/**
 * TikTok TikHub Adapter — Phase 1 (Hardened)
 *
 * Wraps the TikHub API download logic into the NovaDLProvider interface.
 * Uses shared provider utilities (mapHttpError, createOfflineHealth, wrapProviderError)
 * to eliminate code duplication across adapters.
 */

import { NovaDLProvider, ProviderCapabilities, ProviderHealth } from '../../types';
import { NovaDLResult, NovaDLFormat, NovaDLAudio, NovaDLImage, NovaDLMetadata, NovaDLFormatType, NovaDLImageType } from '../../../types';
import { NovaDLError, NovaDLErrorCode, generateRequestId } from '../../../errors';
import { mapHttpError, createOfflineHealth, wrapProviderError } from '../../../provider-utils';
import { formatCount } from '@/lib/format';

/** TikTok-specific response structure from TikHub API */
interface TikHubVideoData {
  id?: string;
  aweme_id?: string;
  desc?: string;
  title?: string;
  author?: {
    unique_id?: string;
    nickname?: string;
    avatar_larger?: { url_list?: string[] };
    avatar?: { url_list?: string[] };
  };
  cover?: { url_list?: string[] };
  origin_cover?: { url_list?: string[] };
  video?: {
    duration?: number;
    play_addr?: { url_list?: string[] };
    download_addr?: { url_list?: string[] };
    play_addr_265?: { url_list?: string[] };
  };
  statistics?: {
    play_count?: number;
    digg_count?: number;
    comment_count?: number;
    share_count?: number;
  };
}

export class TikTokTikHubAdapter implements NovaDLProvider {
  name = 'tikhub';
  platform = 'tiktok';

  private readonly baseUrl = 'https://api.tikhub.io';

