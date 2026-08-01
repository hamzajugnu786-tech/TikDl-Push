/**
 * NovaDL Engine — Dailymotion Native Extractor
 *
 * Parses player metadata JSON from Dailymotion page to extract
 * video URLs and metadata.
 *
 * Extraction sources:
 * - Player metadata API (/player/metadata/video/{id})
 * - oEmbed endpoint for metadata
 * - Embedded data in page HTML
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

// ─── Dailymotion Data Types ──────────────────────────────────────────
interface DailymotionPlayerMetadata {
  id?: string;
  title?: string;
  description?: string;
  duration?: number;
  owner?: DailymotionOwner;
  views_total?: number;
  likes_total?: number;
  created_time?: string;
  aspect_ratio?: string;
  thumbnails?: DailymotionThumbnails;
  qualities?: Record<string, DailymotionQualityInfo>;
  subtitles?: Record<string, DailymotionSubtitleInfo>;
  embed_url?: string;
  url?: string;
  private?: boolean;
  geo_blocking?: string[];
  language?: string;
  channel?: { id?: string; name?: string };
  tags?: string[];
}

interface DailymotionOwner {
  id?: string;
  username?: string;
  screenname?: string;
  url?: string;
  avatar_url?: string;
}

interface DailymotionThumbnails {
  url?: string;
  120?: string;
  180?: string;
  240?: string;
  360?: string;
  480?: string;
  720?: string;
  1080?: string;
}

interface DailymotionQualityInfo {
  url?: string;
  type?: string;
  bitrate?: number;
}

interface DailymotionSubtitleInfo {
  url?: string;
  language?: string;
  language_code?: string;
}

interface DailymotionOEmbedData {
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
export class DailymotionNativeExtractor extends BaseProvider {
  readonly id = 'native_dailymotion';
  readonly name = 'Dailymotion Native Extractor';
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
        `Dailymotion native extractor does not support platform '${platform}'`,
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
    return platform === 'dailymotion';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['dailymotion'],
      mediaTypes: ['video', 'metadata'],
      formats: ['mp4', 'jpeg', 'png', 'vtt', 'srt'],
      qualities: ['best', '1080p', '720p', '480p', '360p', '240p'],
      features: [
        'video_download', 'cover_extraction', 'thumbnail_extraction',
        'metadata_extraction', 'subtitle_extraction', 'multiple_qualities',
        'streaming',
      ] as ProviderFeature[],
      maxConcurrent: 5,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      await fetch('https://www.dailymotion.com', {
        headers: { 'User-Agent': this._userAgent },
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
        'Could not extract Dailymotion video ID from URL',
        this.id,
        'UNSUPPORTED',
        false,
        'dailymotion',
      );
    }

    // Strategy 1: Player metadata API
    try {
      const metadata = await this._fetchPlayerMetadata(videoId);
      if (metadata.qualities) {
        return this._buildResultFromMetadata(metadata, url);
      }
    } catch {
      // Continue
    }

    // Strategy 2: oEmbed endpoint
    try {
      const oembed = await this._fetchOEmbed(url);
      return this._buildResultFromOEmbed(oembed, url);
    } catch {
      // All strategies failed
    }

    throw new ProviderError(
      'Could not extract Dailymotion video data. Player metadata not accessible.',
      this.id,
      'PARSE_ERROR',
      false,
      'dailymotion',
    );
  }

  // ─── Private: Video ID Extraction ──────────────────────────────────
  private _extractVideoId(url: string): string | null {
    // Match patterns: dailymotion.com/video/x12345, dai.ly/x12345
    const patterns = [
      /dailymotion\.com\/video\/([a-z0-9]+)/i,
      /dai\.ly\/([a-z0-9]+)/i,
      /dailymotion\.com\/embed\/video\/([a-z0-9]+)/i,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(url);
      if (match?.[1]) return match[1];
    }
    return null;
  }

  // ─── Private: Player Metadata Fetch ──────────────────────────────────
  private async _fetchPlayerMetadata(videoId: string): Promise<DailymotionPlayerMetadata> {
    const apiUrl = `https://www.dailymotion.com/player/metadata/video/${videoId}`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new ProviderError(
        `Dailymotion player metadata fetch failed: ${response.status}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'dailymotion',
      );
    }

    return await response.json() as DailymotionPlayerMetadata;
  }

  // ─── Private: oEmbed Fetch ──────────────────────────────────────────
  private async _fetchOEmbed(url: string): Promise<DailymotionOEmbedData> {
    const oembedUrl = `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(url)}`;
    const response = await fetch(oembedUrl, {
      headers: { 'User-Agent': this._userAgent, 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new ProviderError(
        `Dailymotion oEmbed failed: ${response.status}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'dailymotion',
      );
    }

    return await response.json() as DailymotionOEmbedData;
  }

  // ─── Private: Build Result from Metadata ──────────────────────────────
  private _buildResultFromMetadata(metadata: DailymotionPlayerMetadata, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const qualityOptions: QualityOption[] = [];

    // Process quality variants
    const qualities = metadata.qualities ?? {};
    const qualityOrder = ['1080', '720', '480', '360', '240', 'auto'];

    for (const qualityKey of qualityOrder) {
      const qualityInfo = qualities[qualityKey];
      if (!qualityInfo?.url) continue;

      // Type can be "video/mp4" or "application/x-mpegURL" (HLS)
      const isHls = qualityInfo.type === 'application/x-mpegURL' || qualityInfo.url.includes('.m3u8');

      mediaItems.push({
        type: 'video',
        format: isHls ? 'mp4' : 'mp4',
        quality: this._qualityKeyToLabel(qualityKey),
        url: qualityInfo.url,
        streamUrl: isHls ? qualityInfo.url : undefined,
        directUrl: isHls ? undefined : qualityInfo.url,
        duration: metadata.duration,
        bitrate: qualityInfo.bitrate ? qualityInfo.bitrate * 1000 : undefined,
        title: metadata.title,
        filename: this._buildFilename(metadata.title ?? 'dailymotion_video', 'mp4'),
      });

      qualityOptions.push({
        label: `${qualityKey}p`,
        quality: this._qualityKeyToLabel(qualityKey),
        format: 'mp4',
        url: qualityInfo.url,
        bitrate: qualityInfo.bitrate ? qualityInfo.bitrate * 1000 : undefined,
        isSource: qualityKey === '1080' || qualityKey === 'auto',
      });
    }

    // Covers and thumbnails
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    const thumbData = metadata.thumbnails;
    if (thumbData) {
      const thumbSizes: Array<{ key: string; width: number }> = [
        { key: '1080', width: 1080 },
        { key: '720', width: 720 },
        { key: '480', width: 480 },
        { key: '360', width: 360 },
        { key: '240', width: 240 },
        { key: '180', width: 180 },
        { key: '120', width: 120 },
      ];

      for (const size of thumbSizes) {
        const thumbUrl = thumbData[size.key as keyof DailymotionThumbnails] ?? thumbData.url;
        if (thumbUrl) {
          thumbnails.push({ url: thumbUrl, width: size.width, format: 'jpeg' });
        }
      }

      // Largest thumbnail as cover
      const coverUrl = thumbData['1080'] ?? thumbData['720'] ?? thumbData.url;
      if (coverUrl) {
        covers.push({ url: coverUrl, format: 'jpeg' });
      }
    }

    // Metadata
    const dmMetadata: ExtractionMetadata = {
      title: metadata.title,
      description: metadata.description,
      author: metadata.owner?.screenname ?? metadata.owner?.username,
      authorId: metadata.owner?.username ?? metadata.owner?.id,
      authorUrl: metadata.owner?.url,
      platform: 'dailymotion',
      originalUrl: metadata.url ?? originalUrl,
      duration: metadata.duration,
      viewCount: metadata.views_total,
      likeCount: metadata.likes_total,
      uploadDate: metadata.created_time,
      isPrivate: metadata.private ?? false,
      categories: metadata.channel?.name ? [metadata.channel.name] : undefined,
      tags: metadata.tags,
      extra: {
        videoId: metadata.id,
        aspectRatio: metadata.aspect_ratio,
        language: metadata.language,
        geoBlocking: metadata.geo_blocking,
        embedUrl: metadata.embed_url,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'dailymotion',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata: dmMetadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse: metadata,
    };
  }

  // ─── Private: Build Result from oEmbed ──────────────────────────────
  private _buildResultFromOEmbed(oembed: DailymotionOEmbedData, originalUrl: string): ExtractionResult {
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
      platform: 'dailymotion',
      originalUrl,
      duration: oembed.duration,
      extra: { oembedType: oembed.type },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'dailymotion',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      rawResponse: oembed,
    };
  }

  // ─── Private: Helpers ──────────────────────────────────────────────────
  private _qualityKeyToLabel(key: string): '1080p' | '720p' | '480p' | '360p' | '240p' | 'best' {
    const map: Record<string, '1080p' | '720p' | '480p' | '360p' | '240p' | 'best'> = {
      '1080': '1080p',
      '720': '720p',
      '480': '480p',
      '360': '360p',
      '240': '240p',
      'auto': 'best',
    };
    return map[key] ?? 'best';
  }

  private _buildFilename(title: string, ext: string): string {
    const sanitized = title.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').substring(0, 200);
    return `${sanitized}.${ext}`;
  }
}
