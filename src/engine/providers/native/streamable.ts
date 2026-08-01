/**
 * NovaDL Engine — Streamable Native Extractor
 *
 * Production-grade extractor for Streamable video content using
 * multiple extraction strategies with cascading fallback.
 *
 * Extraction strategies (all real, no mock):
 * 1. Streamable API endpoint (`/videos/{shortcode}`) — full video data
 *    with multiple quality levels (mp4-mobile, mp4-full, mp4-720p, etc.)
 * 2. Streamable oEmbed endpoint (`/oembed?url=...`) — title, author, thumbnail
 * 3. Streamable page HTML parsing — extract video data from <meta> tags
 *    (og:video, og:video:url, og:video:secure_url, og:video:type,
 *    og:image, og:title, og:description)
 * 4. Direct <video> tag parsing for source URLs
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

// ─── Streamable Data Types ────────────────────────────────────────────

/** Response from Streamable's /videos/{shortcode} API endpoint */
interface StreamableVideoData {
  shortcode?: string;
  title?: string;
  description?: string;
  url?: string;
  thumbnail_url?: string;
  files?: Record<string, StreamableFileData>;
  thumbnail_width?: number;
  thumbnail_height?: number;
  date_created?: string;
  date_lastmod?: string;
  views?: number;
  likes?: number;
  duration?: number;
  user?: StreamableUserInfo;
  status?: number; // 0=uploading, 1=ready, 2=error, 3=deleted
  message?: string;
  embed_code?: string;
  player_url?: string;
}

/** User information from Streamable API */
interface StreamableUserInfo {
  username?: string;
  user_id?: number;
  url?: string;
  avatar_url?: string;
}

/** Individual file variant within Streamable video data */
interface StreamableFileData {
  url?: string;
  width?: number;
  height?: number;
  duration?: number;
  bitrate?: number;
  size?: number;
  mime?: string;
  codec?: string;
  fps?: number;
}

/** Response from Streamable's oEmbed endpoint */
interface StreamableOEmbedData {
  type?: string;
  version?: string;
  title?: string;
  author_name?: string;
  author_url?: string;
  provider_name?: string;
  provider_url?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  width?: number;
  height?: number;
  html?: string;
  duration?: number;
}

/** Parsed meta tag data from Streamable page HTML */
interface StreamableMetaTags {
  ogVideo?: string;
  ogVideoUrl?: string;
  ogVideoSecureUrl?: string;
  ogVideoType?: string;
  ogImage?: string;
  ogImageSecureUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogSiteName?: string;
  ogUrl?: string;
  twitterCard?: string;
  twitterTitle?: string;
  twitterImage?: string;
  twitterPlayer?: string;
}

/** Parsed <video> tag source data */
interface StreamableVideoSource {
  src?: string;
  type?: string;
}

/** Parsed <video> tag data from HTML */
interface StreamableVideoTagData {
  poster?: string;
  sources: StreamableVideoSource[];
}

// ─── Quality Label Mapping ────────────────────────────────────────────

/** Map Streamable file keys to human-readable quality labels */
const STREAMABLE_QUALITY_MAP: Record<string, string> = {
  'mp4-mobile': 'Mobile (360p)',
  'mp4-360p': '360p',
  'mp4-480p': '480p',
  'mp4-720p': '720p HD',
  'mp4-full': 'Original (Full Quality)',
  'mp4': 'Standard',
  'webm-mobile': 'Mobile WebM (360p)',
  'webm-full': 'Original WebM',
  'webm': 'Standard WebM',
};

/** Map Streamable file keys to VideoQuality type values */
const STREAMABLE_QUALITY_LEVEL: Record<string, string> = {
  'mp4-mobile': '360p',
  'mp4-360p': '360p',
  'mp4-480p': '480p',
  'mp4-720p': '720p',
  'mp4-full': 'best',
  'mp4': '720p',
  'webm-mobile': '360p',
  'webm-full': 'best',
  'webm': '720p',
};

// ─── Provider Implementation ──────────────────────────────────────────
export class StreamableNativeExtractor extends BaseProvider {
  readonly id = 'native_streamable';
  readonly name = 'Streamable Native Extractor';
  readonly type: 'custom' = 'custom';

  private _userAgent: string;

