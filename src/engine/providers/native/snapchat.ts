/**
 * NovaDL Engine — Snapchat Native Extractor
 *
 * Parses story data from Snapchat page source to extract video/image URLs.
 *
 * Extraction sources:
 * - Embedded JSON data in page source (snap data)
 * - Snapchat web API for spotlight/story data
 * - Meta tags (og:video, og:image) as fallback
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
  ProviderConfig,
  ProviderCapabilities,
  ProviderHealth,
  ProviderFeature,
} from '../../types/index';
import { BaseProvider, ProviderError } from '../base';
import { detectPlatform } from '../../utils/url';

// ─── Snapchat Data Types ──────────────────────────────────────────────
interface SnapchatSpotlightData {
  id?: string;
  title?: string;
  media?: SnapchatMediaInfo;
  creator?: SnapchatCreatorInfo;
  story?: SnapchatStoryInfo;
  shareUrl?: string;
  creationTime?: number;
  viewCount?: number;
  likeCount?: number;
}

interface SnapchatMediaInfo {
  type?: string; // VIDEO, IMAGE
  url?: string;
  streamingUrl?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  previewUrl?: string;
  overlayUrl?: string;
  mediaKey?: string;
}

interface SnapchatCreatorInfo {
  id?: string;
  username?: string;
  displayName?: string;
  bio?: string;
  profileImageUrl?: string;
  bitmojiAvatarUrl?: string;
}

interface SnapchatStoryInfo {
  id?: string;
  title?: string;
  thumbnailUrl?: string;
  duration?: number;
  items?: SnapchatStoryItem[];
}

interface SnapchatStoryItem {
  id?: string;
  type?: string;
  mediaUrl?: string;
  streamingUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  creationTime?: number;
}

interface SnapchatPageData {
  spotlight?: SnapchatSpotlightData;
  story?: SnapchatStoryInfo;
}

// ─── Provider Implementation ──────────────────────────────────────────
export class SnapchatNativeExtractor extends BaseProvider {
  readonly id = 'native_snapchat';
  readonly name = 'Snapchat Native Extractor';
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
        `Snapchat native extractor does not support platform '${platform}'`,
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
    return platform === 'snapchat_spotlight';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['snapchat_spotlight'],
      mediaTypes: ['video', 'image', 'metadata'],
      formats: ['mp4', 'jpeg', 'png', 'webp'],
      qualities: ['best', '1080p', '720p', '480p'],
      features: [
        'video_download', 'cover_extraction', 'thumbnail_extraction',
        'metadata_extraction', 'stories',
      ] as ProviderFeature[],
      maxConcurrent: 5,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      await fetch('https://www.snapchat.com', {
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
        `Snapchat page fetch failed: ${response.status} ${response.statusText}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'snapchat_spotlight',
      );
    }

    return response.text();
  }

  // ─── Private: Parse Page HTML ──────────────────────────────────────────
  private _parsePageHtml(html: string, originalUrl: string): ExtractionResult {
    // Strategy 1: Embedded JSON data in script tags
    const embeddedJson = this._extractJsonFromHtml(
      html,
      /<script[^>]*type="application\/json"[^>]*>(.*?)<\/script>/s,
    );

    if (embeddedJson) {
      try {
        const pageData = JSON.parse(embeddedJson) as SnapchatPageData;
        if (pageData.spotlight?.media) {
          return this._buildResultFromSpotlight(pageData.spotlight, originalUrl);
        }
        if (pageData.story?.items) {
          return this._buildResultFromStory(pageData.story, originalUrl);
        }
      } catch {
        // Parse failed
      }
    }

    // Strategy 2: Parse meta tags for Snapchat Spotlight videos
    const ogVideo = this._extractMetaContent(html, 'og:video');
    const ogVideoSecureUrl = this._extractMetaContent(html, 'og:video:secure_url');
    const ogImage = this._extractMetaContent(html, 'og:image');
    const ogTitle = this._extractMetaContent(html, 'og:title');
    const ogDescription = this._extractMetaContent(html, 'og:description');

    const videoUrl = ogVideoSecureUrl ?? ogVideo;
    if (videoUrl || ogImage) {
      return this._buildResultFromMetaTags(videoUrl, ogImage, ogTitle, ogDescription, originalUrl);
    }

    throw new ProviderError(
      'Could not extract Snapchat media data from page HTML.',
      this.id,
      'PARSE_ERROR',
      false,
      'snapchat_spotlight',
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

  // ─── Private: Build Result from Spotlight ──────────────────────────────
  private _buildResultFromSpotlight(data: SnapchatSpotlightData, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const media = data.media;

    if (media) {
      if (media.type === 'VIDEO') {
        // Streaming URL (HLS) and direct URL
        const videoUrl = media.url ?? media.streamingUrl;
        if (videoUrl) {
          mediaItems.push({
            type: 'video',
            format: 'mp4',
            quality: this._heightToQuality(media.height ?? 0),
            url: videoUrl,
            streamUrl: media.streamingUrl,
            directUrl: media.url,
            duration: media.duration,
            resolution: media.width && media.height ? { width: media.width, height: media.height } : undefined,
            title: data.title,
            filename: this._buildFilename(data.title ?? data.id ?? 'snapchat_video', 'mp4'),
          });
        }
      } else if (media.type === 'IMAGE' && media.url) {
        mediaItems.push({
          type: 'image',
          format: 'jpeg',
          quality: 'best',
          url: media.url,
          directUrl: media.url,
          resolution: media.width && media.height ? { width: media.width, height: media.height } : undefined,
          title: data.title,
        });
      }
    }

    // Covers and thumbnails
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    if (media?.thumbnailUrl) {
      covers.push({ url: media.thumbnailUrl, format: 'jpeg' });
      thumbnails.push({ url: media.thumbnailUrl, format: 'jpeg' });
    }
    if (media?.previewUrl) {
      thumbnails.push({ url: media.previewUrl, format: 'jpeg' });
    }

    // Metadata
    const creator = data.creator;
    const metadata: ExtractionMetadata = {
      title: data.title,
      description: data.title,
      author: creator?.displayName ?? creator?.username,
      authorId: creator?.username ?? creator?.id,
      authorUrl: creator?.username ? `https://www.snapchat.com/add/${creator.username}` : undefined,
      platform: 'snapchat_spotlight',
      originalUrl: data.shareUrl ?? originalUrl,
      duration: media?.duration,
      viewCount: data.viewCount,
      likeCount: data.likeCount,
      uploadDate: data.creationTime ? new Date(data.creationTime * 1000).toISOString() : undefined,
      extra: {
        spotlightId: data.id,
        mediaType: media?.type,
        creatorAvatar: creator?.profileImageUrl ?? creator?.bitmojiAvatarUrl,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'snapchat_spotlight',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      rawResponse: data,
    };
  }

  // ─── Private: Build Result from Story ──────────────────────────────
  private _buildResultFromStory(story: SnapchatStoryInfo, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];

    for (const item of story.items ?? []) {
      if (item.type === 'VIDEO' && (item.mediaUrl ?? item.streamingUrl)) {
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: 'best',
          url: item.mediaUrl ?? item.streamingUrl ?? '',
          streamUrl: item.streamingUrl,
          directUrl: item.mediaUrl,
          duration: item.duration,
          title: story.title,
        });
      } else if (item.type === 'IMAGE' && item.mediaUrl) {
        mediaItems.push({
          type: 'image',
          format: 'jpeg',
          quality: 'best',
          url: item.mediaUrl,
          title: story.title,
        });
      }
    }

    const covers: CoverImage[] = [];
    if (story.thumbnailUrl) {
      covers.push({ url: story.thumbnailUrl, format: 'jpeg' });
    }

    const metadata: ExtractionMetadata = {
      title: story.title,
      platform: 'snapchat_spotlight',
      originalUrl,
      duration: story.duration,
      extra: { storyId: story.id },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'snapchat_spotlight',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      rawResponse: story,
    };
  }

  // ─── Private: Build Result from Meta Tags ──────────────────────────────
  private _buildResultFromMetaTags(
    videoUrl: string | undefined,
    imageUrl: string | undefined,
    title: string | undefined,
    description: string | undefined,
    originalUrl: string,
  ): ExtractionResult {
    const mediaItems: MediaItem[] = [];

    if (videoUrl) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: 'best',
        url: videoUrl,
        directUrl: videoUrl,
        title: title,
      });
    }

    if (imageUrl && !videoUrl) {
      mediaItems.push({
        type: 'image',
        format: 'jpeg',
        quality: 'best',
        url: imageUrl,
        directUrl: imageUrl,
        title: title,
      });
    }

    const covers: CoverImage[] = [];
    if (imageUrl) {
      covers.push({ url: imageUrl, format: 'jpeg' });
    }

    const metadata: ExtractionMetadata = {
      title: title,
      description: description,
      platform: 'snapchat_spotlight',
      originalUrl,
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'snapchat_spotlight',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
    };
  }

  // ─── Private: Helpers ──────────────────────────────────────────────────
  private _heightToQuality(height: number): '1080p' | '720p' | '480p' | '360p' {
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
