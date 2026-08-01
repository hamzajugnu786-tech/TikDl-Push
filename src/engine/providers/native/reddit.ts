/**
 * NovaDL Engine — Reddit Native Extractor
 *
 * Parses embedded post data from Reddit page source to extract
 * video/image URLs from Reddit media embeds.
 *
 * Extraction sources:
 * - JSON API endpoint (.json suffix on Reddit URLs)
 * - window.__r object (Reddit SSR data)
 * - Embedded video data from page HTML
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
  QualityOption,
  ProviderConfig,
  ProviderCapabilities,
  ProviderHealth,
  ProviderFeature,
} from '../../types/index';
import { BaseProvider, ProviderError } from '../base';
import { detectPlatform } from '../../utils/url';

// ─── Reddit Embedded Data Types ──────────────────────────────────────
interface RedditApiResponse {
  kind?: string;
  data?: {
    children?: Array<{
      kind?: string;
      data?: RedditPostData;
    }>;
    after?: string;
  };
}

interface RedditPostData {
  id?: string;
  title?: string;
  selftext?: string;
  url?: string;
  author?: string;
  author_fullname?: string;
  subreddit?: string;
  subreddit_id?: string;
  score?: number;
  num_comments?: number;
  num_crossposts?: number;
  view_count?: number;
  created_utc?: number;
  is_video?: boolean;
  is_self?: boolean;
  is_reddit_media_domain?: boolean;
  media?: RedditMediaInfo;
  secure_media?: RedditMediaInfo;
  preview?: RedditPreviewInfo;
  thumbnail?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  over_18?: boolean;
  domain?: string;
  permalink?: string;
  link_flair_text?: string;
  gallery_data?: RedditGalleryData;
  media_metadata?: Record<string, RedditMediaMetadata>;
}

interface RedditMediaInfo {
  reddit_video?: RedditVideoData;
  type?: string;
  oembed?: RedditOEmbedInfo;
}

interface RedditVideoData {
  fallback_url?: string;
  scrubber_media_url?: string;
  dash_url?: string;
  hls_url?: string;
  is_gif?: boolean;
  duration?: number;
  height?: number;
  width?: number;
  bitrate_kbps?: number;
}

interface RedditOEmbedInfo {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
  html?: string;
}

interface RedditPreviewInfo {
  images?: Array<{
    source?: RedditPreviewImage;
    resolutions?: RedditPreviewImage[];
    id?: string;
  }>;
  enabled?: boolean;
}

interface RedditPreviewImage {
  url?: string;
  width?: number;
  height?: number;
}

interface RedditGalleryData {
  items?: Array<{
    media_id?: string;
    id?: string;
    caption?: string;
  }>;
}

interface RedditMediaMetadata {
  id?: string;
  status?: string;
  e?: string; // type: Image or Video
  m?: string; // mime type
  p?: Array<{ u?: string; x?: number; y?: number }>; // image previews
  s?: { u?: string; x?: number; y?: number }; // source image
  o?: { u?: string; x?: number; y?: number }; // original image
  dash_url?: string;
  hls_url?: string;
  bitrate_kbps?: number;
  duration?: number;
}

// ─── Provider Implementation ──────────────────────────────────────────
export class RedditNativeExtractor extends BaseProvider {
  readonly id = 'native_reddit';
  readonly name = 'Reddit Native Extractor';
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
        `Reddit native extractor does not support platform '${platform}'`,
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
    return platform === 'reddit';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['reddit'],
      mediaTypes: ['video', 'image', 'metadata'],
      formats: ['mp4', 'jpeg', 'png', 'gif', 'webp'],
      qualities: ['best', '1080p', '720p', '480p', '360p'],
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
      await fetch('https://www.reddit.com/.json', {
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
    // Strategy 1: Reddit JSON API (append .json to URL)
    const jsonUrl = this._normalizeToJsonApi(url);
    try {
      const apiResponse = await this._fetchJsonApi(jsonUrl);
      const postData = this._getPostDataFromApiResponse(apiResponse);
      if (postData) {
        return this._buildResultFromPostData(postData, url);
      }
    } catch {
      // JSON API failed, try HTML
    }

    // Strategy 2: Parse page HTML for embedded data
    const html = await this._fetchPage(url);
    const htmlResult = this._parsePageHtml(html, url);
    if (htmlResult.media.length > 0) {
      return htmlResult;
    }

    throw new ProviderError(
      'Could not extract Reddit media data. No video or image found.',
      this.id,
      'PARSE_ERROR',
      false,
      'reddit',
    );
  }

  // ─── Private: URL Normalization ──────────────────────────────────────────
  private _normalizeToJsonApi(url: string): string {
    // Remove trailing slash and add .json
    const normalized = url.replace(/\/+$/, '');
    // If URL already has query params, add .json before them
    if (normalized.includes('?')) {
      const [base, query] = normalized.split('?');
      return `${base}.json?${query ?? ''}`;
    }
    return `${normalized}.json`;
  }

  // ─── Private: JSON API Fetch ──────────────────────────────────────────
  private async _fetchJsonApi(url: string): Promise<RedditApiResponse | Array<RedditApiResponse>> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': `${this._userAgent} (NovaDL-Engine/1.0)`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new ProviderError(
        `Reddit JSON API failed: ${response.status} ${response.statusText}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'reddit',
      );
    }

    return await response.json() as RedditApiResponse | Array<RedditApiResponse>;
  }

  private _getPostDataFromApiResponse(data: RedditApiResponse | Array<RedditApiResponse>): RedditPostData | null {
    // Reddit API can return an array (for comments) or single object (for posts)
    if (Array.isArray(data)) {
      // First element is the post, second is comments
      const postData = data[0]?.data?.children?.[0]?.data;
      return postData ?? null;
    }
    const postData = data.data?.children?.[0]?.data;
    return postData ?? null;
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
        `Reddit page fetch failed: ${response.status} ${response.statusText}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'reddit',
      );
    }

    return response.text();
  }

  // ─── Private: Parse Page HTML ──────────────────────────────────────────
  private _parsePageHtml(html: string, originalUrl: string): ExtractionResult {
    // Extract video URL from meta tags
    const ogVideo = this._extractMetaContent(html, 'og:video');
    const ogVideoSecureUrl = this._extractMetaContent(html, 'og:video:secure_url');
    const ogImage = this._extractMetaContent(html, 'og:image');
    const ogTitle = this._extractMetaContent(html, 'og:title');
    const ogDescription = this._extractMetaContent(html, 'og:description');

    const mediaItems: MediaItem[] = [];
    const videoUrl = ogVideoSecureUrl ?? ogVideo;
    if (videoUrl) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: 'best',
        url: videoUrl,
        directUrl: videoUrl,
        title: ogTitle,
      });
    }

    if (ogImage && !videoUrl) {
      mediaItems.push({
        type: 'image',
        format: 'jpeg',
        quality: 'best',
        url: ogImage,
        directUrl: ogImage,
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
      platform: 'reddit',
      originalUrl,
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'reddit',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
    };
  }

  private _extractMetaContent(html: string, property: string): string | undefined {
    const pattern = new RegExp(`<meta\\s+property=["']${property}["']\\s+content=["']([^"']+)["']`, 'i');
    const match = pattern.exec(html);
    return match?.[1];
  }

  // ─── Private: Build Result from PostData ──────────────────────────────
  private _buildResultFromPostData(post: RedditPostData, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const qualityOptions: QualityOption[] = [];

    // Video extraction (Reddit-hosted video)
    const redditVideo = post.secure_media?.reddit_video ?? post.media?.reddit_video;
    if (redditVideo) {
      // Fallback URL (MP4 direct download, video+audio combined)
      if (redditVideo.fallback_url) {
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: this._heightToQuality(redditVideo.height ?? 0),
          url: redditVideo.fallback_url,
          directUrl: redditVideo.fallback_url,
          duration: redditVideo.duration,
          resolution: redditVideo.width && redditVideo.height
            ? { width: redditVideo.width, height: redditVideo.height }
            : undefined,
          bitrate: redditVideo.bitrate_kbps ? redditVideo.bitrate_kbps * 1000 : undefined,
          title: post.title,
          filename: this._buildFilename(post.title ?? 'reddit_video', 'mp4'),
        });

        qualityOptions.push({
          label: `${redditVideo.height ?? 720}p`,
          quality: this._heightToQuality(redditVideo.height ?? 0),
          format: 'mp4',
          url: redditVideo.fallback_url,
          isSource: true,
          bitrate: redditVideo.bitrate_kbps ? redditVideo.bitrate_kbps * 1000 : undefined,
        });
      }

      // HLS stream
      if (redditVideo.hls_url) {
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: 'best',
          url: redditVideo.hls_url,
          streamUrl: redditVideo.hls_url,
          duration: redditVideo.duration,
          title: post.title,
        });
      }

      // DASH stream
      if (redditVideo.dash_url) {
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: 'best',
          url: redditVideo.dash_url,
          streamUrl: redditVideo.dash_url,
          duration: redditVideo.duration,
          title: post.title,
        });
      }
    }

    // Image extraction
    const isImage = post.url && (
      post.url.endsWith('.jpg') ||
      post.url.endsWith('.jpeg') ||
      post.url.endsWith('.png') ||
      post.url.endsWith('.gif') ||
      post.url.endsWith('.webp')
    );

    if (!post.is_video && isImage && post.url) {
      mediaItems.push({
        type: 'image',
        format: this._urlToFormat(post.url),
        quality: 'best',
        url: post.url,
        directUrl: post.url,
        title: post.title,
        filename: this._buildFilename(post.title ?? 'reddit_image', this._urlToFormat(post.url)),
      });
    }

    // Gallery extraction (multi-image posts)
    if (post.gallery_data?.items && post.media_metadata) {
      for (const item of post.gallery_data.items) {
        const mediaId = item.media_id;
        if (!mediaId) continue;
        const metadata = post.media_metadata[mediaId];
        if (!metadata) continue;

        if (metadata.e === 'Image' && metadata.s?.u) {
          mediaItems.push({
            type: 'image',
            format: 'jpeg',
            quality: 'best',
            url: metadata.s.u,
            directUrl: metadata.s.u,
            resolution: metadata.s.x && metadata.s.y ? { width: metadata.s.x, height: metadata.s.y } : undefined,
            title: item.caption ?? post.title,
          });
        }

        if (metadata.e === 'Video' && metadata.s?.u) {
          mediaItems.push({
            type: 'video',
            format: 'mp4',
            quality: 'best',
            url: metadata.s.u,
            directUrl: metadata.s.u,
            duration: metadata.duration,
            title: item.caption ?? post.title,
          });
        }
      }
    }

    // External media (oEmbed)
    const oembed = post.secure_media?.oembed ?? post.media?.oembed;
    if (oembed?.thumbnail_url && mediaItems.length === 0) {
      mediaItems.push({
        type: 'image',
        format: 'jpeg',
        quality: 'best',
        url: oembed.thumbnail_url,
        title: oembed.title ?? post.title,
      });
    }

    // Covers and thumbnails
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    // Post thumbnail
    if (post.thumbnail && post.thumbnail !== 'self' && post.thumbnail !== 'default') {
      thumbnails.push({
        url: post.thumbnail,
        width: post.thumbnail_width,
        height: post.thumbnail_height,
        format: 'jpeg',
      });
    }

    // Preview images
    const previewImages = post.preview?.images ?? [];
    for (const preview of previewImages) {
      if (preview.source?.url) {
        covers.push({
          url: preview.source.url,
          width: preview.source.width,
          height: preview.source.height,
          format: 'jpeg',
        });
      }
      for (const res of preview.resolutions ?? []) {
        if (res.url) {
          thumbnails.push({ url: res.url, width: res.width, height: res.height, format: 'jpeg' });
        }
      }
    }

    // Metadata
    const metadata: ExtractionMetadata = {
      title: post.title,
      description: post.selftext,
      author: post.author,
      authorId: post.author_fullname,
      authorUrl: post.author ? `https://www.reddit.com/user/${post.author}/` : undefined,
      platform: 'reddit',
      originalUrl: post.permalink ? `https://www.reddit.com${post.permalink}` : originalUrl,
      duration: redditVideo?.duration,
      likeCount: post.score,
      commentCount: post.num_comments,
      shareCount: post.num_crossposts,
      viewCount: post.view_count,
      uploadDate: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : undefined,
      isPrivate: false,
      ageRestricted: post.over_18 ?? false,
      extra: {
        subreddit: post.subreddit,
        postId: post.id,
        isVideo: post.is_video,
        isGif: redditVideo?.is_gif ?? false,
        domain: post.domain,
        flair: post.link_flair_text,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'reddit',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse: post,
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

  private _urlToFormat(url: string): 'jpeg' | 'png' | 'gif' | 'webp' {
    if (url.endsWith('.png')) return 'png';
    if (url.endsWith('.gif')) return 'gif';
    if (url.endsWith('.webp')) return 'webp';
    return 'jpeg';
  }

  private _buildFilename(title: string, ext: string): string {
    const sanitized = title.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').substring(0, 200);
    return `${sanitized}.${ext}`;
  }
}
