/**
 * NovaDL Engine — Lemon8 Native Extractor
 *
 * Parses embedded post data from Lemon8 page source to extract
 * image/video URLs and metadata.
 *
 * Extraction sources:
 * - Embedded JSON data in page HTML (Lemon8 SSR data)
 * - Meta tags (og:image, og:video) as fallback
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

// ─── Lemon8 Data Types ──────────────────────────────────────────────
interface Lemon8PostData {
  id?: string;
  title?: string;
  description?: string;
  author?: Lemon8AuthorInfo;
  mediaList?: Lemon8MediaItem[];
  stats?: Lemon8StatsInfo;
  createTime?: number;
  tags?: string[];
  category?: string;
  shareUrl?: string;
}

interface Lemon8AuthorInfo {
  id?: string;
  username?: string;
  nickname?: string;
  avatarUrl?: string;
  signature?: string;
}

interface Lemon8MediaItem {
  type?: string; // image, video
  url?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
}

interface Lemon8StatsInfo {
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  collectCount?: number;
}

// ─── Provider Implementation ──────────────────────────────────────────
export class Lemon8NativeExtractor extends BaseProvider {
  readonly id = 'native_lemon8';
  readonly name = 'Lemon8 Native Extractor';
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
        `Lemon8 native extractor does not support platform '${platform}'`,
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
    return platform === 'lemon8';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['lemon8'],
      mediaTypes: ['video', 'image', 'metadata'],
      formats: ['mp4', 'jpeg', 'png', 'webp'],
      qualities: ['best', '1080p', '720p', '480p'],
      features: [
        'video_download', 'cover_extraction', 'thumbnail_extraction',
        'metadata_extraction',
      ] as ProviderFeature[],
      maxConcurrent: 5,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      await fetch('https://www.lemon8-app.com', {
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
        `Lemon8 page fetch failed: ${response.status} ${response.statusText}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'lemon8',
      );
    }

    return response.text();
  }

  // ─── Private: Parse Page HTML ──────────────────────────────────────────
  private _parsePageHtml(html: string, originalUrl: string): ExtractionResult {
    // Strategy 1: __NEXT_DATA__ (Lemon8 uses Next.js SSR)
    const nextDataJson = this._extractJsonFromHtml(
      html,
      /<script\s+id="__NEXT_DATA__"\s+type="application\/json"[^>]*>(.*?)<\/script>/s,
    );

    if (nextDataJson) {
      try {
        const nextData = JSON.parse(nextDataJson) as Record<string, unknown>;
        const props = nextData.props as Record<string, unknown> | undefined;
        const pageProps = props?.pageProps as Record<string, unknown> | undefined;
        const postData = pageProps?.postData as Lemon8PostData | undefined;
        if (postData) {
          return this._buildResultFromPostData(postData, originalUrl);
        }

        // Try alternate key names
        const postDetail = pageProps?.postDetail as Lemon8PostData | undefined;
        if (postDetail) {
          return this._buildResultFromPostData(postDetail, originalUrl);
        }
      } catch {
        // Parse failed
      }
    }

    // Strategy 2: Embedded window.__INITIAL_STATE__
    const initialStateJson = this._extractJsonFromHtml(
      html,
      /window\.__INITIAL_STATE__\s*=\s*(\{.*?\});?\s*<\/script>/s,
    );

    if (initialStateJson) {
      try {
        const state = JSON.parse(initialStateJson) as Record<string, unknown>;
        const post = state.post as Lemon8PostData | undefined ?? state.postDetail as Lemon8PostData | undefined;
        if (post) {
          return this._buildResultFromPostData(post, originalUrl);
        }
      } catch {
        // Parse failed
      }
    }

    // Strategy 3: Meta tags fallback
    const ogImage = this._extractMetaContent(html, 'og:image');
    const ogVideo = this._extractMetaContent(html, 'og:video');
    const ogVideoSecureUrl = this._extractMetaContent(html, 'og:video:secure_url');
    const ogTitle = this._extractMetaContent(html, 'og:title');
    const ogDescription = this._extractMetaContent(html, 'og:description');

    if (ogImage || ogVideo) {
      return this._buildResultFromMetaTags(
        ogVideoSecureUrl ?? ogVideo,
        ogImage,
        ogTitle,
        ogDescription,
        originalUrl,
      );
    }

    throw new ProviderError(
      'Could not extract Lemon8 post data from page HTML.',
      this.id,
      'PARSE_ERROR',
      false,
      'lemon8',
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

  // ─── Private: Build Result from PostData ──────────────────────────────
  private _buildResultFromPostData(post: Lemon8PostData, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];

    for (const media of post.mediaList ?? []) {
      if (media.type === 'video') {
        const videoUrl = media.videoUrl ?? media.url;
        if (videoUrl) {
          mediaItems.push({
            type: 'video',
            format: 'mp4',
            quality: this._heightToQuality(media.height ?? 0),
            url: videoUrl,
            directUrl: videoUrl,
            duration: media.duration,
            resolution: media.width && media.height ? { width: media.width, height: media.height } : undefined,
            title: post.title,
            filename: this._buildFilename(post.title ?? post.id ?? 'lemon8_video', 'mp4'),
          });
        }
      } else if (media.url) {
        mediaItems.push({
          type: 'image',
          format: 'jpeg',
          quality: 'best',
          url: media.url,
          directUrl: media.url,
          resolution: media.width && media.height ? { width: media.width, height: media.height } : undefined,
          title: post.title,
          filename: this._buildFilename(post.title ?? post.id ?? 'lemon8_image', 'jpeg'),
        });
      }
    }

    // Covers and thumbnails
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    for (const media of post.mediaList ?? []) {
      if (media.thumbnailUrl) {
        covers.push({ url: media.thumbnailUrl, format: 'jpeg' });
        thumbnails.push({ url: media.thumbnailUrl, format: 'jpeg' });
      }
      if (media.url && media.type === 'image') {
        thumbnails.push({ url: media.url, width: media.width, height: media.height, format: 'jpeg' });
      }
    }

    // Author avatar
    if (post.author?.avatarUrl) {
      thumbnails.push({ url: post.author.avatarUrl, format: 'jpeg' });
    }

    // Metadata
    const metadata: ExtractionMetadata = {
      title: post.title,
      description: post.description,
      author: post.author?.nickname ?? post.author?.username,
      authorId: post.author?.username ?? post.author?.id,
      authorUrl: post.author?.username ? `https://www.lemon8-app.com/@${post.author.username}` : undefined,
      platform: 'lemon8',
      originalUrl: post.shareUrl ?? originalUrl,
      duration: post.mediaList?.find((m) => m.type === 'video')?.duration,
      viewCount: post.stats?.viewCount,
      likeCount: post.stats?.likeCount,
      commentCount: post.stats?.commentCount,
      shareCount: post.stats?.shareCount,
      uploadDate: post.createTime ? new Date(post.createTime * 1000).toISOString() : undefined,
      categories: post.category ? [post.category] : undefined,
      tags: post.tags,
      extra: {
        postId: post.id,
        collectCount: post.stats?.collectCount,
        authorAvatar: post.author?.avatarUrl,
        authorSignature: post.author?.signature,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'lemon8',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      rawResponse: post,
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

    if (imageUrl) {
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
      platform: 'lemon8',
      originalUrl,
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'lemon8',
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
