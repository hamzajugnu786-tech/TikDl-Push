import { DownloadProvider, VideoMetadata } from './types';

export class MockProvider implements DownloadProvider {
  name = 'mock';

  async fetchVideo(url: string): Promise<VideoMetadata> {
    console.log(`[MockProvider] Fetching video for: ${url}`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    return {
      id: Date.now().toString(),
      title: "Viral TikTok Video",
      author: "@creator",
      avatar: "https://picsum.photos/id/64/128/128",
      thumbnail: "https://picsum.photos/id/1015/720/1280",
      duration: "0:35",
      views: "1.2M",
      likes: "245K",
      noWatermarkUrl: "#demo-no-wm",
      withWatermarkUrl: "#demo-wm",
      audioUrl: "#demo-audio",
      cover: "https://picsum.photos/id/1015/720/1280",
    };
  }
}
