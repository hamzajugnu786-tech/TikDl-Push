/**
 * NovaDL Engine — Instagram Native Extractor
 *
 * Parses embedded JSON from Instagram page HTML to extract video/image URLs,
 * carousel posts, reels, stories metadata.
 *
 * Extraction sources:
 * - __a_video_data__ or window._sharedData (Instagram's SSR data)
 * - oEmbed endpoint for metadata
 * - GraphQL data from embedded scripts
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

// ─── Instagram Embedded Data Types ──────────────────────────────────────
interface InstagramSharedData {
  entry_data?: {
    PostPage?: InstagramPostPage[];
    ProfilePage?: unknown[];
    ExplorePage?: unknown[];
  };
  config?: {
    viewerId?: string;
  };
  language_code?: string;
}

interface InstagramPostPage {
  graphql?: {
    shortcode_media?: InstagramShortcodeMedia;
  };
}

interface InstagramShortcodeMedia {
  id?: string;
  shortcode?: string;
  display_url?: string;
  video_url?: string;
  is_video?: boolean;
  edge_media_to_caption?: {
    edges?: Array<{
      node?: { text?: string };
    }>;
  };
  owner?: InstagramOwner;
  edge_media_preview_like?: { count?: number };
  edge_media_to_comment?: { count?: number };
  video_view_count?: number;
  dash_info?: {
    video_dash_manifest?: string;
    is_dash_eligible?: boolean;
  };
  thumbnail_resources?: InstagramThumbnailResource[];
  edge_sidecar_to_children?: {
    edges?: Array<{
      node?: InstagramCarouselItem;
    }>;
  };
  dimensions?: { height?: number; width?: number };
  tracking_token?: string;
  taken_at_timestamp?: number;
}

interface InstagramOwner {
  id?: string;
  username?: string;
  profile_pic_url?: string;
  full_name?: string;
  is_verified?: boolean;
}

interface InstagramThumbnailResource {
  src?: string;
  config_width?: number;
  config_height?: number;
}

interface InstagramCarouselItem {
  id?: string;
  shortcode?: string;
  display_url?: string;
  is_video?: boolean;
  video_url?: string;
  dimensions?: { height?: number; width?: number };
  thumbnail_resources?: InstagramThumbnailResource[];
}

interface InstagramVideoData {
  video_url?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  upload_date?: string;
  width?: number;
  height?: number;
  duration?: number;
  views?: number;
  title?: string;
}

interface InstagramOEmbedData {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  width?: number;
  height?: number;
  html?: string;
  provider_name?: string;
  type?: string;
}

// ─── Provider Implementation ──────────────────────────────────────────
export class InstagramNativeExtractor extends BaseProvider {
  readonly id = 'native_instagram';
  readonly name = 'Instagram Native Extractor';
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
        `Instagram native extractor does not support platform '${platform}'`,
        this.id,
        'UNSUPPORTED',
        false,
        platform,
      );
    }

    try {
      const result = await this.withTimeout(
        this._extractFromPage(request),
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
    return platform === 'instagram';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['instagram'],
      mediaTypes: ['video', 'image', 'metadata'],
      formats: ['mp4', 'jpeg', 'png', 'webp'],
      qualities: ['best', '1080p', '720p', '480p'],
      features: [
        'video_download', 'cover_extraction', 'thumbnail_extraction',
        'metadata_extraction', 'reels', 'stories',
      ] as ProviderFeature[],
      maxConcurrent: 5,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      await fetch('https://www.instagram.com', {
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
  private async _extractFromPage(request: ExtractionRequest): Promise<ExtractionResult> {
    const html = await this._fetchPage(request.url);
    const originalUrl = request.url;

    // Strategy 1: __a_video_data__ (video/reels page format)
    const videoDataJson = this._extractJsonFromHtml(
      html,
      /window\.__a_video_data__\s*=\s*(\{.*?\});?\s*(?:<\/script>|$)/s,
    );

    if (videoDataJson) {
      try {
        const videoData = JSON.parse(videoDataJson) as InstagramVideoData;
        if (videoData.video_url) {
          return this._buildResultFromVideoData(videoData, originalUrl);
        }
      } catch {
        // Continue to next strategy
      }
    }

    // Strategy 2: window._sharedData (traditional Instagram page format)
    const sharedDataJson = this._extractJsonFromHtml(
      html,
      /window\._sharedData\s*=\s*(\{.*?\});\s*<\/script>/s,
    );

    if (sharedDataJson) {
      try {
        const sharedData = JSON.parse(sharedDataJson) as InstagramSharedData;
        const postPages = sharedData.entry_data?.PostPage;
        if (postPages && postPages.length > 0) {
          const shortcodeMedia = postPages[0]?.graphql?.shortcode_media;
          if (shortcodeMedia) {
            return this._buildResultFromShortcodeMedia(shortcodeMedia, originalUrl);
          }
        }
      } catch {
        // Continue to next strategy
      }
    }

    // Strategy 3: Try oEmbed endpoint for metadata
    try {
      const oembedResult = await this._fetchOEmbed(originalUrl);
      if (oembedResult) {
        return this._buildResultFromOEmbed(oembedResult, originalUrl);
      }
    } catch {
      // oEmbed failed
    }

    throw new ProviderError(
      'Could not extract Instagram media data from page HTML. No embedded JSON found.',
      this.id,
      'PARSE_ERROR',
      false,
      'instagram',
    );
  }

  // ─── Private: Page Fetching ──────────────────────────────────────────
  private async _fetchPage(url: string): Promise<string> {
    // Convert mobile URLs to desktop format for richer data
    const normalizedUrl = url.replace('instagram.com/p/', 'www.instagram.com/p/');

    const response = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cookie': 'ig_cb=1', // Required for some page formats
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new ProviderError(
        `Instagram page fetch failed: ${response.status} ${response.statusText}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500 || response.status === 429,
        'instagram',
      );
    }

    return response.text();
  }

  // ─── Private: Extract JSON from HTML ──────────────────────────────────
  private _extractJsonFromHtml(html: string, pattern: RegExp): string | null {
    const match = pattern.exec(html);
    if (!match || !match[1]) return null;
    return match[1];
  }

  // ─── Private: oEmbed Fetch ──────────────────────────────────────────
  private async _fetchOEmbed(url: string): Promise<InstagramOEmbedData | null> {
    try {
      const oembedUrl = `https://www.instagram.com/oembed/?url=${encodeURIComponent(url)}`;
      const response = await fetch(oembedUrl, {
        headers: {
          'User-Agent': this._userAgent,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) return null;
      return await response.json() as InstagramOEmbedData;
    } catch {
      return null;
    }
  }

  // ─── Private: Build Result from VideoData ──────────────────────────────
  private _buildResultFromVideoData(videoData: InstagramVideoData, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];

    if (videoData.video_url) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: this._heightToQuality(videoData.height ?? videoData.width ?? 0),
        url: videoData.video_url,
        directUrl: videoData.video_url,
        duration: videoData.duration,
        resolution: videoData.width && videoData.height
          ? { width: videoData.width, height: videoData.height }
          : undefined,
        title: videoData.title,
        filename: this._buildFilename(videoData.title ?? 'instagram_video', 'mp4'),
      });
    }

    if (videoData.thumbnail_url) {
      mediaItems.push({
        type: 'image',
        format: 'jpeg',
        quality: 'best',
        url: videoData.thumbnail_url,
        title: videoData.title,
      });
    }

    const covers: CoverImage[] = [];
    if (videoData.thumbnail_url) {
      covers.push({
        url: videoData.thumbnail_url,
        width: videoData.thumbnail_width ?? videoData.width,
        height: videoData.thumbnail_height ?? videoData.height,
        format: 'jpeg',
      });
    }

    const metadata: ExtractionMetadata = {
      title: videoData.title,
      platform: 'instagram',
      originalUrl,
      duration: videoData.duration,
      viewCount: videoData.views,
      uploadDate: videoData.upload_date,
      extra: {
        width: videoData.width,
        height: videoData.height,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'instagram',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      qualityOptions: mediaItems.length > 0
        ? mediaItems.map((m) => ({
            label: m.quality as string,
            quality: m.quality,
            format: m.format,
            url: m.url,
          }))
        : undefined,
      rawResponse: videoData,
    };
  }

  // ─── Private: Build Result from ShortcodeMedia ──────────────────────────
  private _buildResultFromShortcodeMedia(media: InstagramShortcodeMedia, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const qualityOptions: QualityOption[] = [];

    // Carousel posts (multi-image/multi-video)
    const carouselItems = media.edge_sidecar_to_children?.edges;
    if (carouselItems && carouselItems.length > 0) {
      for (const edge of carouselItems) {
        const node = edge.node;
        if (!node) continue;

        if (node.is_video && node.video_url) {
          mediaItems.push({
            type: 'video',
            format: 'mp4',
            quality: this._heightToQuality(node.dimensions?.height ?? 0),
            url: node.video_url,
            directUrl: node.video_url,
            resolution: node.dimensions?.width && node.dimensions?.height
              ? { width: node.dimensions.width, height: node.dimensions.height }
              : undefined,
            title: this._getCaption(media),
            filename: this._buildFilename(node.shortcode ?? 'instagram_carousel', 'mp4'),
          });
        } else if (node.display_url) {
          mediaItems.push({
            type: 'image',
            format: 'jpeg',
            quality: 'best',
            url: node.display_url,
            directUrl: node.display_url,
            resolution: node.dimensions?.width && node.dimensions?.height
              ? { width: node.dimensions.width, height: node.dimensions.height }
              : undefined,
            title: this._getCaption(media),
            filename: this._buildFilename(node.shortcode ?? 'instagram_image', 'jpeg'),
          });
        }
      }
    } else {
      // Single video
      if (media.is_video && media.video_url) {
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: this._heightToQuality(media.dimensions?.height ?? 0),
          url: media.video_url,
          directUrl: media.video_url,
          duration: undefined, // Instagram doesn't expose duration in SSR data
          resolution: media.dimensions?.width && media.dimensions?.height
            ? { width: media.dimensions.width, height: media.dimensions.height }
            : undefined,
          title: this._getCaption(media),
          filename: this._buildFilename(media.shortcode ?? 'instagram_video', 'mp4'),
        });

        qualityOptions.push({
          label: 'Original quality',
          quality: 'best',
          format: 'mp4',
          url: media.video_url,
          isSource: true,
        });
      }

      // Single image
      if (!media.is_video && media.display_url) {
        mediaItems.push({
          type: 'image',
          format: 'jpeg',
          quality: 'best',
          url: media.display_url,
          directUrl: media.display_url,
          resolution: media.dimensions?.width && media.dimensions?.height
            ? { width: media.dimensions.width, height: media.dimensions.height }
            : undefined,
          title: this._getCaption(media),
          filename: this._buildFilename(media.shortcode ?? 'instagram_image', 'jpeg'),
        });
      }
    }

    // Covers
    const covers: CoverImage[] = [];
    if (media.display_url) {
      covers.push({ url: media.display_url, format: 'jpeg' });
    }

    // Thumbnails (from thumbnail_resources)
    const thumbnails: Thumbnail[] = [];
    const thumbResources = media.thumbnail_resources ?? [];
    for (const res of thumbResources) {
      if (res.src) {
        thumbnails.push({
          url: res.src,
          width: res.config_width,
          height: res.config_height,
          format: 'jpeg',
        });
      }
    }

    // Metadata
    const metadata: ExtractionMetadata = {
      title: this._getCaption(media),
      description: this._getCaption(media),
      author: media.owner?.username,
      authorId: media.owner?.id,
      authorUrl: media.owner?.username ? `https://www.instagram.com/${media.owner.username}/` : undefined,
      platform: 'instagram',
      originalUrl,
      viewCount: media.video_view_count,
      likeCount: media.edge_media_preview_like?.count,
      commentCount: media.edge_media_to_comment?.count,
      uploadDate: media.taken_at_timestamp ? new Date(media.taken_at_timestamp * 1000).toISOString() : undefined,
      isPrivate: false,
      extra: {
        shortcode: media.shortcode,
        isVideo: media.is_video,
        isVerified: media.owner?.is_verified,
        carouselCount: carouselItems?.length ?? 0,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'instagram',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse: media,
    };
  }

  // ─── Private: Build Result from oEmbed ──────────────────────────────
  private _buildResultFromOEmbed(oembed: InstagramOEmbedData, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];

    if (oembed.thumbnail_url) {
      mediaItems.push({
        type: 'image',
        format: 'jpeg',
        quality: 'best',
        url: oembed.thumbnail_url,
        resolution: oembed.thumbnail_width && oembed.thumbnail_height
          ? { width: oembed.thumbnail_width, height: oembed.thumbnail_height }
          : undefined,
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
      author: oembed.author_name,
      authorUrl: oembed.author_url,
      platform: 'instagram',
      originalUrl,
      extra: {
        providerName: oembed.provider_name,
        type: oembed.type,
        width: oembed.width,
        height: oembed.height,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'instagram',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      rawResponse: oembed,
    };
  }

  // ─── Private: Helpers ──────────────────────────────────────────────────
  private _getCaption(media: InstagramShortcodeMedia): string | undefined {
    const edges = media.edge_media_to_caption?.edges;
    if (edges && edges.length > 0) {
      return edges[0]?.node?.text;
    }
    return undefined;
  }

  private _heightToQuality(height: number): '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p' {
    if (height >= 2160) return '2160p';
    if (height >= 1440) return '1440p';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    return '360p';
  }

  private _buildFilename(title: string, ext: string): string {
    const sanitized = title.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').substring(0, 200);
    return `${sanitized}.${ext}`;
  }
}
