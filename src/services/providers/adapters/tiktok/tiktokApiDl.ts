/**
 * TikTok tiktok-api-dl Adapter — Free Provider (Primary)
 *
 * Wraps @tobyg74/tiktok-api-dl's Downloader into the NovaDLProvider interface.
 *
 * This adapter uses NO API keys and NO paid services.
 * It provides triple fallback internally:
 *   V2 (SSSTik.io) → V3 (MusicalDown.com) → V1 (TikTok mobile API)
 *
 * Only the Downloader function is imported. We do NOT import:
 *   - CookieManager (filesystem-dependent)
 *   - DownloadManager (filesystem-dependent)
 *   - TiktokService (JSDOM + filesystem-dependent)
 *   - Signature generator (JSDOM-dependent)
 *   - Search APIs (cookie-dependent)
 *   - User APIs (cookie-dependent)
 *
 * Provider priority in registry:
 *   1. tiktok-api-dl (this adapter — FREE, no keys)
 *   2. tikhub (emergency fallback — paid, quota-limited)
 *   3. rapidapi (emergency fallback — paid)
 */

import { NovaDLProvider, ProviderCapabilities, ProviderHealth } from '../../types';
import { NovaDLResult, NovaDLFormat, NovaDLAudio, NovaDLImage, NovaDLMetadata, NovaDLFormatType, NovaDLImageType } from '../../../types';
import { NovaDLError, NovaDLErrorCode, generateRequestId } from '../../../errors';
import { wrapProviderError } from '../../../provider-utils';
import { formatCount } from '@/lib/format';

// ============================================================================
// TYPE DEFINITIONS FOR tiktok-api-dl RESPONSES
// ============================================================================

/** V1 response (TikTok mobile API) */
interface V1Result {
  status: 'success' | 'error';
  message?: string;
  result?: {
    type: 'video' | 'image' | 'music';
    id?: string;
    createTime?: number;
    desc?: string;
    author?: {
      uid?: string;
      username?: string;
      uniqueId?: string;
      nickname?: string;
      avatarThumb?: string | string[];
      avatarMedium?: string | string[];
      url?: string;
      signature?: string;
      region?: string;
    };
    statistics?: {
      commentCount?: number;
      likeCount?: number;
      shareCount?: number;
      playCount?: number;
      downloadCount?: number;
    };
    video?: {
      ratio?: string;
      duration?: number;
      playAddr?: string[];
      downloadAddr?: string[];
      cover?: string[];
      dynamicCover?: string[];
      originCover?: string[];
    };
    images?: string[];
    music?: {
      id?: number | string;
      title?: string;
      author?: string;
      playUrl?: string[];
      duration?: number;
    };
    hashtag?: string[];
    isADS?: boolean;
    isTurnOffComment?: boolean;
  };
  resultNotParsed?: unknown;
}

/** V2 response (SSSTik.io) */
interface V2Result {
  status: 'success' | 'error';
  message?: string;
  result?: {
    type: 'video' | 'image' | 'music';
    desc?: string;
    author?: {
      avatar?: string;
      nickname?: string;
    };
    statistics?: {
      likeCount?: string;
      commentCount?: string;
      shareCount?: string;
    };
    video?: {
      playAddr?: string[];
    };
    music?: {
      playUrl?: string[];
    };
    images?: string[];
    direct?: string;
  };
}

/** V3 response (MusicalDown.com) */
interface V3Result {
  status: 'success' | 'error';
  message?: string;
  result?: {
    type: 'video' | 'image';
    author?: {
      avatar?: string;
      nickname?: string;
    };
    desc?: string;
    images?: string[];
    videoHD?: string;
    videoSD?: string;
    videoWatermark?: string;
    music?: string;
  };
}

/** Union of all possible results from the Downloader */
type AnyDownloaderResult = V1Result | V2Result | V3Result;

// ============================================================================
// ADAPTER CLASS
// ============================================================================

export class TikTokApiDlAdapter implements NovaDLProvider {
  name = 'tiktok-api-dl';
  platform = 'tiktok';

