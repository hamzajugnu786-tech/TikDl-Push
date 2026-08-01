/**
 * NovaDL Engine — VK (VKontakte) Native Extractor
 *
 * Extracts video URLs, metadata, thumbnails, and multiple quality levels
 * from VK (VKontakte) content using multiple extraction strategies.
 *
 * Extraction strategies (all real, no mock/demo):
 * 1. VK oEmbed endpoint — returns title, author, thumbnail
 * 2. VK page HTML parsing — extract player data from embedded JSON:
 *    var playerParams / window.playerParams / inline <script> containing
 *    video configuration objects with quality URLs (1080, 720, 480, 360)
 * 3. VK embedded <video> tag source extraction
 * 4. Open Graph meta tags extraction (og:video, og:title, etc.)
 * 5. VK API endpoint (video.get) for full video metadata
 */

import { v4 as uuid } from 'uuid';
import type {
  Platform,
  ExtractionRequest,
  ExtractionResult,
  ExtractionMetadata,
  MediaItem,
  CoverImage,
  Thumbnail,
  QualityOption,
  ProviderConfig,
  ProviderCapabilities,
  ProviderHealth,
  ProviderFeature,
} from '../../types/index';
import { BaseProvider, ProviderError } from '../base';
import { detectPlatform } from '../../utils/url';

// ─── VK Data Types ──────────────────────────────────────────────────────

interface VKPlayerParams {
  video_id?: string;
  oid?: string;
  id?: string;
  hd_src?: string;
  sd_src?: string;
  low_src?: string;
  src?: string;
  duration?: number;
  title?: string;
  author?: string;
  thumbnail?: string;
  thumb?: string;
  width?: number;
  height?: number;
  viewer_count?: number;
  is_live?: boolean;
  can_download?: boolean;
  add_hash?: string;
  md_author?: VKMdAuthor;
  md5_hash?: string;
  urls?: VKVideoUrls;
}

interface VKMdAuthor {
  id?: string;
  name?: string;
  photo?: string;
  profile?: string;
}

interface VKVideoUrls {
  1080?: string;
  720?: string;
  480?: string;
  360?: string;
  240?: string;
}

interface VKVideoItem {
  id?: string;
  owner_id?: string;
  title?: string;
  description?: string;
  duration?: number;
  photo_320?: string;
  photo_640?: string;
  photo_800?: string;
  photo_1280?: string;
  photo_1920?: string;
  date?: number;
  views?: number;
  likes?: VKReactionInfo;
  comments?: VKReactionInfo;
  player?: string;
  files?: VKVideoFiles;
  can_download?: boolean;
  is_private?: boolean;
  access_key?: string;
  adding_date?: number;
  content_restricted?: number;
}

interface VKReactionInfo {
  count?: number;
  user_likes?: boolean;
}

interface VKVideoFiles {
  mp4_1080?: string;
  mp4_720?: string;
  mp4_480?: string;
  mp4_360?: string;
  mp4_240?: string;
  external?: string;
  hls?: string;
  live_hls?: string;
}

interface VKOEmbedData {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  width?: number;
  height?: number;
  html?: string;
  type?: string;
  provider_name?: string;
  provider_url?: string;
  version?: string;
}

interface VKApiVideoResponse {
  response?: {
    count?: number;
    items?: VKVideoItem[];
  };
  error?: VKApiError;
}

interface VKApiError {
  error_code?: number;
  error_msg?: string;
  request_params?: Array<{ key: string; value: string }>;
}

interface VKOpenGraphData {
  ogVideo?: string;
  ogVideoUrl?: string;
  ogVideoSecureUrl?: string;
  ogVideoType?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogImageWidth?: number;
  ogImageHeight?: number;
  ogSiteName?: string;
  ogVideoWidth?: number;
  ogVideoHeight?: number;
}

// ─── Provider Implementation ──────────────────────────────────────────────

export class VKNativeExtractor extends BaseProvider {
  readonly id = 'native_vk';
  readonly name = 'VK Native Extractor';
  readonly type: 'custom' = 'custom';

  private _userAgent: string;
  private _vkAccessToken: string;
  private _vkApiVersion: string;

