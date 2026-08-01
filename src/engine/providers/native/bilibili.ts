/**
 * NovaDL Engine — Bilibili Native Extractor
 *
 * Parses window.__playinfo__ or embedded player data from Bilibili
 * page HTML to extract video/audio URLs and metadata.
 *
 * Extraction sources:
 * - window.__playinfo__ (Bilibili player data with video/audio stream URLs)
 * - window.__INITIAL_STATE__ (Bilibili SSR data with video metadata)
 * - Bilibili API (/x/player/playurl endpoint)
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

// ─── Bilibili Data Types ──────────────────────────────────────────────
interface BilibiliPlayInfo {
  code?: number;
  message?: string;
  data?: BilibiliPlayInfoData;
}

interface BilibiliPlayInfoData {
  quality?: number;
  accept_quality?: number[];
  video_codecid?: number;
  dash?: BilibiliDashData;
  flv?: BilibiliFlvData;
  durl?: BilibiliDurlData[];
  from?: string;
  timelength?: number;
  quality_options?: unknown;
}

interface BilibiliDashData {
  video?: BilibiliDashStream[];
  audio?: BilibiliDashStream[];
  dolby?: unknown;
  flac?: unknown;
}

interface BilibiliDashStream {
  id?: number;
  baseUrl?: string;
  backupUrl?: string[];
  codecid?: number;
  codecs?: string;
  bandwidth?: number;
  width?: number;
  height?: number;
  mimeType?: string;
  frameRate?: string;
  sar?: string;
  startWithSap?: number;
  segmentBase?: {
    initialization?: string;
    indexRange?: string;
  };
  Segments?: unknown;
}

interface BilibiliFlvData {
  order?: number;
  url?: string;
  backup?: string[];
  size?: number;
  duration?: number;
}

interface BilibiliDurlData {
  order?: number;
  url?: string;
  backup?: string[];
  size?: number;
  duration?: number;
}

interface BilibiliInitialState {
  videoData?: BilibiliVideoData;
  tags?: Array<{ tag_id?: number; tag_name?: string }>;
  related?: unknown[];
  viewData?: BilibiliViewData;
}

interface BilibiliVideoData {
  aid?: number;
  bvid?: string;
  title?: string;
  desc?: string;
  pic?: string;
  duration?: number;
  pubdate?: number;
  owner?: BilibiliOwnerData;
  stat?: BilibiliStatData;
  dimension?: { width?: number; height?: number };
  cid?: number;
  videos?: number;
  tid?: number;
  tname?: string;
  dynamic?: string;
  is_stein_gate?: boolean;
}

interface BilibiliOwnerData {
  mid?: number;
  name?: string;
  face?: string;
  fans?: number;
}

interface BilibiliStatData {
  view?: number;
  danmaku?: number;
  reply?: number;
  favorite?: number;
  coin?: number;
  share?: number;
  like?: number;
  dislike?: number;
}

interface BilibiliViewData {
  aid?: number;
  bvid?: string;
  cid?: number;
  title?: string;
}

// ─── Provider Implementation ──────────────────────────────────────────
export class BilibiliNativeExtractor extends BaseProvider {
  readonly id = 'native_bilibili';
  readonly name = 'Bilibili Native Extractor';
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
        `Bilibili native extractor does not support platform '${platform}'`,
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
    return platform === 'bilibili';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      platforms: ['bilibili'],
      mediaTypes: ['video', 'audio', 'image', 'metadata'],
      formats: ['mp4', 'flv', 'm4a', 'aac', 'jpeg', 'png'],
      qualities: ['best', '1080p', '720p', '480p', '360p', '320kbps', '128kbps'],
      features: [
        'video_download', 'audio_download', 'cover_extraction',
        'thumbnail_extraction', 'metadata_extraction', 'codec_detection',
        'multiple_qualities', 'streaming',
      ] as ProviderFeature[],
      maxConcurrent: 5,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      await fetch('https://www.bilibili.com', {
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
    const videoInfo = this._parseUrl(url);

    // Strategy 1: Fetch page HTML and parse __playinfo__ + __INITIAL_STATE__
    try {
      const html = await this._fetchPage(url);
      const playInfo = this._extractPlayInfo(html);
      const initialState = this._extractInitialState(html);

      if (playInfo?.data) {
        return this._buildResultFromPlayInfo(playInfo, initialState, url);
      }
    } catch {
      // Page HTML failed
    }

    // Strategy 2: Bilibili API endpoint (requires cookies for higher quality)
    if (videoInfo.bvid) {
      try {
        const viewData = await this._fetchVideoInfo(videoInfo.bvid);
        if (viewData?.cid && videoInfo?.aid) {
          const playUrlData = await this._fetchPlayUrl(videoInfo.aid, viewData.cid);
          if (playUrlData?.data) {
            return this._buildResultFromPlayInfo(playUrlData, { videoData: viewData }, url);
          }
        }
      } catch {
        // API failed
      }
    }

    throw new ProviderError(
      'Could not extract Bilibili video data. No embedded playinfo found.',
      this.id,
      'PARSE_ERROR',
      false,
      'bilibili',
    );
  }

  // ─── Private: URL Parsing ──────────────────────────────────────────
  private _parseUrl(url: string): { bvid?: string; aid?: number } {
    // Match patterns: bilibili.com/video/BVxxxx, bilibili.com/video/avxxxx
    const bvidMatch = /bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/i.exec(url);
    if (bvidMatch?.[1]) return { bvid: bvidMatch[1] };

    const aidMatch = /bilibili\.com\/video\/av(\d+)/i.exec(url);
    if (aidMatch?.[1]) return { aid: parseInt(aidMatch[1], 10) };

    // b23.tv short URLs
    const shortMatch = /b23\.tv\/([a-zA-Z0-9]+)/i.exec(url);
    if (shortMatch?.[1]) return { bvid: shortMatch[1] };

    return {};
  }

  // ─── Private: Page Fetching ──────────────────────────────────────────
  private async _fetchPage(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': this._userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.5',
        'Referer': 'https://www.bilibili.com/',
        'Cookie': 'CURRENT_FNVAL=80; bflv=1',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new ProviderError(
        `Bilibili page fetch failed: ${response.status}`,
        this.id,
        response.status === 404 ? 'NOT_FOUND' : 'NETWORK',
        response.status >= 500,
        'bilibili',
      );
    }

    return response.text();
  }

  // ─── Private: Extract PlayInfo from HTML ──────────────────────────
  private _extractPlayInfo(html: string): BilibiliPlayInfo | null {
    const match = /window\.__playinfo__\s*=\s*(\{.*?\})\s*;?\s*<\/script>/s.exec(html);
    if (match?.[1]) {
      try {
        return JSON.parse(match[1]) as BilibiliPlayInfo;
      } catch {
        // Parse failed
      }
    }
    return null;
  }

  // ─── Private: Extract Initial State from HTML ──────────────────────────
  private _extractInitialState(html: string): BilibiliInitialState | null {
    const match = /window\.__INITIAL_STATE__\s*=\s*(\{.*?\})\s*;?\s*<\/script>/s.exec(html);
    if (match?.[1]) {
      try {
        // Bilibili __INITIAL_STATE__ may be encoded/escaped
        const jsonStr = match[1].replace(/\\u0026/g, '&').replace(/&quot;/g, '"');
        return JSON.parse(jsonStr) as BilibiliInitialState;
      } catch {
        // Parse failed
      }
    }
    return null;
  }

  // ─── Private: API Fetches ──────────────────────────────────────────
  private async _fetchVideoInfo(bvid: string): Promise<BilibiliVideoData | undefined> {
    const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
    try {
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': this._userAgent,
          'Referer': 'https://www.bilibili.com/',
        },
      });
      if (!response.ok) return undefined;
      const data = await response.json() as { code?: number; data?: BilibiliVideoData };
      return data.code === 0 ? data.data : undefined;
    } catch {
      return undefined;
    }
  }

  private async _fetchPlayUrl(aid: number, cid: number): Promise<BilibiliPlayInfo | null> {
    const apiUrl = `https://api.bilibili.com/x/player/playurl?avid=${aid}&cid=${cid}&fnval=80&fourk=1`;
    try {
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': this._userAgent,
          'Referer': 'https://www.bilibili.com/',
        },
      });
      if (!response.ok) return null;
      return await response.json() as BilibiliPlayInfo;
    } catch {
      return null;
    }
  }

  // ─── Private: Build Result ──────────────────────────────────────
  private _buildResultFromPlayInfo(
    playInfo: BilibiliPlayInfo,
    initialState: BilibiliInitialState | null,
    originalUrl: string,
  ): ExtractionResult {
    const mediaItems: MediaItem[] = [];
    const qualityOptions: QualityOption[] = [];
    const playData = playInfo.data;

    if (!playData) {
      throw new ProviderError(
        'Bilibili playinfo data is empty',
        this.id,
        'PARSE_ERROR',
        false,
        'bilibili',
      );
    }

    const durationMs = playData.timelength ?? initialState?.videoData?.duration ?? 0;

    // DASH format (modern Bilibili - separate video+audio streams)
    if (playData.dash) {
      // Video streams
      const videoStreams = playData.dash.video ?? [];
      // Sort by quality (height descending)
      const sortedVideos = videoStreams.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));

      for (const stream of sortedVideos) {
        if (stream.baseUrl) {
          mediaItems.push({
            type: 'video',
            format: 'mp4',
            quality: this._heightToQuality(stream.height ?? 0),
            url: stream.baseUrl,
            streamUrl: stream.baseUrl,
            duration: durationMs / 1000,
            resolution: stream.width && stream.height ? { width: stream.width, height: stream.height } : undefined,
            bitrate: stream.bandwidth,
            fps: stream.frameRate ? parseFloat(stream.frameRate) : undefined,
            codec: {
              video: stream.codecs,
              container: stream.mimeType?.split('/')[1] ?? 'mp4',
            },
            title: initialState?.videoData?.title,
            filename: this._buildFilename(initialState?.videoData?.title ?? 'bilibili_video', 'mp4'),
          });

          qualityOptions.push({
            label: `${stream.height ?? 0}p (${stream.codecs ?? 'unknown'})`,
            quality: this._heightToQuality(stream.height ?? 0),
            format: 'mp4',
            url: stream.baseUrl,
            bitrate: stream.bandwidth,
            codec: { video: stream.codecs },
            resolution: stream.width && stream.height ? { width: stream.width, height: stream.height } : undefined,
            isSource: stream === sortedVideos[0],
          });
        }
      }

      // Audio streams
      const audioStreams = playData.dash.audio ?? [];
      const sortedAudio = audioStreams.sort((a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0));

      for (const stream of sortedAudio) {
        if (stream.baseUrl) {
          mediaItems.push({
            type: 'audio',
            format: stream.mimeType?.includes('mp4a') ? 'm4a' : 'aac',
            quality: this._bandwidthToAudioQuality(stream.bandwidth ?? 0),
            url: stream.baseUrl,
            streamUrl: stream.baseUrl,
            duration: durationMs / 1000,
            bitrate: stream.bandwidth,
            codec: { audio: stream.codecs },
            title: initialState?.videoData?.title,
          });
        }
      }
    }

    // FLV format (legacy - single file with video+audio combined)
    if (playData.flv?.url) {
      mediaItems.push({
        type: 'video',
        format: 'flv',
        quality: this._qualityNumberToLabel(playData.quality ?? 0),
        url: playData.flv.url,
        directUrl: playData.flv.url,
        duration: durationMs / 1000,
        title: initialState?.videoData?.title,
        filename: this._buildFilename(initialState?.videoData?.title ?? 'bilibili_video', 'flv'),
      });
    }

    // DURL format (legacy MP4 - segmented)
    const durls = playData.durl ?? [];
    if (durls.length > 0 && mediaItems.length === 0) {
      for (const durl of durls) {
        if (durl.url) {
          mediaItems.push({
            type: 'video',
            format: 'mp4',
            quality: this._qualityNumberToLabel(playData.quality ?? 0),
            url: durl.url,
            directUrl: durl.url,
            duration: durl.duration ? durl.duration / 1000 : durationMs / 1000,
            size: durl.size,
            title: initialState?.videoData?.title,
          });
        }
      }
    }

    // Covers and thumbnails
    const covers: CoverImage[] = [];
    const thumbnails: Thumbnail[] = [];

    if (initialState?.videoData?.pic) {
      covers.push({ url: initialState.videoData.pic, format: 'jpeg' });
      thumbnails.push({ url: initialState.videoData.pic, format: 'jpeg' });
    }

    // Metadata
    const videoData = initialState?.videoData;
    const statData = videoData?.stat;

    const metadata: ExtractionMetadata = {
      title: videoData?.title,
      description: videoData?.desc ?? videoData?.dynamic,
      author: videoData?.owner?.name,
      authorId: videoData?.owner?.mid?.toString(),
      authorUrl: videoData?.owner?.mid ? `https://space.bilibili.com/${videoData.owner.mid}` : undefined,
      platform: 'bilibili',
      originalUrl,
      duration: videoData?.duration ?? durationMs / 1000,
      viewCount: statData?.view,
      likeCount: statData?.like,
      commentCount: statData?.reply,
      shareCount: statData?.share,
      uploadDate: videoData?.pubdate ? new Date(videoData.pubdate * 1000).toISOString() : undefined,
      categories: videoData?.tname ? [videoData.tname] : undefined,
      tags: initialState?.tags?.map((t) => t.tag_name ?? ''),
      extra: {
        bvid: videoData?.bvid,
        aid: videoData?.aid?.toString(),
        cid: videoData?.cid?.toString(),
        videoCount: videoData?.videos,
        coinCount: statData?.coin,
        favoriteCount: statData?.favorite,
        danmakuCount: statData?.danmaku,
        quality: playData.quality,
        acceptQuality: playData.accept_quality,
      },
    };

    return {
      id: uuid(),
      url: originalUrl,
      platform: 'bilibili',
      provider: this.id,
      timestamp: new Date(),
      media: mediaItems,
      metadata,
      covers: covers.length > 0 ? covers : undefined,
      thumbnails: thumbnails.length > 0 ? thumbnails : undefined,
      qualityOptions: qualityOptions.length > 0 ? qualityOptions : undefined,
      rawResponse: { playInfo, initialState },
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

  private _bandwidthToAudioQuality(bandwidth: number): '320kbps' | '256kbps' | '192kbps' | '128kbps' | '64kbps' {
    // bandwidth is in bits per second
    const kbps = bandwidth / 1000;
    if (kbps >= 320) return '320kbps';
    if (kbps >= 256) return '256kbps';
    if (kbps >= 192) return '192kbps';
    if (kbps >= 128) return '128kbps';
    return '64kbps';
  }

  private _qualityNumberToLabel(quality: number): '2160p' | '1080p' | '720p' | '480p' | '360p' | '240p' {
    // Bilibili quality numbers: 120=4K, 116=1080P60, 112=1080P+, 80=1080P, 64=720P, 48=720P60, 32=480P, 16=360P
    if (quality >= 120) return '2160p';
    if (quality >= 80) return '1080p';
    if (quality >= 48) return '720p';
    if (quality >= 32) return '480p';
    return '360p';
  }

  private _buildFilename(title: string, ext: string): string {
    const sanitized = title.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').substring(0, 200);
    return `${sanitized}.${ext}`;
  }
}
