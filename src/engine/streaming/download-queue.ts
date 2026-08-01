/**
 * NovaDL Engine — Download Queue
 *
 * Priority-based queue managing concurrent downloads.
 * Features:
 * - Configurable concurrency (default 4)
 * - Priority-based scheduling (high/normal/low)
 * - Per-job cancellation via AbortController
 * - Pause/resume per download
 * - Progress events per download job
 *
 * Jobs are stored in memory and processed by worker slots.
 * Higher-priority jobs are always dequeued before lower-priority ones.
 */

import { TypedEmitter } from '../utils/events';
import { v4 as uuid } from 'uuid';
import { StreamDownloader } from './stream-downloader';

import type {
  DownloadJob,
  DownloadPriority,
  DownloadProgress,
  DownloadResult,
  DownloadQueueEvents,
} from './types';

import { DEFAULT_CONCURRENCY, DEFAULT_TIMEOUT_MS } from './types';

// ─── Queue Item ──────────────────────────────────────────────────────
interface QueueItem {
  job: DownloadJob;
  priorityValue: number;
}

// ─── Priority Weight ─────────────────────────────────────────────────
const PRIORITY_WEIGHTS: Record<DownloadPriority, number> = {
  high: 3,
  normal: 2,
  low: 1,
};

// ─── DownloadQueue ───────────────────────────────────────────────────
export class DownloadQueue extends TypedEmitter<DownloadQueueEvents> {
  private readonly downloader: StreamDownloader;
  private readonly concurrency: number;
  private readonly queue: QueueItem[] = [];
  private readonly jobs: Map<string, DownloadJob> = new Map();
  private readonly activeSlots: Map<string, Promise<void>> = new Map();
  private readonly abortControllers: Map<string, AbortController> = new Map();
  private activeCount = 0;
  private processingScheduled = false;

  constructor(options?: { concurrency?: number; downloader?: StreamDownloader }) {
    super();
    this.concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;
    this.downloader = options?.downloader ?? new StreamDownloader();
  }

  /**
   * Add a download job to the queue.
   * The job will be processed when a worker slot is available,
   * respecting priority ordering.
   */
  enqueue(item: {
    url: string;
    outputPath: string;
    priority?: DownloadPriority;
    headers?: Record<string, string>;
    timeoutMs?: number;
    resume?: boolean;
    parallelChunks?: number;
    overwrite?: boolean;
  }): DownloadJob {
    const priority: DownloadPriority = item.priority ?? 'normal';
    const jobId = uuid();
    const abortController = new AbortController();

    const progress: DownloadProgress = {
      downloadId: jobId,
      url: item.url,
      bytesDownloaded: 0,
      totalBytes: 0,
      percentage: 0,
      speed: 0,
      etaMs: Infinity,
      status: 'pending',
    };

    const job: DownloadJob = {
      id: jobId,
      url: item.url,
      outputPath: item.outputPath,
      priority,
      status: 'queued',
      progress,
      headers: item.headers,
      timeoutMs: item.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      resume: item.resume ?? true,
      parallelChunks: item.parallelChunks ?? 0,
      overwrite: item.overwrite ?? false,
      abortController,
    };

    this.abortControllers.set(jobId, abortController);
    this.jobs.set(jobId, job);

    const queueItem: QueueItem = {
      job,
      priorityValue: PRIORITY_WEIGHTS[priority],
    };

    this.queue.push(queueItem);
    // Sort by priority (highest first) then by insertion order (FIFO within same priority)
    this.sortQueue();

    this.emit('job:queued', { jobId, url: item.url, priority });

    // Schedule processing
    this.scheduleProcessing();

    return job;
  }

  /**
   * Cancel a download job by ID.
   * Aborts the active download or removes from the queue.
   */
  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    const controller = this.abortControllers.get(jobId);

