/**
 * NovaDL Engine — Facebook Native Extractor
 *
 * Parses embedded video data from Facebook page HTML to extract
 * video source URLs and metadata from SSR data.
 *
 * Extraction sources:
 * - Embedded video data in page source (video_src, hd_src, sd_src fields)
 * - Server-side rendered data in inline scripts
 * - Meta tags (og:video, og:image, etc.) as fallback
 */

import { v4 as uuid } from 'uuid';
import type {
  Platform,
  ExtractionRequest,
  ExtractionResult,
  ExtractionMetadata,
  MediaItem,
  CoverImage,
  QualityOption,
  ProviderConfig,
  ProviderCapabilities,
  ProviderHealth,
  ProviderFeature,
} from '../../types/index';
import { BaseProvider, ProviderError } from '../base';
import { detectPlatform } from '../../utils/url';

// ─── Facebook Embedded Data Types ──────────────────────────────────────
interface FacebookVideoData {
  video_src?: string;
  hd_src?: string;
  hd_src_no_ratelimit?: string;
  sd_src?: string;
  sd_src_no_ratelimit?: string;
  thumbnail_src?: string;
  video_width?: number;
  video_height?: number;
  duration?: number;
  owner_id?: string;
  owner_name?: string;
  title?: string;
  view_count?: number;
  is_live?: boolean;
  preferred_thumbnail?: {
    image?: { uri?: string; width?: number; height?: number };
  };
}

interface FacebookSsrData {
  require?: Array<Array<unknown>>;
  bootloadable?: Record<string, unknown>;
  hsrp?: {
    currentModule?: Record<string, unknown>;
  };
  data?: Record<string, unknown>;
}

interface FacebookMetaTags {
  ogVideo?: string;
  ogVideoSecureUrl?: string;
  ogVideoType?: string;
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogVideoWidth?: number;
  ogVideoHeight?: number;
}

