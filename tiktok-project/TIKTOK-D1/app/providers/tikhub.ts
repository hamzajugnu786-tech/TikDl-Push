import { DownloadProvider, VideoMetadata } from './types';

export class TikHubProvider implements DownloadProvider {
  name = 'tikhub';

  private readonly baseUrl = 'https://api.tikhub.io'; // Adjust per actual endpoint

  async fetchVideo(inputUrl: string): Promise<VideoMetadata> {
    const apiKey = process.env.TIKTOK_API_KEY;
    if (!apiKey) {
      throw new Error('TIKTOK_API_KEY environment variable is required for TikHub provider');
    }

    console.log(`[TikHub] Fetching: ${inputUrl}`);

    // Production implementation placeholder - replace with actual fetch when key provided
    // Example:
    // const response = await fetch(`${this.baseUrl}/api/v1/...`, {
    //   headers: { Authorization: `Bearer ${apiKey}` },
    //   ...
    // });

    // For now, fallback simulation with normalized error handling
    await new Promise(r => setTimeout(r, 600));

    if (inputUrl.includes('private')) {
      throw new Error('PRIVATE_VIDEO');
    }
    if (inputUrl.includes('deleted')) {
      throw new Error('DELETED_VIDEO');
    }

    return {
      id: 'tikhub_' + Date.now(),
      title: 'TikHub Fetched Video',
      author: '@tikhub_user',
      avatar: 'https://picsum.photos/id/64/128/128',
      thumbnail: 'https://picsum.photos/id/1015/720/1280',
      duration: '0:45',
      views: '3.1M',
      likes: '421K',
      noWatermarkUrl: 'https://example.com/no-wm.mp4',
      withWatermarkUrl: 'https://example.com/wm.mp4',
      audioUrl: 'https://example.com/audio.mp3',
      cover: 'https://picsum.photos/id/1015/720/1280',
    };
  }
}
