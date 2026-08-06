/**
 * TikTok TikHub Adapter — Phase 1 (Hardened)
 *
 * Wraps the TikHub API download logic into the NovaDLProvider interface.
 * Uses shared provider utilities (mapHttpError, createOfflineHealth, wrapProviderError)
 * to eliminate code duplication across adapters.
 *
 * CRITICAL FIX: Handles multiple TikHub response formats:
 *   - Some endpoints wrap data in result.data.aweme_detail
 *   - Some endpoints return data directly in result.data
 *   - URL fields can be objects with url_list OR plain strings
 *   - Stats field can be "statistics" or "stats"
 */

import { NovaDLProvider, ProviderCapabilities, ProviderHealth } from '../../types';
import { NovaDLResult, NovaDLFormat, NovaDLAudio, NovaDLImage, NovaDLMetadata, NovaDLFormatType, NovaDLImageType } from '../../../types';
import { NovaDLError, NovaDLErrorCode, generateRequestId } from '../../../errors';
import { mapHttpError, createOfflineHealth, wrapProviderError } from '../../../provider-utils';
import { formatCount } from '@/lib/format';

// ============================================================================
// URL EXTRACTION HELPER
// ============================================================================

/**
 * Extract a URL from a TikHub response field.
 * Handles BOTH formats:
 *   - Object with url_list: { url_list: ["https://..."] }
 *   - Plain string: "https://..."
 *   - Object that IS a string (type coercion edge case)
 *   - Object with "uri" field (TikTok internal video URI format)
 *   - Object with nested "data" containing url_list
 *
 * IMPORTANT: This function MUST return a valid URL for any normal TikTok video.
 * If it returns '' for a valid video, the frontend will show "unavailable".
 */
function extractUrl(field: unknown): string {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'object' && field !== null) {
    const obj = field as Record<string, unknown>;
    // Primary: url_list array — try ALL elements (not just [0])
    // TikHub sometimes returns ["", "real-url"] or [null, "real-url"]
    if (Array.isArray(obj.url_list)) {
      for (const item of obj.url_list) {
        if (typeof item === 'string' && item.length > 0) {
          return item;
        }
      }
    }
    // Secondary: "url" field (some TikHub formats)
    if (typeof obj.url === 'string' && obj.url.length > 0) return obj.url;
    // Tertiary: "uri" field (TikTok internal format, less common)
    if (typeof obj.uri === 'string' && obj.uri.startsWith('http')) return obj.uri;
  }
  return '';
}

// ============================================================================
// TIKHUB RESPONSE TYPES (permissive — handles both formats)
// ============================================================================

/** TikTok-specific response structure from TikHub API */
interface TikHubVideoData {
  id?: string;
  aweme_id?: string;
  desc?: string;
  title?: string;
  create_time?: number;
  author?: {
    uid?: string;
    unique_id?: string;
    nickname?: string;
    // Avatar can be { url_list: string[] } OR plain string
    avatar_larger?: unknown;
    avatar?: unknown;
    avatar_medium?: unknown;
    signature?: string;
    follower_count?: number;
  };
  // Cover can be { url_list: string[] } OR plain string
  cover?: unknown;
  origin_cover?: unknown;
  dynamic_cover?: unknown;
  video?: {
    duration?: number;
    // These can be { url_list: string[] } OR plain string
    play_addr?: unknown;
    download_addr?: unknown;
    play_addr_265?: unknown;
    width?: number;
    height?: number;
    ratio?: string;
    format?: string;
    codec?: string;
    bitrate?: number;
    cover?: unknown;
    origin_cover?: unknown;
    dynamic_cover?: unknown;
  };
  music?: {
    id?: string;
    title?: string;
    author?: string;
    play_url?: unknown;  // Can be string or { url_list: string[] }
    cover_medium?: unknown;
    duration?: number;
  };
  // Stats can be "statistics" or "stats" depending on API version
  statistics?: {
    play_count?: number;
    digg_count?: number;
    comment_count?: number;
    share_count?: number;
    collect_count?: number;
  };
  stats?: {
    play_count?: number;
    digg_count?: number;
    comment_count?: number;
    share_count?: number;
    collect_count?: number;
  };
  share_url?: string;
  // Some endpoints wrap the aweme data inside aweme_detail
  aweme_detail?: TikHubVideoData;
  // Photo/slide posts: TikTok uses image_post_info.images[] for photo carousels
  // Each image is { url_list: string[], thumbnail: { url_list: string[] } }
  image_post_info?: {
    images?: unknown[];
  };
  // Legacy field — some older API versions may use image_list
  image_list?: unknown[];
  // Photo post indicator: media_type=68 for photo/slide posts
  media_type?: number;
  // aweme_type: 150 = photo post (another indicator)
  aweme_type?: number;
}

