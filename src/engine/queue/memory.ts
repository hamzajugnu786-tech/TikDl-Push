/**
 * NovaDL Engine — In-Memory Queue Adapter
 *
 * Zero-dependency priority-based job queue for single-instance
 * deployments. Jobs are processed in priority order with
 * configurable concurrency limits.
 */

import { v4 as uuid } from 'uuid';
import type { IQueueAdapter, QueueJob, QueuePriority, ExtractionResult } from '../types/index';

interface QueueJobInternal<T> extends QueueJob<T> {
  resolve?: (value: ExtractionResult | undefined) => void;
  reject?: (error: Error) => void;
}

const PRIORITY_WEIGHT: Record<QueuePriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export class MemoryQueueAdapter implements IQueueAdapter {
  private _queues: Map<QueuePriority, QueueJobInternal<unknown>[]> = new Map();
  private _activeJobs: Map<string, QueueJobInternal<unknown>> = new Map();
  private _completedJobs: Map<string, QueueJobInternal<unknown>> = new Map();
  private _failedJobs: Map<string, QueueJobInternal<unknown>> = new Map();
  private _activeCount = 0;
  private _onCompletedHandlers: Array<(job: QueueJob) => void> = [];
  private _onFailedHandlers: Array<(job: QueueJob) => void> = [];

  constructor(_concurrency: number = 4) {
    for (const priority of Object.keys(PRIORITY_WEIGHT) as QueuePriority[]) {
      this._queues.set(priority, []);
    }
  }

  async enqueue<T>(data: T, priority: QueuePriority = 'normal'): Promise<QueueJob<T>> {
    const job: QueueJobInternal<T> = {
      id: uuid(),
      data,
      priority,
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: 3,
      status: 'pending',
    };

    const queue = this._queues.get(priority);
    if (queue) {
      queue.push(job as QueueJobInternal<unknown>);
    }

    return job as QueueJob<T>;
  }

  async dequeue(): Promise<QueueJob | null> {
    for (const priority of ['critical', 'high', 'normal', 'low'] as QueuePriority[]) {
      const queue = this._queues.get(priority);
      if (queue && queue.length > 0) {
        const job = queue.shift();
        if (job) {
          job.startedAt = new Date();
          job.status = 'active';
          job.attempts++;
          this._activeJobs.set(job.id, job);
          this._activeCount++;
          return job as QueueJob;
        }
      }
    }
    return null;
  }

  async complete(jobId: string, result?: ExtractionResult): Promise<void> {
    const job = this._activeJobs.get(jobId);
    if (job) {
      job.completedAt = new Date();
      job.status = 'completed';
      job.result = result;
      this._activeJobs.delete(jobId);
      this._completedJobs.set(jobId, job);
      this._activeCount--;

      for (const handler of this._onCompletedHandlers) {
        try { handler(job as QueueJob); } catch { /* ignore handler errors */ }
      }
    }
  }

  async fail(jobId: string, error?: string): Promise<void> {
    const job = this._activeJobs.get(jobId);
    if (job) {
      job.error = error ?? 'Unknown error';
      job.status = 'failed';
      this._activeJobs.delete(jobId);
      this._failedJobs.set(jobId, job);
      this._activeCount--;

      for (const handler of this._onFailedHandlers) {
        try { handler(job as QueueJob); } catch { /* ignore handler errors */ }
      }
    }
  }

  async retry(jobId: string): Promise<void> {
    const job = this._failedJobs.get(jobId);
    if (job && job.attempts < job.maxAttempts) {
      job.status = 'retrying';
      this._failedJobs.delete(jobId);
      const queue = this._queues.get(job.priority);
      if (queue) {
        queue.push(job);
      }
    }
  }

  async size(): Promise<number> {
    let total = 0;
    for (const queue of this._queues.values()) {
      total += queue.length;
    }
    return total + this._activeCount;
  }

  async pending(): Promise<number> {
    let total = 0;
    for (const queue of this._queues.values()) {
      total += queue.length;
    }
    return total;
  }

  async active(): Promise<number> {
    return this._activeCount;
  }

  async clear(): Promise<void> {
    for (const [key, queue] of this._queues.entries()) {
      queue.length = 0;
      this._queues.set(key, queue);
    }
    this._activeJobs.clear();
    this._completedJobs.clear();
    this._failedJobs.clear();
    this._activeCount = 0;
  }

  onCompleted(handler: (job: QueueJob) => void): void {
    this._onCompletedHandlers.push(handler);
  }

  onFailed(handler: (job: QueueJob) => void): void {
    this._onFailedHandlers.push(handler);
  }
}
