/**
 * TikTok RapidAPI Adapter — Phase 1 (Hardened)
 *
 * Wraps the RapidAPI TikTok download logic into the NovaDLProvider interface.
 * Uses shared provider utilities (mapHttpError, createOfflineHealth, wrapProviderError)
 * to eliminate code duplication across adapters.
 */

import { NovaDLProvider, ProviderCapabilities, ProviderHealth } from '../../types';
import { NovaDLResult, NovaDLFormat, NovaDLAudio, NovaDLImage, NovaDLMetadata, NovaDLFormatType, NovaDLImageType } from '../../../types';
import { NovaDLError, NovaDLErrorCode, generateRequestId } from '../../../errors';
import { mapHttpError, createOfflineHealth, wrapProviderError } from '../../../provider-utils';
import { formatCount } from '@/lib/format';

/** TikTok-specific response structure from RapidAPI */
interface RapidAPIVideoData {
  id?: string;
  desc?: string;
  title?: string;
  author?: {
    unique_id?: string;
    nickname?: string;
    avatar_larger?: string;
    avatar?: string;
  };
  cover?: string;
  thumbnail?: string;
  duration?: string;
  play_count?: number;
  digg_count?: number;
  video?: {
    download_addr?: string;
    play_addr?: string;
  };
  download_url?: string;
  noWatermarkUrl?: string;
  withWatermarkUrl?: string;
  music?: { play_url?: string };
  audioUrl?: string;
}

export class TikTokRapidAPIAdapter implements NovaDLProvider {
  name = 'rapidapi';
  platform = 'tiktok';

  private readonly host = 'tiktok-info.p.rapidapi.com';

  async fetchVideo(inputUrl: string): Promise<NovaDLResult> {
    const apiKey = process.env.RAPIDAPI_KEY;
    const requestId = generateRequestId();

    if (!apiKey) {
      throw new NovaDLError(
        NovaDLErrorCode.PROVIDER_OFFLINE,
        'RAPIDAPI_KEY environment variable is required',
        this.platform,
        requestId,
        { provider: this.name }
      );
    }

    try {
      const response = await fetch(
        `https://${this.host}/?url=${encodeURIComponent(inputUrl)}`,
        {
          headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': this.host,
          },
          signal: AbortSignal.timeout(15000),
        }
      );

      if (!response.ok) {
        throw mapHttpError(response.status, this.platform, requestId, this.name);
      }

      const result = await response.json();
      const videoData: RapidAPIVideoData = result.videoData || result.data || result;

      return this.toNovaDLResult(videoData);
    } catch (error) {
      throw wrapProviderError(error, this.platform, requestId, this.name);
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const apiKey = process.env.RAPIDAPI_KEY;

    if (!apiKey) {
      return createOfflineHealth();
    }

    const start = Date.now();

    try {
      const response = await fetch(
        `https://${this.host}/?url=https://www.tiktok.com/@tiktok/video/7100000000000000000`,
        {
          headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': this.host,
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

  private toNovaDLResult(videoData: RapidAPIVideoData): NovaDLResult {
    const id = videoData.id || String(Date.now());
    const title = videoData.desc || videoData.title || 'TikTok Video';
    const author = videoData.author?.unique_id || videoData.author?.nickname || '@unknown';
    const authorAvatar = videoData.author?.avatar_larger || videoData.author?.avatar || '';
    const thumbnail = videoData.cover || videoData.thumbnail || '';
    const duration = videoData.duration || '0:00';

    const formats: NovaDLFormat[] = [];

    const noWatermarkUrl = videoData.video?.download_addr || videoData.download_url || videoData.noWatermarkUrl || '';
    if (noWatermarkUrl) {
      formats.push({
        type: NovaDLFormatType.VIDEO_NO_WATERMARK,
        url: noWatermarkUrl,
        quality: '1080p',
        extension: 'mp4',
        label: 'No Watermark HD',
      });
    }

    const withWatermarkUrl = videoData.video?.play_addr || videoData.withWatermarkUrl || '';
    if (withWatermarkUrl && withWatermarkUrl !== noWatermarkUrl) {
      formats.push({
        type: NovaDLFormatType.VIDEO_WITH_WATERMARK,
        url: withWatermarkUrl,
        quality: undefined,
        extension: 'mp4',
        label: 'With Watermark',
      });
    }

    const audioUrl = videoData.music?.play_url || videoData.audioUrl || '';
    const audio: NovaDLAudio[] = audioUrl ? [{
      url: audioUrl,
      format: 'mp3',
      extension: 'mp3',
      label: 'MP3 Audio',
    }] : [];

    const images: NovaDLImage[] = [];
    const coverUrl = videoData.cover || videoData.thumbnail || '';
    if (coverUrl) {
      images.push({ url: coverUrl, type: NovaDLImageType.COVER, extension: 'jpg', label: 'Cover Image' });
    }
    if (thumbnail && thumbnail !== coverUrl) {
      images.push({ url: thumbnail, type: NovaDLImageType.THUMBNAIL, extension: 'jpg', label: 'Thumbnail' });
    }

    const metadata: NovaDLMetadata = {
      videoId: id,
      views: videoData.play_count ? formatCount(videoData.play_count) : undefined,
      likes: videoData.digg_count ? formatCount(videoData.digg_count) : undefined,
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
