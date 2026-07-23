import { DownloadProvider, VideoMetadata } from './types';

export class RapidAPIProvider implements DownloadProvider {
  name = 'rapidapi';

  async fetchVideo(inputUrl: string): Promise<VideoMetadata> {
    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey) {
      throw new Error('RAPIDAPI_KEY environment variable is required');
    }

    console.log(`[RapidAPI] Fetching: ${inputUrl}`);

    // Placeholder - full implementation when key provided
    await new Promise(r => setTimeout(r, 700));

    // Error normalization examples
    if (!inputUrl.includes('tiktok')) {
      throw new Error('INVALID_URL');
    }

    return {
      id: 'rapid_' + Date.now(),
      title: 'RapidAPI Video Example',
      author: '@rapid_user',
      avatar: 'https://picsum.photos/id/64/128/128',
      thumbnail: 'https://picsum.photos/id/1015/720/1280',
      duration: '0:38',
      views: '4.8M',
      likes: '672K',
      noWatermarkUrl: 'https://example.com/rapid-no-wm.mp4',
      withWatermarkUrl: 'https://example.com/rapid-wm.mp4',
      audioUrl: 'https://example.com/rapid-audio.mp3',
      cover: 'https://picsum.photos/id/1015/720/1280',
    };
  }
}
