/**
 * NovaDL Engine — Stream Downloader
 *
 * Core streaming download engine implementing:
 * - Streaming mode (pipe response → file via Node streams)
 * - Resume support (Range header continuation)
 * - Chunked transfer (read/write chunks with progress)
 * - Parallel chunk downloads (split large files, merge after)
 * - Temporary storage (.tmp → rename on completion)
 * - Automatic cleanup (delete .tmp on failure/timeout)
 * - Progress tracking (emit events with bytes/percentage/speed/ETA)
 *
 * Uses native Node.js http/https modules and node:stream.
 * Supports both HTTP and HTTPS URLs with redirect chain handling.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import * as https from 'node:https';
import { Transform } from 'node:stream';
import type { TransformCallback, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { TypedEmitter } from '../utils/events';
import { v4 as uuid } from 'uuid';

import type {
  DownloadProgress,
  StreamDownloaderEvents,
  ChunkDownloadInfo,
} from './types';

import {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_CHUNK_SIZE,
  TMP_EXTENSION,
} from './types';

// ─── Errors ──────────────────────────────────────────────────────────
export class DownloadError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly url?: string,
  ) {
    super(message);
    this.name = 'DownloadError';
  }
}

export class DownloadTimeoutError extends DownloadError {
  constructor(url: string, timeoutMs: number) {
    super(`Download timed out after ${timeoutMs}ms`, 'TIMEOUT', url);
    this.name = 'DownloadTimeoutError';
  }
}

export class NetworkError extends DownloadError {
  constructor(message: string, url: string) {
    super(message, 'NETWORK', url);
    this.name = 'NetworkError';
  }
}

export class DiskError extends DownloadError {
  constructor(message: string, _filePath: string) {
    super(message, 'DISK');
    this.name = 'DiskError';
  }
}

// ─── HTTP Request Options ────────────────────────────────────────────
interface HttpRequestOptions {
  method: string;
  headers: Record<string, string>;
  timeout: number;
  maxRedirects: number;
}

const DEFAULT_MAX_REDIRECTS = 10;

// ─── Response Metadata ──────────────────────────────────────────────
interface ResponseMeta {
  statusCode: number;
  totalSize: number;
  supportsRange: boolean;
  redirectUrl?: string;
}

// ─── Progress Transform Stream ───────────────────────────────────────
class ProgressTransform extends Transform {
  private bytesSoFar: number;
  private lastTime: number;
  private lastBytes: number;
  private speedSamples: number[];
  private readonly maxSpeedSamples: number = 10;
  private readonly totalBytes: number;
  private readonly onProgress?: (progress: DownloadProgress) => void;
  private readonly emitter: StreamDownloader;
  private readonly progressRef: DownloadProgress;

  constructor(
    opts: {
      downloadId: string;
      url: string;
      totalBytes: number;
      startByte: number;
      onProgress?: (progress: DownloadProgress) => void;
      emitter: StreamDownloader;
      progressRef: DownloadProgress;
    },
  ) {
    super();
    this.totalBytes = opts.totalBytes;
    this.bytesSoFar = opts.startByte;
    this.lastTime = Date.now();
    this.lastBytes = opts.startByte;
    this.speedSamples = [];
    this.onProgress = opts.onProgress;
    this.emitter = opts.emitter;
    this.progressRef = opts.progressRef;
  }

  _transform(chunk: Buffer | string, encoding: BufferEncoding, callback: TransformCallback): void {
    const byteLength = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
    this.bytesSoFar += byteLength;

    // Calculate speed every ~500ms or 64KB
    const now = Date.now();
    const elapsedMs = now - this.lastTime;

    if (elapsedMs >= 500 || byteLength >= 65536) {
      const bytesDelta = this.bytesSoFar - this.lastBytes;
      const secondsElapsed = elapsedMs / 1000;
      const currentSpeed = secondsElapsed > 0 ? bytesDelta / secondsElapsed : 0;

      this.speedSamples.push(currentSpeed);
      if (this.speedSamples.length > this.maxSpeedSamples) {
        this.speedSamples.shift();
      }

      // Smoothed average speed
      const avgSpeed = this.speedSamples.length > 0
        ? this.speedSamples.reduce((a, b) => a + b, 0) / this.speedSamples.length
        : 0;

      // Update progress reference
      this.progressRef.bytesDownloaded = this.bytesSoFar;
      this.progressRef.totalBytes = this.totalBytes;
      this.progressRef.percentage = this.totalBytes > 0
        ? (this.bytesSoFar / this.totalBytes) * 100
        : 0;
      this.progressRef.speed = avgSpeed;
      this.progressRef.etaMs = avgSpeed > 0 && this.totalBytes > 0
        ? ((this.totalBytes - this.bytesSoFar) / avgSpeed) * 1000
        : Infinity;
      this.progressRef.status = 'downloading';

      // Emit
      this.emitter.emitProgress(this.progressRef, this.onProgress);

      this.lastTime = now;
      this.lastBytes = this.bytesSoFar;
    }

    this.push(chunk, encoding);
    callback();
  }

  _flush(callback: TransformCallback): void {
    // Final progress update
    this.progressRef.bytesDownloaded = this.bytesSoFar;
    this.progressRef.percentage = this.totalBytes > 0
      ? (this.bytesSoFar / this.totalBytes) * 100
      : 100;
    this.progressRef.status = 'completed';
    this.emitter.emitProgress(this.progressRef, this.onProgress);
    callback();
  }
}

// ─── StreamDownloader ────────────────────────────────────────────────
export class StreamDownloader extends TypedEmitter<StreamDownloaderEvents> {
  private readonly activeDownloads: Map<string, AbortController> = new Map();
  private readonly progressMap: Map<string, DownloadProgress> = new Map();

  /**
   * Download a file from url to outputPath using streaming.
   * Writes to a .tmp file first, then renames on completion.
   * If resume=true and a .tmp file exists, resumes from the
   * existing byte offset using HTTP Range headers.
   */
  async download(
    url: string,
    outputPath: string,
    options?: {
      resume?: boolean;
      parallelChunks?: number;
      timeoutMs?: number;
      headers?: Record<string, string>;
      overwrite?: boolean;
      onProgress?: (progress: DownloadProgress) => void;
      abortSignal?: AbortSignal;
    },
  ): Promise<string> {
    const downloadId = uuid();
    const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const resume = options?.resume ?? true;
    const overwrite = options?.overwrite ?? false;
    const parallelChunks = options?.parallelChunks ?? 0;
    const extraHeaders = options?.headers ?? {};
    const onProgress = options?.onProgress;
    const abortSignal = options?.abortSignal;

    // Set up AbortController chaining
    const controller = new AbortController();
    this.activeDownloads.set(downloadId, controller);

    if (abortSignal) {
      if (abortSignal.aborted) {
        this.activeDownloads.delete(downloadId);
        throw new DownloadError('Download was aborted before starting', 'ABORTED', url);
      }
      abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    // Setup timeout timer
    const timeoutRef = setTimeout(() => controller.abort(), timeout);

    try {
      // Ensure output directory exists
      const dir = path.dirname(outputPath);
      await fs.promises.mkdir(dir, { recursive: true });

      // Check if final file already exists
      if (!overwrite) {
        try {
          const stat = await fs.promises.stat(outputPath);
          if (stat.isFile() && stat.size > 0) {
            this.activeDownloads.delete(downloadId);
            clearTimeout(timeoutRef);
            return outputPath;
          }
        } catch {
          // File doesn't exist — proceed with download
        }
      }

      // Determine tmp file path
      const tmpPath = outputPath + TMP_EXTENSION;

      // Determine start offset for resume
      let startByte = 0;
      if (resume) {
        try {
          const tmpStat = await fs.promises.stat(tmpPath);
          if (tmpStat.isFile() && tmpStat.size > 0) {
            startByte = tmpStat.size;
          }
        } catch {
          // No tmp file — start from 0
        }
      } else {
        // Clean up any existing tmp file
        try {
          await fs.promises.unlink(tmpPath);
        } catch {
          // Nothing to clean
        }
      }

      // Initial progress
      const progress = this.createProgress(downloadId, url);
      this.progressMap.set(downloadId, progress);
      this.emitProgress(progress, onProgress);

      // Fetch response metadata (HEAD request)
      progress.status = 'connecting';
      this.emitProgress(progress, onProgress);

      const responseMeta = await this.fetchResponseMeta(url, {
        method: 'HEAD',
        headers: {
          ...extraHeaders,
        },
        timeout,
        maxRedirects: DEFAULT_MAX_REDIRECTS,
      }, controller.signal);

      // Resolve redirect URL for actual download
      const effectiveUrl = responseMeta.redirectUrl ?? url;
      const totalBytes = responseMeta.totalSize;
      const supportsRange = responseMeta.supportsRange;

      // Check server supports Range for resume
      if (startByte > 0 && !supportsRange) {
        // Server doesn't support Range — restart from scratch
        startByte = 0;
        try {
          await fs.promises.unlink(tmpPath);
        } catch {
          // Ignore cleanup errors
        }
      }

      // Update progress with total size
      progress.totalBytes = totalBytes;
      progress.bytesDownloaded = startByte;
      progress.percentage = totalBytes > 0 ? (startByte / totalBytes) * 100 : 0;
      progress.status = startByte > 0 ? 'resuming' : 'downloading';
      this.emitProgress(progress, onProgress);

      // Decide download strategy
      if (parallelChunks > 0 && supportsRange && totalBytes > 0 && totalBytes > parallelChunks * DEFAULT_CHUNK_SIZE) {
        // Use parallel chunk download for large files with Range support
        const result = await this.downloadParallelChunksInternal(
          effectiveUrl,
          outputPath,
          tmpPath,
          totalBytes,
          parallelChunks,
          extraHeaders,
          downloadId,
          progress,
          onProgress,
          controller.signal,
        );
        this.activeDownloads.delete(downloadId);
        clearTimeout(timeoutRef);
        return result;
      }

      // Stream download (single connection, possibly resumed)
      const finalSize = await this.streamDownload(
        effectiveUrl,
        tmpPath,
        startByte,
        totalBytes,
        supportsRange,
        extraHeaders,
        downloadId,
        progress,
        onProgress,
        controller.signal,
      );

      // Rename tmp → final
      try {
        await fs.promises.unlink(outputPath);
      } catch {
        // Final file may not exist
      }
      await fs.promises.rename(tmpPath, outputPath);

      // Final progress event
      progress.bytesDownloaded = finalSize;
      progress.totalBytes = totalBytes > 0 ? totalBytes : finalSize;
      progress.percentage = 100;
      progress.status = 'completed';
      this.emitProgress(progress, onProgress);
      this.emit('complete', { downloadId, filePath: outputPath, fileSize: finalSize });

      this.activeDownloads.delete(downloadId);
      clearTimeout(timeoutRef);
      return outputPath;

    } catch (error) {
      // Clean up tmp file on failure
      const tmpPath = outputPath + TMP_EXTENSION;
      try {
        await fs.promises.unlink(tmpPath);
      } catch {
        // Ignore cleanup errors
      }

      const progressObj = this.progressMap.get(downloadId);
      if (progressObj) {
        progressObj.status = 'failed';
        this.emitProgress(progressObj, onProgress);
      }

      this.activeDownloads.delete(downloadId);
      clearTimeout(timeoutRef);

      const err = error instanceof DownloadError
        ? error
        : new DownloadError(
            error instanceof Error ? error.message : String(error),
            'UNKNOWN',
            url,
          );
      this.emit('error', { downloadId, error: err });
      throw err;
    }
  }

  /**
   * Convenience: download with resume enabled by default.
   */
  async downloadWithResume(
    url: string,
    outputPath: string,
    options?: {
      timeoutMs?: number;
      headers?: Record<string, string>;
      onProgress?: (progress: DownloadProgress) => void;
      abortSignal?: AbortSignal;
    },
  ): Promise<string> {
    return this.download(url, outputPath, {
      ...options,
      resume: true,
    });
  }

  /**
   * Download a large file by splitting it into parallel chunks.
   * Each chunk is downloaded to its own tmp file, then all are
   * merged into the final output.
   */
  async downloadParallelChunks(
    url: string,
    outputPath: string,
    chunkCount: number,
    options?: {
      timeoutMs?: number;
      headers?: Record<string, string>;
      overwrite?: boolean;
      onProgress?: (progress: DownloadProgress) => void;
      abortSignal?: AbortSignal;
    },
  ): Promise<string> {
    return this.download(url, outputPath, {
      ...options,
      parallelChunks: chunkCount,
    });
  }

  /**
   * Get current progress for a download by ID.
   */
  getProgress(downloadId: string): DownloadProgress | undefined {
    return this.progressMap.get(downloadId);
  }

  /**
   * Cancel an active download.
   */
  cancel(downloadId: string): boolean {
    const controller = this.activeDownloads.get(downloadId);
    if (controller) {
      controller.abort();
      const progress = this.progressMap.get(downloadId);
      if (progress) {
        progress.status = 'cancelled';
      }
      return true;
    }
    return false;
  }

  // ─── Internal: Emit Progress ───────────────────────────────────────
  emitProgress(
    progress: DownloadProgress,
    onProgress?: (progress: DownloadProgress) => void,
  ): void {
    this.progressMap.set(progress.downloadId, progress);
    this.emit('progress', progress);
    if (onProgress) {
      onProgress(progress);
    }
  }

  // ─── Internal: Create Progress Object ──────────────────────────────
  private createProgress(
    downloadId: string,
    url: string,
  ): DownloadProgress {
    return {
      downloadId,
      url,
      bytesDownloaded: 0,
      totalBytes: 0,
      percentage: 0,
      speed: 0,
      etaMs: Infinity,
      status: 'pending',
    };
  }

  // ─── Internal: Fetch Response Metadata ────────────────────────────
  private async fetchResponseMeta(
    url: string,
    options: HttpRequestOptions,
    abortSignal: AbortSignal,
  ): Promise<ResponseMeta> {
    const { maxRedirects } = options;
    let currentUrl = url;
    let redirectCount = 0;

    while (redirectCount < maxRedirects) {
      const parsedUrl = new URL(currentUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const requestModule = isHttps ? https : http;

      const requestOptions: https.RequestOptions = {
        method: options.method,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        headers: options.headers,
        timeout: options.timeout,
      };

      const response = await this.makeRequest(requestModule, requestOptions, abortSignal);

      const statusCode = response.statusCode ?? 0;

      // Handle redirects
      if (statusCode >= 300 && statusCode < 400) {
        const location = response.headers['location'];
        if (!location) {
          throw new NetworkError(`Redirect response (${statusCode}) missing Location header`, currentUrl);
        }

        // Resolve relative redirect URLs
        currentUrl = new URL(location, currentUrl).toString();
        redirectCount++;

        // Consume the response body to free the connection
        response.resume();
        continue;
      }

      // Non-2xx status — error
      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        throw new NetworkError(`HTTP ${statusCode} for ${currentUrl}`, currentUrl);
      }

      // Parse content length and range support
      const contentLength = response.headers['content-length'];
      const acceptRanges = response.headers['accept-ranges'];
      const totalSize = contentLength ? parseInt(contentLength, 10) : 0;
      const supportsRange = acceptRanges === 'bytes';

      response.resume(); // Consume body for HEAD request

      const meta: ResponseMeta = {
        statusCode,
        totalSize,
        supportsRange,
        redirectUrl: redirectCount > 0 ? currentUrl : undefined,
      };

      return meta;
    }

    throw new NetworkError(`Too many redirects (${redirectCount})`, url);
  }

  // ─── Internal: Make HTTP(S) Request ───────────────────────────────
  private makeRequest(
    requestModule: typeof http | typeof https,
    options: https.RequestOptions,
    abortSignal: AbortSignal,
  ): Promise<http.IncomingMessage> {
    return new Promise<http.IncomingMessage>((resolve, reject) => {
      if (abortSignal.aborted) {
        reject(new DownloadError('Request aborted before sending', 'ABORTED'));
        return;
      }

      const req = requestModule.request(options, (res: http.IncomingMessage) => {
        resolve(res);
      });

      req.on('error', (err: Error) => {
        if (abortSignal.aborted) {
          reject(new DownloadError('Request aborted', 'ABORTED'));
        } else {
          reject(new NetworkError(err.message, String(options.hostname ?? 'unknown')));
        }
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new DownloadTimeoutError(
          String(options.hostname ?? 'unknown'),
          options.timeout ?? DEFAULT_TIMEOUT_MS,
        ));
      });

      abortSignal.addEventListener('abort', () => {
        req.destroy();
        reject(new DownloadError('Request aborted', 'ABORTED'));
      }, { once: true });

      req.end();
    });
  }

  // ─── Internal: Stream Download ─────────────────────────────────────
  private async streamDownload(
    url: string,
    tmpPath: string,
    startByte: number,
    totalBytes: number,
    supportsRange: boolean,
    extraHeaders: Record<string, string>,
    downloadId: string,
    progressRef: DownloadProgress,
    onProgress?: (progress: DownloadProgress) => void,
    abortSignal?: AbortSignal,
  ): Promise<number> {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const requestModule = isHttps ? https : http;

    const requestHeaders: Record<string, string> = {
      ...extraHeaders,
    };

    if (startByte > 0 && supportsRange) {
      requestHeaders['Range'] = `bytes=${startByte}-`;
    }

    const requestOptions: https.RequestOptions = {
      method: 'GET',
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      headers: requestHeaders,
    };

    const controller = new AbortController();
    if (abortSignal) {
      if (abortSignal.aborted) {
        throw new DownloadError('Download aborted before stream request', 'ABORTED');
      }
      abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    // Get the response
    const response = await this.makeRequest(requestModule, requestOptions, controller.signal);

    // Verify status
    const statusCode = response.statusCode ?? 0;
    if (startByte > 0 && statusCode === 200) {
      // Server ignored Range — restart from 0
      startByte = 0;
    } else if (startByte > 0 && statusCode !== 206) {
      // Unexpected status for Range request
      response.resume();
      throw new NetworkError(`Expected 206 for Range request, got ${statusCode}`, url);
    } else if (statusCode !== 200 && statusCode !== 206) {
      response.resume();
      throw new NetworkError(`HTTP ${statusCode} for ${url}`, url);
    }

    // Calculate actual total bytes from response
    const contentRange = response.headers['content-range'];
    let effectiveTotalBytes = totalBytes;
    if (contentRange) {
      // Content-Range: bytes start-end/total
      const match = contentRange.match(/bytes \d+-\d+\/(\d+)/);
      if (match?.[1]) {
        effectiveTotalBytes = parseInt(match[1], 10);
      }
    } else if (totalBytes === 0) {
      const contentLength = response.headers['content-length'];
      if (contentLength) {
        effectiveTotalBytes = parseInt(contentLength, 10);
      }
    }

    // Update progress ref with resolved total
    progressRef.totalBytes = effectiveTotalBytes;

    // Create progress-tracking Transform stream
    const progressTransform = new ProgressTransform({
      downloadId,
      url,
      totalBytes: effectiveTotalBytes,
      startByte,
      onProgress,
      emitter: this,
      progressRef,
    });

    // Open write stream (append if resuming)
    const writeFlags = startByte > 0 ? 'a' : 'w';
    const writeStart = startByte > 0 ? startByte : undefined;
    const writeStream = fs.createWriteStream(tmpPath, {
      flags: writeFlags,
      start: writeStart,
    });

    // Pipe: response → progressTransform → file
    try {
      await pipeline(
        response,
        progressTransform,
        writeStream,
      );
    } catch (pipeError) {
      // Clean up
      writeStream.destroy();
      response.destroy();
      progressTransform.destroy();

      if (controller.signal.aborted || abortSignal?.aborted) {
        throw new DownloadError('Download aborted during stream', 'ABORTED', url);
      }
      throw pipeError instanceof Error
        ? new NetworkError(pipeError.message, url)
        : new NetworkError(String(pipeError), url);
    }

    // Final size on disk
    const stat = await fs.promises.stat(tmpPath);
    return stat.size;
  }

  // ─── Internal: Parallel Chunk Download ─────────────────────────────
  private async downloadParallelChunksInternal(
    url: string,
    outputPath: string,
    tmpPath: string,
    totalBytes: number,
    chunkCount: number,
    extraHeaders: Record<string, string>,
    downloadId: string,
    progressRef: DownloadProgress,
    onProgress?: (progress: DownloadProgress) => void,
    abortSignal?: AbortSignal,
  ): Promise<string> {
    const chunks: ChunkDownloadInfo[] = [];
    const chunkSize = Math.ceil(totalBytes / chunkCount);

    for (let i = 0; i < chunkCount; i++) {
      const startByte = i * chunkSize;
      const endByte = Math.min(startByte + chunkSize - 1, totalBytes - 1);

      chunks.push({
        index: i,
        startByte,
        endByte,
        tmpPath: `${tmpPath}.chunk${i}`,
        completed: false,
        bytesWritten: 0,
      });
    }

    progressRef.status = 'downloading';
    this.emitProgress(progressRef, onProgress);

    // Download all chunks concurrently
    const chunkPromises = chunks.map((chunk) =>
      this.downloadChunk(url, chunk, extraHeaders, downloadId, progressRef, onProgress, abortSignal),
    );

    await Promise.all(chunkPromises);

    // Verify abort didn't happen during downloads
    if (abortSignal?.aborted) {
      // Clean up all chunk files
      for (const chunk of chunks) {
        try {
          await fs.promises.unlink(chunk.tmpPath);
        } catch {
          // Ignore
        }
      }
      throw new DownloadError('Download aborted during chunk download', 'ABORTED', url);
    }

    // Merge chunks
    progressRef.status = 'merging_chunks';
    this.emitProgress(progressRef, onProgress);

    const mergedSize = await this.mergeChunks(chunks, tmpPath);

    // Clean up chunk tmp files
    for (const chunk of chunks) {
      try {
        await fs.promises.unlink(chunk.tmpPath);
      } catch {
        // Ignore
      }
    }

    // Rename merged tmp → final output
    try {
      await fs.promises.unlink(outputPath);
    } catch {
      // Final file may not exist
    }
    await fs.promises.rename(tmpPath, outputPath);

    // Final progress
    progressRef.bytesDownloaded = mergedSize;
    progressRef.totalBytes = totalBytes;
    progressRef.percentage = 100;
    progressRef.status = 'completed';
    this.emitProgress(progressRef, onProgress);
    this.emit('complete', { downloadId, filePath: outputPath, fileSize: mergedSize });

    return outputPath;
  }

  // ─── Internal: Download Single Chunk ───────────────────────────────
  private async downloadChunk(
    url: string,
    chunk: ChunkDownloadInfo,
    extraHeaders: Record<string, string>,
    downloadId: string,
    progressRef: DownloadProgress,
    onProgress?: (progress: DownloadProgress) => void,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const requestModule = isHttps ? https : http;

    const requestHeaders: Record<string, string> = {
      ...extraHeaders,
      Range: `bytes=${chunk.startByte}-${chunk.endByte}`,
    };

    const controller = new AbortController();
    if (abortSignal) {
      if (abortSignal.aborted) {
        throw new DownloadError('Download aborted before chunk request', 'ABORTED');
      }
      abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const requestOptions: https.RequestOptions = {
      method: 'GET',
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      headers: requestHeaders,
    };

    const response = await this.makeRequest(requestModule, requestOptions, controller.signal);

    if (response.statusCode !== 206 && response.statusCode !== 200) {
      response.resume();
      throw new NetworkError(`Chunk ${chunk.index}: HTTP ${response.statusCode ?? 0}`, url);
    }

    // Create progress-tracking Transform stream for this chunk
    const chunkProgressTransform = new ProgressTransform({
      downloadId,
      url,
      totalBytes: chunk.endByte - chunk.startByte + 1,
      startByte: 0,
      onProgress,
      emitter: this,
      progressRef,
    });

    const writeStream = fs.createWriteStream(chunk.tmpPath, { flags: 'w' });

    try {
      await pipeline(
        response,
        chunkProgressTransform,
        writeStream,
      );
    } catch (pipeError) {
      writeStream.destroy();
      response.destroy();
      chunkProgressTransform.destroy();

      if (controller.signal.aborted) {
        throw new DownloadError(`Chunk ${chunk.index} aborted`, 'ABORTED');
      }
      throw pipeError instanceof Error
        ? new NetworkError(`Chunk ${chunk.index}: ${pipeError.message}`, url)
        : new NetworkError(`Chunk ${chunk.index}: ${String(pipeError)}`, url);
    }

    const stat = await fs.promises.stat(chunk.tmpPath);
    chunk.bytesWritten = stat.size;
    chunk.completed = true;
  }

  // ─── Internal: Merge Chunks ─────────────────────────────────────────
  private async mergeChunks(
    chunks: ChunkDownloadInfo[],
    outputPath: string,
  ): Promise<number> {
    // Ensure all chunks completed
    for (const chunk of chunks) {
      if (!chunk.completed) {
        throw new DiskError(`Chunk ${chunk.index} not completed before merge`, outputPath);
      }
    }

    // Sort by index to ensure correct order
    const sorted = [...chunks].sort((a, b) => a.index - b.index);

    const writeStream = fs.createWriteStream(outputPath, { flags: 'w' });
    let totalWritten = 0;

    for (const chunk of sorted) {
      const readStream = fs.createReadStream(chunk.tmpPath);
      try {
        await pipeline(readStream, writeStream as Writable, { end: false });
      } catch (mergeError) {
        readStream.destroy();
        writeStream.destroy();
        throw mergeError instanceof Error
          ? new DiskError(`Merge failed at chunk ${chunk.index}: ${mergeError.message}`, outputPath)
          : new DiskError(`Merge failed at chunk ${chunk.index}`, outputPath);
      }
      totalWritten += chunk.bytesWritten;
    }

    // Close the write stream
    writeStream.end();

    return totalWritten;
  }
}