  async fetchVideo(inputUrl: string): Promise<NovaDLResult> {
    const requestId = generateRequestId();

    try {
      // Dynamic import to avoid loading JSDOM/heavy deps at module level.
      // We only use the Downloader function.
      const tiktokPkg = await import('@tobyg74/tiktok-api-dl');
      const Downloader = tiktokPkg.default?.Downloader || tiktokPkg.Downloader;

      if (!Downloader || typeof Downloader !== 'function') {
        throw new NovaDLError(
          NovaDLErrorCode.PROVIDER_OFFLINE,
          'tiktok-api-dl Downloader not available',
          this.platform,
          requestId,
          { provider: this.name }
        );
      }

      // ──── Internal fallback: V2 → V3 → V1 ────
      // Each version is tried independently. If one fails,
      // we try the next. The frontend never sees this fallback.
      const versions: Array<{ version: 'v1' | 'v2' | 'v3'; label: string }> = [
        { version: 'v2', label: 'SSSTik' },
        { version: 'v3', label: 'MusicalDown' },
        { version: 'v1', label: 'TikTokAPI' },
      ];

      let lastError: string | null = null;

      for (const { version, label } of versions) {
        try {
          console.log(`[tiktok-api-dl] Trying ${label} (${version}) for: ${inputUrl.slice(0, 80)}`);

          // Cast to any — the package's TypeScript types are union types
          // that are broader than our per-version interfaces. We handle
          // the response dynamically in the version-specific mappers.
          const result: any = await Downloader(inputUrl, { version });

          if (result?.status === 'success' && result?.result) {
            console.log(`[tiktok-api-dl] ${label} (${version}) succeeded — type: ${result.result.type}`);
            return this.mapToNovaDLResult(result, version);
          }

          // Version returned an error — try next
          lastError = result?.message || `${label} returned status: ${result?.status}`;
          console.warn(`[tiktok-api-dl] ${label} (${version}) failed: ${lastError}`);
        } catch (versionError) {
          const msg = versionError instanceof Error ? versionError.message : String(versionError);
          lastError = msg;
          console.warn(`[tiktok-api-dl] ${label} (${version}) threw: ${msg.slice(0, 200)}`);
        }
      }

      // All three versions failed
      throw new NovaDLError(
        NovaDLErrorCode.DOWNLOAD_FAILED,
        lastError || 'All tiktok-api-dl versions failed (V2→V3→V1)',
        this.platform,
        requestId,
        { provider: this.name }
      );
    } catch (error) {
      // If it's already a NovaDLError, throw as-is
      if (error instanceof NovaDLError) throw error;
      // Wrap unknown errors
      throw wrapProviderError(error, this.platform, requestId, this.name);
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    // This provider requires NO API keys, so it's always "online"
    // (individual download attempts may still fail due to third-party uptime)
    return {
      status: 'online',
      latency: 0,
      availability: 1.0,
      version: '1.3.8',
      lastCheck: new Date(),
      errorRate: 0,
      successRate: 1,
      retryCount: 0,
    };
  }

  supportedFormats(): string[] {
    return [
      NovaDLFormatType.VIDEO_NO_WATERMARK,
      NovaDLFormatType.VIDEO_WITH_WATERMARK,
      NovaDLFormatType.VIDEO_HD,
      NovaDLFormatType.VIDEO_SD,
    ];
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsVideo: true,
      supportsAudio: true,
      supportsImages: true,
      supportsSlides: true,  // V1, V2, V3 all support slides/images
      supportsStories: false,
      supportsReels: true,
      supportsShorts: true,
      supportsPlaylist: false,
      supportsLive: false,
      supportsCaptions: false,
      supportsMetadata: true,
    };
  }

  // ========================================================================
  // RESULT MAPPING — Maps tiktok-api-dl responses to NovaDLResult
  // ========================================================================

  private mapToNovaDLResult(result: any, version: 'v1' | 'v2' | 'v3'): NovaDLResult {
    // Dispatch to version-specific mapper
    switch (version) {
      case 'v1':
        return this.mapV1Result(result);
      case 'v2':
        return this.mapV2Result(result);
      case 'v3':
        return this.mapV3Result(result);
    }
  }

  // ──── V1 Mapper (TikTok mobile API) ────

