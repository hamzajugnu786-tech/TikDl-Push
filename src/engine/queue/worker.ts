/**
 * NovaDL Engine — Worker Pool
 *
 * Manages concurrent extraction workers with priority-based
 * job processing, cancellation, pause/resume, and progress
 * tracking. Emits structured events for monitoring integration.
 *
 * Design:
 * - Workers pull jobs from a shared IQueueAdapter in priority order
 * - Each worker runs one extraction at a time
 * - Cancellation uses AbortController to signal abort to active jobs
 * - Pause/resume suspends processing per job without aborting
 * - Progress events are emitted for download and extraction phases
 * - Graceful shutdown waits for active jobs to complete
 */

import { TypedEmitter } from '../utils/events';
import type { NovaLogger } from '../monitoring/logger';
import type {
  IQueueAdapter,
  QueueJob,
  ExtractionRequest,
  ExtractionResult,
  Platform,
} from '../types/index';

// ─── Events ────────────────────────────────────────────────────────
export interface WorkerPoolEvents {
  'worker:started': { workerId: number };
  'worker:stopped': { workerId: number };
  'worker:job_started': { workerId: number; jobId: string; platform: Platform };
  'worker:job_completed': { workerId: number; jobId: string; durationMs: number };
  'worker:job_failed': { workerId: number; jobId: string; error: string };
  'worker:job_cancelled': { jobId: string };
  'worker:job_paused': { jobId: string };
  'worker:job_resumed': { jobId: string };
  'worker:progress': { jobId: string; phase: 'download' | 'extraction'; percent: number };
  'pool:started': { workerCount: number };
  'pool:stopped': { workerCount: number };
}

// ─── Progress tracking ──────────────────────────────────────────────
export interface JobProgress {
  phase: 'download' | 'extraction';
  percent: number;
  startedAt: Date;
  updatedAt: Date;
}

// ─── Active job state ───────────────────────────────────────────────
interface ActiveJobEntry {
  jobId: string;
  workerId: number;
  platform: Platform;
  abortController: AbortController;
  paused: boolean;
  progress: JobProgress;
  startTime: Date;
  resolve: (result: ExtractionResult | undefined) => void;
  reject: (error: Error) => void;
}

// ─── Worker pool statistics ─────────────────────────────────────────
export interface WorkerPoolStats {
  workerCount: number;
  activeJobCount: number;
  pausedJobCount: number;
  totalCompleted: number;
  totalFailed: number;
  totalCancelled: number;
  isRunning: boolean;
}

// ─── Extraction function type ───────────────────────────────────────
/** Function that performs the actual extraction for a job */
export type ExtractionHandler = (
  request: ExtractionRequest,
  signal: AbortSignal,
  onProgress: (phase: 'download' | 'extraction', percent: number) => void,
) => Promise<ExtractionResult>;

// ─── WorkerPool ──────────────────────────────────────────────────────
export class WorkerPool extends TypedEmitter<WorkerPoolEvents> {
  private _queue: IQueueAdapter;
  private _logger: NovaLogger;
  private _concurrency: number;
  private _handler: ExtractionHandler;

  private _running = false;
  private _activeJobs: Map<string, ActiveJobEntry> = new Map();
  private _completedCount = 0;
  private _failedCount = 0;
  private _cancelledCount = 0;
  private _workerLoopIds: Map<number, Promise<void>> = new Map();
  private _shutdownPromise: Promise<void> | null = null;
  private _shutdownResolve: (() => void) | null = null;

