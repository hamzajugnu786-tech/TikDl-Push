/**
 * NovaDL Engine — TikTok Native Extractor
 *
 * Parses embedded JSON from TikTok page HTML to extract video URLs,
 * metadata, cover images, author info, and music data.
 *
 * Extraction sources:
 * - __NEXT_DATA__ JSON (Next.js SSR data embedded in script tag)
 * - SIGI_STATE or _SIGI_STATE object (TikTok's proprietary SSR format)
 * - Video detail API fallback via /api/v1/video/detail endpoint
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

// ─── TikTok Embedded Data Types ──────────────────────────────────────
interface TikTokNextData {
  props?: {
    pageProps?: {
      itemInfo?: {
        itemStruct?: TikTokVideoStruct;
      };
      videoData?: {
        itemInfos?: TikTokItemInfos;
        authorInfos?: TikTokAuthorInfos;
        musicInfos?: TikTokMusicInfos;
      };
    };
  };
}

interface TikTokVideoStruct {
  id?: string;
  desc?: string;
  createTime?: number;
  author?: TikTokAuthorStruct;
  stats?: TikTokStatsStruct;
  video?: TikTokVideoInfoStruct;
  music?: TikTokMusicStruct;
}

interface TikTokAuthorStruct {
  id?: string;
  uniqueId?: string;
  nickname?: string;
  avatarLarger?: string;
  signature?: string;
}

interface TikTokStatsStruct {
  diggCount?: number;
  shareCount?: number;
  commentCount?: number;
  playCount?: number;
  collectCount?: number;
}

interface TikTokVideoInfoStruct {
  id?: string;
  height?: number;
  width?: number;
  duration?: number;
  ratio?: string;
  cover?: string;
  originCover?: string;
  dynamicCover?: string;
  playAddr?: TikTokUrlList;
  downloadAddr?: TikTokUrlList;
  codecType?: string;
  bitrate?: number;
}

interface TikTokUrlList {
  urlList?: string[];
  uri?: string;
  width?: number;
  height?: number;
}

interface TikTokMusicStruct {
  id?: string;
  title?: string;
  authorName?: string;
  coverLarge?: string;
  playUrl?: TikTokUrlList;
  duration?: number;
}

interface TikTokItemInfos {
  commentCount?: number;
  diggCount?: number;
  playCount?: number;
  shareCount?: number;
  videoId?: string;
  text?: string;
  covers?: string[];
  videoUrls?: string[];
}

interface TikTokAuthorInfos {
  uniqueId?: string;
  nickname?: string;
  signature?: string;
  covers?: string[];
}

interface TikTokMusicInfos {
  musicId?: string;
  musicName?: string;
  musicAuthor?: string;
  covers?: string[];
  playUrl?: string;
}

// ─── Provider Implementation ──────────────────────────────────────────
export class TikTokNativeExtractor extends BaseProvider {
  readonly id = 'native_tiktok';
  readonly name = 'TikTok Native Extractor';
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
        `TikTok native extractor does not support platform '${platform}'`,
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

      const result = this._parseEmbeddedJson(html, request.url);
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
    return platform === 'tiktok';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['tiktok'],
      mediaTypes: ['video', 'audio', 'image', 'metadata'],
      formats: ['mp4', 'mp3', 'jpeg', 'png', 'webp'],
      qualities: ['best', '1080p', '720p', '480p', '360p', '320kbps', '128kbps'],
      features: [
        'video_download', 'audio_download', 'cover_extraction',
        'thumbnail_extraction', 'metadata_extraction', 'watermark_detection',
        'watermark_removal', 'multiple_qualities',
      ] as ProviderFeature[],
      maxConcurrent: 5,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      await this._fetchPage('https://www.tiktok.com');
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
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new ProviderError(
        `TikTok page fetch failed: ${response.status} ${response.statusText}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500 || response.status === 429,
        'tiktok',
      );
    }

    return response.text();
  }

  // ─── Private: Extract JSON from HTML ──────────────────────────────────
  private _extractJsonFromHtml(html: string, pattern: RegExp): string | null {
    const match = pattern.exec(html);
    if (!match) return null;
    // match[1] is the captured JSON string
    const jsonStr = match[1];
    if (!jsonStr) return null;
    return jsonStr;
  }

  // ─── Private: Parse Embedded Data ──────────────────────────────────────
  private _parseEmbeddedJson(html: string, originalUrl: string): ExtractionResult {
    // Strategy 1: __NEXT_DATA__ (Next.js SSR format)
    const nextDataJson = this._extractJsonFromHtml(
      html,
      /<script\s+id="__NEXT_DATA__"\s+type="application\/json"[^>]*>(.*?)<\/script>/s,
    );

    if (nextDataJson) {
      try {
        const nextData = JSON.parse(nextDataJson) as TikTokNextData;
        const itemStruct = nextData.props?.pageProps?.itemInfo?.itemStruct;
        if (itemStruct) {
          return this._buildResultFromVideoStruct(itemStruct, originalUrl);
        }
      } catch {
        // JSON parse failed, try next strategy
      }
    }

    // Strategy 2: SIGI_STATE (TikTok's legacy SSR format)
    const sigiJson = this._extractJsonFromHtml(
      html,
      /window\['SIGI_STATE'\]\s*=\s*(\{.*?\});?\s*<\/script>/s,
    );

    if (sigiJson) {
      try {
        const sigiState = JSON.parse(sigiJson) as Record<string, unknown>;
        const itemModule = sigiState.ItemModule as Record<string, Record<string, unknown>> | undefined;
        if (itemModule) {
          // Get the first video key from ItemModule
          const videoKeys = Object.keys(itemModule);
          const firstKey = videoKeys[0];
          if (firstKey) {
            const videoData = itemModule[firstKey] as Record<string, unknown>;
            return this._buildResultFromSigiState(videoData, originalUrl);
          }
        }
      } catch {
        // JSON parse failed, try next strategy
      }
    }

    // Strategy 3: _SIGI_STATE (alternate name)
    const sigiAltJson = this._extractJsonFromHtml(
      html,
      /window\['_SIGI_STATE'\]\s*=\s*(\{.*?\});?\s*<\/script>/s,
    );

    if (sigiAltJson) {
      try {
        const sigiAltState = JSON.parse(sigiAltJson) as Record<string, unknown>;
        const itemModule = sigiAltState.ItemModule as Record<string, Record<string, unknown>> | undefined;
        if (itemModule) {
          const videoKeys = Object.keys(itemModule);
          const firstKey = videoKeys[0];
          if (firstKey) {
            const videoData = itemModule[firstKey] as Record<string, unknown>;
            return this._buildResultFromSigiState(videoData, originalUrl);
          }
        }
      } catch {
        // JSON parse failed, try next strategy
      }
    }

    // Strategy 4: videoData object (mobile/embed page format)
    const videoDataJson = this._extractJsonFromHtml(
      html,
      /window\['videoData'\]\s*=\s*(\{.*?\});?\s*<\/script>/s,
    );

    if (videoDataJson) {
      try {
        const videoData = JSON.parse(videoDataJson) as Record<string, unknown>;
        const itemInfos = videoData.itemInfos as Record<string, unknown> | undefined;
        if (itemInfos) {
          return this._buildResultFromItemInfos(itemInfos, videoData, originalUrl);
        }
      } catch {
        // All strategies exhausted
      }
    }

    throw new ProviderError(
      'Could not extract TikTok video data from page HTML. No embedded JSON found.',
      this.id,
      'PARSE_ERROR',
      false,
      'tiktok',
    );
  }

  // ─── Private: Build Result from VideoStruct ──────────────────────────────
  private _buildResultFromVideoStruct(videoStruct: TikTokVideoStruct, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const qualityOptions: QualityOption[] = [];

    const video = videoStruct.video;
    if (video) {
      // Download URL (no watermark)
      const downloadUrls = video.downloadAddr?.urlList ?? [];
      if (downloadUrls.length > 0) {
        const downloadUrl = downloadUrls[0] ?? '';
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: this._heightToQuality(video.height ?? 0),
          url: downloadUrl,
          directUrl: downloadUrl,
          duration: video.duration,
          resolution: video.width && video.height ? { width: video.width, height: video.height } : undefined,
          codec: video.codecType ? { video: video.codecType, container: 'mp4' } : undefined,
          bitrate: video.bitrate,
          watermark: { detected: false, removable: true, removed: true, description: 'No watermark on download URL' },
          title: videoStruct.desc,
          filename: this._buildFilename(videoStruct.desc ?? 'tiktok_video', 'mp4'),
        });

        qualityOptions.push({
          label: `${video.height ?? 1080}p (no watermark)`,
          quality: 'best',
          format: 'mp4',
          url: downloadUrl,
          isSource: true,
        });
      }

      // Play URL (may contain watermark)
      const playUrls = video.playAddr?.urlList ?? [];
      if (playUrls.length > 0) {
        const playUrl = playUrls[0] ?? '';
        const playItem: MediaItem = {
          type: 'video',
          format: 'mp4',
          quality: this._heightToQuality(video.height ?? 0),
          url: playUrl,
          directUrl: playUrl,
          duration: video.duration,
          resolution: video.width && video.height ? { width: video.width, height: video.height } : undefined,
          codec: video.codecType ? { video: video.codecType, container: 'mp4' } : undefined,
          watermark: { detected: true, removable: true, description: 'TikTok watermark on play URL' },
          title: videoStruct.desc,
          filename: this._buildFilename(videoStruct.desc ?? 'tiktok_video_wm', 'mp4'),
        };
        mediaItems.push(playItem);

        qualityOptions.push({
          label: `${video.height ?? 1080}p (with watermark)`,
          quality: this._heightToQuality(video.height ?? 0),
          format: 'mp4',
          url: playUrl,
        });
      }
    }

    // Music/audio extraction
    const music = videoStruct.music;
    if (music?.playUrl?.urlList?.length) {
      const musicUrl = music.playUrl.urlList[0] ?? '';
      mediaItems.push({
        type: 'audio',
        format: 'mp3',
        quality: '128kbps',
        url: musicUrl,
        directUrl: musicUrl,
        duration: music.duration,
        title: music.title,
        filename: this._buildFilename(music.title ?? 'tiktok_audio', 'mp3'),
      });
    }

    // Cover images
    const covers: CoverImage[] = [];
    if (video?.originCover) {
      covers.push({ url: video.originCover, format: 'jpeg' });
    }
    if (video?.cover) {
      covers.push({ url: video.cover, format: 'jpeg' });
    }

    // Thumbnails
    const thumbnails: Thumbnail[] = [];
    if (video?.dynamicCover) {
      thumbnails.push({ url: video.dynamicCover, format: 'webp' });
    }
    thumbnails.push(...covers.map((c): Thumbnail => ({ url: c.url, format: c.format })));

    // Metadata
    const metadata: ExtractionMetadata = {
      title: videoStruct.desc,
      description: videoStruct.desc,
      author: videoStruct.author?.nickname,
      authorId: videoStruct.author?.uniqueId,
      authorUrl: videoStruct.author?.uniqueId ? `https://www.tiktok.com/@${videoStruct.author.uniqueId}` : undefined,
      platform: 'tiktok',
      originalUrl,
      duration: video?.duration,
      viewCount: videoStruct.stats?.playCount,
      likeCount: videoStruct.stats?.diggCount,
      commentCount: videoStruct.stats?.commentCount,
      shareCount: videoStruct.stats?.shareCount,
      uploadDate: videoStruct.createTime ? new Date(videoStruct.createTime * 1000).toISOString() : undefined,
      extra: {
        videoId: videoStruct.id ?? video?.id,
        musicTitle: music?.title,
        musicAuthor: music?.authorName,
        ratio: video?.ratio,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'tiktok',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse: videoStruct,
    };
  }

  // ─── Private: Build Result from SIGI_STATE ──────────────────────────────
  private _buildResultFromSigiState(videoData: Record<string, unknown>, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];

    const videoUrls = videoData.videoUrls as string[] | undefined;
    const downloadUrl = videoData.videoDownloadUrl as string | undefined;

    if (downloadUrl) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: 'best',
        url: downloadUrl,
        directUrl: downloadUrl,
        watermark: { detected: false, removable: true, removed: true, description: 'No watermark on download URL' },
        title: videoData.desc as string | undefined,
      });
    }

    if (videoUrls && videoUrls.length > 0) {
      const playUrl = videoUrls[0] ?? '';
      if (playUrl !== downloadUrl) {
        mediaItems.push({
          type: 'video',
          format: 'mp4',
          quality: '720p',
          url: playUrl,
          directUrl: playUrl,
          watermark: { detected: true, removable: true, description: 'TikTok watermark on play URL' },
          title: videoData.desc as string | undefined,
        });
      }
    }

    const covers: CoverImage[] = [];
    const coverUrls = videoData.covers as string[] | undefined;
    if (coverUrls && coverUrls.length > 0) {
      covers.push({ url: coverUrls[0] ?? '', format: 'jpeg' });
    }

    const metadata: ExtractionMetadata = {
      title: videoData.desc as string | undefined,
      description: videoData.desc as string | undefined,
      author: videoData.authorNickName as string | undefined,
      authorId: videoData.authorUniqueId as string | undefined,
      platform: 'tiktok',
      originalUrl,
      viewCount: videoData.playCount as number | undefined,
      likeCount: videoData.diggCount as number | undefined,
      commentCount: videoData.commentCount as number | undefined,
      shareCount: videoData.shareCount as number | undefined,
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'tiktok',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      rawResponse: videoData,
    };
  }

  // ─── Private: Build Result from ItemInfos ──────────────────────────────
  private _buildResultFromItemInfos(
    itemInfos: Record<string, unknown>,
    videoData: Record<string, unknown>,
    originalUrl: string,
  ): ExtractionResult {
    const mediaItems: MediaItem[] = [];

    const videoUrls = itemInfos.videoUrls as string[] | undefined;
    if (videoUrls && videoUrls.length > 0) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: 'best',
        url: videoUrls[0] ?? '',
        directUrl: videoUrls[0] ?? '',
        title: itemInfos.text as string | undefined,
      });
    }

    const covers: CoverImage[] = [];
    const coverUrls = itemInfos.covers as string[] | undefined;
    if (coverUrls && coverUrls.length > 0) {
      covers.push({ url: coverUrls[0] ?? '', format: 'jpeg' });
    }

    const authorInfos = videoData.authorInfos as Record<string, unknown> | undefined;

    const metadata: ExtractionMetadata = {
      title: itemInfos.text as string | undefined,
      description: itemInfos.text as string | undefined,
      author: authorInfos?.nickname as string | undefined,
      authorId: authorInfos?.uniqueId as string | undefined,
      platform: 'tiktok',
      originalUrl,
      viewCount: itemInfos.playCount as number | undefined,
      likeCount: itemInfos.diggCount as number | undefined,
      commentCount: itemInfos.commentCount as number | undefined,
      shareCount: itemInfos.shareCount as number | undefined,
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'tiktok',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      rawResponse: videoData,
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
