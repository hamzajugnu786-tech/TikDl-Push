import { DownloadProvider, VideoMetadata } from './types';

export class TikHubProvider implements DownloadProvider {
  name = 'tikhub';

  private readonly baseUrl = 'https://api.tikhub.io';

  async fetchVideo(inputUrl: string): Promise<VideoMetadata> {
    const apiKey = process.env.TIKHUB_API_KEY;
    if (!apiKey) {
      throw new Error('TIKHUB_API_KEY environment variable is required for TikHub provider');
    }

    console.log(`[TikHub] Fetching: ${inputUrl}`);

    try {
      // TikHub API endpoint for fetching TikTok video info
      const response = await fetch(
        `${this.baseUrl}/api/v1/tiktok/web/fetch_one_video?url=${encodeURIComponent(inputUrl)}&web_request=0`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(15000),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[TikHub] HTTP ${response.status}: ${errorText}`);
        throw new Error(`TikHub API returned status ${response.status}`);
      }

      const result = await response.json();

      // TikHub returns data in nested structure
      const videoData = result.data?.video || result.data;

      if (!videoData) {
        throw new Error('No video data found in TikHub response');
      }

      // Extract video metadata from TikHub response
      const metadata: VideoMetadata = {
        id: videoData.id || String(videoData.aweme_id || Date.now()),
        title: videoData.desc || videoData.title || 'TikTok Video',
        author: videoData.author?.unique_id || videoData.author?.nickname || '@unknown',
        avatar: videoData.author?.avatar_larger?.url_list?.[0] || videoData.author?.avatar?.url_list?.[0] || '',
        thumbnail: videoData.cover?.url_list?.[0] || videoData.origin_cover?.url_list?.[0] || '',
        duration: videoData.video?.duration
          ? `${Math.floor(videoData.video.duration / 60)}:${String(Math.floor(videoData.video.duration % 60)).padStart(2, '0')}`
          : '0:00',
        views: videoData.statistics?.play_count
          ? formatCount(videoData.statistics.play_count)
          : undefined,
        likes: videoData.statistics?.digg_count
          ? formatCount(videoData.statistics.digg_count)
          : undefined,
        noWatermarkUrl: videoData.video?.play_addr?.url_list?.[0] || videoData.video?.download_addr?.url_list?.[0] || '',
        withWatermarkUrl: videoData.video?.play_addr_265?.url_list?.[0] || videoData.video?.play_addr?.url_list?.[0] || '',
        audioUrl: '', // TikHub doesn't always provide separate audio URL
        cover: videoData.cover?.url_list?.[0] || videoData.origin_cover?.url_list?.[0] || '',
      };

      // If no separate audio URL, use the video URL as fallback
      if (!metadata.audioUrl) {
        metadata.audioUrl = metadata.noWatermarkUrl;
      }

      console.log(`[TikHub] Successfully fetched video: ${metadata.id}`);
      return metadata;
    } catch (err) {
      console.error('[TikHub] Fetch error:', err);
      throw err instanceof Error ? err : new Error('TikHub fetch failed');
    }
  }
}

function formatCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return String(count);
}
