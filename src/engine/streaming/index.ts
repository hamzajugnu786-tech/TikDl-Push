/**
 * NovaDL Engine — Streaming Download Pipeline
 *
 * Barrel exports for the streaming download subsystem.
 */

// ─── Stream Downloader ──────────────────────────────────────────────
export { StreamDownloader, DownloadError, DownloadTimeoutError, NetworkError, DiskError } from './stream-downloader';

// ─── Download Queue ─────────────────────────────────────────────────
export { DownloadQueue } from './download-queue';

// ─── Download Manager ───────────────────────────────────────────────
export { DownloadManager } from './download-manager';

// ─── Types ───────────────────────────────────────────────────────────
export type {
  DownloadOptions,
  DownloadIncludeFlags,
  DownloadResult,
  DownloadedItemResult,
  DownloadCategory,
  DownloadProgress,
  DownloadStatus,
  DownloadJob,
  DownloadPriority,
  DownloadJobStatus,
  StreamDownloaderEvents,
  DownloadQueueEvents,
  DownloadManagerEvents,
  ChunkDownloadInfo,
  ResolvedMediaUrl,
} from './types';

export {
  DEFAULT_DOWNLOAD_INCLUDES,
  DEFAULT_CONCURRENCY,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_CHUNK_SIZE,
  TMP_EXTENSION,
  categoryFromMediaType,
  sanitizeFilename,
} from './types';
