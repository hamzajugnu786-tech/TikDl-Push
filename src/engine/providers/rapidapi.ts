/**
 * NovaDL Engine — RapidAPI Provider
 * 
 * RapidAPI is a marketplace provider that aggregates many media
 * extraction APIs under a single subscription. This provider
 * implements the IProvider contract and routes requests to
 * specific RapidAPI endpoints based on the detected platform.
 * 
 * Key design: RapidAPI serves as a "meta-provider" — one API key
 * gives access to many underlying services, making it ideal for
 * fallback scenarios where direct providers fail.
 */

import { v4 as uuid } from 'uuid';
import type {
  Platform,
  ExtractionRequest,
  ExtractionResult,
  ExtractionMetadata,
  MediaItem,
  VideoQuality,
  AudioQuality,
  CoverImage,
  Thumbnail,
  ProviderConfig,
  ProviderCapabilities,
  ProviderFeature,
} from '../types/index';
import { BaseProvider, ProviderError } from './base';
import { detectPlatform } from '../utils/url';

// ─── RapidAPI Endpoint Mapping ──────────────────────────────────────
interface RapidApiEndpoint {
  host: string;
  path: string;
  method: 'GET' | 'POST';
  queryParams?: Record<string, string>;
  bodyParams?: Record<string, string>;
}

// Maps platforms to their RapidAPI service endpoints
const PLATFORM_ENDPOINTS: Record<string, RapidApiEndpoint> = {
  tiktok: {
    host: 'tiktok-video-no-watermark2.p.rapidapi.com',
    path: '/api/video',
    method: 'GET',
    queryParams: { url: '{URL}' },
  },
  instagram: {
    host: 'instagram-downloader-download-instagram-videos1.p.rapidapi.com',
    path: '/v1/instagram',
    method: 'GET',
    queryParams: { url: '{URL}' },
  },
  youtube: {
    host: 'yt-api.p.rapidapi.com',
    path: '/api/video',
    method: 'GET',
    queryParams: { url: '{URL}' },
  },
  youtube_shorts: {
    host: 'yt-api.p.rapidapi.com',
    path: '/api/video',
    method: 'GET',
    queryParams: { url: '{URL}' },
  },
  facebook: {
    host: 'facebook-downloader-download-facebook-videos1.p.rapidapi.com',
    path: '/v1/facebook',
    method: 'GET',
    queryParams: { url: '{URL}' },
  },
  x_twitter: {
    host: 'twitter-downloader-download-twitter-videos1.p.rapidapi.com',
    path: '/v1/twitter',
    method: 'GET',
    queryParams: { url: '{URL}' },
  },
  pinterest: {
    host: 'pinterest-downloader-download-pinterest-videos1.p.rapidapi.com',
    path: '/v1/pinterest',
    method: 'GET',
    queryParams: { url: '{URL}' },
  },
  reddit: {
    host: 'social-media-video-downloader.p.rapidapi.com',
    path: '/api/reddit',
    method: 'GET',
    queryParams: { url: '{URL}' },
  },
  vimeo: {
    host: 'vimeo-downloader.p.rapidapi.com',
    path: '/api/video',
    method: 'GET',
    queryParams: { url: '{URL}' },
  },
  lemon8: {
    host: 'tiktok-video-no-watermark2.p.rapidapi.com',
    path: '/api/video',
    method: 'GET',
    queryParams: { url: '{URL}' },
  },
};

// ─── Provider Implementation ──────────────────────────────────────────
export class RapidApiProvider extends BaseProvider {
  readonly id = 'rapidapi';
  readonly name = 'RapidAPI Marketplace Provider';
  readonly type: 'api' = 'api';

  private _apiKey: string;

  constructor(config: ProviderConfig) {
    super(config);
    this._apiKey = config.apiKey ?? '';
  }

