/**
 * NovaDL Engine — Likee Native Extractor
 *
 * Parses embedded video data from Likee page source to extract
 * video URLs and metadata.
 *
 * Extraction sources:
 * - Likee API endpoint for video detail (/video/detail)
 * - Embedded JSON data in page HTML (window.__INITIAL_STATE__)
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

// ─── Likee Data Types ────────────────────────────────────────────────
interface LikeeVideoDetail {
  videoId?: string;
  title?: string;
  desc?: string;
  videoUrl?: string;
  videoUrlNoWatermark?: string;
  coverUrl?: string;
  coverUrlNoWatermark?: string;
  dynamicCoverUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  likeCnt?: number;
  commentCnt?: number;
  shareCnt?: number;
  viewCnt?: number;
  createTime?: number;
  userInfo?: LikeeUserInfo;
  musicInfo?: LikeeMusicInfo;
}

interface LikeeUserInfo {
  userId?: string;
  nickName?: string;
  userName?: string;
  avatarUrl?: string;
}

interface LikeeMusicInfo {
  musicId?: string;
  musicName?: string;
  musicAuthor?: string;
  playUrl?: string;
  coverUrl?: string;
  duration?: number;
}

interface LikeeApiResponse {
  code?: number;
  msg?: string;
  data?: {
    videoDetail?: LikeeVideoDetail;
  };
}

interface LikeeInitialState {
  videoDetail?: LikeeVideoDetail;
  shareVideoDetail?: LikeeVideoDetail;
}

// ─── Provider Implementation ──────────────────────────────────────────
export class LikeeNativeExtractor extends BaseProvider {
  readonly id = 'native_likee';
  readonly name = 'Likee Native Extractor';
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
        `Likee native extractor does not support platform '${platform}'`,
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
    return platform === 'likee';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['likee'],
      mediaTypes: ['video', 'audio', 'image', 'metadata'],
      formats: ['mp4', 'mp3', 'jpeg', 'png'],
      qualities: ['best', '1080p', '720p', '480p', '360p'],
      features: [
        'video_download', 'audio_download', 'cover_extraction',
        'thumbnail_extraction', 'metadata_extraction', 'watermark_detection',
        'watermark_removal',
      ] as ProviderFeature[],
      maxConcurrent: 5,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      await fetch('https://likee.video', {
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
    // Strategy 1: Likee API endpoint
    const videoId = this._extractVideoId(url);
    if (videoId) {
      try {
        const apiResponse = await this._fetchVideoDetail(videoId);
        if (apiResponse.data?.videoDetail) {
          return this._buildResultFromVideoDetail(apiResponse.data.videoDetail, url);
        }
      } catch {
        // API failed, try page HTML
      }
    }

    // Strategy 2: Page HTML with embedded __INITIAL_STATE__
    try {
      const html = await this._fetchPage(url);
      const initialState = this._extractInitialState(html);
      if (initialState) {
        const videoDetail = initialState.videoDetail ?? initialState.shareVideoDetail;
        if (videoDetail) {
          return this._buildResultFromVideoDetail(videoDetail, url);
        }
      }
    } catch {
      // Page fetch failed
    }

    throw new ProviderError(
      'Could not extract Likee video data. No embedded data found.',
      this.id,
      'PARSE_ERROR',
      false,
      'likee',
    );
  }

  // ─── Private: Video ID Extraction ──────────────────────────────────
  private _extractVideoId(url: string): string | null {
    const patterns = [
      /likee\.video\/v\/([a-zA-Z0-9]+)/i,
      /likee\.video\/@[^/]+\/video\/([a-zA-Z0-9]+)/i,
      /l\.likee\.video\/([a-zA-Z0-9]+)/i,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(url);
      if (match?.[1]) return match[1];
    }
    return null;
  }

  // ─── Private: API Fetch ──────────────────────────────────────────
  private async _fetchVideoDetail(videoId: string): Promise<LikeeApiResponse> {
    const apiUrl = `https://api.likee.video/likee-video/detail/video?videoId=${videoId}`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new ProviderError(
        `Likee API fetch failed: ${response.status}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'likee',
      );
    }

    return await response.json() as LikeeApiResponse;
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
        `Likee page fetch failed: ${response.status}`,
        this.id,
        'NETWORK',
        response.status >= 500,
        'likee',
      );
    }

    return response.text();
  }

  // ─── Private: Extract Initial State from HTML ──────────────────────────
  private _extractInitialState(html: string): LikeeInitialState | null {
    const match = /window\.__INITIAL_STATE__\s*=\s*(\{.*?\});\s*<\/script>/s.exec(html);
    if (match?.[1]) {
      try {
        return JSON.parse(match[1]) as LikeeInitialState;
      } catch {
        // Parse failed
      }
    }
    return null;
  }

  // ─── Private: Build Result ──────────────────────────────────────
  private _buildResultFromVideoDetail(video: LikeeVideoDetail, originalUrl: string): ExtractionResult {
    const mediaItems: MediaItem[] = [];

    // No-watermark video
    if (video.videoUrlNoWatermark) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: this._heightToQuality(video.height ?? 0),
        url: video.videoUrlNoWatermark,
        directUrl: video.videoUrlNoWatermark,
        duration: video.duration,
        resolution: video.width && video.height ? { width: video.width, height: video.height } : undefined,
        watermark: { detected: false, removable: true, removed: true, description: 'No watermark download' },
        title: video.title ?? video.desc,
        filename: this._buildFilename(video.title ?? video.desc ?? 'likee_video', 'mp4'),
      });
    }

    // Video with watermark
    if (video.videoUrl) {
      mediaItems.push({
        type: 'video',
        format: 'mp4',
        quality: this._heightToQuality(video.height ?? 0),
        url: video.videoUrl,
        directUrl: video.videoUrl,
        duration: video.duration,
        resolution: video.width && video.height ? { width: video.width, height: video.height } : undefined,
        watermark: { detected: true, removable: true, description: 'Likee watermark present' },
        title: video.title ?? video.desc,
        filename: this._buildFilename(video.title ?? video.desc ?? 'likee_video_wm', 'mp4'),
      });
    }

    // Audio
    if (video.musicInfo?.playUrl) {
      mediaItems.push({
        type: 'audio',
        format: 'mp3',
        quality: '128kbps',
        url: video.musicInfo.playUrl,
        directUrl: video.musicInfo.playUrl,
        duration: video.musicInfo.duration,
        title: video.musicInfo.musicName,
        filename: this._buildFilename(video.musicInfo.musicName ?? 'likee_audio', 'mp3'),
      });
    }

    // Covers and thumbnails
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    if (video.coverUrlNoWatermark) {
      covers.push({ url: video.coverUrlNoWatermark, format: 'jpeg' });
    }
    if (video.coverUrl) {
      covers.push({ url: video.coverUrl, format: 'jpeg' });
    }
    if (video.dynamicCoverUrl) {
      thumbnails.push({ url: video.dynamicCoverUrl, format: 'jpeg' });
    }
    thumbnails.push(...covers.map((c): Thumbnail => ({ url: c.url, format: c.format })));

    // Metadata
    const metadata: ExtractionMetadata = {
      title: video.title ?? video.desc,
      description: video.desc,
      author: video.userInfo?.nickName ?? video.userInfo?.userName,
      authorId: video.userInfo?.userName ?? video.userInfo?.userId,
      authorUrl: video.userInfo?.userName ? `https://likee.video/@${video.userInfo.userName}` : undefined,
      platform: 'likee',
      originalUrl,
      duration: video.duration,
      viewCount: video.viewCnt,
      likeCount: video.likeCnt,
      commentCount: video.commentCnt,
      shareCount: video.shareCnt,
      uploadDate: video.createTime ? new Date(video.createTime * 1000).toISOString() : undefined,
      extra: {
        videoId: video.videoId,
        musicName: video.musicInfo?.musicName,
        musicAuthor: video.musicInfo?.musicAuthor,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'likee',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      rawResponse: video,
    };
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
