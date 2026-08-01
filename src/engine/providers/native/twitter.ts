/**
 * NovaDL Engine — Twitter/X Native Extractor
 *
 * Parses embedded tweet JSON from page source to extract video URLs
 * and tweet metadata.
 *
 * Extraction sources:
 * - oEmbed API endpoint (reliable for public tweets)
 * - Embedded tweet JSON from data-testid attributes in page source
 * - Syndication API (publish.twitter.com/oembed)
 * - Meta tags (og:video, twitter:player:stream) as fallback
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

// ─── Twitter/X Embedded Data Types ──────────────────────────────────────
interface TwitterOEmbedData {
  url?: string;
  author_name?: string;
  author_url?: string;
  html?: string;
  width?: number;
  height?: number;
  type?: string;
  cache_age?: string;
  version?: string;
}

interface TwitterVideoVariant {
  bitrate?: number;
  content_type?: string;
  url?: string;
}

interface TwitterTweetData {
  id_str?: string;
  full_text?: string;
  user?: {
    id_str?: string;
    screen_name?: string;
    name?: string;
    profile_image_url_https?: string;
  };
  media?: TwitterMediaEntity[];
  created_at?: string;
  favorite_count?: number;
  retweet_count?: number;
  reply_count?: number;
  view_count?: number;
  video?: {
    variants?: TwitterVideoVariant[];
    duration_millis?: number;
  };
}

interface TwitterMediaEntity {
  type?: string;
  media_url_https?: string;
  video_info?: {
    variants?: TwitterVideoVariant[];
    duration_millis?: number;
    aspect_ratio?: [number, number];
  };
  sizes?: {
    large?: { w?: number; h?: number };
    medium?: { w?: number; h?: number };
    small?: { w?: number; h?: number };
    thumb?: { w?: number; h?: number };
  };
}

interface TwitterMetaTags {
  ogVideo?: string;
  ogVideoSecureUrl?: string;
  ogVideoType?: string;
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  twitterPlayerStream?: string;
  twitterPlayer?: string;
  twitterImage?: string;
  twitterTitle?: string;
  twitterDescription?: string;
}

// ─── Provider Implementation ──────────────────────────────────────────
export class TwitterNativeExtractor extends BaseProvider {
  readonly id = 'native_twitter';
  readonly name = 'Twitter/X Native Extractor';
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
        `Twitter/X native extractor does not support platform '${platform}'`,
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
    return platform === 'x_twitter';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['x_twitter'],
      mediaTypes: ['video', 'image', 'metadata'],
      formats: ['mp4', 'jpeg', 'png'],
      qualities: ['best', '1080p', '720p', '480p', '360p'],
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
      // Use oEmbed endpoint as health check (no auth needed)
      await fetch('https://publish.twitter.com/oembed?url=https://twitter.com/X/status/1780435045657477345', {
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
    // Strategy 1: Fetch page HTML and parse embedded data
    try {
      const html = await this._fetchPage(url);
      const embeddedResult = this._parsePageHtml(html, url);
      if (embeddedResult.media.length > 0) {
        return embeddedResult;
      }
    } catch {
      // Page fetch might fail, try oEmbed
    }

    // Strategy 2: oEmbed API
    const oembedResult = await this._fetchOEmbed(url);
    if (oembedResult.html) {
      const parsedHtml = oembedResult.html;
      return this._parseOEmbedHtml(parsedHtml, url, oembedResult);
    }

    throw new ProviderError(
      'Could not extract Twitter/X video data. No embedded data or oEmbed found.',
      this.id,
      'PARSE_ERROR',
      false,
      'x_twitter',
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
        `Twitter/X page fetch failed: ${response.status} ${response.statusText}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'x_twitter',
      );
    }

    return response.text();
  }

  // ─── Private: oEmbed Fetch ──────────────────────────────────────────
  private async _fetchOEmbed(url: string): Promise<TwitterOEmbedData> {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;
    const response = await fetch(oembedUrl, {
      headers: { 'User-Agent': this._userAgent, 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new ProviderError(
        `Twitter/X oEmbed failed: ${response.status} ${response.statusText}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'x_twitter',
      );
    }

    return await response.json() as TwitterOEmbedData;
  }

  // ─── Private: Parse Page HTML ──────────────────────────────────────────
  private _parsePageHtml(html: string, originalUrl: string): ExtractionResult {
    // Strategy A: Parse video data from embedded tweet JSON
    const tweetJson = this._extractJsonFromHtml(html);
    if (tweetJson) {
      try {
        const tweetData = JSON.parse(tweetJson) as TwitterTweetData;
        return this._buildResultFromTweetData(tweetData, originalUrl);
      } catch {
        // Continue
      }
    }

    // Strategy B: Parse og/twitter meta tags
    const metaTags = this._extractMetaTags(html);
    if (metaTags.ogVideo || metaTags.twitterPlayerStream) {
      return this._buildResultFromMetaTags(metaTags, originalUrl);
    }

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'x_twitter',
      provider: this.id,
      timestamp: new Date(),
      media: [],
      metadata: { platform: 'x_twitter', originalUrl },
      rawResponse: html,
    };
  }

  // ─── Private: Extract JSON from HTML ──────────────────────────────────
  private _extractJsonFromHtml(html: string): string | null {
    // Look for tweet data in data-testid="tweet" or embedded script blocks
    const patterns = [
      // Next.js data format
      /<script\s+id="__NEXT_DATA__"\s+type="application\/json"[^>]*>(.*?)<\/script>/s,
      // Embedded tweet data in script tags
      /data-testid="tweet"\s+[^>]*data-tweet="(\{.*?\})"/s,
      // GraphQL response format
      /"tweetResult"\s*:\s*\{[^}]*"result"\s*:\s*(\{.*?\})\s*\}/s,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(html);
      if (match?.[1]) {
        return match[1];
      }
    }
    return null;
  }

  // ─── Private: Extract Meta Tags ──────────────────────────────────
  private _extractMetaTags(html: string): TwitterMetaTags {
    return {
      ogVideo: this._extractMetaContent(html, 'og:video'),
      ogVideoSecureUrl: this._extractMetaContent(html, 'og:video:secure_url'),
      ogVideoType: this._extractMetaContent(html, 'og:video:type'),
      ogImage: this._extractMetaContent(html, 'og:image'),
      ogTitle: this._extractMetaContent(html, 'og:title'),
      ogDescription: this._extractMetaContent(html, 'og:description'),
      twitterPlayerStream: this._extractMetaContent(html, 'twitter:player:stream'),
      twitterPlayer: this._extractMetaContent(html, 'twitter:player'),
      twitterImage: this._extractMetaContent(html, 'twitter:image'),
      twitterTitle: this._extractMetaContent(html, 'twitter:title'),
      twitterDescription: this._extractMetaContent(html, 'twitter:description'),
    };
  }

  private _extractMetaContent(html: string, property: string): string | undefined {
    const pattern = new RegExp(`<meta\\s+(?:property|name)=["']${property}["']\\s+content=["']([^"']+)["']`, 'i');
    const match = pattern.exec(html);
    return match?.[1];
  }

  // ─── Private: Build Result from TweetData ──────────────────────────────
  private _buildResultFromTweetData(tweet: TwitterTweetData, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const qualityOptions: QualityOption[] = [];

    // Process media entities (videos and images)
    const mediaEntities = tweet.media ?? [];
    for (const media of mediaEntities) {
      if (media.type === 'video' || media.type === 'animated_gif') {
        const variants = media.video_info?.variants ?? [];
        // Sort variants by bitrate (highest first)
        const videoVariants = variants
          .filter((v) => v.content_type === 'video/mp4')
          .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

        for (const variant of videoVariants) {
          if (variant.url) {
            const quality = this._bitrateToQuality(variant.bitrate ?? 0);
            const isHighest = variant === videoVariants[0];

            mediaItems.push({
              type: 'video',
              format: 'mp4',
              quality,
              url: variant.url,
              directUrl: variant.url,
              duration: media.video_info?.duration_millis
                ? media.video_info.duration_millis / 1000
                : undefined,
              bitrate: variant.bitrate,
              title: tweet.full_text,
              filename: this._buildFilename(tweet.id_str ?? 'twitter_video', 'mp4'),
            });

            qualityOptions.push({
              label: `${variant.bitrate ?? 0}kbps`,
              quality,
              format: 'mp4',
              bitrate: variant.bitrate,
              url: variant.url,
              isSource: isHighest,
            });
          }
        }

        // Also add m3u8 if available
        const hlsVariant = variants.find((v) => v.content_type === 'application/x-mpegURL');
        if (hlsVariant?.url) {
          mediaItems.push({
            type: 'video',
            format: 'mp4',
            quality: 'best',
            url: hlsVariant.url,
            streamUrl: hlsVariant.url,
            title: tweet.full_text,
          });
        }
      } else if (media.type === 'photo' && media.media_url_https) {
        mediaItems.push({
          type: 'image',
          format: 'jpeg',
          quality: 'best',
          url: media.media_url_https,
          directUrl: media.media_url_https,
          title: tweet.full_text,
        });
      }
    }

    // Covers / thumbnails
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];
    for (const media of mediaEntities) {
      if (media.media_url_https) {
        covers.push({ url: media.media_url_https, format: 'jpeg' });
        thumbnails.push({ url: media.media_url_https, format: 'jpeg' });
      }
    }

    // Metadata
    const metadata: ExtractionMetadata = {
      title: tweet.full_text,
      description: tweet.full_text,
      author: tweet.user?.name,
      authorId: tweet.user?.screen_name,
      authorUrl: tweet.user?.screen_name ? `https://twitter.com/${tweet.user.screen_name}` : undefined,
      platform: 'x_twitter',
      originalUrl,
      duration: tweet.video?.duration_millis ? tweet.video.duration_millis / 1000 : undefined,
      likeCount: tweet.favorite_count,
      commentCount: tweet.reply_count,
      shareCount: tweet.retweet_count,
      viewCount: tweet.view_count,
      uploadDate: tweet.created_at,
      extra: {
        tweetId: tweet.id_str,
        authorAvatar: tweet.user?.profile_image_url_https,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'x_twitter',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse: tweet,
    };
  }

  // ─── Private: Build Result from Meta Tags ──────────────────────────────
  private _buildResultFromMetaTags(metaTags: TwitterMetaTags, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];

    const videoUrl = metaTags.twitterPlayerStream ?? metaTags.ogVideoSecureUrl ?? metaTags.ogVideo;
    if (videoUrl) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: 'best',
        url: videoUrl,
        directUrl: videoUrl,
        title: metaTags.twitterTitle ?? metaTags.ogTitle,
      });
    }

    const imageUrl = metaTags.twitterImage ?? metaTags.ogImage;
    if (imageUrl && !videoUrl) {
      mediaItems.push({
        type: 'image',
        format: 'jpeg',
        quality: 'best',
        url: imageUrl,
        directUrl: imageUrl,
        title: metaTags.twitterTitle ?? metaTags.ogTitle,
      });
    }

    const covers: CoverImage[] = [];
    if (imageUrl) {
      covers.push({ url: imageUrl, format: 'jpeg' });
    }

    const metadata: ExtractionMetadata = {
      title: metaTags.twitterTitle ?? metaTags.ogTitle,
      description: metaTags.twitterDescription ?? metaTags.ogDescription,
      platform: 'x_twitter',
      originalUrl,
      extra: {
        videoType: metaTags.ogVideoType,
        playerUrl: metaTags.twitterPlayer,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'x_twitter',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      rawResponse: metaTags,
    };
  }

  // ─── Private: Build Result from oEmbed HTML ──────────────────────────────
  private _parseOEmbedHtml(html: string, originalUrl: string, oembed: TwitterOEmbedData): ExtractionResult {
    const mediaItems: MediaItem[] = [];

    // oEmbed returns an HTML block with an iframe or embedded video
    // Extract video URL from the iframe src if available
    const videoMatch = /src=["']([^"']*video[^"']*\.mp4[^"']*)["']/i.exec(html);
    if (videoMatch?.[1]) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: 'best',
        url: videoMatch[1],
        title: oembed.author_name,
      });
    }

    // Extract image URL from the HTML
    const imgMatch = /src=["']([^"']*\.jpg[^"']*)["']/i.exec(html);
    if (imgMatch?.[1]) {
      mediaItems.push({
        type: 'image',
        format: 'jpeg',
        quality: 'best',
        url: imgMatch[1],
        title: oembed.author_name,
      });
    }

    const covers: CoverImage[] = [];
    if (imgMatch?.[1]) {
      covers.push({ url: imgMatch[1], format: 'jpeg' });
    }

    const metadata: ExtractionMetadata = {
      author: oembed.author_name,
      authorUrl: oembed.author_url,
      platform: 'x_twitter',
      originalUrl,
      extra: {
        oembedType: oembed.type,
        oembedWidth: oembed.width,
        oembedHeight: oembed.height,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'x_twitter',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      rawResponse: oembed,
    };
  }

  // ─── Private: Helpers ──────────────────────────────────────────────────
  private _bitrateToQuality(bitrate: number): '1080p' | '720p' | '480p' | '360p' | '240p' {
    if (bitrate >= 2000) return '1080p';
    if (bitrate >= 832) return '720p';
    if (bitrate >= 320) return '480p';
    if (bitrate >= 128) return '360p';
    return '240p';
  }

  private _buildFilename(title: string, ext: string): string {
    const sanitized = title.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').substring(0, 200);
    return `${sanitized}.${ext}`;
  }
}
