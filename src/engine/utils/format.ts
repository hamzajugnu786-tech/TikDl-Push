/**
 * NovaDL Engine — Format Conversion Utilities
 */

import type { MediaFormat, VideoQuality, AudioQuality, Resolution } from '../types/index';

/** Convert a resolution string (e.g., "1920x1080") to a Resolution object */
export function parseResolution(resolution: string): Resolution | undefined {
  const match = resolution.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (match && match[1] && match[2]) {
    return { width: parseInt(match[1]), height: parseInt(match[2]) };
  }
  return undefined;
}

/** Convert a Resolution to a human-readable string */
export function formatResolution(resolution: Resolution): string {
  return `${resolution.width}x${resolution.height}`;
}

/** Convert a height in pixels to a VideoQuality label */
export function heightToQuality(height: number): VideoQuality {
  if (height >= 2160) return '2160p';
  if (height >= 1440) return '1440p';
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  if (height >= 480) return '480p';
  if (height >= 360) return '360p';
  if (height >= 240) return '240p';
  return `${height}p`;
}

/** Convert a VideoQuality label to an approximate height in pixels */
export function qualityToHeight(quality: VideoQuality): number {
  const map: Record<string, number> = {
    '2160p': 2160, '1440p': 1440, '1080p': 1080,
    '720p': 720, '480p': 480, '360p': 360, '240p': 240,
  };
  return map[quality] ?? 0;
}

/** Convert an audio bitrate to an AudioQuality label */
export function bitrateToAudioQuality(bitrate: number): AudioQuality {
  if (bitrate >= 320) return '320kbps';
  if (bitrate >= 256) return '256kbps';
  if (bitrate >= 192) return '192kbps';
  if (bitrate >= 128) return '128kbps';
  if (bitrate >= 96) return '96kbps';
  return '64kbps';
}

/** Sort qualities from highest to lowest */
export function sortQualitiesByResolution(qualities: VideoQuality[]): VideoQuality[] {
  return [...qualities].sort((a, b) => qualityToHeight(b) - qualityToHeight(a));
}

/** Check if a format is a video format */
export function isVideoFormat(format: MediaFormat): boolean {
  return ['mp4', 'webm', 'avi', 'mov', 'flv'].includes(format);
}

/** Check if a format is an audio format */
export function isAudioFormat(format: MediaFormat): boolean {
  return ['mp3', 'aac', 'opus', 'flac', 'wav', 'm4a', 'ogg'].includes(format);
}

/** Check if a format is an image format */
export function isImageFormat(format: MediaFormat): boolean {
  return ['png', 'jpeg', 'webp', 'gif'].includes(format);
}

/** Format a file size in bytes to a human-readable string */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/** Format duration in seconds to a human-readable string */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