  private mapV1Result(result: any): NovaDLResult {
    const r = result.result;
    const id = r.id || String(Date.now());
    const title = r.desc || 'TikTok Video';
    const author = r.author?.uniqueId || r.author?.nickname || r.author?.username || '@unknown';

    // Author avatar — V1 returns string arrays
    const authorAvatar = this.firstString(r.author?.avatarThumb) ||
      this.firstString(r.author?.avatarMedium) || '';

    // Thumbnail/cover
    const thumbnail = this.firstString(r.video?.originCover) ||
      this.firstString(r.video?.cover) ||
      this.firstString(r.video?.dynamicCover) || '';

    // Duration — V1 returns duration in milliseconds
    const duration = r.video?.duration
      ? `${Math.floor(r.video.duration / 1000 / 60)}:${String(Math.floor((r.video.duration / 1000) % 60)).padStart(2, '0')}`
      : '0:00';

    // ──── Video formats ────
    const formats: NovaDLFormat[] = [];

    // downloadAddr = no watermark; playAddr = with watermark
    const noWatermarkUrl = this.firstString(r.video?.downloadAddr) || '';
    const withWatermarkUrl = this.firstString(r.video?.playAddr) || '';

    if (noWatermarkUrl) {
      formats.push({
        type: NovaDLFormatType.VIDEO_NO_WATERMARK,
        url: noWatermarkUrl,
        quality: '1080p',
        extension: 'mp4',
        label: 'No Watermark HD',
      });
    }

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
    const audioUrl = this.firstString(r.music?.playUrl);
    const audio: NovaDLAudio[] = audioUrl ? [{
      url: audioUrl,
      format: 'mp3',
      extension: 'mp3',
      label: r.music?.title ? `${r.music.title} (MP3)` : 'MP3 Audio',
    }] : [];

    // ──── Images ────
    const images: NovaDLImage[] = [];

    const coverUrl = this.firstString(r.video?.originCover) || this.firstString(r.video?.cover) || '';
    if (coverUrl) {
      images.push({ url: coverUrl, type: NovaDLImageType.COVER, extension: 'jpg', label: 'Cover Image' });
    }

    const dynamicCover = this.firstString(r.video?.dynamicCover);
    if (dynamicCover && dynamicCover !== coverUrl) {
      images.push({ url: dynamicCover, type: NovaDLImageType.THUMBNAIL, extension: 'jpg', label: 'Thumbnail' });
    } else if (thumbnail && thumbnail !== coverUrl) {
      images.push({ url: thumbnail, type: NovaDLImageType.THUMBNAIL, extension: 'jpg', label: 'Thumbnail' });
    }

    // ──── Statistics ────
    const stats = r.statistics;
    const metadata: NovaDLMetadata = {
      videoId: id,
      views: stats?.playCount ? formatCount(stats.playCount) : undefined,
      likes: stats?.likeCount ? formatCount(stats.likeCount) : undefined,
      comments: stats?.commentCount ? formatCount(stats.commentCount) : undefined,
      shares: stats?.shareCount ? formatCount(stats.shareCount) : undefined,
      postType: r.type === 'image' ? 'images' : 'video',
      slideImages: r.type === 'image' && r.images && r.images.length > 0 ? r.images : undefined,
    };

    // ──── Diagnostic ────
    this.logMapping('V1', title, author, noWatermarkUrl, withWatermarkUrl, audioUrl, metadata);

    return {
      success: true,
      message: `Successfully fetched TikTok video from ${this.name} (V1)`,
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

  // ──── V2 Mapper (SSSTik.io) ────

  private mapV2Result(result: any): NovaDLResult {
    const r = result.result;
    const title = r.desc || 'TikTok Video';
    const author = r.author?.nickname || '@unknown';
    const authorAvatar = r.author?.avatar || '';

    // SSSTik returns video URL directly (no-watermark by default)
    const videoUrl = this.firstString(r.video?.playAddr) || '';

    // Thumbnail — SSSTik doesn't provide separate thumbnail; use author avatar as fallback
    const thumbnail = authorAvatar || '';

    const duration = '0:00'; // SSSTik doesn't provide duration

    // ──── Video formats ────
    const formats: NovaDLFormat[] = [];

    if (videoUrl) {
      formats.push({
        type: NovaDLFormatType.VIDEO_NO_WATERMARK,
        url: videoUrl,
        quality: '1080p',
        extension: 'mp4',
        label: 'No Watermark HD',
      });
    }

    // ──── Audio ────
    const audioUrl = this.firstString(r.music?.playUrl);
    const audio: NovaDLAudio[] = audioUrl ? [{
      url: audioUrl,
      format: 'mp3',
      extension: 'mp3',
      label: 'MP3 Audio',
    }] : [];

    // ──── Images ────
    const images: NovaDLImage[] = [];

    // SSSTik doesn't provide separate cover/thumbnail, but we add
    // the author avatar as a cover fallback for the frontend
    if (authorAvatar) {
      images.push({ url: authorAvatar, type: NovaDLImageType.COVER, extension: 'jpg', label: 'Cover Image' });
    }

    // ──── Statistics ────
    const stats = r.statistics;
    const metadata: NovaDLMetadata = {
      videoId: String(Date.now()),
      views: undefined,  // SSSTik returns string stats, skip formatted mapping
      likes: stats?.likeCount || undefined,
      comments: stats?.commentCount || undefined,
      shares: stats?.shareCount || undefined,
      postType: r.type === 'image' ? 'images' : r.type === 'music' ? 'video' : 'video',
      slideImages: r.type === 'image' && r.images && r.images.length > 0 ? r.images : undefined,
    };

    this.logMapping('V2', title, author, videoUrl, '', audioUrl, metadata);

    return {
      success: true,
      message: `Successfully fetched TikTok video from ${this.name} (V2)`,
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

  // ──── V3 Mapper (MusicalDown.com) ────

  private mapV3Result(result: any): NovaDLResult {
    const r = result.result;
    const title = r.desc || 'TikTok Video';
    const author = r.author?.nickname || '@unknown';
    const authorAvatar = r.author?.avatar || '';
    const thumbnail = authorAvatar || ''; // MusicalDown doesn't provide separate thumbnail

    const duration = '0:00'; // MusicalDown doesn't provide duration

    // ──── Video formats ────
    const formats: NovaDLFormat[] = [];

    // V3 provides the richest video format selection:
    // videoHD, videoSD, videoWatermark
    const noWatermarkUrl = r.videoHD || r.videoSD || '';
    const withWatermarkUrl = r.videoWatermark || '';

    if (r.videoHD) {
      formats.push({
        type: NovaDLFormatType.VIDEO_NO_WATERMARK,
        url: r.videoHD,
        quality: '1080p',
        extension: 'mp4',
        label: 'No Watermark HD',
      });
    } else if (r.videoSD) {
      formats.push({
        type: NovaDLFormatType.VIDEO_NO_WATERMARK,
        url: r.videoSD,
        quality: '720p',
        extension: 'mp4',
        label: 'No Watermark SD',
      });
    }

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
    const audioUrl = r.music || '';
    const audio: NovaDLAudio[] = audioUrl ? [{
      url: audioUrl,
      format: 'mp3',
      extension: 'mp3',
      label: 'MP3 Audio',
    }] : [];

    // ──── Images ────
    const images: NovaDLImage[] = [];

    if (authorAvatar) {
      images.push({ url: authorAvatar, type: NovaDLImageType.COVER, extension: 'jpg', label: 'Cover Image' });
    }

    // ──── Statistics ────
    // MusicalDown doesn't provide statistics
    const metadata: NovaDLMetadata = {
      videoId: String(Date.now()),
      postType: r.type === 'image' ? 'images' : 'video',
      slideImages: r.type === 'image' && r.images && r.images.length > 0 ? r.images : undefined,
    };

    this.logMapping('V3', title, author, noWatermarkUrl, withWatermarkUrl, audioUrl, metadata);

    return {
      success: true,
      message: `Successfully fetched TikTok video from ${this.name} (V3)`,
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

  // ========================================================================
  // HELPERS
  // ========================================================================

  /**
   * Get the first non-empty string from a string array.
   * Handles both string[] and string inputs.
   */
  private firstString(arr: string | string[] | undefined): string {
    if (!arr) return '';
    if (typeof arr === 'string') return arr;
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (typeof item === 'string' && item.length > 0) return item;
      }
    }
    return '';
  }

  /**
   * Log mapping diagnostics (same format as TikHub adapter).
   */
  private logMapping(
    version: string,
    title: string,
    author: string,
    noWatermarkUrl: string,
    withWatermarkUrl: string,
    audioUrl: string,
    metadata: NovaDLMetadata
  ): void {
    console.log(`[tiktok-api-dl→NovaDL] version: ${version}`);
    console.log(`[tiktok-api-dl→NovaDL] title: ${title}`);
    console.log(`[tiktok-api-dl→NovaDL] author: ${author}`);
    console.log(`[tiktok-api-dl→NovaDL] noWatermarkUrl: ${noWatermarkUrl ? '✓' : '✗'}`);
    console.log(`[tiktok-api-dl→NovaDL] withWatermarkUrl: ${withWatermarkUrl ? '✓' : '✗'}`);
    console.log(`[tiktok-api-dl→NovaDL] audioUrl: ${audioUrl ? '✓' : '✗'}`);
    console.log(`[tiktok-api-dl→NovaDL] postType: ${metadata.postType || 'video'}`);
    console.log(`[tiktok-api-dl→NovaDL] slideImages: ${metadata.slideImages?.length || 0}`);
  }
}
