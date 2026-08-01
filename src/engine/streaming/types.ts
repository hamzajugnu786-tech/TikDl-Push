/**
 * NovaDL Engine — Streaming Download Types
 *
 * Type definitions for the streaming download pipeline:
 * StreamDownloader, DownloadQueue, and DownloadManager.
 */

import type { MediaItem, SubtitleTrack, CoverImage, Thumbnail } from '../types/index';

// ─── Download Options ──────────────────────────────────────────────
export interface DownloadOptions {
  /** Base directory for saving downloaded files */
  outputPath: string;
  /** Custom filename override (without extension) */
  filename?: string;
  /** Overwrite existing files instead of skipping */
  overwrite?: boolean;
  /** Resume partially downloaded files using Range headers */
  resume?: boolean;
  /** Number of parallel chunks for large file downloads (0 = no chunking) */
  parallelChunks?: number;
  /** Timeout in milliseconds for each download request */
  timeoutMs?: number;
  /** Extra HTTP headers to send with download requests */
  headers?: Record<string, string>;
  /** Callback invoked with progress updates during download */
  onProgress?: (progress: DownloadProgress) => void;
  /** Which media categories to download */
  include?: DownloadIncludeFlags;
}

export interface DownloadIncludeFlags {
  video?: boolean;
  audio?: boolean;
  images?: boolean;
  thumbnails?: boolean;
  covers?: boolean;
  subtitles?: boolean;
  metadata?: boolean;
}

// ─── Download Result ────────────────────────────────────────────────
export interface DownloadResult {
  /** Whether the overall download succeeded */
  success: boolean;
  /** Path to the primary downloaded file */
  filePath: string;
  /** Total bytes written to disk */
  fileSize: number;
  /** Wall-clock time for the download in ms */
  durationMs: number;
  /** Error message if success is false */
  error?: string;
  /** All individual file results from a multi-item download */
  items?: DownloadedItemResult[];
}

export interface DownloadedItemResult {
  /** The media category this item belongs to */
  category: DownloadCategory;
  /** Local file path after download */
  filePath: string;
  /** Size in bytes */
  fileSize: number;
  /** Duration of the download in ms */
  durationMs: number;
  /** Whether this specific item succeeded */
  success: boolean;
  /** Error if the item failed */
  error?: string;
}

export type DownloadCategory =
  | 'video'
  | 'audio'
  | 'image'
  | 'thumbnail'
  | 'cover'
  | 'subtitle'
  | 'metadata';

// ─── Download Progress ──────────────────────────────────────────────
export interface DownloadProgress {
  /** Unique download identifier */
  downloadId: string;
  /** Source URL being downloaded */
  url: string;
  /** Bytes downloaded so far */
  bytesDownloaded: number;
  /** Total expected bytes (0 if unknown / chunked) */
  totalBytes: number;
  /** Completion percentage (0–100, NaN if total unknown) */
  percentage: number;
  /** Current download speed in bytes/sec */
  speed: number;
  /** Estimated time remaining in ms (Infinity if unknown) */
  etaMs: number;
  /** Current download status */
  status: DownloadStatus;
}

export type DownloadStatus =
  | 'pending'
  | 'connecting'
  | 'downloading'
  | 'paused'
  | 'resuming'
  | 'merging_chunks'
  | 'completed'
  | 'failed'
  | 'cancelled';

// ─── Download Job (for Queue) ──────────────────────────────────────
export interface DownloadJob {
  /** Unique job identifier */
  id: string;
  /** Source URL to download */
  url: string;
  /** Destination file path on disk */
  outputPath: string;
  /** Priority level for queue scheduling */
  priority: DownloadPriority;
  /** Current job status */
  status: DownloadJobStatus;
  /** Progress tracker for this job */
  progress: DownloadProgress;
  /** Final result (populated on completion) */
  result?: DownloadResult;
  /** Error message (populated on failure) */
  error?: string;
  /** Extra headers for this job */
  headers?: Record<string, string>;
  /** Timeout in ms */
  timeoutMs?: number;
  /** Whether to support resume */
  resume?: boolean;
  /** Number of parallel chunks */
  parallelChunks?: number;
  /** Whether to overwrite existing files */
  overwrite?: boolean;
  /** AbortController for cancellation support */
  abortController?: AbortController;
  /** When this job was started */
  startedAt?: Date;
  /** When this job completed */
  completedAt?: Date;
}

export type DownloadPriority = 'high' | 'normal' | 'low';

export type DownloadJobStatus =
  | 'queued'
  | 'active'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

// ─── Stream Downloader Events ───────────────────────────────────────
export interface StreamDownloaderEvents {
  'progress': DownloadProgress;
  'error': { downloadId: string; error: Error };
  'complete': { downloadId: string; filePath: string; fileSize: number };
}

// ─── Download Queue Events ──────────────────────────────────────────
export interface DownloadQueueEvents {
  'job:queued': { jobId: string; url: string; priority: DownloadPriority };
  'job:started': { jobId: string; url: string };
  'job:progress': { jobId: string; progress: DownloadProgress };
  'job:completed': { jobId: string; result: DownloadResult };
  'job:failed': { jobId: string; error: string };
  'job:cancelled': { jobId: string };
  'job:paused': { jobId: string };
  'job:resumed': { jobId: string };
  'queue:drain': void;
}

// ─── Download Manager Events ────────────────────────────────────────
export interface DownloadManagerEvents {
  'download:start': { extractionId: string; itemCount: number };
  'download:progress': { extractionId: string; progress: DownloadProgress };
  'download:item:complete': { extractionId: string; category: DownloadCategory; filePath: string };
  'download:item:fail': { extractionId: string; category: DownloadCategory; error: string };
  'download:complete': { extractionId: string; result: DownloadResult };
  'download:fail': { extractionId: string; error: string };
}

// ─── Chunk Download Info (for parallel chunks) ──────────────────────
export interface ChunkDownloadInfo {
  /** Chunk index (0-based) */
  index: number;
  /** Start byte offset */
  startByte: number;
  /** End byte offset (inclusive) */
  endByte: number;
  /** Temporary file path for this chunk */
  tmpPath: string;
  /** Whether this chunk completed successfully */
  completed: boolean;
  /** Size written to disk for this chunk */
  bytesWritten: number;
}

// ─── Media Item URL (resolved from ExtractionResult) ────────────────
export interface ResolvedMediaUrl {
  category: DownloadCategory;
  url: string;
  filename: string;
  headers?: Record<string, string>;
  size?: number;
  sourceItem: MediaItem | SubtitleTrack | CoverImage | Thumbnail;
}

// ─── Helpers ─────────────────────────────────────────────────────────
export const DEFAULT_DOWNLOAD_INCLUDES: DownloadIncludeFlags = {
  video: true,
  audio: true,
  images: true,
  thumbnails: false,
  covers: true,
  subtitles: true,
  metadata: true,
};

export const DEFAULT_CONCURRENCY = 4;
export const DEFAULT_TIMEOUT_MS = 30000;
export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk boundary
export const TMP_EXTENSION = '.tmp';

export function categoryFromMediaType(
  type: string,
): DownloadCategory {
  switch (type) {
    case 'video': return 'video';
    case 'audio': return 'audio';
    case 'image': return 'image';
    case 'subtitle': return 'subtitle';
    case 'metadata': return 'metadata';
    default: return 'image';
  }
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 200);
}