// ============================================================================
// ADAPTER CLASS
// ============================================================================

export class TikTokTikHubAdapter implements NovaDLProvider {
  name = 'tikhub';
  platform = 'tiktok';

  private readonly baseUrl = 'https://api.tikhub.io';

  async fetchVideo(inputUrl: string): Promise<NovaDLResult> {
    const apiKey = process.env.TIKHUB_API_KEY;
    const requestId = generateRequestId();

    if (!apiKey) {
      throw new NovaDLError(
        NovaDLErrorCode.PROVIDER_OFFLINE,
        'TIKHUB_API_KEY environment variable is required',
        this.platform,
        requestId,
        { provider: this.name }
      );
    }

    try {
      // TikHub API v3 endpoint — accepts share_url (full TikTok URL)
      const response = await fetch(
        `${this.baseUrl}/api/v1/tiktok/app/v3/fetch_one_video_by_share_url?share_url=${encodeURIComponent(inputUrl)}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(15000),
        }
      );

      if (!response.ok) {
        throw mapHttpError(response.status, this.platform, requestId, this.name);
      }

      const result = await response.json();

      // ──── UNWRAP: Handle multiple TikHub response formats ────
      // Format 1: { code, msg, data: { aweme_id, desc, author, ... } }
      //   → result.data IS the aweme object
      // Format 2: { code, msg, data: { aweme_detail: { aweme_id, desc, ... } } }
      //   → result.data.aweme_detail IS the aweme object
      // Format 3: { code, msg, data: null } with data at another path
      //   → Try result.videoData, result.data as fallbacks
      const rawData = result.data;
      let videoData: TikHubVideoData | null = null;

      if (rawData && typeof rawData === 'object') {
        // Check if data is wrapped in aweme_detail
        if (rawData.aweme_detail && typeof rawData.aweme_detail === 'object') {
          console.log('[TikHub] Unwrapped response from result.data.aweme_detail');
          videoData = rawData.aweme_detail;
        } else if (rawData.aweme_id || rawData.desc || rawData.author || rawData.video) {
          // Data is the aweme object directly (has recognizable aweme fields)
          console.log('[TikHub] Using result.data directly as aweme object');
          videoData = rawData;
        } else if (rawData.data && typeof rawData.data === 'object') {
          // Double-nested: result.data.data (some API versions)
          console.log('[TikHub] Unwrapped response from result.data.data');
          videoData = rawData.data;
        }
      }

      // Fallback: try other common paths (like RapidAPI adapter does)
      if (!videoData) {
        videoData = result.videoData || result.data || result;
      }

      // ──── DIAGNOSTIC: Log the unwrapped data structure ────
      if (videoData) {
        console.log('[TikHub] videoData keys:', Object.keys(videoData).join(', '));
        console.log('[TikHub] videoData.aweme_id:', videoData.aweme_id);
        console.log('[TikHub] videoData.desc:', (videoData.desc || '').slice(0, 80));
        console.log('[TikHub] videoData.author:', videoData.author ? `uid=${videoData.author.unique_id} nick=${videoData.author.nickname}` : '(missing)');
        console.log('[TikHub] videoData.statistics:', videoData.statistics ? 'present' : 'missing');
        console.log('[TikHub] videoData.stats:', videoData.stats ? 'present' : 'missing');
        console.log('[TikHub] videoData.cover type:', typeof videoData.cover);
        console.log('[TikHub] videoData.video:', videoData.video ? 'present' : 'missing');
        console.log('[TikHub] videoData.media_type:', videoData.media_type);
        console.log('[TikHub] videoData.aweme_type:', videoData.aweme_type);
        console.log('[TikHub] videoData.image_post_info:', videoData.image_post_info ? `present, images=${videoData.image_post_info.images?.length ?? 0}` : 'missing');
        console.log('[TikHub] videoData.image_list:', videoData.image_list ? `present, length=${videoData.image_list.length}` : 'missing');
        if (videoData.video) {
          const videoObj = videoData.video as Record<string, unknown>;
          if (videoObj.play_addr !== undefined) console.log('[TikHub] videoData.video.play_addr type:', typeof videoObj.play_addr);
          if (videoObj.download_addr !== undefined) console.log('[TikHub] videoData.video.download_addr type:', typeof videoObj.download_addr);
        }
      }

      if (!videoData) {
        throw new NovaDLError(
          NovaDLErrorCode.DOWNLOAD_FAILED,
          'No video data found in TikHub response',
          this.platform,
          requestId,
          { provider: this.name }
        );
      }

      // ──── Detect private/deleted/unavailable content ────
      // REGRESSION FIX: The previous fix (checking only hasVideo || hasImages) was too
      //   aggressive. The hasVideo variable uses extractUrl() which can return '' (falsy)
      //   even for valid videos when the URL format is unexpected. The old condition
      //   (!hasVideo && !hasImages && !hasAuthor && !hasTitle) protected normal videos
      //   because it required ALL four to be missing.
      //
      // Two-stage detection:
      //   Stage 1 (pre-extraction): Quick filter for obviously empty responses.
      //     If NO video section, NO images, AND NO metadata → definitely unavailable.
      //   Stage 2 (post-extraction): Thorough check after URL extraction.
      //     If the result has zero formats, zero images, zero audio → unavailable.
      //     This catches deleted/private videos that return metadata but no media.
      const hasVideoSection = !!videoData.video;
      const hasImages = (videoData.image_post_info?.images && videoData.image_post_info.images.length > 0) ||
                         (videoData.image_list && videoData.image_list.length > 0);
      const hasAuthor = videoData.author && (videoData.author.unique_id || videoData.author.nickname);
      const hasTitle = videoData.desc || videoData.title;

      // Stage 1: No recognizable content at all → definitely unavailable
      if (!hasVideoSection && !hasImages && !hasAuthor && !hasTitle) {
        console.log('[TikHub] No recognizable content — treating as unavailable');
        throw new NovaDLError(
          NovaDLErrorCode.DELETED_CONTENT,
          'This content is unavailable. It may be private, deleted, or region-locked.',
          this.platform,
          requestId,
          { provider: this.name }
        );
      }

      return this.toNovaDLResult(videoData);
    } catch (error) {
      throw wrapProviderError(error, this.platform, requestId, this.name);
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const apiKey = process.env.TIKHUB_API_KEY;

    if (!apiKey) {
      return createOfflineHealth();
    }

    const start = Date.now();

    try {
      const response = await fetch(
        `${this.baseUrl}/api/v1/tiktok/app/v3/fetch_one_video_by_share_url?share_url=${encodeURIComponent('https://www.tiktok.com/@tiktok/video/7100000000000000000')}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        }
      );

      const latency = Date.now() - start;
      const isOk = response.ok || response.status === 404;

      return {
        status: isOk ? 'online' : 'degraded',
        latency,
        availability: isOk ? 1.0 : 0.0,
        version: undefined,
        lastCheck: new Date(),
        errorRate: isOk ? 0 : 1,
        successRate: isOk ? 1 : 0,
        retryCount: 0,
      };
    } catch {
      return {
        ...createOfflineHealth(),
        latency: Date.now() - start,
        lastCheck: new Date(),
      };
    }
  }

  supportedFormats(): string[] {
    return [
      NovaDLFormatType.VIDEO_NO_WATERMARK,
      NovaDLFormatType.VIDEO_WITH_WATERMARK,
      NovaDLFormatType.VIDEO_HD,
    ];
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsVideo: true,
      supportsAudio: true,
      supportsImages: true,
      supportsSlides: true,
      supportsStories: false,
      supportsReels: true,
      supportsShorts: true,
      supportsPlaylist: false,
      supportsLive: false,
      supportsCaptions: false,
      supportsMetadata: true,
    };
  }

  private toNovaDLResult(videoData: TikHubVideoData): NovaDLResult {
    const id = videoData.id || videoData.aweme_id || String(Date.now());
    const title = videoData.desc || videoData.title || 'TikTok Video';
    const author = videoData.author?.unique_id || videoData.author?.nickname || '@unknown';

    // Extract avatar — handles both { url_list: string[] } and plain string
    const authorAvatar =
      extractUrl(videoData.author?.avatar_larger) ||
      extractUrl(videoData.author?.avatar) ||
      extractUrl(videoData.author?.avatar_medium) ||
      '';

    // Extract thumbnail/cover — handles both formats
    const thumbnail =
      extractUrl(videoData.cover) ||
      extractUrl(videoData.origin_cover) ||
      extractUrl(videoData.video?.cover) ||
      extractUrl(videoData.video?.origin_cover) ||
      '';

    // Duration — TikTok API returns duration in milliseconds
    const duration = videoData.video?.duration
      ? `${Math.floor(videoData.video.duration / 1000 / 60)}:${String(Math.floor((videoData.video.duration / 1000) % 60)).padStart(2, '0')}`
      : '0:00';

    // ──── Video formats ────
    const formats: NovaDLFormat[] = [];

    // download_addr is typically no-watermark, play_addr may have watermark
    // Priority: download_addr (no watermark) > play_addr (may have watermark)
    const noWatermarkUrl =
      extractUrl(videoData.video?.download_addr) ||
      extractUrl(videoData.video?.play_addr) ||
      '';
    if (noWatermarkUrl) {
      formats.push({
        type: NovaDLFormatType.VIDEO_NO_WATERMARK,
        url: noWatermarkUrl,
        quality: '1080p',
        extension: 'mp4',
        label: 'No Watermark HD',
      });
    }

    const withWatermarkUrl =
      extractUrl(videoData.video?.play_addr_265) ||
      extractUrl(videoData.video?.play_addr) ||
      '';
    if (withWatermarkUrl && withWatermarkUrl !== noWatermarkUrl) {
      formats.push({
        type: NovaDLFormatType.VIDEO_WITH_WATERMARK,
        url: withWatermarkUrl,
        quality: undefined,
        extension: 'mp4',
        label: 'With Watermark',
      });
    }

    // ──── Audio ────
    // Use music.play_url if available, NOT the video URL
    const audioUrl = extractUrl(videoData.music?.play_url);
    // TikTok API returns AAC audio (m4a), detect extension from URL
    const audioExt = audioUrl.includes('.mp3') ? 'mp3' : 'm4a';
    const audio: NovaDLAudio[] = audioUrl ? [{
      url: audioUrl,
      format: audioExt,
      extension: audioExt,
      label: audioExt === 'mp3' ? 'MP3 Audio' : 'M4A Audio',
    }] : [];

    // ──── Images ────
    const images: NovaDLImage[] = [];
    const coverUrl =
      extractUrl(videoData.cover) ||
      extractUrl(videoData.origin_cover) ||
      extractUrl(videoData.video?.cover) ||
      extractUrl(videoData.video?.origin_cover) ||
      '';
    if (coverUrl) {
      images.push({ url: coverUrl, type: NovaDLImageType.COVER, extension: 'jpg', label: 'Cover Image' });
    }
    const dynamicCover = extractUrl(videoData.dynamic_cover) || extractUrl(videoData.video?.dynamic_cover);
    if (dynamicCover && dynamicCover !== coverUrl) {
      images.push({ url: dynamicCover, type: NovaDLImageType.THUMBNAIL, extension: 'jpg', label: 'Thumbnail' });
    } else if (thumbnail && thumbnail !== coverUrl) {
      images.push({ url: thumbnail, type: NovaDLImageType.THUMBNAIL, extension: 'jpg', label: 'Thumbnail' });
    }

    // ──── Statistics ────
    // Handle both "statistics" and "stats" field names
    const stats = videoData.statistics || videoData.stats;

    // ──── Photo/Slide Post Detection ────
    // TikTok photo posts use image_post_info.images[] (confirmed by TikTok API docs)
    // Each image object has: { url_list: string[], thumbnail: { url_list: string[] } }
    // The thumbnail.url_list[0] gives the watermark-free full-resolution image.
    // Fallback: some API versions may use image_list at the top level.
    //
    // ROOT CAUSE FIX (Bug 1): The previous logic required hasImages AND one of
    //   (no play_addr, media_type=68, aweme_type=150). This was TOO RESTRICTIVE.
    //   Real TikTok image posts often have video.play_addr present (auto-generated
    //   slideshow video) AND media_type/aweme_type values that don't match 68/150.
    //   This caused isPhotoPost=false, so postType='video' and slideImages=undefined,
    //   meaning the slide gallery never rendered.
    //
    // NEW LOGIC: If image_post_info.images or image_list has entries, it IS a photo
    //   post. The presence of images is the definitive indicator. The other fields
    //   (media_type, aweme_type, play_addr absence) are only secondary confirmations
    //   for cases where image data might be empty/malformed.
    const imagePostImages = videoData.image_post_info?.images;
    const legacyImageList = videoData.image_list;
    const hasImages = (imagePostImages && imagePostImages.length > 0) ||
                      (legacyImageList && legacyImageList.length > 0);
    const isPhotoPost = hasImages;

    const slideImageUrls: string[] = [];
    if (isPhotoPost) {
      // Primary: image_post_info.images[] — each image has thumbnail.url_list or url_list
      if (imagePostImages && imagePostImages.length > 0) {
        for (const img of imagePostImages) {
          if (!img || typeof img !== 'object') continue;
          const imgObj = img as Record<string, unknown>;
          // Prefer thumbnail.url_list[0] (watermark-free full-res)
          const thumbnailUrl = extractUrl(imgObj.thumbnail);
          // Fallback to url_list[0] on the image object itself
          const directUrl = extractUrl(img);
          const finalUrl = thumbnailUrl || directUrl;
          if (finalUrl) slideImageUrls.push(finalUrl);
        }
      }
      // Fallback: legacy image_list
      if (slideImageUrls.length === 0 && legacyImageList && legacyImageList.length > 0) {
        for (const img of legacyImageList) {
          const url = extractUrl(img);
          if (url) slideImageUrls.push(url);
        }
      }
    }

    const metadata: NovaDLMetadata = {
      videoId: id,
      views: stats?.play_count ? formatCount(stats.play_count) : undefined,
      likes: stats?.digg_count ? formatCount(stats.digg_count) : undefined,
      comments: stats?.comment_count ? formatCount(stats.comment_count) : undefined,
      shares: stats?.share_count ? formatCount(stats.share_count) : undefined,
      followers: videoData.author?.follower_count ? formatCount(videoData.author.follower_count) : undefined,
      postType: isPhotoPost ? 'images' : 'video',
      slideImages: slideImageUrls.length > 0 ? slideImageUrls : undefined,
    };

    // ──── DIAGNOSTIC: Log the final NovaDLResult ────
    console.log('[TikHub→NovaDL] title:', title);
    console.log('[TikHub→NovaDL] author:', author);
    console.log('[TikHub→NovaDL] authorAvatar:', authorAvatar ? authorAvatar.slice(0, 80) : '(empty)');
    console.log('[TikHub→NovaDL] thumbnail:', thumbnail ? thumbnail.slice(0, 80) : '(empty)');
    console.log('[TikHub→NovaDL] duration:', duration);
    console.log('[TikHub→NovaDL] formats:', formats.length, 'types:', formats.map(f => f.type));
    console.log('[TikHub→NovaDL] audio:', audio.length, 'url:', audioUrl ? audioUrl.slice(0, 80) : '(empty)');
    console.log('[TikHub→NovaDL] noWatermarkUrl:', noWatermarkUrl ? noWatermarkUrl.slice(0, 80) : '(empty)');
    console.log('[TikHub→NovaDL] isPhotoPost:', isPhotoPost, 'slideImages:', slideImageUrls.length);
    console.log('[TikHub→NovaDL] media_type:', videoData.media_type, 'aweme_type:', videoData.aweme_type);
    console.log('[TikHub→NovaDL] image_post_info.images:', imagePostImages?.length ?? 0, 'image_list:', legacyImageList?.length ?? 0);

    // ──── NOTE: Post-extraction unavailable check REMOVED ────
    // REGRESSION FIX: The previous post-extraction check
    //   (if formats.length === 0 && audio.length === 0 && slideImageUrls.length === 0)
    //   was causing FALSE POSITIVES. It relied on extractUrl() successfully
    //   extracting URLs from TikHub response fields. If extractUrl() returned ''
    //   for ANY reason (unexpected URL format, empty url_list, missing field),
    //   formats.length would be 0 and the video would be incorrectly classified
    //   as unavailable — even for perfectly valid, public, downloadable videos.
    //
    // The PRE-EXTRACTION check (Stage 1 in fetchVideo) already handles the case
    //   where the response is genuinely empty (no video section, no images,
    //   no author, no title). That check is safe because it uses hasVideoSection
    //   (= !!videoData.video) which only checks if the video object EXISTS,
    //   not whether extractUrl() can extract URLs from it.
    //
    // For genuinely deleted/private videos that return metadata but no media URLs,
    //   the frontend will receive empty noWatermarkUrl/audioUrl and can show
    //   the unavailable UI there. This is the SAFER approach because:
    //   1. It never incorrectly blocks a valid video
    //   2. The frontend has more context to show a helpful message
    //   3. It matches the behavior of the WORKING code before commit 229dba9
    //
    // Log the extraction result for diagnostics:
    const hasAnyDownload = formats.length > 0 || slideImageUrls.length > 0 || audio.length > 0;
    if (!hasAnyDownload) {
      console.log('[TikHub→NovaDL] WARNING: No downloadable content extracted (formats=0, slides=0, audio=0). Returning result with empty fields — frontend will show unavailable.');
    }

    return {
      success: true,
      message: `Successfully fetched TikTok video from ${this.name}`,
      platform: this.platform,
      title,
      author,
      authorAvatar,
      thumbnail,
      duration,
      formats,
      audio,
      images,
      metadata,
    };
  }
}