  constructor(config: ProviderConfig) {
    super(config);
    this._userAgent = config.customOptions?.userAgent as string ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
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
        `Streamable native extractor does not support platform '${platform}'`,
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
    return platform === 'streamable';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['streamable'],
      mediaTypes: ['video', 'image', 'metadata'],
      formats: ['mp4', 'jpeg', 'png', 'webp'],
      qualities: ['best', '720p', '480p', '360p'],
      features: [
        'video_download',
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
      // Use Streamable's public API to verify service availability
      const response = await fetch('https://api.streamable.com/oembed?url=https://streamable.com/example', {
        headers: { 'User-Agent': this._userAgent, 'Accept': 'application/json' },
      });
      // 200 or 404 both confirm the API is reachable; 5xx means service is down
      if (response.status >= 500) {
        return {
          status: 'unhealthy',
          latencyMs: Date.now() - startTime,
          lastChecked: new Date(),
          lastError: `Streamable API returned server error: ${response.status}`,
          consecutiveFailures: (this._health.consecutiveFailures ?? 0) + 1,
          consecutiveSuccesses: 0,
          successRate: 0,
        };
      }
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
    const shortcode = this._extractShortcode(url);
    if (!shortcode) {
      throw new ProviderError(
        'Could not extract Streamable shortcode from URL',
        this.id,
        'UNSUPPORTED',
        false,
        'streamable',
      );
    }

    // Strategy 1: Streamable API endpoint — richest data source
    // with multiple quality levels, bitrate, size, codec info
    try {
      const videoData = await this._fetchApiData(shortcode);
      if (videoData && videoData.status === 1) {
        return this._buildResultFromApiData(videoData, url);
      }
    } catch {
      // Continue to next strategy
    }

    // Strategy 2: oEmbed endpoint — provides title, author, thumbnail
    try {
      const oembed = await this._fetchOEmbed(url);
      if (oembed) {
        return this._buildResultFromOEmbed(oembed, url, shortcode);
      }
    } catch {
      // Continue to next strategy
    }

    // Strategy 3: Page HTML parsing — extract from <meta> tags and <video> tag
    try {
      const html = await this._fetchPage(url);
      const metaTags = this._extractMetaTagsFromHtml(html);
      const videoTagData = this._extractVideoTagFromHtml(html);
      if (metaTags.ogVideo || metaTags.ogVideoUrl || metaTags.ogVideoSecureUrl || videoTagData.sources.length > 0) {
        return this._buildResultFromHtml(metaTags, videoTagData, url, shortcode);
      }
    } catch {
      // All strategies failed
    }

    throw new ProviderError(
      'Could not extract Streamable video data. All extraction strategies exhausted.',
      this.id,
      'PARSE_ERROR',
      false,
      'streamable',
    );
  }

  // ─── Private: Shortcode Extraction ──────────────────────────────────────
  private _extractShortcode(url: string): string | null {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
      // Streamable URLs: streamable.com/{shortcode} or streamable.com/{shortcode}/info
      // Shortcodes are typically alphanumeric, 5-8 characters
      const parts = pathname.split('/');
      if (parts.length > 0 && parts[0]) {
        const shortcode = parts[0];
        // Validate shortcode format: alphanumeric, may contain hyphens
        if (/^[a-zA-Z0-9_-]+$/.test(shortcode)) {
          return shortcode;
        }
      }
    } catch {
      // URL parse failed
    }
    return null;
  }

