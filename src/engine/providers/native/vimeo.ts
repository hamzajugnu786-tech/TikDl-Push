/**
 * NovaDL Engine — Vimeo Native Extractor
 *
 * Parses player config JSON from Vimeo page to extract progressive/HLS
 * video URLs and thumbnails.
 *
 * Extraction sources:
 * - Player config JSON from /playerconfig endpoint
 * - Embedded data in page HTML (clip_page_config)
 * - oEmbed API for metadata
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

// ─── Vimeo Data Types ────────────────────────────────────────────────
interface VimeoPlayerConfig {
  request?: VimeoRequestData;
  video?: VimeoVideoInfo;
  embed?: VimeoEmbedInfo;
}

interface VimeoRequestData {
  files?: VimeoFilesData;
  progressive?: VimeoProgressiveFile[];
  hls?: VimeoHlsData;
  dash?: VimeoDashData;
  thumbnails?: VimeoThumbnailInfo;
}

interface VimeoFilesData {
  progressive?: VimeoProgressiveFile[];
  hls?: VimeoHlsData;
  dash?: VimeoDashData;
}

interface VimeoProgressiveFile {
  url?: string;
  quality?: string;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
  mime?: string;
  codec?: string;
  origin?: string;
  profile?: number;
}

interface VimeoHlsData {
  cdn?: string;
  default_cdn?: string;
  se?: Record<string, string>;
  url?: string;
}

interface VimeoDashData {
  cdn?: string;
  default_cdn?: string;
  se?: Record<string, string>;
  url?: string;
}

interface VimeoThumbnailInfo {
  base?: string;
  120?: string;
  360?: string;
  480?: string;
  640?: string;
  960?: string;
  1280?: string;
  1920?: string;
}

interface VimeoVideoInfo {
  id?: number;
  title?: string;
  description?: string;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  thumbs?: VimeoVideoThumbs;
  owner?: VimeoOwnerInfo;
  privacy?: string;
  upload_date?: string;
}

interface VimeoVideoThumbs {
  base?: string;
  120?: string;
  360?: string;
  480?: string;
  640?: string;
  960?: string;
  1280?: string;
  1920?: string;
}

interface VimeoOwnerInfo {
  id?: number;
  name?: string;
  url?: string;
  img?: string;
}

interface VimeoEmbedInfo {
  autoplay?: boolean;
  color?: string;
  loop?: boolean;
  muted?: boolean;
}

interface VimeoOEmbedData {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  width?: number;
  height?: number;
  duration?: number;
  type?: string;
  description?: string;
}

// ─── Provider Implementation ──────────────────────────────────────────
export class VimeoNativeExtractor extends BaseProvider {
  readonly id = 'native_vimeo';
  readonly name = 'Vimeo Native Extractor';
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
        `Vimeo native extractor does not support platform '${platform}'`,
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
    return platform === 'vimeo';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['vimeo'],
      mediaTypes: ['video', 'metadata'],
      formats: ['mp4', 'webm', 'jpeg', 'png'],
      qualities: ['best', '1080p', '720p', '480p', '360p', '240p'],
      features: [
        'video_download', 'cover_extraction', 'thumbnail_extraction',
        'metadata_extraction', 'multiple_qualities', 'streaming',
      ] as ProviderFeature[],
      maxConcurrent: 5,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      await fetch('https://vimeo.com/api/v2/config', {
        headers: { 'User-Agent': this._userAgent },
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
        'Could not extract Vimeo video ID from URL',
        this.id,
        'UNSUPPORTED',
        false,
        'vimeo',
      );
    }

    // Strategy 1: Player config endpoint
    try {
      const playerConfig = await this._fetchPlayerConfig(videoId);
      if (playerConfig.request) {
        return this._buildResultFromPlayerConfig(playerConfig, url);
      }
    } catch {
      // Continue to next strategy
    }

    // Strategy 2: Page HTML with embedded clip_page_config
    try {
      const html = await this._fetchPage(url);
      const embeddedConfig = this._extractPlayerConfigFromHtml(html);
      if (embeddedConfig) {
        return this._buildResultFromPlayerConfig(embeddedConfig, url);
      }
    } catch {
      // Continue to oEmbed
    }

    // Strategy 3: oEmbed endpoint
    try {
      const oembed = await this._fetchOEmbed(url);
      return this._buildResultFromOEmbed(oembed, url);
    } catch {
      // All strategies failed
    }

    throw new ProviderError(
      'Could not extract Vimeo video data. Player config not accessible.',
      this.id,
      'PARSE_ERROR',
      false,
      'vimeo',
    );
  }

  // ─── Private: Video ID Extraction ──────────────────────────────────
  private _extractVideoId(url: string): string | null {
    // Match patterns: vimeo.com/12345, vimeo.com/channels/staffpicks/12345,
    // player.vimeo.com/video/12345, vimeo.com/12345/abcdef (private)
    const patterns = [
      /vimeo\.com\/(\d+)(?:\/[a-f0-9]+)?/i,
      /player\.vimeo\.com\/video\/(\d+)/i,
      /vimeo\.com\/channels\/[^/]+\/(\d+)/i,
      /vimeo\.com\/groups\/[^/]+\/videos\/(\d+)/i,
      /vimeo\.com\/album\/\d+\/video\/(\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(url);
      if (match?.[1]) return match[1];
    }
    return null;
  }

  // ─── Private: Player Config Fetch ──────────────────────────────────
  private async _fetchPlayerConfig(videoId: string): Promise<VimeoPlayerConfig> {
    const apiUrl = `https://player.vimeo.com/video/${videoId}/config`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'application/json',
        'Referer': 'https://vimeo.com/',
      },
    });

    if (!response.ok) {
      throw new ProviderError(
        `Vimeo player config fetch failed: ${response.status}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'vimeo',
      );
    }

    return await response.json() as VimeoPlayerConfig;
  }

  // ─── Private: Page Fetching ──────────────────────────────────────────
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
        `Vimeo page fetch failed: ${response.status}`,
        this.id,
        'NETWORK',
        response.status >= 500,
        'vimeo',
      );
    }

    return response.text();
  }

  // ─── Private: Extract Player Config from HTML ──────────────────────────
  private _extractPlayerConfigFromHtml(html: string): VimeoPlayerConfig | null {
    // Vimeo embeds player config in script tags
    const match = /var\s+clipPageConfig\s*=\s*(\{.*?\});/s.exec(html);
    if (match?.[1]) {
      try {
        const parsed = JSON.parse(match[1]) as VimeoPlayerConfig;
        if (parsed.request) return parsed;
      } catch {
        // Parse failed
      }
    }

    // Alternative: playerConfig in inline script
    const altMatch = /playerConfig\s*=\s*(\{.*?"request".*?\})\s*;/s.exec(html);
    if (altMatch?.[1]) {
      try {
        return JSON.parse(altMatch[1]) as VimeoPlayerConfig;
      } catch {
        // Parse failed
      }
    }

    return null;
  }

  // ─── Private: oEmbed Fetch ──────────────────────────────────────────
  private async _fetchOEmbed(url: string): Promise<VimeoOEmbedData> {
    const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
    const response = await fetch(oembedUrl, {
      headers: { 'User-Agent': this._userAgent, 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new ProviderError(
        `Vimeo oEmbed failed: ${response.status}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'vimeo',
      );
    }

    return await response.json() as VimeoOEmbedData;
  }

  // ─── Private: Build Result from PlayerConfig ──────────────────────────
  private _buildResultFromPlayerConfig(config: VimeoPlayerConfig, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const qualityOptions: QualityOption[] = [];

    const requestData = config.request;

    // Progressive (direct MP4) downloads
    const progressiveFiles = requestData?.progressive ?? requestData?.files?.progressive ?? [];
    for (const file of progressiveFiles) {
      if (file.url) {
        mediaItems.push({
          type: 'video',
          format: file.mime === 'video/webm' ? 'webm' : 'mp4',
          quality: this._heightToQuality(file.height ?? 0),
          url: file.url,
          directUrl: file.url,
          duration: config.video?.duration,
          resolution: file.width && file.height ? { width: file.width, height: file.height } : undefined,
          fps: file.fps,
          bitrate: file.bitrate ? file.bitrate * 1000 : undefined, // kbps to bps
          codec: file.codec ? { video: file.codec } : undefined,
          title: config.video?.title,
          filename: this._buildFilename(config.video?.title ?? 'vimeo_video', file.mime === 'video/webm' ? 'webm' : 'mp4'),
        });

        qualityOptions.push({
          label: file.quality ?? `${file.height ?? 0}p`,
          quality: this._heightToQuality(file.height ?? 0),
          format: file.mime === 'video/webm' ? 'webm' : 'mp4',
          url: file.url,
          bitrate: file.bitrate ? file.bitrate * 1000 : undefined,
          resolution: file.width && file.height ? { width: file.width, height: file.height } : undefined,
          isSource: file.profile === 175 || file.origin === 'vimeo',
        });
      }
    }

    // HLS stream
    const hls = requestData?.hls ?? requestData?.files?.hls;
    if (hls?.url) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: 'best',
        url: hls.url,
        streamUrl: hls.url,
        duration: config.video?.duration,
        title: config.video?.title,
      });
    }

    // DASH stream
    const dash = requestData?.dash ?? requestData?.files?.dash;
    if (dash?.url) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: 'best',
        url: dash.url,
        streamUrl: dash.url,
        duration: config.video?.duration,
        title: config.video?.title,
      });
    }

    // Covers and thumbnails
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    const thumbs = requestData?.thumbnails ?? config.video?.thumbs;
    if (thumbs?.base) {
      // Vimeo thumbnails use a base URL pattern like: base_640x360.jpg
      const thumbBase = thumbs.base;
      const sizes: Array<{ key: string; width: number; height: number }> = [
        { key: '1920', width: 1920, height: 1080 },
        { key: '1280', width: 1280, height: 720 },
        { key: '960', width: 960, height: 540 },
        { key: '640', width: 640, height: 360 },
        { key: '480', width: 480, height: 270 },
        { key: '360', width: 360, height: 203 },
        { key: '120', width: 120, height: 68 },
      ];

      for (const size of sizes) {
        const suffix = thumbs[size.key as keyof VimeoThumbnailInfo] ?? `_${size.width}x${size.height}.jpg`;
        const thumbUrl = `${thumbBase.replace(/_[\d]+x[\d]+\.\w+$/, '')}${suffix}`;
        thumbnails.push({ url: thumbUrl, width: size.width, height: size.height, format: 'jpeg' });
      }

      // Largest thumbnail as cover
      const largestThumb = thumbs['1920'] ?? thumbs['1280'];
      if (largestThumb) {
        const coverUrl = `${thumbBase.replace(/_[\d]+x[\d]+\.\w+$/, '')}${largestThumb}`;
        covers.push({ url: coverUrl, width: 1920, height: 1080, format: 'jpeg' });
      }
    }

    // Metadata
    const metadata: ExtractionMetadata = {
      title: config.video?.title,
      description: config.video?.description,
      author: config.video?.owner?.name,
      authorId: config.video?.owner?.id?.toString(),
      authorUrl: config.video?.owner?.url,
      platform: 'vimeo',
      originalUrl,
      duration: config.video?.duration,
      viewCount: undefined, // Vimeo doesn't always provide view counts in config
      uploadDate: config.video?.upload_date,
      extra: {
        videoId: config.video?.id?.toString(),
        privacy: config.video?.privacy,
        fps: config.video?.fps,
        embedSettings: config.embed,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'vimeo',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse: config,
    };
  }

  // ─── Private: Build Result from oEmbed ──────────────────────────────
  private _buildResultFromOEmbed(oembed: VimeoOEmbedData, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];

    if (oembed.thumbnail_url) {
      mediaItems.push({
        type: 'image',
        format: 'jpeg',
        quality: 'best',
        url: oembed.thumbnail_url,
        title: oembed.title,
      });
    }

    const covers: CoverImage[] = [];
    if (oembed.thumbnail_url) {
      covers.push({
        url: oembed.thumbnail_url,
        width: oembed.thumbnail_width,
        height: oembed.thumbnail_height,
        format: 'jpeg',
      });
    }

    const metadata: ExtractionMetadata = {
      title: oembed.title,
      description: oembed.description,
      author: oembed.author_name,
      authorUrl: oembed.author_url,
      platform: 'vimeo',
      originalUrl,
      duration: oembed.duration,
      extra: { oembedType: oembed.type },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'vimeo',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      rawResponse: oembed,
    };
  }

  // ─── Private: Helpers ──────────────────────────────────────────────────
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