  async initialize(): Promise<void> {
    if (!this._apiKey) {
      throw new ProviderError(
        'RapidAPI key is required. Set NOVA_RAPIDAPI_KEY or provide it in config.',
        this.id,
        'CONFIG_ERROR',
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
  }

  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    this.ensureInitialized();

    const startTime = Date.now();
    const platform = request.platform ?? detectPlatform(request.url);

    if (!this.supports(platform)) {
      throw new ProviderError(
        `RapidAPI provider does not support platform '${platform}'`,
        this.id,
        'UNSUPPORTED',
        false,
        platform,
      );
    }

    try {
      const endpoint = PLATFORM_ENDPOINTS[platform];
      if (!endpoint) {
        throw new ProviderError(
          `No RapidAPI endpoint configured for platform '${platform}'`,
          this.id,
          'UNSUPPORTED',
          false,
          platform,
        );
      }

      const apiUrl = this._buildUrl(endpoint, request.url);
      const apiResponse = await this.withTimeout(
        this._callApi(apiUrl, endpoint.host),
        this.config.timeout,
      );

      const result = this._transformApiResponse(apiResponse, request, platform);
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
    return Object.keys(PLATFORM_ENDPOINTS).includes(platform);
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: Object.keys(PLATFORM_ENDPOINTS) as Platform[],
      mediaTypes: ['video', 'audio', 'metadata', 'image'],
      formats: ['mp4', 'mp3', 'jpeg', 'png'],
      qualities: ['best', '1080p', '720p', '480p'],
      features: [
        'video_download', 'audio_download', 'cover_extraction',
        'thumbnail_extraction', 'metadata_extraction', 'multiple_qualities',
      ] as ProviderFeature[],
      maxConcurrent: 5,
    };
  }

  // ─── Private: API Communication ──────────────────────────────────────
  private _buildUrl(endpoint: RapidApiEndpoint, videoUrl: string): string {
    let path = endpoint.path;
    const params = new URLSearchParams();

    if (endpoint.queryParams) {
      for (const [key, value] of Object.entries(endpoint.queryParams)) {
        if (value === '{URL}') {
          params.append(key, videoUrl);
        } else {
          params.append(key, value);
        }
      }
    }

    return `https://${endpoint.host}${path}?${params.toString()}`;
  }

  private async _callApi(url: string, host: string): Promise<unknown> {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': this._apiKey,
        'X-RapidAPI-Host': host,
        'Content-Type': 'application/json',
        'User-Agent': 'NovaDL-Engine/1.0',
      },
    });

    if (response.status === 401 || response.status === 403) {
      throw new ProviderError(
        `RapidAPI key invalid or expired (${response.status})`,
        this.id,
        'AUTH_FAILED',
        false,
      );
    }
    if (response.status === 429) {
      throw new ProviderError(
        'RapidAPI rate limit exceeded',
        this.id,
        'RATE_LIMITED',
        true,
      );
    }
    if (!response.ok) {
      throw new ProviderError(
        `RapidAPI returned ${response.status}: ${response.statusText}`,
        this.id,
        'NETWORK',
        response.status >= 500,
      );
    }

    return response.json();
  }

  // ─── Private: Transform RapidAPI Response ────────────────────────────
  private _transformApiResponse(
    rawData: unknown,
    request: ExtractionRequest,
    platform: Platform,
  ): ExtractionResult {
    // RapidAPI responses vary by service, so we do a generic transformation
    // that extracts common fields. The raw data is preserved for inspection.
    const data = rawData as Record<string, unknown>;

    const mediaItems: MediaItem[] = [];
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    // Try to extract video URL from various response shapes
    const videoUrl = this._extractVideoUrl(data);
    if (videoUrl) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: 'best',
        url: videoUrl,
        directUrl: videoUrl,
        title: data.title as string ?? data.desc as string,
        filename: `${((data.title as string) ?? 'video').replace(/[^\w\s]/g, '')}.mp4`,
      });
    }

    // Try to extract audio URL
    const audioUrl = data.audio_url as string ?? data.music_url as string;
    if (audioUrl) {
      mediaItems.push({
        type: 'audio',
        format: 'mp3',
        quality: 'best',
        url: audioUrl,
        directUrl: audioUrl,
        title: data.music_title as string ?? data.audio_title as string,
      });
    }

    // Cover images
    const coverUrl = data.cover as string ?? data.thumbnail as string ?? data.origin_cover as string;
    if (coverUrl) {
      covers.push({ url: coverUrl, format: 'jpeg' });
      thumbnails.push({ url: coverUrl, format: 'jpeg' });
    }

    // Metadata
    const metadata: ExtractionMetadata = {
      title: data.title as string ?? data.desc as string,
      description: data.desc as string ?? data.description as string,
      author: data.author as string ?? data.creator as string ?? data.uploader as string,
      authorId: data.author_id as string ?? data.creator_id as string,
      platform,
      originalUrl: request.url,
      duration: data.duration as number ?? data.length as number,
      viewCount: data.view_count as number ?? data.play_count as number ?? data.views as number,
      likeCount: data.like_count as number ?? data.likes as number ?? data.digg_count as number,
      commentCount: data.comment_count as number ?? data.comments as number,
      shareCount: data.share_count as number ?? data.shares as number,
      extra: data,
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
      qualityOptions: mediaItems.length > 0
        ? mediaItems.map((m) => ({
            label: m.quality as string ?? 'best',
            quality: m.quality as VideoQuality | AudioQuality,
            format: m.format,
            url: m.url,
          }))
        : undefined,
      rawResponse: rawData,
    };
  }

  /** Extract video URL from various RapidAPI response shapes */
  private _extractVideoUrl(data: Record<string, unknown>): string | undefined {
    // Common field names across RapidAPI services
    const urlFields = [
      'video_url', 'download_url', 'url', 'video',
      'nwm_video_url', 'no_watermark_url', 'video_download_url',
      'sd_url', 'hd_url', 'mp4_url',
    ];

    for (const field of urlFields) {
      const value = data[field];
      if (typeof value === 'string' && value.startsWith('http')) {
        return value;
      }
    }

    // Check for nested video object
    const videoObj = data.video as Record<string, unknown> | undefined;
    if (videoObj && typeof videoObj === 'object') {
      for (const field of urlFields) {
        const value = videoObj[field];
        if (typeof value === 'string' && value.startsWith('http')) {
          return value;
        }
      }
    }

    return undefined;
  }
}
