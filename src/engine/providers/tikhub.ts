/**
 * NovaDL Engine — TikHub Provider
 * 
 * TikHub is a specialized API provider for TikTok and related
 * short-video platforms. It offers direct API access with
 * structured JSON responses, watermark-free downloads where
 * available, and rich metadata extraction.
 * 
 * This provider implements the IProvider contract and serves
 * as an example of how to build API-based providers.
 */

import { v4 as uuid } from 'uuid';
import type {
  Platform,
  ExtractionRequest,
  ExtractionResult,
  ExtractionMetadata,
  MediaItem,
  VideoQuality,
  CoverImage,
  Thumbnail,
  QualityOption,
  ProviderConfig,
  ProviderCapabilities,
  ProviderHealth,
  ProviderFeature,
} from '../types/index';
import { BaseProvider, ProviderError } from './base';
import { detectPlatform } from '../utils/url';

// ─── TikHub API Response Types ──────────────────────────────────────
interface TikHubApiResponse {
  code: number;
  msg: string;
  data?: TikHubVideoData;
}

interface TikHubVideoData {
  id?: string;
  title?: string;
  desc?: string;
  create_time?: number;
  author?: TikHubAuthor;
  stats?: TikHubStats;
  video?: TikHubVideoInfo;
  music?: TikHubMusicInfo;
  cover?: string;
  origin_cover?: string;
  dynamic_cover?: string;
  share_url?: string;
  item_urls?: string[];
  downloaded?: boolean;
  duration?: number;
}

interface TikHubAuthor {
  id?: string;
  unique_id?: string;
  nickname?: string;
  avatar?: string;
  signature?: string;
}

interface TikHubStats {
  digg_count?: number;
  share_count?: number;
  comment_count?: number;
  play_count?: number;
  collect_count?: number;
}

interface TikHubVideoInfo {
  play_addr?: TikHubVideoUrl;
  download_addr?: TikHubVideoUrl;
  width?: number;
  height?: number;
  duration?: number;
  ratio?: string;
  format?: string;
  codec?: string;
  bitrate?: number;
  cover?: string;
  origin_cover?: string;
  dynamic_cover?: string;
}

interface TikHubVideoUrl {
  url_list?: string[];
  uri?: string;
  width?: number;
  height?: number;
}

interface TikHubMusicInfo {
  id?: string;
  title?: string;
  author?: string;
  play_url?: string;
  cover_medium?: string;
  duration?: number;
}

// ─── Provider Implementation ──────────────────────────────────────────
export class TikHubProvider extends BaseProvider {
  readonly id = 'tikhub';
  readonly name = 'TikHub API Provider';
  readonly type: 'api' = 'api';