// ─── Provider Implementation ──────────────────────────────────────────
export class FacebookNativeExtractor extends BaseProvider {
  readonly id = 'native_facebook';
  readonly name = 'Facebook Native Extractor';
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
        `Facebook native extractor does not support platform '${platform}'`,
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
    return platform === 'facebook';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['facebook'],
      mediaTypes: ['video', 'image', 'metadata'],
      formats: ['mp4', 'jpeg', 'png'],
      qualities: ['best', '1080p', '720p', '480p', '360p', '240p'],
      features: [
        'video_download', 'cover_extraction', 'thumbnail_extraction',
        'metadata_extraction', 'multiple_qualities', 'live_stream',
      ] as ProviderFeature[],
      maxConcurrent: 3,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      await fetch('https://www.facebook.com', {
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
        'Cookie': 'dpr=1; locale=en_US;',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new ProviderError(
        `Facebook page fetch failed: ${response.status} ${response.statusText}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500 || response.status === 429,
        'facebook',
      );
    }

    return response.text();
  }

  // ─── Private: Parse Page HTML ──────────────────────────────────────────
  private _parsePageHtml(html: string, originalUrl: string): ExtractionResult {
    // Strategy 1: Extract video_src/hd_src/sd_src from inline scripts
    const videoDataMatch = this._extractVideoSrcFromHtml(html);
    if (videoDataMatch) {
      return this._buildResultFromVideoData(videoDataMatch, originalUrl);
    }

    // Strategy 2: Parse SSR data from __bbox or ServerJS inline data
    const ssrVideoData = this._extractFromSsrData(html);
    if (ssrVideoData) {
      return this._buildResultFromVideoData(ssrVideoData, originalUrl);
    }

    // Strategy 3: Parse og:video meta tags as fallback
    const metaTags = this._extractMetaTags(html);
    if (metaTags.ogVideo) {
      return this._buildResultFromMetaTags(metaTags, originalUrl);
    }

    throw new ProviderError(
      'Could not extract Facebook video data from page HTML. No embedded data found.',
      this.id,
      'PARSE_ERROR',
      false,
      'facebook',
    );
  }

  // ─── Private: Extract video_src from HTML ──────────────────────────
  private _extractVideoSrcFromHtml(html: string): FacebookVideoData | null {
    // Look for hd_src pattern in inline scripts
    const hdSrcMatch = /"hd_src_no_ratelimit":"([^"]+)"/.exec(html);
    const sdSrcMatch = /"sd_src_no_ratelimit":"([^"]+)"/.exec(html);
    const hdSrcAltMatch = /"hd_src":"([^"]+)"/.exec(html);
    const sdSrcAltMatch = /"sd_src":"([^"]+)"/.exec(html);
    const thumbnailMatch = /"thumbnail_src":"([^"]+)"/.exec(html);
    const widthMatch = /"video_width":(\d+)/.exec(html);
    const heightMatch = /"video_height":(\d+)/.exec(html);
    const durationMatch = /"duration":([\d.]+)/.exec(html);
    const ownerIdMatch = /"owner_id":"(\d+)"/.exec(html);
    const ownerNameMatch = /"owner_name":"([^"]+)"/.exec(html);
    const titleMatch = /"title":"([^"]+)"/.exec(html);
    const viewCountMatch = /"view_count":(\d+)/.exec(html);
    const isLiveMatch = /"is_live_streaming":(true|false)/.exec(html);

    const hdSrc = hdSrcMatch?.[1] ?? hdSrcAltMatch?.[1];
    const sdSrc = sdSrcMatch?.[1] ?? sdSrcAltMatch?.[1];

    if (!hdSrc && !sdSrc) return null;

    return {
      hd_src: hdSrc,
      hd_src_no_ratelimit: hdSrcMatch?.[1],
      sd_src: sdSrc,
      sd_src_no_ratelimit: sdSrcMatch?.[1],
      thumbnail_src: thumbnailMatch?.[1],
      video_width: widthMatch?.[1] ? parseInt(widthMatch[1], 10) : undefined,
      video_height: heightMatch?.[1] ? parseInt(heightMatch[1], 10) : undefined,
      duration: durationMatch?.[1] ? parseFloat(durationMatch[1]) : undefined,
      owner_id: ownerIdMatch?.[1],
      owner_name: ownerNameMatch?.[1],
      title: titleMatch?.[1],
      view_count: viewCountMatch?.[1] ? parseInt(viewCountMatch[1], 10) : undefined,
      is_live: isLiveMatch?.[1] === 'true',
    };
  }

  // ─── Private: Extract from SSR Data ──────────────────────────────────
  private _extractFromSsrData(html: string): FacebookVideoData | null {
    // Facebook SSR data is typically in __bbox or bigPipe inline scripts
    // Look for patterns like data-video or videoData in the inline scripts
    const bboxMatch = /__bbox:\s*(\{.*?\})\s*}\s*\)\s*;?\s*<\/script>/s.exec(html);
    if (!bboxMatch?.[1]) return null;

    try {
      const bboxData = JSON.parse(bboxMatch[1]) as FacebookSsrData;
      // Search through require array for video data
      const requireArr = bboxData.require;
      if (!requireArr) return null;

      for (const moduleArr of requireArr) {
        if (!Array.isArray(moduleArr)) continue;
        for (const moduleData of moduleArr) {
          if (typeof moduleData === 'object' && moduleData !== null) {
            const data = moduleData as Record<string, unknown>;
            // Check for video_src field
            if (data.hd_src || data.sd_src || data.video_src) {
              return {
                hd_src: data.hd_src as string | undefined,
                sd_src: data.sd_src as string | undefined,
                video_src: data.video_src as string | undefined,
                thumbnail_src: data.thumbnail_src as string | undefined,
                video_width: data.video_width as number | undefined,
                video_height: data.video_height as number | undefined,
                duration: data.duration as number | undefined,
              };
            }
          }
        }
      }
    } catch {
      // SSR data parse failed
    }
    return null;
  }

  // ─── Private: Extract Meta Tags ──────────────────────────────────
  private _extractMetaTags(html: string): FacebookMetaTags {
    const ogVideo = this._extractMetaContent(html, 'og:video');
    const ogVideoSecure = this._extractMetaContent(html, 'og:video:secure_url');
    const ogVideoType = this._extractMetaContent(html, 'og:video:type');
    const ogImage = this._extractMetaContent(html, 'og:image');
    const ogTitle = this._extractMetaContent(html, 'og:title');
    const ogDescription = this._extractMetaContent(html, 'og:description');
    const ogVideoWidth = this._extractMetaContent(html, 'og:video:width');
    const ogVideoHeight = this._extractMetaContent(html, 'og:video:height');

    return {
      ogVideo,
      ogVideoSecureUrl: ogVideoSecure,
      ogVideoType,
      ogImage,
      ogTitle,
      ogDescription,
      ogVideoWidth: ogVideoWidth ? parseInt(ogVideoWidth, 10) : undefined,
      ogVideoHeight: ogVideoHeight ? parseInt(ogVideoHeight, 10) : undefined,
    };
  }

  private _extractMetaContent(html: string, property: string): string | undefined {
    const pattern = new RegExp(`<meta\\s+property=["']${property}["']\\s+content=["']([^"']+)["']`, 'i');
    const match = pattern.exec(html);
    return match?.[1];
  }

  // ─── Private: Build Result from VideoData ──────────────────────────────
  private _buildResultFromVideoData(videoData: FacebookVideoData, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const qualityOptions: QualityOption[] = [];

    // HD video (no rate limit preferred)
    const hdUrl = videoData.hd_src_no_ratelimit ?? videoData.hd_src;
    if (hdUrl) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: this._heightToQuality(videoData.video_height ?? 0),
        url: hdUrl,
        directUrl: hdUrl,
        duration: videoData.duration,
        resolution: videoData.video_width && videoData.video_height
          ? { width: videoData.video_width, height: videoData.video_height }
          : undefined,
        title: videoData.title,
        filename: this._buildFilename(videoData.title ?? 'facebook_video', 'mp4'),
      });

      qualityOptions.push({
        label: 'HD (no rate limit)',
        quality: 'best',
        format: 'mp4',
        url: hdUrl,
        isSource: true,
      });
    }

    // SD video
    const sdUrl = videoData.sd_src_no_ratelimit ?? videoData.sd_src;
    if (sdUrl) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: '480p',
        url: sdUrl,
        directUrl: sdUrl,
        duration: videoData.duration,
        title: videoData.title,
        filename: this._buildFilename(videoData.title ?? 'facebook_video_sd', 'mp4'),
      });

