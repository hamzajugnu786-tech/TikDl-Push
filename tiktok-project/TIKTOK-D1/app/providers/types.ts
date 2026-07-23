export interface VideoMetadata {
  id: string;
  title: string;
  author: string;
  avatar?: string;
  thumbnail: string;
  duration: string;
  views?: string;
  likes?: string;
  noWatermarkUrl: string;
  withWatermarkUrl?: string;
  audioUrl?: string;
  cover: string;
}

export interface DownloadProvider {
  name: string;
  fetchVideo(url: string): Promise<VideoMetadata>;
}
