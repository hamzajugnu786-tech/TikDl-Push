/**
 * NovaDL Engine — Threads Native Extractor
 *
 * Parses embedded JSON from Threads page source to extract
 * media URLs and author info.
 *
 * Extraction sources:
 * - __NEXT_DATA__ (Threads uses Next.js SSR)
 * - Embedded script data with thread post info
 * - oEmbed endpoint for metadata
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

// ─── Threads Embedded Data Types ──────────────────────────────────────
interface ThreadsNextData {
  props?: {
    pageProps?: {
      threadPostData?: ThreadsPostContainer;
      caption?: ThreadsCaption;
    };
  };
}

interface ThreadsPostContainer {
  code?: string;
  caption?: ThreadsCaption;
  media?: ThreadsMedia[];
  user?: ThreadsUser;
  like_count?: number;
  reply_count?: number;
  repost_count?: number;
  taken_at?: number;
  text_post_app_info?: {
    link_preview_attachment?: unknown;
    quoted_post?: ThreadsPostContainer;
    reply_to_post?: ThreadsPostContainer;
  };
}

interface ThreadsCaption {
  text?: string;
  created_at?: number;
}

interface ThreadsMedia {
  id?: string;
  media_type?: number; // 1=photo, 2=video
  image_versions2?: {
    candidates?: ThreadsImageCandidate[];
  };
  video_versions?: ThreadsVideoVersion[];
  original_width?: number;
  original_height?: number;
  video_duration?: number;
  carousel_media?: ThreadsMedia[];
}

interface ThreadsImageCandidate {
  url?: string;
  width?: number;
  height?: number;
}

interface ThreadsVideoVersion {
  url?: string;
  width?: number;
  height?: number;
  type?: number;
}

interface ThreadsUser {
  username?: string;
  user_id?: string;
  full_name?: string;
  profile_pic_url?: string;
  is_verified?: boolean;
  biography?: string;
}

interface ThreadsOEmbedData {
  title?: string;
  author_name?: string;
  author_url?: string;
  html?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
}

// ─── Provider Implementation ──────────────────────────────────────────
export class ThreadsNativeExtractor extends BaseProvider {
  readonly id = 'native_threads';
  readonly name = 'Threads Native Extractor';
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
        `Threads native extractor does not support platform '${platform}'`,
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
    return platform === 'threads';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['threads'],
      mediaTypes: ['video', 'image', 'metadata'],
      formats: ['mp4', 'jpeg', 'png'],
      qualities: ['best', '1080p', '720p', '480p'],
      features: [
        'video_download', 'cover_extraction', 'thumbnail_extraction',
        'metadata_extraction', 'reels',
      ] as ProviderFeature[],
      maxConcurrent: 5,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      await fetch('https://www.threads.net', {
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
    const html = await this._fetchPage(url);

    // Strategy 1: __NEXT_DATA__ (Next.js SSR format)
    const nextDataJson = this._extractJsonFromHtml(
      html,
      /<script\s+id="__NEXT_DATA__"\s+type="application\/json"[^>]*>(.*?)<\/script>/s,
    );

    if (nextDataJson) {
      try {
        const nextData = JSON.parse(nextDataJson) as ThreadsNextData;
        const postData = nextData.props?.pageProps?.threadPostData;
        if (postData) {
          return this._buildResultFromPostData(postData, url);
        }
      } catch {
        // Continue to fallback
      }
    }

    // Strategy 2: Direct JSON extraction from page source
    // Threads sometimes embeds data in a different script format
    const directJson = this._extractJsonFromHtml(
      html,
      /window\.__threadData\s*=\s*(\{.*?\});?\s*<\/script>/s,
    );

    if (directJson) {
      try {
        const threadData = JSON.parse(directJson) as ThreadsPostContainer;
        return this._buildResultFromPostData(threadData, url);
      } catch {
        // Continue
      }
    }

    // Strategy 3: oEmbed endpoint
    try {
      const oembed = await this._fetchOEmbed(url);
      if (oembed) {
        return this._buildResultFromOEmbed(oembed, url);
      }
    } catch {
      // oEmbed failed
    }

    throw new ProviderError(
      'Could not extract Threads media data from page HTML. No embedded JSON found.',
      this.id,
      'PARSE_ERROR',
      false,
      'threads',
    );
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
        `Threads page fetch failed: ${response.status} ${response.statusText}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'threads',
      );
    }

    return response.text();
  }

  private _extractJsonFromHtml(html: string, pattern: RegExp): string | null {
    const match = pattern.exec(html);
    if (!match?.[1]) return null;
    return match[1];
  }

  // ─── Private: oEmbed Fetch ──────────────────────────────────────────
  private async _fetchOEmbed(url: string): Promise<ThreadsOEmbedData | null> {
    try {
      const oembedUrl = `https://www.threads.net/oembed/?url=${encodeURIComponent(url)}`;
      const response = await fetch(oembedUrl, {
        headers: { 'User-Agent': this._userAgent, 'Accept': 'application/json' },
      });
      if (!response.ok) return null;
      return await response.json() as ThreadsOEmbedData;
    } catch {
      return null;
    }
  }

  // ─── Private: Build Result from PostData ──────────────────────────────
  private _buildResultFromPostData(post: ThreadsPostContainer, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];

    // Process media array
    const mediaList = post.media ?? [];
    for (const media of mediaList) {
      // Handle carousel media (nested media items)
      const carouselMedia = media.carousel_media ?? [media];

      for (const item of carouselMedia) {
        if (item.media_type === 2) {
          // Video
          const videoVersions = item.video_versions ?? [];
          // Sort by width (highest first)
          const sorted = videoVersions.sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
          if (sorted.length > 0 && sorted[0]?.url) {
            mediaItems.push({
              type: 'video',
              format: 'mp4',
              quality: this._heightToQuality(sorted[0].height ?? 0),
              url: sorted[0].url,
              directUrl: sorted[0].url,
              duration: item.video_duration,
              resolution: item.original_width && item.original_height
                ? { width: item.original_width, height: item.original_height }
                : undefined,
              title: post.caption?.text,
              filename: this._buildFilename(post.code ?? 'threads_video', 'mp4'),
            });
          }
        } else if (item.media_type === 1) {
          // Image
          const candidates = item.image_versions2?.candidates ?? [];
          const bestCandidate = candidates.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
          if (bestCandidate?.url) {
            mediaItems.push({
              type: 'image',
              format: 'jpeg',
              quality: 'best',
              url: bestCandidate.url,
              directUrl: bestCandidate.url,
              resolution: bestCandidate.width && bestCandidate.height
                ? { width: bestCandidate.width, height: bestCandidate.height }
                : undefined,
              title: post.caption?.text,
              filename: this._buildFilename(post.code ?? 'threads_image', 'jpeg'),
            });
          }
        }
      }
    }

    // Covers and thumbnails
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];
    for (const media of mediaList) {
      const candidates = media.image_versions2?.candidates ?? [];
      if (candidates.length > 0 && candidates[0]?.url) {
        covers.push({ url: candidates[0].url, format: 'jpeg' });
        thumbnails.push({ url: candidates[0].url, format: 'jpeg' });
      }
    }

    // Metadata
    const metadata: ExtractionMetadata = {
      title: post.caption?.text,
      description: post.caption?.text,
      author: post.user?.full_name ?? post.user?.username,
      authorId: post.user?.username,
      authorUrl: post.user?.username ? `https://www.threads.net/@${post.user.username}` : undefined,
      platform: 'threads',
      originalUrl,
      likeCount: post.like_count,
      commentCount: post.reply_count,
      shareCount: post.repost_count,
      uploadDate: post.taken_at ? new Date(post.taken_at * 1000).toISOString() : undefined,
      extra: {
        postId: post.code,
        isVerified: post.user?.is_verified,
        authorAvatar: post.user?.profile_pic_url,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'threads',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      rawResponse: post,
    };
  }

  // ─── Private: Build Result from oEmbed ──────────────────────────────
  private _buildResultFromOEmbed(oembed: ThreadsOEmbedData, originalUrl: string): ExtractionResult {
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
      platform: 'threads',
      originalUrl,
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'threads',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      rawResponse: oembed,
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
