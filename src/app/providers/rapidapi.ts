import { DownloadProvider, VideoMetadata } from './types';

export class RapidAPIProvider implements DownloadProvider {
  name = 'rapidapi';

  private readonly host = 'tiktok-info.p.rapidapi.com';

  async fetchVideo(inputUrl: string): Promise<VideoMetadata> {
    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey) {
      throw new Error('RAPIDAPI_KEY environment variable is required');
    }

    console.log(`[RapidAPI] Fetching: ${inputUrl}`);

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
        const errorText = await response.text();
        console.error(`[RapidAPI] HTTP ${response.status}: ${errorText}`);
        throw new Error(`RapidAPI returned status ${response.status}`);
      }

      const result = await response.json();

      const videoData = result.videoData || result.data || result;

      const metadata: VideoMetadata = {
        id: videoData.id || String(Date.now()),
        title: videoData.desc || videoData.title || 'TikTok Video',
        author: videoData.author?.unique_id || videoData.author?.nickname || '@unknown',
        avatar: videoData.author?.avatar_larger || videoData.author?.avatar || '',
        thumbnail: videoData.cover || videoData.thumbnail || '',
        duration: videoData.duration || '0:00',
        views: videoData.play_count ? formatCount(videoData.play_count) : undefined,
        likes: videoData.digg_count ? formatCount(videoData.digg_count) : undefined,
        noWatermarkUrl: videoData.video?.download_addr || videoData.download_url || videoData.noWatermarkUrl || '',
        withWatermarkUrl: videoData.video?.play_addr || videoData.withWatermarkUrl || '',
        audioUrl: videoData.music?.play_url || videoData.audioUrl || '',
        cover: videoData.cover || videoData.thumbnail || '',
      };

      if (!metadata.noWatermarkUrl) {
        throw new Error('No download URL found in RapidAPI response');
      }

      console.log(`[RapidAPI] Successfully fetched video: ${metadata.id}`);
      return metadata;
    } catch (err) {
      console.error('[RapidAPI] Fetch error:', err);
      throw err instanceof Error ? err : new Error('RapidAPI fetch failed');
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