    switch (job.status) {
      case 'queued': {
        // Remove from queue
        const queueIndex = this.queue.findIndex((item) => item.job.id === jobId);
        if (queueIndex >= 0) {
          this.queue.splice(queueIndex, 1);
        }
        job.status = 'cancelled';
        job.progress.status = 'cancelled';
        if (controller) controller.abort();
        this.jobs.delete(jobId);
        this.abortControllers.delete(jobId);
        this.emit('job:cancelled', { jobId });
        return true;
      }

      case 'active': {
        // Abort the active download
        job.status = 'cancelled';
        job.progress.status = 'cancelled';
        if (controller) controller.abort();
        this.emit('job:cancelled', { jobId });
        return true;
      }

      case 'paused': {
        // Abort the paused download
        job.status = 'cancelled';
        job.progress.status = 'cancelled';
        if (controller) controller.abort();
        this.jobs.delete(jobId);
        this.abortControllers.delete(jobId);
        this.emit('job:cancelled', { jobId });
        return true;
      }

      case 'completed':
      case 'failed':
      case 'cancelled':
        return false;

      default:
        return false;
    }
  }

  /**
   * Pause an active download job.
   * The download is aborted, but the job stays in memory
   * so it can be resumed later (if resume=true on the job).
   */
  pause(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status === 'active') {
      const controller = this.abortControllers.get(jobId);
      if (controller) controller.abort();
      job.status = 'paused';
      job.progress.status = 'paused';
      this.emit('job:paused', { jobId });
      return true;
    }

    return false;
  }

  /**
   * Resume a paused download job.
   * Re-enqueues the job so it's picked up by a worker.
   * If the original job supports resume, the downloader will
   * attempt Range-based continuation.
   */
  resume(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status === 'paused') {
      // Create new AbortController for the resumed download
      const newController = new AbortController();
      this.abortControllers.set(jobId, newController);
      job.abortController = newController;

      job.status = 'queued';
      job.progress.status = 'pending';

      // Re-enqueue
      const queueItem: QueueItem = {
        job,
        priorityValue: PRIORITY_WEIGHTS[job.priority],
      };
      this.queue.push(queueItem);
      this.sortQueue();

      this.emit('job:resumed', { jobId });
      this.scheduleProcessing();
      return true;
    }

    return false;
  }

  /**
   * Get progress for a job by ID.
   */
  getProgress(jobId: string): DownloadProgress | undefined {
    const job = this.jobs.get(jobId);
    return job?.progress;
  }

  /**
   * Get a job by ID.
   */
  getJob(jobId: string): DownloadJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get current queue size (pending jobs).
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get number of active downloads.
   */
  getActiveCount(): number {
    return this.activeCount;
  }

  // ─── Internal: Sort Queue ──────────────────────────────────────────
  private sortQueue(): void {
    // Stable sort: highest priority first, then FIFO
    this.queue.sort((a, b) => {
      if (a.priorityValue !== b.priorityValue) {
        return b.priorityValue - a.priorityValue; // Higher priority first
      }
      // Same priority — keep original order (FIFO)
      // Since we use push(), earlier items have lower indices
      return 0;
    });
  }

  // ─── Internal: Schedule Processing ────────────────────────────────
  private scheduleProcessing(): void {
    if (this.processingScheduled) return;
    this.processingScheduled = true;

    // Use setImmediate-like scheduling via Promise
    Promise.resolve().then(() => {
      this.processingScheduled = false;
      this.processQueue();
    });
  }

  // ─── Internal: Process Queue ───────────────────────────────────────
  private processQueue(): void {
    // Fill available worker slots
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      const job = item.job;
      if (job.status !== 'queued') continue; // Skip cancelled/paused jobs

      this.activeCount++;
      job.status = 'active';
      job.progress.status = 'downloading';
      job.startedAt = new Date();

      this.emit('job:started', { jobId: job.id, url: job.url });

      const slotPromise = this.executeJob(job)
        .then((result) => {
          if (job.status !== 'cancelled') {
            job.status = 'completed';
            job.progress.status = 'completed';
            job.progress.percentage = 100;
            job.result = result;
            job.completedAt = new Date();
            this.emit('job:completed', { jobId: job.id, result });
          }
        })
        .catch((error) => {
          if (job.status !== 'cancelled') {
            job.status = 'failed';
            job.progress.status = 'failed';
            const errorMsg = error instanceof Error ? error.message : String(error);
            job.error = errorMsg;
            this.emit('job:failed', { jobId: job.id, error: errorMsg });
          }
        })
        .finally(() => {
          this.activeCount--;
          this.activeSlots.delete(job.id);
          this.jobs.delete(job.id);
          this.abortControllers.delete(job.id);
          this.scheduleProcessing();

          // Check if queue is drained
          if (this.activeCount === 0 && this.queue.length === 0) {
            this.emit('queue:drain', undefined as never);
          }
        });

      this.activeSlots.set(job.id, slotPromise);
    }
  }

  // ─── Internal: Execute a Download Job ──────────────────────────────
  private async executeJob(job: DownloadJob): Promise<DownloadResult> {
    const startTime = Date.now();

    // Wire up progress forwarding from the downloader
    const onProgress = (progress: DownloadProgress) => {
      job.progress.bytesDownloaded = progress.bytesDownloaded;
      job.progress.totalBytes = progress.totalBytes;
      job.progress.percentage = progress.percentage;
      job.progress.speed = progress.speed;
      job.progress.etaMs = progress.etaMs;
      job.progress.status = progress.status;
      this.emit('job:progress', { jobId: job.id, progress: job.progress });
    };

    try {
      const filePath = await this.downloader.download(job.url, job.outputPath, {
        resume: job.resume,
        parallelChunks: job.parallelChunks,
        timeoutMs: job.timeoutMs,
        headers: job.headers,
        overwrite: job.overwrite,
        onProgress,
        abortSignal: job.abortController?.signal,
      });

      // Get file size
      const stat = await import('node:fs').then((fs) => fs.promises.stat(filePath));
      const durationMs = Date.now() - startTime;

      const result: DownloadResult = {
        success: true,
        filePath,
        fileSize: stat.size,
        durationMs,
      };

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Throw so the catch in processQueue handles it
      throw new Error(errorMsg);
    }
  }
}