  constructor(config: ProviderConfig) {
    super(config);
    this._userAgent = config.customOptions?.userAgent as string ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    this._vkAccessToken = config.apiKey ?? config.customOptions?.vkAccessToken as string ?? '';
    this._vkApiVersion = config.customOptions?.vkApiVersion as string ?? '5.199';
  }

  async initialize(): Promise<void> {
    this._initialized = true;
    this._health = {
      status: 'healthy',
      lastChecked: new Date(),
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
    };
  }

  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    this.ensureInitialized();

    const startTime = Date.now();
    const platform = request.platform ?? detectPlatform(request.url);

    if (!this.supports(platform)) {
      throw new ProviderError(
        `VK native extractor does not support platform '${platform}'`,
        this.id,
        'UNSUPPORTED',
        false,
        platform,
      );
    }

    try {
      const result = await this.withTimeout(
        this._extractFromUrl(request.url),
        this.config.timeout,
      );
      this.recordSuccess(Date.now() - startTime);
      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      const providerError = ProviderError.fromUnknown(this.id, error, platform);
      this.recordFailure(providerError.message, latency);
      throw providerError;
    }
  }

  supports(platform: Platform): boolean {
    return platform === 'vk';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['vk'],
      mediaTypes: ['video', 'audio', 'image', 'metadata'],
      formats: ['mp4', 'm4a', 'jpeg', 'png', 'webp'],
      qualities: ['best', '1080p', '720p', '480p', '360p', '240p'],
      features: [
        'video_download',
        'audio_download',
        'cover_extraction',
        'thumbnail_extraction',
        'metadata_extraction',
        'multiple_qualities',
      ] as ProviderFeature[],
      maxConcurrent: 5,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      await fetch('https://vk.com', {
        headers: {
          'User-Agent': this._userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Cookie': 'remixlang=0;',
        },
        redirect: 'follow',
      });
      return {
        status: 'healthy',
        latencyMs: Date.now() - startTime,
        lastChecked: new Date(),
        consecutiveFailures: 0,
        consecutiveSuccesses: (this._health.consecutiveSuccesses ?? 0) + 1,
        successRate: 1.0,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastChecked: new Date(),
        lastError: error instanceof Error ? error.message : 'Health check failed',
        consecutiveFailures: (this._health.consecutiveFailures ?? 0) + 1,
        consecutiveSuccesses: 0,
        successRate: 0,
      };
    }
  }

  // ─── Private: Main Extraction ──────────────────────────────────────────

  private async _extractFromUrl(url: string): Promise<ExtractionResult> {
    const videoId = this._extractVideoId(url);
    if (!videoId) {
      throw new ProviderError(
        'Could not extract VK video ID from URL',
        this.id,
        'UNSUPPORTED',
        false,
        'vk',
      );
    }

    // Strategy 1: VK API endpoint (requires access_token)
    if (this._vkAccessToken) {
      try {
        const apiResult = await this._fetchFromApi(videoId);
        if (apiResult) {
          return this._buildResultFromApiItem(apiResult, url);
        }
      } catch {
        // Continue to next strategy
      }
    }

    // Strategy 2: VK page HTML parsing — playerParams
    try {
      const html = await this._fetchPage(url);
      const playerParams = this._extractPlayerParamsFromHtml(html);
      if (playerParams && (playerParams.hd_src || playerParams.sd_src || playerParams.urls)) {
        return this._buildResultFromPlayerParams(playerParams, url);
      }
    } catch {
      // Continue to next strategy
    }

    // Strategy 3: VK page HTML — embedded <video> tag source
    try {
      const html = await this._fetchPage(url);
      const videoSrc = this._extractVideoTagSrcFromHtml(html);
      if (videoSrc) {
        return this._buildResultFromVideoSrc(videoSrc, url, html);
      }
    } catch {
      // Continue to next strategy
    }

    // Strategy 4: oEmbed endpoint
    try {
      const oembed = await this._fetchOEmbed(url);
      if (oembed.title || oembed.thumbnail_url) {
        return this._buildResultFromOEmbed(oembed, url);
      }
    } catch {
      // Continue to next strategy
    }

    // Strategy 5: Open Graph meta tags (final fallback)
    try {
      const html = await this._fetchPage(url);
      const ogData = this._extractOpenGraphFromHtml(html);
      if (ogData.ogVideo || ogData.ogVideoUrl) {
        return this._buildResultFromOpenGraph(ogData, url);
      }
    } catch {
      // All strategies failed
    }

    throw new ProviderError(
      'Could not extract VK video data. All extraction strategies failed — player data not accessible, API unavailable, and no fallback metadata found.',
      this.id,
      'PARSE_ERROR',
      false,
      'vk',
    );
  }

  // ─── Private: Video ID Extraction ──────────────────────────────────────

  private _extractVideoId(url: string): string | null {
    // Match patterns:
    // vk.com/video-12345_67890 (owner_id + video_id format)
    // vk.com/video12345_67890 (no dash = positive owner_id)
    // vk.com/videos-12345?z=video-12345_67890%2F... (wall video format)
    // vk.com/video?id=67890&oid=12345 (query param format)
    const patterns = [
      /vk\.com\/video(-?\d+)_(\d+)/i,
      /vk\.com\/videos(-?\d+).*[?&]z=video(-?\d+)_(\d+)/i,
      /vk\.com\/video\?.*oid=(-?\d+).*[&?]id=(\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(url);
      if (match) {
        // For patterns with owner_id and video_id, return combined format
        if (pattern.source.includes('(-?\\d+)_(\\d+)') && match[1] && match[2]) {
          return `${match[1]}_${match[2]}`;
        }
        if (pattern.source.includes('oid=') && match[1] && match[2]) {
          return `${match[1]}_${match[2]}`;
        }
      }
    }

    // Handle z= parameter in wall video URLs
    const zParamMatch = /[?&]z=video(-?\d+)_(\d+)/i.exec(url);
    if (zParamMatch?.[1] && zParamMatch?.[2]) {
      return `${zParamMatch[1]}_${zParamMatch[2]}`;
    }

    return null;
  }

  // ─── Private: Page Fetching ──────────────────────────────────────────────

  private async _fetchPage(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cookie': 'remixlang=0; remixflash=0; remixmdevice=0/0/0;',
        'Referer': 'https://vk.com/',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new ProviderError(
        `VK page fetch failed: ${response.status} ${response.statusText}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500 || response.status === 429,
        'vk',
      );
    }

    return response.text();
  }

  // ─── Private: oEmbed Fetch ──────────────────────────────────────────────

  private async _fetchOEmbed(url: string): Promise<VKOEmbedData> {
    const oembedUrl = `https://vk.com/oembed.php?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(oembedUrl, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'application/json',
        'Referer': 'https://vk.com/',
      },
    });

    if (!response.ok) {
      throw new ProviderError(
        `VK oEmbed fetch failed: ${response.status}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'vk',
      );
    }

    return await response.json() as VKOEmbedData;
  }

  // ─── Private: VK API Fetch ──────────────────────────────────────────────

  private async _fetchFromApi(videoId: string): Promise<VKVideoItem | null> {
    const apiUrl = 'https://api.vk.com/method/video.get';
    const params = new URLSearchParams({
      access_token: this._vkAccessToken,
      v: this._vkApiVersion,
      videos: videoId,
    });

    const response = await fetch(`${apiUrl}?${params.toString()}`, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new ProviderError(
        `VK API fetch failed: ${response.status}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'vk',
      );
    }

    const data = await response.json() as VKApiVideoResponse;

    if (data.error) {
      const errorCode: number = data.error.error_code ?? 0;
      // VK error code 5 = invalid access token
      if (errorCode === 5) {
        throw new ProviderError(
          `VK API auth failed: ${data.error.error_msg}`,
          this.id,
          'AUTH_FAILED',
          false,
          'vk',
        );
      }
      // VK error code 15 = access denied (private video)
      if (errorCode === 15) {
        throw new ProviderError(
          `VK video is private: ${data.error.error_msg}`,
          this.id,
          'PRIVATE',
          false,
          'vk',
        );
      }
      // VK error code 100 = invalid parameters
      if (errorCode === 100) {
        throw new ProviderError(
          `VK API invalid params: ${data.error.error_msg}`,
          this.id,
          'UNSUPPORTED',
          false,
          'vk',
        );
      }
      throw new ProviderError(
        `VK API error ${String(errorCode)}: ${data.error.error_msg ?? 'unknown'}`,
        this.id,
        'UNKNOWN',
        errorCode >= 500 || false,
        'vk',
      );
    }

    const items = data.response?.items;
    if (items && items.length > 0) {
      const firstItem = items[0];
      return firstItem ?? null;
    }

    return null;
  }

  // ─── Private: Extract PlayerParams from HTML ──────────────────────────────

  private _extractPlayerParamsFromHtml(html: string): VKPlayerParams | null {
    // Pattern 1: var playerParams = {...};
    const varMatch = /var\s+playerParams\s*=\s*(\{[\s\S]*?\});/m.exec(html);
    if (varMatch?.[1]) {
      try {
        const parsed = JSON.parse(varMatch[1]) as VKPlayerParams;
        if (parsed.hd_src || parsed.sd_src || parsed.urls) return parsed;
      } catch {
        // Parse failed — try next pattern
      }
    }

    // Pattern 2: window.playerParams = {...};
    const windowMatch = /window\.playerParams\s*=\s*(\{[\s\S]*?\});/m.exec(html);
    if (windowMatch?.[1]) {
      try {
        const parsed = JSON.parse(windowMatch[1]) as VKPlayerParams;
        if (parsed.hd_src || parsed.sd_src || parsed.urls) return parsed;
      } catch {
        // Parse failed — try next pattern
      }
    }

    // Pattern 3: Inline script containing video configuration object
    // VK embeds video data in a larger JSON blob within script tags
    const inlineMatch = /"video_data"\s*:\s*(\{[\s\S]*?"urls"[\s\S]*?\})/m.exec(html);
    if (inlineMatch?.[1]) {
      try {
        const parsed = JSON.parse(inlineMatch[1]) as VKPlayerParams;
        if (parsed.urls) return parsed;
      } catch {
        // Parse failed — try next pattern
      }
    }

    // Pattern 4: Extract from al_video object embedded in VK's module data
    // VK uses a pattern like: al_video: { ... } within page data
    const alVideoMatch = /al_video.*?(\{"oid"\s*:.*?"hd_src"\s*:.*?\})/s.exec(html);
    if (alVideoMatch?.[1]) {
      try {
        const parsed = JSON.parse(alVideoMatch[1]) as VKPlayerParams;
        if (parsed.hd_src || parsed.sd_src) return parsed;
      } catch {
        // Parse failed
      }
    }

    // Pattern 5: Direct "hd_src":"url" / "sd_src":"url" strings in HTML
    const hdSrcMatch = /"hd_src"\s*:\s*"([^"]+)"/.exec(html);
    const sdSrcMatch = /"sd_src"\s*:\s*"([^"]+)"/.exec(html);
    const lowSrcMatch = /"low_src"\s*:\s*"([^"]+)"/.exec(html);
    const srcMatch = /"src"\s*:\s*"([^"]+)"/.exec(html);
    const durationMatch = /"duration"\s*:\s*(\d+)/.exec(html);
    const thumbMatch = /"thumb"\s*:\s*"([^"]+)"/.exec(html);
    const titleMatch = /"title"\s*:\s*"([^"]*?)"/.exec(html);
    const oidMatch = /"oid"\s*:\s*(-?\d+)/.exec(html);
    const vidMatch = /"id"\s*:\s*(\d+)/.exec(html);

    const hdSrc = hdSrcMatch?.[1];
    const sdSrc = sdSrcMatch?.[1];
    const lowSrc = lowSrcMatch?.[1];
    const src = srcMatch?.[1];

    if (hdSrc || sdSrc || lowSrc || src) {
      // Extract quality URLs from "urlNN0":"url" patterns
      const urls: VKVideoUrls = {};
      const url1080Match = /"url1080"\s*:\s*"([^"]+)"/.exec(html);
      const url720Match = /"url720"\s*:\s*"([^"]+)"/.exec(html);
      const url480Match = /"url480"\s*:\s*"([^"]+)"/.exec(html);
      const url360Match = /"url360"\s*:\s*"([^"]+)"/.exec(html);
      const url240Match = /"url240"\s*:\s*"([^"]+)"/.exec(html);

      if (url1080Match?.[1]) urls[1080] = url1080Match[1];
      if (url720Match?.[1]) urls[720] = url720Match[1];
      if (url480Match?.[1]) urls[480] = url480Match[1];
      if (url360Match?.[1]) urls[360] = url360Match[1];
      if (url240Match?.[1]) urls[240] = url240Match[1];

      return {
        hd_src: hdSrc,
        sd_src: sdSrc,
        low_src: lowSrc,
        src: src,
        urls,
        duration: durationMatch?.[1] ? parseInt(durationMatch[1], 10) : undefined,
        thumb: thumbMatch?.[1],
        thumbnail: thumbMatch?.[1],
        title: titleMatch?.[1],
        oid: oidMatch?.[1],
        id: vidMatch?.[1],
      };
    }

    return null;
  }

  // ─── Private: Extract <video> Tag Source from HTML ──────────────────────

  private _extractVideoTagSrcFromHtml(html: string): string | null {
    // Look for <video> tag with src attribute
    const videoSrcMatch = /<video[^>]*\s+src\s*=\s*"([^"]+)"/i.exec(html);
    if (videoSrcMatch?.[1]) return videoSrcMatch[1];

    // Look for <source> tag inside <video>
    const sourceSrcMatch = /<source[^>]*\s+src\s*=\s*"([^"]+)"[^>]*type\s*=\s*"video\/(?:mp4|webm)"/i.exec(html);
    if (sourceSrcMatch?.[1]) return sourceSrcMatch[1];

    // Look for any <source> with video content type inside video element
    const altSourceMatch = /<video[^>]*>[\s\S]*?<source[^>]*src\s*=\s*"([^"]+)"[\s\S]*?<\/video>/i.exec(html);
    if (altSourceMatch?.[1]) return altSourceMatch[1];

    return null;
  }

  // ─── Private: Extract Open Graph from HTML ──────────────────────────────

  private _extractOpenGraphFromHtml(html: string): VKOpenGraphData {
    return {
      ogVideo: this._extractMetaContent(html, 'og:video'),
      ogVideoUrl: this._extractMetaContent(html, 'og:video:url'),
      ogVideoSecureUrl: this._extractMetaContent(html, 'og:video:secure_url'),
      ogVideoType: this._extractMetaContent(html, 'og:video:type'),
      ogTitle: this._extractMetaContent(html, 'og:title'),
      ogDescription: this._extractMetaContent(html, 'og:description'),
      ogImage: this._extractMetaContent(html, 'og:image'),
      ogImageWidth: this._extractMetaContentAsNumber(html, 'og:image:width'),
      ogImageHeight: this._extractMetaContentAsNumber(html, 'og:image:height'),
      ogSiteName: this._extractMetaContent(html, 'og:site_name'),
      ogVideoWidth: this._extractMetaContentAsNumber(html, 'og:video:width'),
      ogVideoHeight: this._extractMetaContentAsNumber(html, 'og:video:height'),
    };
  }

  private _extractMetaContent(html: string, property: string): string | undefined {
    // Match both property= and name= attributes, both single and double quotes
    const pattern = new RegExp(
      `<meta\\s+(?:property|name)=["']${property}["']\\s+content=["']([^"']+)["']`,
      'i',
    );
    const match = pattern.exec(html);
    return match?.[1];
  }

  private _extractMetaContentAsNumber(html: string, property: string): number | undefined {
    const content = this._extractMetaContent(html, property);
    if (!content) return undefined;
    const parsed = parseInt(content, 10);
    return isNaN(parsed) ? undefined : parsed;
  }

  // ─── Private: Build Result from VK API Item ──────────────────────────────

  private _buildResultFromApiItem(item: VKVideoItem, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const qualityOptions: QualityOption[] = [];
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    const files = item.files;

    // Build quality-level video items from API files object
    const qualityMap: Array<{ key: string; label: string; height: number; urlKey: keyof VKVideoFiles }> = [
      { key: '1080', label: '1080p', height: 1080, urlKey: 'mp4_1080' },
      { key: '720', label: '720p', height: 720, urlKey: 'mp4_720' },
      { key: '480', label: '480p', height: 480, urlKey: 'mp4_480' },
      { key: '360', label: '360p', height: 360, urlKey: 'mp4_360' },
      { key: '240', label: '240p', height: 240, urlKey: 'mp4_240' },
    ];

    if (files) {
      for (const q of qualityMap) {
        const url = files[q.urlKey];
        if (url) {
          mediaItems.push({
            type: 'video',
            format: 'mp4',
            quality: q.label,
            url: url,
            directUrl: url,
            duration: item.duration,
            resolution: { width: Math.round(q.height * 16 / 9), height: q.height },
            title: item.title,
            filename: this._buildFilename(item.title ?? 'vk_video', 'mp4'),
          });

          qualityOptions.push({
            label: q.label,
            quality: q.label,
            format: 'mp4',
            url: url,
            resolution: { width: Math.round(q.height * 16 / 9), height: q.height },
            isSource: q.height === 1080,
          });
        }
      }

      // HLS stream if available
      if (files.hls) {
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: 'best',
          url: files.hls,
          streamUrl: files.hls,
          duration: item.duration,
          title: item.title,
        });
      }

      // Live HLS stream
      if (files.live_hls) {
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: 'best',
          url: files.live_hls,
          streamUrl: files.live_hls,
          duration: item.duration,
          title: item.title,
        });
      }

      // External source (e.g., YouTube embed on VK)
      if (files.external) {
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: 'best',
          url: files.external,
          title: item.title,
        });
      }
    }

    // Player embed URL as fallback if no direct files
    if (mediaItems.length === 0 && item.player) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: 'best',
        url: item.player,
        streamUrl: item.player,
        duration: item.duration,
        title: item.title,
      });
    }

    // Thumbnails from API photo fields
    const thumbFields: Array<{ field: keyof VKVideoItem; width: number; height: number }> = [
      { field: 'photo_1920', width: 1920, height: 1080 },
      { field: 'photo_1280', width: 1280, height: 720 },
      { field: 'photo_800', width: 800, height: 450 },
      { field: 'photo_640', width: 640, height: 360 },
      { field: 'photo_320', width: 320, height: 180 },
    ];

    for (const t of thumbFields) {
      const thumbUrl = item[t.field as keyof VKVideoItem];
      if (typeof thumbUrl === 'string') {
        thumbnails.push({ url: thumbUrl, width: t.width, height: t.height, format: 'jpeg' });
      }
    }

    // Largest thumbnail as cover
    const coverUrl = item.photo_1920 ?? item.photo_1280 ?? item.photo_800 ?? item.photo_640;
    if (coverUrl) {
      covers.push({ url: coverUrl, format: 'jpeg' });
    }

    // Build metadata
    const ownerId = item.owner_id;
    const videoId = item.id;
    const compositeId = ownerId && videoId ? `${ownerId}_${videoId}` : undefined;

    const metadata: ExtractionMetadata = {
      title: item.title,
      description: item.description,
      author: ownerId ? `VK User ${ownerId}` : undefined,
      authorId: ownerId,
      authorUrl: ownerId ? `https://vk.com/id${ownerId.replace('-', '')}` : undefined,
      platform: 'vk',
      originalUrl,
      duration: item.duration,
      viewCount: item.views,
      likeCount: item.likes?.count,
      commentCount: item.comments?.count,
      uploadDate: item.date ? new Date(item.date * 1000).toISOString() : undefined,
      isPrivate: item.is_private ?? false,
      extra: {
        videoId: compositeId,
        ownerId,
        accessKey: item.access_key,
        canDownload: String(item.can_download ?? false),
        contentRestricted: String(item.content_restricted ?? 0),
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'vk',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse: item,
    };
  }

  // ─── Private: Build Result from PlayerParams ──────────────────────────────

  private _buildResultFromPlayerParams(params: VKPlayerParams, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const qualityOptions: QualityOption[] = [];
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    // Quality-level URLs from params.urls
    const urls = params.urls;
    if (urls) {
      const qualityMap: Array<{ key: string; label: string; height: number }> = [
        { key: '1080', label: '1080p', height: 1080 },
        { key: '720', label: '720p', height: 720 },
        { key: '480', label: '480p', height: 480 },
        { key: '360', label: '360p', height: 360 },
        { key: '240', label: '240p', height: 240 },
      ];

      for (const q of qualityMap) {
        const url = urls[q.key as unknown as keyof VKVideoUrls];
        if (url) {
          mediaItems.push({
            type: 'video',
            format: 'mp4',
            quality: q.label,
            url: url,
            directUrl: url,
            duration: params.duration,
            resolution: { width: Math.round(q.height * 16 / 9), height: q.height },
            title: params.title,
            filename: this._buildFilename(params.title ?? 'vk_video', 'mp4'),
          });

          qualityOptions.push({
            label: q.label,
            quality: q.label,
            format: 'mp4',
            url: url,
            resolution: { width: Math.round(q.height * 16 / 9), height: q.height },
            isSource: q.height === 1080,
          });
        }
      }
    }

    // HD source (legacy format)
    if (params.hd_src) {
      const hasHigherQuality = urls?.[1080] !== undefined;
      if (!hasHigherQuality) {
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: this._heightToQuality(params.height ?? 0),
          url: params.hd_src,
          directUrl: params.hd_src,
          duration: params.duration,
          resolution: params.width && params.height ? { width: params.width, height: params.height } : undefined,
          title: params.title,
          filename: this._buildFilename(params.title ?? 'vk_video_hd', 'mp4'),
        });

        qualityOptions.push({
          label: 'HD',
          quality: this._heightToQuality(params.height ?? 0),
          format: 'mp4',
          url: params.hd_src,
          isSource: true,
        });
      }
    }

    // SD source (legacy format)
    if (params.sd_src) {
      const has480Quality = urls?.[480] !== undefined;
      if (!has480Quality) {
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: '480p',
          url: params.sd_src,
          directUrl: params.sd_src,
          duration: params.duration,
          title: params.title,
          filename: this._buildFilename(params.title ?? 'vk_video_sd', 'mp4'),
        });

        qualityOptions.push({
          label: 'SD',
          quality: '480p',
          format: 'mp4',
          url: params.sd_src,
        });
      }
    }

    // Low source (legacy format)
    if (params.low_src) {
      const has240Quality = urls?.[240] !== undefined;
      if (!has240Quality) {
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: '360p',
          url: params.low_src,
          directUrl: params.low_src,
          duration: params.duration,
          title: params.title,
          filename: this._buildFilename(params.title ?? 'vk_video_low', 'mp4'),
        });

        qualityOptions.push({
          label: 'Low',
          quality: '360p',
          format: 'mp4',
          url: params.low_src,
        });
      }
    }

    // Generic src as absolute fallback
    if (mediaItems.length === 0 && params.src) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: 'best',
        url: params.src,
        directUrl: params.src,
        duration: params.duration,
        title: params.title,
      });
    }

    // Thumbnail / cover
    const thumbnailUrl = params.thumbnail ?? params.thumb;
    if (thumbnailUrl) {
      covers.push({ url: thumbnailUrl, format: 'jpeg' });
      thumbnails.push({ url: thumbnailUrl, width: params.width, height: params.height, format: 'jpeg' });
    }

    // Build metadata
    const compositeId = params.oid && params.id ? `${params.oid}_${params.id}` : params.video_id;

    const metadata: ExtractionMetadata = {
      title: params.title,
      author: params.md_author?.name ?? (params.oid ? `VK User ${params.oid}` : undefined),
      authorId: params.oid ?? params.md_author?.id,
      authorUrl: params.md_author?.profile ?? (params.oid ? `https://vk.com/id${Math.abs(parseInt(params.oid, 10))}` : undefined),
      platform: 'vk',
      originalUrl,
      duration: params.duration,
      viewCount: params.viewer_count,
      isLive: params.is_live,
      extra: {
        videoId: compositeId,
        canDownload: params.can_download,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'vk',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse: params,
    };
  }

  // ─── Private: Build Result from Video Src ──────────────────────────────

  private _buildResultFromVideoSrc(videoSrc: string, originalUrl: string, html: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const covers: CoverImage[] = [];

    // Try to extract additional metadata from the same HTML
    const titleMatch = /<meta\s+(?:property|name)=["']og:title["']\s+content=["']([^"']+)["']/i.exec(html);
    const descMatch = /<meta\s+(?:property|name)=["']og:description["']\s+content=["']([^"']+)["']/i.exec(html);
    const imageMatch = /<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i.exec(html);
    const durationMatch = /"duration"\s*:\s*(\d+)/.exec(html);

    const title = titleMatch?.[1];
    const description = descMatch?.[1];
    const imageUrl = imageMatch?.[1];
    const duration = durationMatch?.[1] ? parseInt(durationMatch[1], 10) : undefined;

    // Determine format from URL extension
    const format = videoSrc.includes('.webm') ? 'webm' : 'mp4';

    mediaItems.push({
      type: 'video',
      format: format,
      quality: 'best',
      url: videoSrc,
      directUrl: videoSrc,
      duration: duration,
      title: title,
      filename: this._buildFilename(title ?? 'vk_video', format),
    });

    if (imageUrl) {
      covers.push({ url: imageUrl, format: 'jpeg' });
    }

    const metadata: ExtractionMetadata = {
      title: title,
      description: description,
      platform: 'vk',
      originalUrl,
      duration: duration,
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'vk',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      rawResponse: { videoSrc, title, description, imageUrl, duration },
    };
  }

  // ─── Private: Build Result from oEmbed ────────────────────────────────────

  private _buildResultFromOEmbed(oembed: VKOEmbedData, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    // oEmbed provides metadata and thumbnail but not direct video URLs
    // The html field contains an iframe embed code that may contain a player URL
    if (oembed.html) {
      const iframeSrcMatch = /src=["']([^"']+)["']/i.exec(oembed.html);
      if (iframeSrcMatch?.[1]) {
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: 'best',
          url: iframeSrcMatch[1],
          streamUrl: iframeSrcMatch[1],
          title: oembed.title,
        });
      }
    }

    if (oembed.thumbnail_url) {
      covers.push({
        url: oembed.thumbnail_url,
        width: oembed.thumbnail_width,
        height: oembed.thumbnail_height,
        format: 'jpeg',
      });

      thumbnails.push({
        url: oembed.thumbnail_url,
        width: oembed.thumbnail_width,
        height: oembed.thumbnail_height,
        format: 'jpeg',
      });
    }

    const metadata: ExtractionMetadata = {
      title: oembed.title,
      author: oembed.author_name,
      authorUrl: oembed.author_url,
      platform: 'vk',
      originalUrl,
      extra: {
        oembedType: oembed.type,
        providerName: oembed.provider_name,
        providerUrl: oembed.provider_url,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'vk',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      rawResponse: oembed,
    };
  }

  // ─── Private: Build Result from Open Graph ──────────────────────────────

  private _buildResultFromOpenGraph(ogData: VKOpenGraphData, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    // Prefer secure URL, then og:video:url, then og:video
    const videoUrl = ogData.ogVideoSecureUrl ?? ogData.ogVideoUrl ?? ogData.ogVideo;
    if (videoUrl) {
      // Determine format from URL or og:video:type
      const isWebm = ogData.ogVideoType?.includes('webm') || videoUrl.includes('.webm');
      const format = isWebm ? 'webm' : 'mp4';

      mediaItems.push({
        type: 'video',
        format: format,
        quality: this._heightToQuality(ogData.ogVideoHeight ?? 0),
        url: videoUrl,
        directUrl: videoUrl,
        resolution: ogData.ogVideoWidth && ogData.ogVideoHeight
          ? { width: ogData.ogVideoWidth, height: ogData.ogVideoHeight }
          : undefined,
        title: ogData.ogTitle,
      });
    }

    // Cover image from og:image
    if (ogData.ogImage) {
      covers.push({
        url: ogData.ogImage,
        width: ogData.ogImageWidth,
        height: ogData.ogImageHeight,
        format: 'jpeg',
      });

      thumbnails.push({
        url: ogData.ogImage,
        width: ogData.ogImageWidth,
        height: ogData.ogImageHeight,
        format: 'jpeg',
      });
    }

    const metadata: ExtractionMetadata = {
      title: ogData.ogTitle,
      description: ogData.ogDescription,
      platform: 'vk',
      originalUrl,
      extra: {
        videoType: ogData.ogVideoType,
        siteName: ogData.ogSiteName,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'vk',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      rawResponse: ogData,
    };
  }

  // ─── Private: Helpers ────────────────────────────────────────────────────

  private _heightToQuality(height: number): '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p' | '240p' {
    if (height >= 2160) return '2160p';
    if (height >= 1440) return '1440p';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    if (height >= 360) return '360p';
    return '240p';
  }

  private _buildFilename(title: string, ext: string): string {
    const sanitized = title.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').substring(0, 200);
    return `${sanitized}.${ext}`;
  }
}