      qualityOptions.push({
        label: 'SD',
        quality: '480p',
        format: 'mp4',
        url: sdUrl,
      });
    }

    // Generic video_src (fallback if no hd/sd found)
    if (!hdUrl && !sdUrl && videoData.video_src) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: 'best',
        url: videoData.video_src,
        directUrl: videoData.video_src,
        duration: videoData.duration,
        title: videoData.title,
      });
    }

    // Covers
    const covers: CoverImage[] = [];
    const thumbnailUrl = videoData.thumbnail_src ?? videoData.preferred_thumbnail?.image?.uri;
    if (thumbnailUrl) {
      covers.push({
        url: thumbnailUrl,
        width: videoData.video_width,
        height: videoData.video_height,
        format: 'jpeg',
      });
    }

    // Metadata
    const metadata: ExtractionMetadata = {
      title: videoData.title,
      description: videoData.title,
      author: videoData.owner_name,
      authorId: videoData.owner_id,
      authorUrl: videoData.owner_id ? `https://www.facebook.com/${videoData.owner_id}` : undefined,
      platform: 'facebook',
      originalUrl,
      duration: videoData.duration,
      viewCount: videoData.view_count,
      isLive: videoData.is_live,
      extra: {
        hasHd: Boolean(hdUrl),
        hasSd: Boolean(sdUrl),
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'facebook',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse: videoData,
    };
  }

  // ─── Private: Build Result from Meta Tags ──────────────────────────────
  private _buildResultFromMetaTags(metaTags: FacebookMetaTags, originalUrl: string): ExtractionResult {
    const videoUrl = metaTags.ogVideoSecureUrl ?? metaTags.ogVideo;

    const mediaItems: MediaItem[] = [];
    if (videoUrl) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: this._heightToQuality(metaTags.ogVideoHeight ?? 0),
        url: videoUrl,
        directUrl: videoUrl,
        resolution: metaTags.ogVideoWidth && metaTags.ogVideoHeight
          ? { width: metaTags.ogVideoWidth, height: metaTags.ogVideoHeight }
          : undefined,
        title: metaTags.ogTitle,
      });
    }

    const covers: CoverImage[] = [];
    if (metaTags.ogImage) {
      covers.push({
        url: metaTags.ogImage,
        width: metaTags.ogVideoWidth,
        height: metaTags.ogVideoHeight,
        format: 'jpeg',
      });
    }

    const metadata: ExtractionMetadata = {
      title: metaTags.ogTitle,
      description: metaTags.ogDescription,
      platform: 'facebook',
      originalUrl,
      extra: {
        videoType: metaTags.ogVideoType,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'facebook',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      rawResponse: metaTags,
    };
  }

  // ─── Private: Helpers ──────────────────────────────────────────────────
  private _heightToQuality(height: number): '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p' | '240p' {
    if (height >= 2160) return '2160p';
    if (height >= 1440) return '1440p';
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
