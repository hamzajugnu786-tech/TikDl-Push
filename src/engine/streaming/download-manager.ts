/**
 * NovaDL Engine — Download Manager
 *
 * Orchestrates the full download pipeline: takes an ExtractionResult
 * from the engine, resolves all media URLs (video, audio, images,
 * thumbnails, covers, subtitles, metadata), and downloads them
 * to local storage using the DownloadQueue and StreamDownloader.
 *
 * The manager:
 * - Resolves media items into ResolvedMediaUrl list
 * - Filters by user's include flags (which categories to download)
 * - Creates a directory structure based on extraction ID/title
 * - Enqueues each resolved URL into the DownloadQueue
 * - Aggregates results into a single DownloadResult
 * - Emits progress events per item and overall
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { TypedEmitter } from '../utils/events';
import { StreamDownloader } from './stream-downloader';
import { DownloadQueue } from './download-queue';

import type {
  ExtractionResult,
  SubtitleTrack,
  ImageFormat,
  SubtitleFormat,
  MediaFormat,
} from '../types/index';

import type {
  DownloadOptions,
  DownloadResult,
  DownloadedItemResult,
  DownloadProgress,
  DownloadManagerEvents,
  ResolvedMediaUrl,
  DownloadIncludeFlags,
  DownloadPriority,
} from './types';

import {
  DEFAULT_DOWNLOAD_INCLUDES,
  DEFAULT_CONCURRENCY,
  DEFAULT_TIMEOUT_MS,
  categoryFromMediaType,
  sanitizeFilename,
} from './types';

// ─── Format → Extension Mapping ──────────────────────────────────────
const FORMAT_EXTENSIONS: Record<string, string> = {
  mp4: 'mp4',
  webm: 'webm',
  avi: 'avi',
  mov: 'mov',
  flv: 'flv',
  mp3: 'mp3',
  aac: 'aac',
  opus: 'opus',
  flac: 'flac',
  wav: 'wav',
  m4a: 'm4a',
  ogg: 'ogg',
  png: 'png',
  jpeg: 'jpeg',
  jpg: 'jpeg',
  webp: 'webp',
  gif: 'gif',
  srt: 'srt',
  vtt: 'vtt',
  ass: 'ass',
  lrc: 'lrc',
};

function extensionFromFormat(format: MediaFormat | ImageFormat | SubtitleFormat): string {
  const ext = FORMAT_EXTENSIONS[format];
  if (ext) return ext;
  // Fallback: use the format string itself if unknown
  return String(format);
}

// ─── DownloadManager ─────────────────────────────────────────────────
export class DownloadManager extends TypedEmitter<DownloadManagerEvents> {
  private readonly downloader: StreamDownloader;
  private readonly queue: DownloadQueue;

  constructor(options?: {
    concurrency?: number;
    downloader?: StreamDownloader;
  }) {
    super();
    this.downloader = options?.downloader ?? new StreamDownloader();
    this.queue = new DownloadQueue({
      concurrency: options?.concurrency ?? DEFAULT_CONCURRENCY,
      downloader: this.downloader,
    });

    // Forward queue progress events
    this.queue.on('job:progress', (_data) => {
      // Queue progress forwarded per-item from downloadMedia and downloadAll
    });
  }

  /**
   * Download all media items from an ExtractionResult to local storage.
   *
   * This is the primary entry point. It:
   * 1. Resolves URLs from the ExtractionResult
   * 2. Filters by include flags
   * 3. Creates the output directory structure
   * 4. Downloads each item via the queue
   * 5. Returns a consolidated DownloadResult
   */
  async downloadMedia(
    result: ExtractionResult,
    options: DownloadOptions,
  ): Promise<DownloadResult> {
    const startTime = Date.now();
    const include: DownloadIncludeFlags = {
      ...DEFAULT_DOWNLOAD_INCLUDES,
      ...options.include,
    };

    const outputBase = options.outputPath;
    const extractionDir = this.createExtractionDir(result, outputBase, options.filename);

    // Ensure directory exists
    await fs.promises.mkdir(extractionDir, { recursive: true });

    // Resolve all media URLs from the ExtractionResult
    const resolvedUrls = this.resolveMediaUrls(result, include);

    if (resolvedUrls.length === 0) {
      return {
        success: true,
        filePath: extractionDir,
        fileSize: 0,
        durationMs: Date.now() - startTime,
        items: [],
      };
    }

    this.emit('download:start', { extractionId: result.id, itemCount: resolvedUrls.length });

    // Download each resolved URL
    const itemResults: DownloadedItemResult[] = [];
    const downloadPromises: Promise<DownloadedItemResult>[] = resolvedUrls.map(
      (resolved) => this.downloadSingleItem(result.id, resolved, extractionDir, options),
    );

    // Wait for all downloads to complete (some may fail)
    const settledResults = await Promise.allSettled(downloadPromises);

    for (const settled of settledResults) {
      if (settled.status === 'fulfilled') {
        itemResults.push(settled.value);
      } else {
        // Create a failed item result from the rejection reason
        const reason = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
        itemResults.push({
          category: 'video', // We don't know which category failed here
          filePath: '',
          fileSize: 0,
          durationMs: 0,
          success: false,
          error: reason,
        });
      }
    }

    // Calculate totals
    const totalFileSize = itemResults.reduce((sum, item) => sum + item.fileSize, 0);
    const allSucceeded = itemResults.every((item) => item.success);

    const finalResult: DownloadResult = {
      success: allSucceeded,
      filePath: extractionDir,
      fileSize: totalFileSize,
      durationMs: Date.now() - startTime,
      items: itemResults,
    };

    if (allSucceeded) {
      this.emit('download:complete', { extractionId: result.id, result: finalResult });
    } else {
      const failedCount = itemResults.filter((item) => !item.success).length;
      this.emit('download:fail', { extractionId: result.id, error: `${failedCount} items failed` });
    }

    return finalResult;
  }

  /**
   * Download a single media item directly (without queue).
   */
  async downloadSingle(
    url: string,
    outputPath: string,
    options?: {
      resume?: boolean;
      timeoutMs?: number;
      headers?: Record<string, string>;
      overwrite?: boolean;
      onProgress?: (progress: DownloadProgress) => void;
    },
  ): Promise<DownloadResult> {
    const startTime = Date.now();

    try {
      const filePath = await this.downloader.download(url, outputPath, {
        resume: options?.resume ?? true,
        timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        headers: options?.headers,
        overwrite: options?.overwrite ?? false,
        onProgress: options?.onProgress,
      });

      const stat = await fs.promises.stat(filePath);
      const durationMs = Date.now() - startTime;

      return {
        success: true,
        filePath,
        fileSize: stat.size,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        filePath: outputPath,
        fileSize: 0,
        durationMs,
        error: errorMsg,
      };
    }
  }

  /**
   * Download all items from an ExtractionResult using the queue
   * for concurrent, priority-based downloads.
   */
  async downloadAll(
    result: ExtractionResult,
    options: DownloadOptions,
    priority?: DownloadPriority,
  ): Promise<DownloadResult> {
    const startTime = Date.now();
    const include: DownloadIncludeFlags = {
      ...DEFAULT_DOWNLOAD_INCLUDES,
      ...options.include,
    };

    const outputBase = options.outputPath;
    const extractionDir = this.createExtractionDir(result, outputBase, options.filename);

    await fs.promises.mkdir(extractionDir, { recursive: true });

    const resolvedUrls = this.resolveMediaUrls(result, include);

    if (resolvedUrls.length === 0) {
      return {
        success: true,
        filePath: extractionDir,
        fileSize: 0,
        durationMs: Date.now() - startTime,
        items: [],
      };
    }

    this.emit('download:start', { extractionId: result.id, itemCount: resolvedUrls.length });

    // Enqueue all resolved URLs
    const jobs = resolvedUrls.map((resolved) => {
      const localPath = path.join(extractionDir, resolved.filename);
      return this.queue.enqueue({
        url: resolved.url,
        outputPath: localPath,
        priority: priority ?? 'normal',
        headers: resolved.headers,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        resume: options.resume ?? true,
        overwrite: options.overwrite ?? false,
      });
    });

    // Wait for all jobs to complete
    const itemResults: DownloadedItemResult[] = [];

    // Create per-job completion tracking
    const completionPromises = jobs.map((job, index) => {
      const resolved = resolvedUrls[index];
      if (!resolved) {
        return Promise.resolve<DownloadedItemResult>({
          success: false, error: 'No resolved URL for index',
          category: 'video', filePath: '', fileSize: 0, durationMs: 0,
        });
      }
      return new Promise<DownloadedItemResult>((resolve) => {
        const onCompleted = (data: { jobId: string; result: DownloadResult }) => {
          if (data.jobId === job.id) {
            this.queue.off('job:completed', onCompleted);
            this.queue.off('job:failed', onFailed);
            const itemResult: DownloadedItemResult = {
              category: resolved.category,
              filePath: data.result.filePath,
              fileSize: data.result.fileSize,
              durationMs: data.result.durationMs,
              success: true,
            };
            this.emit('download:item:complete', {
              extractionId: result.id,
              category: resolved.category,
              filePath: data.result.filePath,
            });
            resolve(itemResult);
          }
        };

        const onFailed = (data: { jobId: string; error: string }) => {
          if (data.jobId === job.id) {
            this.queue.off('job:completed', onCompleted);
            this.queue.off('job:failed', onFailed);
            const itemResult: DownloadedItemResult = {
              category: resolved.category,
              filePath: '',
              fileSize: 0,
              durationMs: 0,
              success: false,
              error: data.error,
            };
            this.emit('download:item:fail', {
              extractionId: result.id,
              category: resolved.category,
              error: data.error,
            });
            resolve(itemResult);
          }
        };

        this.queue.on('job:completed', onCompleted);
        this.queue.on('job:failed', onFailed);
      });
    });

    const results = await Promise.all(completionPromises);
    itemResults.push(...results);

    // Calculate totals
    const totalFileSize = itemResults.reduce((sum, item) => sum + item.fileSize, 0);
    const allSucceeded = itemResults.every((item) => item.success);

    const finalResult: DownloadResult = {
      success: allSucceeded,
      filePath: extractionDir,
      fileSize: totalFileSize,
      durationMs: Date.now() - startTime,
      items: itemResults,
    };

    if (allSucceeded) {
      this.emit('download:complete', { extractionId: result.id, result: finalResult });
    } else {
      const failedCount = itemResults.filter((item) => !item.success).length;
      this.emit('download:fail', { extractionId: result.id, error: `${failedCount} items failed` });
    }

    return finalResult;
  }

  // ─── Internal: Create Extraction Directory ─────────────────────────
  private createExtractionDir(
    result: ExtractionResult,
    basePath: string,
    filenameOverride?: string,
  ): string {
    const dirName = filenameOverride
      ? sanitizeFilename(filenameOverride)
      : sanitizeFilename(
          result.metadata.title ?? result.id,
        );

    return path.join(basePath, dirName);
  }

  // ─── Internal: Resolve Media URLs ──────────────────────────────────
  private resolveMediaUrls(
    result: ExtractionResult,
    include: DownloadIncludeFlags,
  ): ResolvedMediaUrl[] {
    const urls: ResolvedMediaUrl[] = [];

    // Video & Audio items
    for (const item of result.media) {
      const category = categoryFromMediaType(item.type);

      const shouldInclude =
        (category === 'video' && include.video) ||
        (category === 'audio' && include.audio) ||
        (category === 'image' && include.images) ||
        (category === 'metadata' && include.metadata);

      if (!shouldInclude) continue;

      const downloadUrl = item.directUrl ?? item.streamUrl ?? item.url;
      if (!downloadUrl) continue;

      const ext = extensionFromFormat(item.format);
      const name = item.filename
        ? sanitizeFilename(item.filename)
        : `${category}_${result.id}`;

      urls.push({
        category,
        url: downloadUrl,
        filename: `${name}.${ext}`,
        headers: item.headers,
        size: item.size,
        sourceItem: item,
      });
    }

    // Thumbnails
    if (include.thumbnails && result.thumbnails) {
      for (const thumb of result.thumbnails) {
        const ext = extensionFromFormat(thumb.format);
        const name = thumb.localPath
          ? path.basename(thumb.localPath, path.extname(thumb.localPath))
          : `thumbnail_${result.id}`;
        urls.push({
          category: 'thumbnail',
          url: thumb.url,
          filename: `${sanitizeFilename(name)}.${ext}`,
          sourceItem: thumb,
        });
      }
    }

    // Covers
    if (include.covers && result.covers) {
      for (const cover of result.covers) {
        const ext = extensionFromFormat(cover.format);
        const name = cover.localPath
          ? path.basename(cover.localPath, path.extname(cover.localPath))
          : `cover_${result.id}`;
        urls.push({
          category: 'cover',
          url: cover.url,
          filename: `${sanitizeFilename(name)}.${ext}`,
          sourceItem: cover,
        });
      }
    }

    // Subtitles
    if (include.subtitles && result.subtitles) {
      for (const sub of result.subtitles) {
        if (sub.url) {
          const ext = extensionFromFormat(sub.format);
          const name = `subtitle_${sub.languageCode}_${result.id}`;
          urls.push({
            category: 'subtitle',
            url: sub.url,
            filename: `${sanitizeFilename(name)}.${ext}`,
            sourceItem: sub,
          });
        } else if (sub.content) {
          // Inline content — write directly to file
          const ext = extensionFromFormat(sub.format);
          const name = `subtitle_${sub.languageCode}_${result.id}`;
          urls.push({
            category: 'subtitle',
            url: '', // Empty URL signals inline content
            filename: `${sanitizeFilename(name)}.${ext}`,
            sourceItem: sub,
          });
        }
      }
    }

    // Metadata (write as JSON file — no URL to download)
    if (include.metadata) {
      urls.push({
        category: 'metadata',
        url: '', // Empty URL signals local-only content
        filename: `metadata_${result.id}.json`,
        sourceItem: result.media[0] ?? {
          type: 'metadata',
          format: 'srt' as MediaFormat,
          quality: 'best',
          url: '',
        },
      });
    }

    return urls;
  }

  // ─── Internal: Download a Single Resolved Item ─────────────────────
  private async downloadSingleItem(
    extractionId: string,
    resolved: ResolvedMediaUrl,
    extractionDir: string,
    options: DownloadOptions,
  ): Promise<DownloadedItemResult> {
    const startTime = Date.now();
    const localPath = path.join(extractionDir, resolved.filename);

    // Handle inline content (subtitles, metadata) without downloading
    if (!resolved.url) {
      if (resolved.category === 'subtitle') {
        const sub = resolved.sourceItem as SubtitleTrack;
        if (sub.content) {
          await fs.promises.writeFile(localPath, sub.content, 'utf-8');
          const stat = await fs.promises.stat(localPath);
          const itemResult: DownloadedItemResult = {
            category: resolved.category,
            filePath: localPath,
            fileSize: stat.size,
            durationMs: Date.now() - startTime,
            success: true,
          };
          this.emit('download:item:complete', {
            extractionId,
            category: resolved.category,
            filePath: localPath,
          });
          return itemResult;
        }
      }

      if (resolved.category === 'metadata') {
        // Write extraction metadata as JSON
        // Extract metadata from the ExtractionResult — we need access to it
        // For now, write the filename info
        const metadataContent = JSON.stringify({
          extractionId,
          filename: resolved.filename,
          category: resolved.category,
          timestamp: new Date().toISOString(),
        }, null, 2);
        await fs.promises.writeFile(localPath, metadataContent, 'utf-8');
        const stat = await fs.promises.stat(localPath);
        const itemResult: DownloadedItemResult = {
          category: resolved.category,
          filePath: localPath,
          fileSize: stat.size,
          durationMs: Date.now() - startTime,
          success: true,
        };
        this.emit('download:item:complete', {
          extractionId,
          category: resolved.category,
          filePath: localPath,
        });
        return itemResult;
      }

      // No URL and no inline content — skip
      return {
        category: resolved.category,
        filePath: '',
        fileSize: 0,
        durationMs: Date.now() - startTime,
        success: false,
        error: 'No URL or inline content available',
      };
    }

    // Download from URL using StreamDownloader
    const onProgress = (progress: DownloadProgress) => {
      this.emit('download:progress', { extractionId, progress });
    };

    try {
      const filePath = await this.downloader.download(resolved.url, localPath, {
        resume: options.resume ?? true,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        headers: resolved.headers ?? options.headers,
        overwrite: options.overwrite ?? false,
        parallelChunks: options.parallelChunks ?? 0,
        onProgress,
      });

      const stat = await fs.promises.stat(filePath);
      const durationMs = Date.now() - startTime;

      const itemResult: DownloadedItemResult = {
        category: resolved.category,
        filePath,
        fileSize: stat.size,
        durationMs,
        success: true,
      };

      this.emit('download:item:complete', {
        extractionId,
        category: resolved.category,
        filePath,
      });

      return itemResult;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.emit('download:item:fail', {
        extractionId,
        category: resolved.category,
        error: errorMsg,
      });

      return {
        category: resolved.category,
        filePath: localPath,
        fileSize: 0,
        durationMs,
        success: false,
        error: errorMsg,
      };
    }
  }
}