  async fetchVideo(inputUrl: string): Promise<NovaDLResult> {
    const apiKey = process.env.TIKHUB_API_KEY;
    const requestId = generateRequestId();

    if (!apiKey) {
      throw new NovaDLError(
        NovaDLErrorCode.PROVIDER_OFFLINE,
        'TIKHUB_API_KEY environment variable is required',
        this.platform,
        requestId,
        { provider: this.name }
      );
    }

    try {
      // TikHub API v3 endpoint — accepts share_url (full TikTok URL)
      // Old endpoint /api/v1/tiktok/web/fetch_one_video was removed by TikHub.
      const response = await fetch(
        `${this.baseUrl}/api/v1/tiktok/app/v3/fetch_one_video_by_share_url?share_url=${encodeURIComponent(inputUrl)}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(15000),
        }
      );

      if (!response.ok) {
        throw mapHttpError(response.status, this.platform, requestId, this.name);
      }

      const result = await response.json();

      // TikHub v3 response: { code, msg, data: { aweme_id, desc, author, video: { play_addr, ... }, statistics, cover, ... } }
      // result.data is the full aweme object. Do NOT use result.data.video —
      // that is only the nested video sub-object and loses desc/author/cover/statistics.
      const videoData: TikHubVideoData = result.data;

      if (!videoData) {
        throw new NovaDLError(
          NovaDLErrorCode.DOWNLOAD_FAILED,
          'No video data found in TikHub response',
          this.platform,
          requestId,
          { provider: this.name }
        );
      }

      return this.toNovaDLResult(videoData);
    } catch (error) {
      throw wrapProviderError(error, this.platform, requestId, this.name);
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const apiKey = process.env.TIKHUB_API_KEY;

    if (!apiKey) {
      return createOfflineHealth();
    }

    const start = Date.now();

    try {
      const response = await fetch(
        `${this.baseUrl}/api/v1/tiktok/app/v3/fetch_one_video_by_share_url?share_url=${encodeURIComponent('https://www.tiktok.com/@tiktok/video/7100000000000000000')}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        }
      );

      const latency = Date.now() - start;
      const isOk = response.ok || response.status === 404;

      return {
        status: isOk ? 'online' : 'degraded',
        latency,
        availability: isOk ? 1.0 : 0.0,
        version: undefined,
        lastCheck: new Date(),
        errorRate: isOk ? 0 : 1,
        successRate: isOk ? 1 : 0,
        retryCount: 0,
      };
    } catch {
      return {
        ...createOfflineHealth(),
        latency: Date.now() - start,
        lastCheck: new Date(),
      };
    }
  }

  supportedFormats(): string[] {
    return [
      NovaDLFormatType.VIDEO_NO_WATERMARK,
      NovaDLFormatType.VIDEO_WITH_WATERMARK,
      NovaDLFormatType.VIDEO_HD,
    ];
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsVideo: true,
      supportsAudio: true,
      supportsImages: true,
      supportsSlides: false,
      supportsStories: false,
      supportsReels: true,
      supportsShorts: true,
      supportsPlaylist: false,
      supportsLive: false,
      supportsCaptions: false,
      supportsMetadata: true,
    };
  }

  private toNovaDLResult(videoData: TikHubVideoData): NovaDLResult {
    const id = videoData.id || String(videoData.aweme_id || Date.now());
    const title = videoData.desc || videoData.title || 'TikTok Video';
    const author = videoData.author?.unique_id || videoData.author?.nickname || '@unknown';
    const authorAvatar = videoData.author?.avatar_larger?.url_list?.[0] || videoData.author?.avatar?.url_list?.[0] || '';
    const thumbnail = videoData.cover?.url_list?.[0] || videoData.origin_cover?.url_list?.[0] || '';
    const duration = videoData.video?.duration
      ? `${Math.floor(videoData.video.duration / 60)}:${String(Math.floor(videoData.video.duration % 60)).padStart(2, '0')}`
      : '0:00';

    const formats: NovaDLFormat[] = [];

    const noWatermarkUrl = videoData.video?.play_addr?.url_list?.[0] || videoData.video?.download_addr?.url_list?.[0] || '';
    if (noWatermarkUrl) {
      formats.push({
        type: NovaDLFormatType.VIDEO_NO_WATERMARK,
        url: noWatermarkUrl,
        quality: '1080p',
        extension: 'mp4',
        label: 'No Watermark HD',
      });
    }

    const withWatermarkUrl = videoData.video?.play_addr_265?.url_list?.[0] || videoData.video?.play_addr?.url_list?.[0] || '';
    if (withWatermarkUrl && withWatermarkUrl !== noWatermarkUrl) {
      formats.push({
        type: NovaDLFormatType.VIDEO_WITH_WATERMARK,
        url: withWatermarkUrl,
        quality: undefined,
        extension: 'mp4',
        label: 'With Watermark',
      });
    }

    const audio: NovaDLAudio[] = noWatermarkUrl ? [{
      url: noWatermarkUrl,
      format: 'mp3',
      extension: 'mp3',
      label: 'MP3 Audio',
    }] : [];

    const images: NovaDLImage[] = [];
    const coverUrl = videoData.cover?.url_list?.[0] || videoData.origin_cover?.url_list?.[0] || '';
    if (coverUrl) {
      images.push({ url: coverUrl, type: NovaDLImageType.COVER, extension: 'jpg', label: 'Cover Image' });
    }
    if (thumbnail && thumbnail !== coverUrl) {
      images.push({ url: thumbnail, type: NovaDLImageType.THUMBNAIL, extension: 'jpg', label: 'Thumbnail' });
    }

    const metadata: NovaDLMetadata = {
      videoId: id,
      views: videoData.statistics?.play_count ? formatCount(videoData.statistics.play_count) : undefined,
      likes: videoData.statistics?.digg_count ? formatCount(videoData.statistics.digg_count) : undefined,
      comments: videoData.statistics?.comment_count ? formatCount(videoData.statistics.comment_count) : undefined,
      shares: videoData.statistics?.share_count ? formatCount(videoData.statistics.share_count) : undefined,
    };

    return {
      success: true,
      message: `Successfully fetched TikTok video from ${this.name}`,
      platform: this.platform,
      title,
      author,
      authorAvatar,
      thumbnail,
      duration,
      formats,
      audio,
      images,
      metadata,
    };
  }
}
