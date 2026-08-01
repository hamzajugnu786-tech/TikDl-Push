/**
 * NovaDL Engine — CapCut Native Extractor
 *
 * Parses template/project data from CapCut page source to extract
 * video URLs and metadata.
 *
 * Extraction sources:
 * - Embedded JSON data in page HTML (template data)
 * - CapCut API for template detail
 * - Meta tags as fallback
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

// ─── CapCut Data Types ──────────────────────────────────────────────
interface CapCutTemplateData {
  id?: string;
  title?: string;
  description?: string;
  coverUrl?: string;
  coverUrlNoWatermark?: string;
  videoUrl?: string;
  videoUrlNoWatermark?: string;
  duration?: number;
  width?: number;
  height?: number;
  author?: CapCutAuthorInfo;
  stats?: CapCutStatsInfo;
  tags?: string[];
  createTime?: number;
  templateId?: string;
  projectId?: string;
  materials?: CapCutMaterialInfo[];
}

interface CapCutAuthorInfo {
  id?: string;
  username?: string;
  nickname?: string;
  avatarUrl?: string;
}

interface CapCutStatsInfo {
  useCount?: number;
  viewCount?: number;
  likeCount?: number;
  shareCount?: number;
  commentCount?: number;
}

interface CapCutMaterialInfo {
  type?: string; // video, image, audio
  url?: string;
  thumbnailUrl?: string;
  duration?: number;
  width?: number;
  height?: number;
}

interface CapCutApiResponse {
  code?: number;
  msg?: string;
  data?: CapCutTemplateData;
}

interface CapCutPageData {
  template?: CapCutTemplateData;
  project?: CapCutTemplateData;
}

// ─── Provider Implementation ──────────────────────────────────────────
export class CapCutNativeExtractor extends BaseProvider {
  readonly id = 'native_capcut';
  readonly name = 'CapCut Native Extractor';
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
        `CapCut native extractor does not support platform '${platform}'`,
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
    return platform === 'capcut';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['capcut'],
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
      await fetch('https://www.capcut.com', {
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
    // Strategy 1: Parse page HTML for embedded data
    try {
      const html = await this._fetchPage(url);
      const pageData = this._extractPageData(html);
      if (pageData) {
        const templateData = pageData.template ?? pageData.project;
        if (templateData) {
          return this._buildResultFromTemplateData(templateData, url);
        }
      }
    } catch {
      // Page fetch failed
    }

    // Strategy 2: CapCut template API
    const templateId = this._extractTemplateId(url);
    if (templateId) {
      try {
        const apiResponse = await this._fetchTemplateDetail(templateId);
        if (apiResponse.data) {
          return this._buildResultFromTemplateData(apiResponse.data, url);
        }
      } catch {
        // API failed
      }
    }

    // Strategy 3: Meta tags fallback
    try {
      const html = await this._fetchPage(url);
      return this._buildResultFromMetaTags(html, url);
    } catch {
      // All strategies failed
    }

    throw new ProviderError(
      'Could not extract CapCut template data from page.',
      this.id,
      'PARSE_ERROR',
      false,
      'capcut',
    );
  }

  // ─── Private: Template ID Extraction ──────────────────────────────────
  private _extractTemplateId(url: string): string | null {
    const patterns = [
      /capcut\.com\/watch\/([a-zA-Z0-9]+)/i,
      /capcut\.com\/template-detail\/([a-zA-Z0-9]+)/i,
      /capcut\.com\/template\/([a-zA-Z0-9]+)/i,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(url);
      if (match?.[1]) return match[1];
    }
    return null;
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
        `CapCut page fetch failed: ${response.status}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'capcut',
      );
    }

    return response.text();
  }

  // ─── Private: Extract Page Data ──────────────────────────────────
  private _extractPageData(html: string): CapCutPageData | null {
    // __NEXT_DATA__ pattern
    const nextDataMatch = /<script\s+id="__NEXT_DATA__"\s+type="application\/json"[^>]*>(.*?)<\/script>/s.exec(html);
    if (nextDataMatch?.[1]) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]) as Record<string, unknown>;
        const props = nextData.props as Record<string, unknown> | undefined;
        const pageProps = props?.pageProps as Record<string, unknown> | undefined;
        const template = pageProps?.template as CapCutTemplateData | undefined;
        const project = pageProps?.project as CapCutTemplateData | undefined;
        if (template || project) {
          return { template, project };
        }
      } catch {
        // Parse failed
      }
    }

    // window.__INITIAL_STATE__ pattern
    const stateMatch = /window\.__INITIAL_STATE__\s*=\s*(\{.*?\});?\s*<\/script>/s.exec(html);
    if (stateMatch?.[1]) {
      try {
        const state = JSON.parse(stateMatch[1]) as Record<string, unknown>;
        const template = state.template as CapCutTemplateData | undefined;
        const project = state.project as CapCutTemplateData | undefined;
        if (template || project) {
          return { template, project };
        }
      } catch {
        // Parse failed
      }
    }

    return null;
  }

  // ─── Private: API Fetch ──────────────────────────────────────────
  private async _fetchTemplateDetail(templateId: string): Promise<CapCutApiResponse> {
    const apiUrl = `https://www.capcut.com/api/template/detail?template_id=${templateId}`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new ProviderError(
        `CapCut API fetch failed: ${response.status}`,
        this.id,
        'NETWORK',
        response.status >= 500,
        'capcut',
      );
    }

    return await response.json() as CapCutApiResponse;
  }

  // ─── Private: Build Result from TemplateData ──────────────────────────
  private _buildResultFromTemplateData(template: CapCutTemplateData, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];

    // Video (no watermark preferred)
    const videoUrl = template.videoUrlNoWatermark ?? template.videoUrl;
    if (videoUrl) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: this._heightToQuality(template.height ?? 0),
        url: videoUrl,
        directUrl: videoUrl,
        duration: template.duration,
        resolution: template.width && template.height ? { width: template.width, height: template.height } : undefined,
        watermark: template.videoUrlNoWatermark
          ? { detected: false, removable: true, removed: true, description: 'No watermark download available' }
          : { detected: true, removable: false, description: 'CapCut watermark on video' },
        title: template.title,
        filename: this._buildFilename(template.title ?? template.templateId ?? template.id ?? 'capcut_video', 'mp4'),
      });
    }

    // Materials (individual assets)
    for (const material of template.materials ?? []) {
      if (material.url) {
        if (material.type === 'video') {
          mediaItems.push({
            type: 'video',
            format: 'mp4',
            quality: this._heightToQuality(material.height ?? 0),
            url: material.url,
            duration: material.duration,
            resolution: material.width && material.height ? { width: material.width, height: material.height } : undefined,
            title: template.title,
          });
        } else if (material.type === 'image') {
          mediaItems.push({
            type: 'image',
            format: 'jpeg',
            quality: 'best',
            url: material.url,
            resolution: material.width && material.height ? { width: material.width, height: material.height } : undefined,
            title: template.title,
          });
        }
      }
    }

    // Cover image
    if (template.coverUrlNoWatermark ?? template.coverUrl) {
      mediaItems.push({
        type: 'image',
        format: 'jpeg',
        quality: 'best',
        url: template.coverUrlNoWatermark ?? template.coverUrl ?? '',
        directUrl: template.coverUrlNoWatermark ?? template.coverUrl ?? '',
        title: template.title,
      });
    }

    // Covers and thumbnails
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    if (template.coverUrlNoWatermark ?? template.coverUrl) {
      covers.push({ url: template.coverUrlNoWatermark ?? template.coverUrl ?? '', format: 'jpeg' });
      thumbnails.push({ url: template.coverUrlNoWatermark ?? template.coverUrl ?? '', format: 'jpeg' });
    }

    for (const material of template.materials ?? []) {
      if (material.thumbnailUrl) {
        thumbnails.push({ url: material.thumbnailUrl, format: 'jpeg' });
      }
    }

    // Metadata
    const metadata: ExtractionMetadata = {
      title: template.title,
      description: template.description,
      author: template.author?.nickname ?? template.author?.username,
      authorId: template.author?.username ?? template.author?.id,
      authorUrl: template.author?.username ? `https://www.capcut.com/@${template.author.username}` : undefined,
      platform: 'capcut',
      originalUrl,
      duration: template.duration,
      viewCount: template.stats?.viewCount,
      likeCount: template.stats?.likeCount,
      shareCount: template.stats?.shareCount,
      commentCount: template.stats?.commentCount,
      uploadDate: template.createTime ? new Date(template.createTime * 1000).toISOString() : undefined,
      tags: template.tags,
      extra: {
        templateId: template.templateId ?? template.id,
        projectId: template.projectId,
        useCount: template.stats?.useCount,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'capcut',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      rawResponse: template,
    };
  }

  // ─── Private: Build Result from Meta Tags ──────────────────────────────
  private _buildResultFromMetaTags(html: string, originalUrl: string): ExtractionResult {
    const ogVideo = this._extractMetaContent(html, 'og:video');
    const ogImage = this._extractMetaContent(html, 'og:image');
    const ogTitle = this._extractMetaContent(html, 'og:title');
    const ogDescription = this._extractMetaContent(html, 'og:description');

    const mediaItems: MediaItem[] = [];
    if (ogVideo) {
      mediaItems.push({ type: 'video', format: 'mp4', quality: 'best', url: ogVideo, title: ogTitle });
    }
    if (ogImage && !ogVideo) {
      mediaItems.push({ type: 'image', format: 'jpeg', quality: 'best', url: ogImage, title: ogTitle });
    }

    const covers: CoverImage[] = [];
    if (ogImage) covers.push({ url: ogImage, format: 'jpeg' });

    const metadata: ExtractionMetadata = {
      title: ogTitle,
      description: ogDescription,
      platform: 'capcut',
      originalUrl,
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'capcut',
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
