/**
 * NovaDL Engine — Pinterest Native Extractor
 *
 * Parses PinterestResource or embedded JSON from page source to
 * extract image/video URLs and pin metadata.
 *
 * Extraction sources:
 * - P.mainData (Pinterest SSR data)
 * - PinResource JSON from inline scripts
 * - Initial data embedded in script tags
 * - Meta tags (og:image, og:video) as fallback
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

// ─── Pinterest Embedded Data Types ──────────────────────────────────────
interface PinterestPinData {
  id?: string;
  title?: string;
  description?: string;
  link?: string;
  images?: PinterestImages;
  story_pin_data?: unknown;
  video?: PinterestVideoInfo;
  grid_title?: string;
  closeup_description?: string;
  created_at?: string;
  pinner?: PinterestPinner;
  board?: PinterestBoard;
  aggregated_pin_data?: {
    aggregated_stats?: PinterestStats;
  };
  is_video?: boolean;
  dominant_color?: string;
}

interface PinterestImages {
  orig?: PinterestImageSize;
  x1200?: PinterestImageSize;
  x736?: PinterestImageSize;
  x474?: PinterestImageSize;
  x236?: PinterestImageSize;
  '170x'?: PinterestImageSize;
  '236x'?: PinterestImageSize;
  '474x'?: PinterestImageSize;
  '736x'?: PinterestImageSize;
  'orig-?'?: PinterestImageSize;
}

interface PinterestImageSize {
  url?: string;
  width?: number;
  height?: number;
}

interface PinterestVideoInfo {
  video_list?: PinterestVideoList;
  duration?: number;
  video_height?: number;
  video_width?: number;
}

interface PinterestVideoList {
  V_720P?: PinterestVideoObj;
  V_HLS?: PinterestVideoObj;
  V_EXP_720P?: PinterestVideoObj;
  V_EXP_480P?: PinterestVideoObj;
  V_360P?: PinterestVideoObj;
  V_240P?: PinterestVideoObj;
}

interface PinterestVideoObj {
  url?: string;
  width?: number;
  height?: number;
  duration?: number;
  thumbnail?: string;
}

interface PinterestPinner {
  username?: string;
  full_name?: string;
  image_small_url?: string;
  follower_count?: number;
}

interface PinterestBoard {
  name?: string;
  url?: string;
}

interface PinterestStats {
  saves?: number;
  comments?: number;
  views?: number;
}

interface PinterestMainData {
  pins?: Record<string, PinterestPinData>;
  resource_response?: {
    data?: PinterestPinData;
  };
}

// ─── Provider Implementation ──────────────────────────────────────────
export class PinterestNativeExtractor extends BaseProvider {
  readonly id = 'native_pinterest';
  readonly name = 'Pinterest Native Extractor';
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
        `Pinterest native extractor does not support platform '${platform}'`,
        this.id,
        'UNSUPPORTED',
        false,
        platform,
      );
    }

    try {
      const html = await this.withTimeout(
        this._fetchPage(request.url),
        this.config.timeout,
      );

      const result = this._parsePageHtml(html, request.url);
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
    return platform === 'pinterest';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['pinterest'],
      mediaTypes: ['video', 'image', 'metadata'],
      formats: ['mp4', 'jpeg', 'png', 'webp'],
      qualities: ['best', '1080p', '720p', '480p'],
      features: [
        'video_download', 'cover_extraction', 'thumbnail_extraction',
        'metadata_extraction', 'multiple_qualities',
      ] as ProviderFeature[],
      maxConcurrent: 5,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      await fetch('https://www.pinterest.com', {
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

  // ─── Private: Page Fetching ──────────────────────────────────────────
  private async _fetchPage(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new ProviderError(
        `Pinterest page fetch failed: ${response.status} ${response.statusText}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'pinterest',
      );
    }

    return response.text();
  }

  // ─── Private: Parse Page HTML ──────────────────────────────────────────
  private _parsePageHtml(html: string, originalUrl: string): ExtractionResult {
    // Strategy 1: P.mainData (Pinterest SSR data)
    const mainDataJson = this._extractJsonFromHtml(
      html,
      /P\.mainData\s*=\s*(\{.*?\});\s*<\/script>/s,
    );

    if (mainDataJson) {
      try {
        const mainData = JSON.parse(mainDataJson) as PinterestMainData;
        // Try to find pin data from resource_response or pins map
        const pinFromResponse = mainData.resource_response?.data;
        if (pinFromResponse) {
          return this._buildResultFromPinData(pinFromResponse, originalUrl);
        }
        const pinsMap = mainData.pins;
        if (pinsMap) {
          const firstKey = Object.keys(pinsMap)[0];
          if (firstKey) {
            const pin = pinsMap[firstKey];
            if (pin) {
              return this._buildResultFromPinData(pin, originalUrl);
            }
          }
        }
      } catch {
        // Continue to next strategy
      }
    }

    // Strategy 2: Embedded pin data in script JSON
    const pinDataJson = this._extractJsonFromHtml(
      html,
      /<script[^>]*type="application\/json"[^>]*>(.*?)<\/script>/s,
    );

    if (pinDataJson) {
      try {
        const parsed = JSON.parse(pinDataJson) as Record<string, unknown>;
        // Look for pin data in various nested structures
        const resourceData = parsed.resource_data_map as Record<string, Record<string, unknown>> | undefined;
        if (resourceData) {
          for (const resourceKey of Object.keys(resourceData)) {
            const inner = resourceData[resourceKey];
            if (!inner) continue;
            const data = inner.data as PinterestPinData | undefined;
            if (data?.id) {
              return this._buildResultFromPinData(data, originalUrl);
            }
          }
        }
      } catch {
        // Continue
      }
    }

    // Strategy 3: Meta tags fallback
    const ogImage = this._extractMetaContent(html, 'og:image');
    const ogVideo = this._extractMetaContent(html, 'og:video');
    const ogTitle = this._extractMetaContent(html, 'og:title');
    const ogDescription = this._extractMetaContent(html, 'og:description');

    if (ogImage || ogVideo) {
      return this._buildResultFromMetaTags(ogImage, ogVideo, ogTitle, ogDescription, originalUrl);
    }

    throw new ProviderError(
      'Could not extract Pinterest data from page HTML.',
      this.id,
      'PARSE_ERROR',
      false,
      'pinterest',
    );
  }

  private _extractJsonFromHtml(html: string, pattern: RegExp): string | null {
    const match = pattern.exec(html);
    if (!match?.[1]) return null;
    return match[1];
  }

  private _extractMetaContent(html: string, property: string): string | undefined {
    const pattern = new RegExp(`<meta\\s+property=["']${property}["']\\s+content=["']([^"']+)["']`, 'i');
    const match = pattern.exec(html);
    return match?.[1];
  }

  // ─── Private: Build Result from PinData ──────────────────────────────
  private _buildResultFromPinData(pin: PinterestPinData, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const qualityOptions: QualityOption[] = [];

    // Video extraction
    if (pin.is_video && pin.video?.video_list) {
      const videoList = pin.video.video_list;

      // Extract all video quality variants
      const videoVariants: PinterestVideoObj[] = [];
      if (videoList.V_720P) videoVariants.push(videoList.V_720P);
      if (videoList.V_EXP_720P) videoVariants.push(videoList.V_EXP_720P);
      if (videoList.V_EXP_480P) videoVariants.push(videoList.V_EXP_480P);
      if (videoList.V_360P) videoVariants.push(videoList.V_360P);
      if (videoList.V_240P) videoVariants.push(videoList.V_240P);

      // Sort by height (highest first)
      const sortedVariants = videoVariants.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));

      for (const variant of sortedVariants) {
        if (variant.url) {
          mediaItems.push({
            type: 'video',
            format: 'mp4',
            quality: this._heightToQuality(variant.height ?? 0),
            url: variant.url,
            directUrl: variant.url,
            duration: variant.duration ?? pin.video?.duration,
            resolution: variant.width && variant.height ? { width: variant.width, height: variant.height } : undefined,
            title: pin.title ?? pin.grid_title,
            filename: this._buildFilename(pin.title ?? pin.grid_title ?? 'pinterest_video', 'mp4'),
          });

          qualityOptions.push({
            label: `${variant.height ?? 0}p`,
            quality: this._heightToQuality(variant.height ?? 0),
            format: 'mp4',
            url: variant.url,
            isSource: variant === sortedVariants[0],
          });
        }
      }

      // HLS stream
      if (videoList.V_HLS?.url) {
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: 'best',
          url: videoList.V_HLS.url,
          streamUrl: videoList.V_HLS.url,
          title: pin.title,
        });
      }
    }

    // Image extraction
    if (pin.images) {
      const origImage = pin.images.orig ?? pin.images['orig-?'];
      if (origImage?.url) {
        mediaItems.push({
          type: 'image',
          format: 'jpeg',
          quality: 'best',
          url: origImage.url,
          directUrl: origImage.url,
          resolution: origImage.width && origImage.height ? { width: origImage.width, height: origImage.height } : undefined,
          title: pin.title ?? pin.grid_title,
          filename: this._buildFilename(pin.title ?? pin.grid_title ?? 'pinterest_image', 'jpeg'),
        });
      }
    }

    // Covers and thumbnails
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    if (pin.images) {
      const origImage = pin.images.orig ?? pin.images['orig-?'];
      if (origImage?.url) {
        covers.push({ url: origImage.url, width: origImage.width, height: origImage.height, format: 'jpeg' });
      }
      const x736 = pin.images.x736 ?? pin.images['736x'];
      if (x736?.url) {
        thumbnails.push({ url: x736.url, width: x736.width, height: x736.height, format: 'jpeg' });
      }
      const x474 = pin.images.x474 ?? pin.images['474x'];
      if (x474?.url) {
        thumbnails.push({ url: x474.url, width: x474.width, height: x474.height, format: 'jpeg' });
      }
      const x236 = pin.images.x236 ?? pin.images['236x'];
      if (x236?.url) {
        thumbnails.push({ url: x236.url, width: x236.width, height: x236.height, format: 'jpeg' });
      }
    }

    // Video thumbnail
    if (pin.video?.video_list?.V_720P?.thumbnail) {
      thumbnails.push({ url: pin.video.video_list.V_720P.thumbnail, format: 'jpeg' });
    }

    // Metadata
    const metadata: ExtractionMetadata = {
      title: pin.title ?? pin.grid_title,
      description: pin.description ?? pin.closeup_description,
      author: pin.pinner?.full_name,
      authorId: pin.pinner?.username,
      authorUrl: pin.pinner?.username ? `https://www.pinterest.com/${pin.pinner.username}/` : undefined,
      platform: 'pinterest',
      originalUrl: pin.link ?? originalUrl,
      duration: pin.video?.duration,
      likeCount: pin.aggregated_pin_data?.aggregated_stats?.saves,
      commentCount: pin.aggregated_pin_data?.aggregated_stats?.comments,
      viewCount: pin.aggregated_pin_data?.aggregated_stats?.views,
      uploadDate: pin.created_at,
      extra: {
        pinId: pin.id,
        isVideo: pin.is_video,
        boardName: pin.board?.name,
        boardUrl: pin.board?.url,
        dominantColor: pin.dominant_color,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'pinterest',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse: pin,
    };
  }

  // ─── Private: Build Result from Meta Tags ──────────────────────────────
  private _buildResultFromMetaTags(
    ogImage: string | undefined,
    ogVideo: string | undefined,
    ogTitle: string | undefined,
    ogDescription: string | undefined,
    originalUrl: string,
  ): ExtractionResult {
    const mediaItems: MediaItem[] = [];

    if (ogVideo) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: 'best',
        url: ogVideo,
        title: ogTitle,
      });
    }

    if (ogImage) {
      mediaItems.push({
        type: 'image',
        format: 'jpeg',
        quality: 'best',
        url: ogImage,
        title: ogTitle,
      });
    }

    const covers: CoverImage[] = [];
    if (ogImage) {
      covers.push({ url: ogImage, format: 'jpeg' });
    }

    const metadata: ExtractionMetadata = {
      title: ogTitle,
      description: ogDescription,
      platform: 'pinterest',
      originalUrl,
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'pinterest',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      rawResponse: { ogImage, ogVideo, ogTitle, ogDescription },
    };
  }

  // ─── Private: Helpers ──────────────────────────────────────────────────
  private _heightToQuality(height: number): '1080p' | '720p' | '480p' | '360p' | '240p' {
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