  private _apiKey: string;
  private _baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    this._apiKey = config.apiKey ?? '';
    this._baseUrl = config.baseUrl ?? 'https://tikhub.io/api/v1';
  }

  async initialize(): Promise<void> {
    if (!this._apiKey) {
      throw new ProviderError(
        'TikHub API key is required. Set NOVA_TIKHUB_API_KEY or provide it in config.',
        this.id,
        'CONFIG_ERROR',
        false,
      );
    }

    // Verify API key by making a lightweight request
    try {
      const response = await this._fetch('/health', { method: 'GET' });
      if (!response.ok) {
        throw new ProviderError(
          `TikHub API key validation failed: ${response.status} ${response.statusText}`,
          this.id,
          'AUTH_FAILED',
          false,
        );
      }
      this._initialized = true;
      this._health = {
        status: 'healthy',
        lastChecked: new Date(),
        consecutiveFailures: 0,
        consecutiveSuccesses: 1,
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        `Failed to connect to TikHub API: ${error instanceof Error ? error.message : String(error)}`,
        this.id,
        'NETWORK',
        true,
        undefined,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    this.ensureInitialized();

    const startTime = Date.now();
    const platform = request.platform ?? detectPlatform(request.url);

    if (!this.supports(platform)) {
      throw new ProviderError(
        `TikHub does not support platform '${platform}'`,
        this.id,
        'UNSUPPORTED',
        false,
        platform,
      );
    }

    try {
      // Determine the appropriate TikHub endpoint based on platform
      const endpoint = this._getEndpoint(request.url, platform);
      const apiResponse = await this.withTimeout(
        this._callApi(endpoint),
        this.config.timeout,
      );

      // [DEBUG] TikHub engine provider response
      console.log('[DEBUG-2b] TikHub engine provider response code:', apiResponse.code, 'msg:', apiResponse.msg);
      console.log('[DEBUG-2b] TikHub engine response data (first 500):', JSON.stringify(apiResponse.data).slice(0, 500));

      if (apiResponse.code !== 200 || !apiResponse.data) {
        throw new ProviderError(
          `TikHub API returned error: ${apiResponse.msg} (code: ${apiResponse.code})`,
          this.id,
          apiResponse.code === 429 ? 'RATE_LIMITED' : 'NOT_FOUND',
          apiResponse.code === 429 || apiResponse.code >= 500,
          platform,
        );
      }

      const result = this._transformTikHubData(apiResponse.data, request, platform);
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
    // TikHub specializes in TikTok and short-video platforms
    return ['tiktok', 'instagram', 'threads', 'snapchat_spotlight', 'likee', 'lemon8'].includes(platform);
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['tiktok', 'instagram', 'threads', 'snapchat_spotlight', 'likee', 'lemon8'],
      mediaTypes: ['video', 'audio', 'metadata', 'image'],
      formats: ['mp4', 'mp3', 'aac', 'jpeg', 'png'],
      qualities: ['best', '1080p', '720p', '480p', '320kbps', '128kbps'],
      features: [
        'video_download', 'audio_download', 'cover_extraction',
        'thumbnail_extraction', 'metadata_extraction', 'watermark_detection',
        'watermark_removal', 'multiple_qualities',
      ] as ProviderFeature[],
      maxConcurrent: 10,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      const response = await this._fetch('/health', { method: 'GET' });
      const latency = Date.now() - startTime;

      if (response.ok) {
        return {
          status: 'healthy',
          latencyMs: latency,
          lastChecked: new Date(),
          consecutiveFailures: 0,
          consecutiveSuccesses: (this._health.consecutiveSuccesses ?? 0) + 1,
          successRate: 1.0,
        };
      }

      return {
        status: response.status === 429 ? 'degraded' : 'unhealthy',
        latencyMs: latency,
        lastChecked: new Date(),
        lastError: `API returned ${response.status}`,
        consecutiveFailures: (this._health.consecutiveFailures ?? 0) + 1,
        consecutiveSuccesses: 0,
        successRate: 0,
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

  // ─── Private: API Communication ──────────────────────────────────────
  private async _fetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this._baseUrl}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this._apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'NovaDL-Engine/1.0',
      ...options.headers as Record<string, string>,
    };

    return fetch(url, { ...options, headers });
  }

  private async _callApi(endpoint: string): Promise<TikHubApiResponse> {
    const response = await this._fetch(endpoint);

    if (response.status === 401) {
      throw new ProviderError('TikHub API key is invalid or expired', this.id, 'AUTH_FAILED', false);
    }
    if (response.status === 429) {
      throw new ProviderError('TikHub API rate limit exceeded', this.id, 'RATE_LIMITED', true);
    }

    const data = await response.json() as TikHubApiResponse;
    return data;
  }

  private _getEndpoint(url: string, platform: Platform): string {
    // TikHub uses different endpoints for different platforms
    switch (platform) {
      case 'tiktok':
        return `/tiktok/video?url=${encodeURIComponent(url)}`;
      case 'instagram':
        return `/instagram/video?url=${encodeURIComponent(url)}`;
      case 'threads':
        return `/threads/video?url=${encodeURIComponent(url)}`;
      case 'snapchat_spotlight':
        return `/snapchat/video?url=${encodeURIComponent(url)}`;
      case 'likee':
        return `/likee/video?url=${encodeURIComponent(url)}`;
      case 'lemon8':
        return `/lemon8/video?url=${encodeURIComponent(url)}`;
      default:
        return `/tiktok/video?url=${encodeURIComponent(url)}`;
    }
  }

  // ─── Private: Transform TikHub Data → ExtractionResult ──────────────
  private _transformTikHubData(
    data: TikHubVideoData,
    request: ExtractionRequest,
    platform: Platform,
  ): ExtractionResult {
    const opts = request.options ?? {};
    const mediaItems: MediaItem[] = [];
    const qualityOptions: QualityOption[] = [];

    // Video items
    if (data.video && (opts.extractVideo ?? true)) {
      // Download URL (watermark-free when available)
      if (data.video.download_addr?.url_list?.length) {
        const downloadUrl = data.video.download_addr.url_list[0] ?? '';
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: 'best',
          url: downloadUrl,
          directUrl: downloadUrl,
          duration: data.video.duration ?? data.duration,
          resolution: data.video.width && data.video.height
            ? { width: data.video.width, height: data.video.height }
            : undefined,
          codec: data.video.codec ? { video: data.video.codec } : undefined,
          bitrate: data.video.bitrate,
          watermark: { detected: false, removable: true, removed: true, description: 'TikHub watermark-free download' },
          title: data.title,
          filename: `${(data.title ?? 'tiktok_video').replace(/[^\w\s]/g, '')}.mp4`,
        });
      }

      // Play URL (may have watermark)
      if (data.video.play_addr?.url_list?.length) {
        const playUrl = data.video.play_addr.url_list[0] ?? '';
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: this._heightToQuality(data.video.height ?? data.video.play_addr?.height ?? 0),
          url: playUrl,
          directUrl: playUrl,
          duration: data.video.duration ?? data.duration,
          resolution: data.video.width && data.video.height
            ? { width: data.video.width, height: data.video.height }
            : undefined,
          codec: data.video.codec ? { video: data.video.codec } : undefined,
          watermark: { detected: true, removable: true, description: 'TikTok platform watermark on play URL' },
          title: data.title,
          filename: `${(data.title ?? 'tiktok_video').replace(/[^\w\s]/g, '')}_wm.mp4`,
        });

        qualityOptions.push({
          label: `${data.video.height ?? 1080}p (with watermark)`,
          quality: this._heightToQuality(data.video.height ?? 1080),
          format: 'mp4',
          url: playUrl,
          codec: data.video.codec ? { video: data.video.codec } : undefined,
        });
      }

      // If we have a watermark-free download URL, add it as a quality option
      if (data.video.download_addr?.url_list?.length) {
        qualityOptions.push({
          label: `${data.video.height ?? 1080}p (no watermark)`,
          quality: 'best',
          format: 'mp4',
          url: data.video.download_addr.url_list[0],
          isSource: true,
          codec: data.video.codec ? { video: data.video.codec } : undefined,
        });
      }
    }

    // Audio extraction
    if (data.music && (opts.extractAudio ?? false)) {
      if (data.music.play_url) {
        mediaItems.push({
          type: 'audio',
          format: 'mp3',
          quality: 'best',
          url: data.music.play_url ?? '',
          directUrl: data.music.play_url ?? '',
          duration: data.music.duration,
          title: data.music.title,
          filename: `${(data.music.title ?? 'tiktok_audio').replace(/[^\w\s]/g, '')}.mp3`,
        });
      }
    }

    // Cover images
    const covers: CoverImage[] = [];
    if (opts.extractCover ?? true) {
      if (data.origin_cover) {
        covers.push({ url: data.origin_cover, format: 'jpeg' });
      }
      if (data.video?.origin_cover) {
        covers.push({ url: data.video.origin_cover, format: 'jpeg' });
      }
      if (data.cover) {
        covers.push({ url: data.cover, format: 'jpeg' });
      }
    }

    // Thumbnails
    const thumbnails: Thumbnail[] = [];
    if (opts.extractThumbnail ?? true) {
      if (data.video?.dynamic_cover) {
        thumbnails.push({ url: data.video.dynamic_cover, format: 'jpeg' });
      }
      if (data.dynamic_cover) {
        thumbnails.push({ url: data.dynamic_cover, format: 'jpeg' });
      }
      thumbnails.push(...covers.map((c) => ({ ...c })));
    }

    // Metadata
    const metadata: ExtractionMetadata = {
      title: data.title ?? data.desc,
      description: data.desc,
      author: data.author?.nickname,
      authorId: data.author?.unique_id ?? data.author?.id,
      platform,
      originalUrl: data.share_url ?? request.url,
      duration: data.video?.duration ?? data.duration,
      viewCount: data.stats?.play_count,
      likeCount: data.stats?.digg_count,
      commentCount: data.stats?.comment_count,
      shareCount: data.stats?.share_count,
      extra: {
        collectCount: data.stats?.collect_count,
        authorAvatar: data.author?.avatar,
        musicTitle: data.music?.title,
        musicAuthor: data.music?.author,
      },
    };

    return {
      id: uuid(),
      url: request.url,
      platform,
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers,
      thumbnails,
      qualityOptions,
      rawResponse: data,
    };
  }

  private _heightToQuality(height: number | undefined): VideoQuality {
    if (!height) return '360p';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    return '360p';
  }
}