  constructor(
    queue: IQueueAdapter,
    handler: ExtractionHandler,
    logger: NovaLogger,
    concurrency: number = 4,
  ) {
    super();
    this._queue = queue;
    this._handler = handler;
    this._logger = logger.child({ component: 'worker-pool' });
    this._concurrency = concurrency;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────

  /** Start all worker loops */
  start(): void {
    if (this._running) return;
    this._running = true;

    this._logger.info('Starting worker pool', { workerCount: this._concurrency });
    this.emit('pool:started', { workerCount: this._concurrency });

    for (let workerId = 0; workerId < this._concurrency; workerId++) {
      this._workerLoopIds.set(workerId, this._workerLoop(workerId));
      this.emit('worker:started', { workerId });
    }
  }

  /** Stop processing. If graceful, wait for active jobs to complete */
  async stop(): Promise<void> {
    if (!this._running) return;

    this._running = false;

    // Wait for all active jobs to complete (graceful shutdown)
    if (this._activeJobs.size > 0) {
      this._logger.info('Waiting for active jobs to complete', { activeCount: this._activeJobs.size });

      this._shutdownPromise = new Promise<void>((resolve) => {
        this._shutdownResolve = resolve;
      });

      await this._shutdownPromise;
    }

    // Wait for all worker loops to exit
    const loopPromises = [...this._workerLoopIds.values()];
    await Promise.allSettled(loopPromises);

    this._workerLoopIds.clear();
    this.emit('pool:stopped', { workerCount: this._concurrency });
    this._logger.info('Worker pool stopped');
  }

  // ─── Job control ──────────────────────────────────────────────────

  /** Cancel an active job by aborting its AbortController */
  cancel(jobId: string): boolean {
    const entry = this._activeJobs.get(jobId);
    if (!entry) return false;

    entry.abortController.abort();
    this._activeJobs.delete(jobId);
    this._cancelledCount++;

    this.emit('worker:job_cancelled', { jobId });
    this._logger.info('Job cancelled', { jobId });

    // If we're shutting down and no more active jobs, resolve the shutdown promise
    this._checkShutdownComplete();

    return true;
  }

  /** Pause a job — it will not be aborted, but progress reporting stops */
  pause(jobId: string): boolean {
    const entry = this._activeJobs.get(jobId);
    if (!entry || entry.paused) return false;

    entry.paused = true;
    this.emit('worker:job_paused', { jobId });
    this._logger.info('Job paused', { jobId });
    return true;
  }

  /** Resume a paused job */
  resume(jobId: string): boolean {
    const entry = this._activeJobs.get(jobId);
    if (!entry || !entry.paused) return false;

    entry.paused = false;
    this.emit('worker:job_resumed', { jobId });
    this._logger.info('Job resumed', { jobId });
    return true;
  }

  /** Get current progress for a job */
  getProgress(jobId: string): JobProgress | null {
    const entry = this._activeJobs.get(jobId);
    if (!entry) return null;
    return { ...entry.progress };
  }

  /** List all active job IDs */
  getActiveJobs(): string[] {
    return [...this._activeJobs.keys()];
  }

  /** Get worker pool statistics */
  getStats(): WorkerPoolStats {
    const pausedCount = [...this._activeJobs.values()].filter((e) => e.paused).length;

    return {
      workerCount: this._concurrency,
      activeJobCount: this._activeJobs.size,
      pausedJobCount: pausedCount,
      totalCompleted: this._completedCount,
      totalFailed: this._failedCount,
      totalCancelled: this._cancelledCount,
      isRunning: this._running,
    };
  }

  // ─── Internal ──────────────────────────────────────────────────────

  /** Worker loop — continuously dequeues and processes jobs */
  private async _workerLoop(workerId: number): Promise<void> {
    this._logger.debug(`Worker ${workerId} loop started`);

    while (this._running) {
      try {
        const job = await this._queue.dequeue();

        if (!job) {
          // No jobs available — wait briefly before retrying
          await this._idleWait(100);
          continue;
        }

        if (!this._running) {
          // Pool stopped between dequeue and processing — re-queue
          await this._queue.retry(job.id);
          break;
        }

        await this._processJob(workerId, job);
      } catch (error) {
        this._logger.error(`Worker ${workerId} loop error`, {
          workerId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Brief pause before resuming the loop to avoid tight error loops
        await this._idleWait(500);
      }
    }

    this.emit('worker:stopped', { workerId });
    this._logger.debug(`Worker ${workerId} loop ended`);
  }

  /** Process a single job with the configured extraction handler */
  private async _processJob(workerId: number, job: QueueJob<ExtractionRequest>): Promise<void> {
    const jobId = job.id;
    const platform = (job.data.platform ?? 'unknown') as Platform;
    const abortController = new AbortController();

    const progress: JobProgress = {
      phase: 'extraction',
      percent: 0,
      startedAt: new Date(),
      updatedAt: new Date(),
    };

    const startTime = new Date();

    // Create a promise wrapper so we can track and resolve/reject the job
    const entry: ActiveJobEntry = {
      jobId,
      workerId,
      platform,
      abortController,
      paused: false,
      progress,
      startTime,
      resolve: () => {},
      reject: () => {},
    };

    // Store placeholder resolves — actual values set in the promise below
    this._activeJobs.set(jobId, entry);

    this.emit('worker:job_started', { workerId, jobId, platform });

    // Progress callback that emits events
    const onProgress = (phase: 'download' | 'extraction', percent: number): void => {
      const activeEntry = this._activeJobs.get(jobId);
      if (!activeEntry || activeEntry.paused) return;

      activeEntry.progress.phase = phase;
      activeEntry.progress.percent = percent;
      activeEntry.progress.updatedAt = new Date();

      this.emit('worker:progress', { jobId, phase, percent });
    };

    try {
      const result = await this._handler(job.data, abortController.signal, onProgress);

      const durationMs = Date.now() - startTime.getTime();

      // Job completed successfully
      await this._queue.complete(jobId, result);
      this._activeJobs.delete(jobId);
      this._completedCount++;

      this.emit('worker:job_completed', { workerId, jobId, durationMs });

      this._checkShutdownComplete();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if this was an abort (cancellation)
      if (abortController.signal.aborted) {
        // Already handled by cancel() — just clean up
        this._checkShutdownComplete();
        return;
      }

      // Job failed
      await this._queue.fail(jobId, errorMessage);
      this._activeJobs.delete(jobId);
      this._failedCount++;

      this.emit('worker:job_failed', { workerId, jobId, error: errorMessage });

      this._checkShutdownComplete();
    }
  }

  /** Check if a graceful shutdown is complete (all active jobs finished) */
  private _checkShutdownComplete(): void {
    if (this._shutdownResolve && this._activeJobs.size === 0) {
      this._shutdownResolve();
      this._shutdownResolve = null;
      this._shutdownPromise = null;
    }
  }

  /** Sleep for the given duration — used for idle waits */
  private _idleWait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