  // ─── Private: API Data Fetch ────────────────────────────────────────────
  private async _fetchApiData(shortcode: string): Promise<StreamableVideoData | null> {
    const apiUrl = `https://api.streamable.com/videos/${shortcode}`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'application/json',
        'Referer': 'https://streamable.com/',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Video not found — try other strategies
      }
      throw new ProviderError(
        `Streamable API fetch failed: ${response.status}`,
        this.id,
        response.status >= 500 ? 'NETWORK' : 'PARSE_ERROR',
        response.status >= 500,
        'streamable',
      );
    }

    const data = await response.json() as StreamableVideoData;
    return data;
  }

  // ─── Private: oEmbed Fetch ──────────────────────────────────────────────
  private async _fetchOEmbed(url: string): Promise<StreamableOEmbedData | null> {
    const oembedUrl = `https://api.streamable.com/oembed?url=${encodeURIComponent(url)}`;
    const response = await fetch(oembedUrl, {
      headers: { 'User-Agent': this._userAgent, 'Accept': 'application/json' },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new ProviderError(
        `Streamable oEmbed fetch failed: ${response.status}`,
        this.id,
        response.status >= 500 ? 'NETWORK' : 'PARSE_ERROR',
        response.status >= 500,
        'streamable',
      );
    }

    return await response.json() as StreamableOEmbedData;
  }

  // ─── Private: Page Fetching ─────────────────────────────────────────────
  private async _fetchPage(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new ProviderError(
        `Streamable page fetch failed: ${response.status}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'streamable',
      );
    }

    return response.text();
  }

  // ─── Private: Meta Tags Extraction from HTML ────────────────────────────
  private _extractMetaTagsFromHtml(html: string): StreamableMetaTags {
    const metaTags: StreamableMetaTags = {
      ogVideo: undefined,
      ogVideoUrl: undefined,
      ogVideoSecureUrl: undefined,
      ogVideoType: undefined,
      ogImage: undefined,
      ogImageSecureUrl: undefined,
      ogTitle: undefined,
      ogDescription: undefined,
      ogSiteName: undefined,
      ogUrl: undefined,
      twitterCard: undefined,
      twitterTitle: undefined,
      twitterImage: undefined,
      twitterPlayer: undefined,
    };

    // Parse OpenGraph meta tags
    const ogPatterns: Array<{ property: string; target: keyof StreamableMetaTags }> = [
      { property: 'og:video', target: 'ogVideo' },
      { property: 'og:video:url', target: 'ogVideoUrl' },
      { property: 'og:video:secure_url', target: 'ogVideoSecureUrl' },
      { property: 'og:video:type', target: 'ogVideoType' },
      { property: 'og:image', target: 'ogImage' },
      { property: 'og:image:secure_url', target: 'ogImageSecureUrl' },
      { property: 'og:title', target: 'ogTitle' },
      { property: 'og:description', target: 'ogDescription' },
      { property: 'og:site_name', target: 'ogSiteName' },
      { property: 'og:url', target: 'ogUrl' },
    ];

    for (const { property, target } of ogPatterns) {
      // Match <meta property="og:..." content="..."> or <meta content="..." property="og:...">
      const pattern = new RegExp(
        `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`,
        'i',
      );
      const match = pattern.exec(html);
      if (match?.[1]) {
        metaTags[target] = match[1];
        continue;
      }
      // Alternative attribute order: content before property
      const altPattern = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["'][^>]*>`,
        'i',
      );
      const altMatch = altPattern.exec(html);
      if (altMatch?.[1]) {
        metaTags[target] = altMatch[1];
      }
    }

    // Parse Twitter card meta tags
    const twitterPatterns: Array<{ property: string; target: keyof StreamableMetaTags }> = [
      { property: 'twitter:card', target: 'twitterCard' },
      { property: 'twitter:title', target: 'twitterTitle' },
      { property: 'twitter:image', target: 'twitterImage' },
      { property: 'twitter:player', target: 'twitterPlayer' },
    ];

    for (const { property, target } of twitterPatterns) {
      const pattern = new RegExp(
        `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`,
        'i',
      );
      const match = pattern.exec(html);
      if (match?.[1]) {
        metaTags[target] = match[1];
        continue;
      }
      const altPattern = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["'][^>]*>`,
        'i',
      );
      const altMatch = altPattern.exec(html);
      if (altMatch?.[1]) {
        metaTags[target] = altMatch[1];
      }
    }

    return metaTags;
  }

  // ─── Private: Video Tag Extraction from HTML ────────────────────────────
  private _extractVideoTagFromHtml(html: string): StreamableVideoTagData {
    const result: StreamableVideoTagData = { poster: undefined, sources: [] };

    // Find <video> tag — extract poster attribute
    const videoTagMatch = /<video[^>]+poster=["']([^"']+)["'][^>]*>/i.exec(html);
    if (videoTagMatch?.[1]) {
      result.poster = videoTagMatch[1];
    }

    // Alternative: <video> without poster, just get the tag itself
    const videoTagNoPoster = /<video[^>]*>/i.exec(html);
    if (!videoTagMatch && videoTagNoPoster?.[0]) {
      const posterAttr = /poster=["']([^"']+)["']/i.exec(videoTagNoPoster[0]);
      if (posterAttr?.[1]) {
        result.poster = posterAttr[1];
      }
    }

    // Find <source> tags within <video>...</video>
    // Extract all source URLs with their type attributes
    const sourceMatches = /<source[^>]+src=["']([^"']+)["'][^>]*(?:type=["']([^"']+)["'])?[^>]*>/gi;
    let sourceMatch: RegExpExecArray | null;
    while ((sourceMatch = sourceMatches.exec(html)) !== null) {
      if (sourceMatch[1]) {
        result.sources.push({
          src: sourceMatch[1],
          type: sourceMatch[2] ?? undefined,
        });
      }
    }

    // Alternative attribute order for <source>: type before src
    const altSourceMatches = /<source[^>]+(?:type=["']([^"']+)["'])[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let altSourceResult: RegExpExecArray | null;
    const existingSrcs = new Set(result.sources.map((s) => s.src));
    while ((altSourceResult = altSourceMatches.exec(html)) !== null) {
      const sourceType = altSourceResult[1];
      const sourceSrc = altSourceResult[2];
      if (sourceSrc && !existingSrcs.has(sourceSrc)) {
        result.sources.push({ src: sourceSrc, type: sourceType ?? undefined });
        existingSrcs.add(sourceSrc);
      }
    }

    return result;
  }

  // ─── Private: Build Result from API Data ────────────────────────────────
  private _buildResultFromApiData(data: StreamableVideoData, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const qualityOptions: QualityOption[] = [];
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    // Process all file variants from Streamable API
    // Streamable returns files as a dict: { "mp4": {url, width, height...}, "mp4-mobile": {...} }
    const files = data.files ?? {};
    let bestQualityKey: string | undefined;

    // Determine the "best" quality key for the primary media item
    const qualityPriority = ['mp4-full', 'mp4-720p', 'mp4', 'mp4-480p', 'mp4-360p', 'mp4-mobile'];

    for (const key of qualityPriority) {
      if (files[key]?.url) {
        bestQualityKey = key;
        break;
      }
    }

    // Build MediaItem for each available quality level
    for (const [fileKey, fileData] of Object.entries(files)) {
      if (!fileData.url) continue;

      // Streamable URLs may be relative (starting with //) — normalize to https
      const videoUrl = this._normalizeUrl(fileData.url);
      const qualityLabel = STREAMABLE_QUALITY_MAP[fileKey] ?? fileKey;
      const qualityLevel = STREAMABLE_QUALITY_LEVEL[fileKey] ?? '720p';
      const format = this._deriveFormatFromKey(fileKey, fileData.mime);

      const isSource = fileKey === bestQualityKey;

      mediaItems.push({
        type: 'video',
        format,
        quality: qualityLevel as QualityOption['quality'],
        url: videoUrl,
        directUrl: videoUrl,
        duration: fileData.duration ?? data.duration,
        size: fileData.size,
        bitrate: fileData.bitrate,
        fps: fileData.fps,
        codec: fileData.codec ? { video: fileData.codec, container: format } : undefined,
        resolution: fileData.width && fileData.height
          ? { width: fileData.width, height: fileData.height }
          : undefined,
        title: data.title,
        filename: this._buildFilename(
          data.title ?? data.shortcode ?? 'streamable_video',
          format,
        ),
        headers: isSource ? { 'Referer': 'https://streamable.com/' } : undefined,
      });

      qualityOptions.push({
        label: qualityLabel,
        quality: qualityLevel as QualityOption['quality'],
        format,
        url: videoUrl,
        size: fileData.size,
        bitrate: fileData.bitrate,
        codec: fileData.codec ? { video: fileData.codec, container: format } : undefined,
        resolution: fileData.width && fileData.height
          ? { width: fileData.width, height: fileData.height }
          : undefined,
        isSource,
      });
    }

    // If no files were found but URL exists on the video data
    if (mediaItems.length === 0 && data.url) {
      const normalizedUrl = this._normalizeUrl(data.url);
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: 'best',
        url: normalizedUrl,
        directUrl: normalizedUrl,
        duration: data.duration,
        title: data.title,
        filename: this._buildFilename(data.title ?? data.shortcode ?? 'streamable_video', 'mp4'),
      });
    }

    // Thumbnail extraction
    if (data.thumbnail_url) {
      const thumbUrl = this._normalizeUrl(data.thumbnail_url);
      thumbnails.push({
        url: thumbUrl,
        width: data.thumbnail_width,
        height: data.thumbnail_height,
        format: this._deriveImageFormatFromUrl(thumbUrl),
      });
      covers.push({
        url: thumbUrl,
        width: data.thumbnail_width,
        height: data.thumbnail_height,
        format: this._deriveImageFormatFromUrl(thumbUrl),
      });
    }

    // Metadata
    const metadata: ExtractionMetadata = {
      title: data.title,
      description: data.description,
      author: data.user?.username,
      authorId: data.user?.user_id?.toString(),
      authorUrl: data.user?.url,
      platform: 'streamable',
      originalUrl,
      duration: data.duration,
      viewCount: data.views,
      likeCount: data.likes,
      uploadDate: data.date_created,
      extra: {
        shortcode: data.shortcode,
        status: data.status,
        embedCode: data.embed_code,
        playerUrl: data.player_url,
        message: data.message,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'streamable',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse: data,
    };
  }

  // ─── Private: Build Result from oEmbed ──────────────────────────────────
  private _buildResultFromOEmbed(
    oembed: StreamableOEmbedData,
    originalUrl: string,
    shortcode: string,
  ): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    // Try to extract video URL from oEmbed HTML (iframe embed code)
    if (oembed.html) {
      const iframeSrcMatch = /src=["']([^"']+)["']/i.exec(oembed.html);
      if (iframeSrcMatch?.[1]) {
        // Streamable embed URL — the actual video can be accessed via the embed player
        const embedUrl = iframeSrcMatch[1];
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: 'best',
          url: embedUrl,
          streamUrl: embedUrl,
          duration: oembed.duration,
          title: oembed.title,
          filename: this._buildFilename(oembed.title ?? shortcode, 'mp4'),
        });
      }
    }

    // Thumbnail from oEmbed
    if (oembed.thumbnail_url) {
      const thumbUrl = this._normalizeUrl(oembed.thumbnail_url);
      thumbnails.push({
        url: thumbUrl,
        width: oembed.thumbnail_width,
        height: oembed.thumbnail_height,
        format: this._deriveImageFormatFromUrl(thumbUrl),
      });
      covers.push({
        url: thumbUrl,
        width: oembed.thumbnail_width,
        height: oembed.thumbnail_height,
        format: this._deriveImageFormatFromUrl(thumbUrl),
      });
    }

    const metadata: ExtractionMetadata = {
      title: oembed.title,
      author: oembed.author_name,
      authorUrl: oembed.author_url,
      platform: 'streamable',
      originalUrl,
      duration: oembed.duration,
      extra: {
        shortcode,
        oembedType: oembed.type,
        providerName: oembed.provider_name,
        providerUrl: oembed.provider_url,
        embedWidth: oembed.width,
        embedHeight: oembed.height,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'streamable',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      rawResponse: oembed,
    };
  }

  // ─── Private: Build Result from HTML ────────────────────────────────────
  private _buildResultFromHtml(
    metaTags: StreamableMetaTags,
    videoTagData: StreamableVideoTagData,
    originalUrl: string,
    shortcode: string,
  ): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];
    const qualityOptions: QualityOption[] = [];

    // Strategy 3a: Extract video URL from OpenGraph meta tags
    // og:video:secure_url is preferred (HTTPS), fall back to og:video:url, then og:video
    const ogVideoUrl = metaTags.ogVideoSecureUrl ?? metaTags.ogVideoUrl ?? metaTags.ogVideo;
    if (ogVideoUrl) {
      const normalizedVideoUrl = this._normalizeUrl(ogVideoUrl);
      const videoFormat = this._deriveVideoFormatFromMetaType(metaTags.ogVideoType);

      mediaItems.push({
        type: 'video',
        format: videoFormat,
        quality: 'best',
        url: normalizedVideoUrl,
        directUrl: normalizedVideoUrl,
        title: metaTags.ogTitle,
        filename: this._buildFilename(metaTags.ogTitle ?? shortcode, videoFormat),
        headers: { 'Referer': 'https://streamable.com/' },
      });

      qualityOptions.push({
        label: 'Original (OpenGraph)',
        quality: 'best',
        format: videoFormat,
        url: normalizedVideoUrl,
        isSource: true,
      });
    }

    // Strategy 3b: Twitter player URL
    if (metaTags.twitterPlayer && !ogVideoUrl) {
      const normalizedPlayerUrl = this._normalizeUrl(metaTags.twitterPlayer);
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: 'best',
        url: normalizedPlayerUrl,
        streamUrl: normalizedPlayerUrl,
        title: metaTags.twitterTitle ?? metaTags.ogTitle,
        filename: this._buildFilename(metaTags.twitterTitle ?? metaTags.ogTitle ?? shortcode, 'mp4'),
      });

      qualityOptions.push({
        label: 'Player (Twitter Card)',
        quality: 'best',
        format: 'mp4',
        url: normalizedPlayerUrl,
        isSource: true,
      });
    }

    // Strategy 4: <video> tag source URLs
    for (const source of videoTagData.sources) {
      if (!source.src) continue;

      const normalizedSourceUrl = this._normalizeUrl(source.src);
      const sourceFormat = this._deriveVideoFormatFromMetaType(source.type);

      // Avoid duplicates with ogVideo
      const alreadyAdded = mediaItems.some(
        (item) => item.url === normalizedSourceUrl,
      );
      if (!alreadyAdded) {
        mediaItems.push({
          type: 'video',
          format: sourceFormat,
          quality: source.type?.includes('720') ? '720p' : 'best',
          url: normalizedSourceUrl,
          directUrl: normalizedSourceUrl,
          title: metaTags.ogTitle,
          filename: this._buildFilename(metaTags.ogTitle ?? shortcode, sourceFormat),
          headers: { 'Referer': 'https://streamable.com/' },
        });

        qualityOptions.push({
          label: source.type?.includes('720') ? '720p (Video Tag)' : 'Standard (Video Tag)',
          quality: source.type?.includes('720') ? '720p' : 'best',
          format: sourceFormat,
          url: normalizedSourceUrl,
        });
      }
    }

    // Thumbnail from og:image or twitter:image
    const imageUrl = metaTags.ogImageSecureUrl ?? metaTags.ogImage ?? metaTags.twitterImage;
    if (imageUrl) {
      const normalizedImageUrl = this._normalizeUrl(imageUrl);
      const imageFormat = this._deriveImageFormatFromUrl(normalizedImageUrl);

      thumbnails.push({
        url: normalizedImageUrl,
        format: imageFormat,
      });
      covers.push({
        url: normalizedImageUrl,
        format: imageFormat,
      });
    }

    // Poster from <video> tag (often a high-quality thumbnail)
    if (videoTagData.poster && !imageUrl) {
      const normalizedPosterUrl = this._normalizeUrl(videoTagData.poster);
      const posterFormat = this._deriveImageFormatFromUrl(normalizedPosterUrl);

      thumbnails.push({
        url: normalizedPosterUrl,
        format: posterFormat,
      });
      covers.push({
        url: normalizedPosterUrl,
        format: posterFormat,
      });
    }

    const metadata: ExtractionMetadata = {
      title: metaTags.ogTitle ?? metaTags.twitterTitle,
      description: metaTags.ogDescription,
      author: metaTags.ogSiteName === 'Streamable' ? undefined : metaTags.ogSiteName,
      platform: 'streamable',
      originalUrl: metaTags.ogUrl ?? originalUrl,
      extra: {
        shortcode,
        extractionMethod: 'html_meta_tags',
        twitterCard: metaTags.twitterCard,
        ogVideoType: metaTags.ogVideoType,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'streamable',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
    };
  }

  // ─── Private: URL Normalization ──────────────────────────────────────────
  /** Normalize Streamable URLs that may be protocol-relative (//cdn...) */
  private _normalizeUrl(rawUrl: string): string {
    if (rawUrl.startsWith('//')) {
      return `https:${rawUrl}`;
    }
    if (rawUrl.startsWith('http://')) {
      return rawUrl.replace('http://', 'https://');
    }
    return rawUrl;
  }

  // ─── Private: Format Derivation Helpers ──────────────────────────────────
  /** Derive video format from Streamable file key and MIME type */
  private _deriveFormatFromKey(fileKey: string, mime?: string): 'mp4' | 'webm' {
    if (fileKey.startsWith('webm')) return 'webm';
    if (mime?.includes('webm')) return 'webm';
    return 'mp4';
  }

  /** Derive video format from a MIME type string (e.g., "video/mp4") */
  private _deriveVideoFormatFromMetaType(mimeType?: string): 'mp4' | 'webm' {
    if (!mimeType) return 'mp4';
    if (mimeType.includes('webm')) return 'webm';
    return 'mp4';
  }

  /** Derive image format from URL extension */
  private _deriveImageFormatFromUrl(url: string): 'jpeg' | 'png' | 'webp' {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('.png')) return 'png';
    if (lowerUrl.includes('.webp')) return 'webp';
    return 'jpeg'; // Streamable thumbnails are typically JPEG
  }

  // ─── Private: Filename Builder ───────────────────────────────────────────
  private _buildFilename(title: string, ext: string): string {
    const sanitized = title
      .replace(/[^\w\s.-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 200);
    return `${sanitized}.${ext}`;
  }
}
