/**
 * NovaDL Engine — Parallel Execution Utilities
 */

export async function raceSuccessful<T>(
  promises: Promise<T>[],
): Promise<T> {
  if (promises.length === 0) {
    throw new Error('No promises to race');
  }

  if (promises.length === 1) {
    const single = promises[0];
    if (single === undefined) throw new Error('Unexpected undefined promise');
    return single;
  }

  return new Promise<T>((resolve, reject) => {
    let rejectedCount = 0;
    let lastError: Error | undefined;
    let settled = false;

    for (const promise of promises) {
      promise
        .then((result) => {
          if (!settled) {
            settled = true;
            resolve(result);
          }
        })
        .catch((error) => {
          rejectedCount++;
          lastError = error instanceof Error ? error : new Error(String(error));

          if (rejectedCount === promises.length && !settled) {
            settled = true;
            reject(lastError);
          }
        });
    }
  });
}

/**
 * Run multiple async tasks with limited concurrency.
 * 
 * Useful for batching provider health checks or running
 * extraction attempts without overwhelming the system.
 */
export async function parallelWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let currentIndex = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (currentIndex < items.length) {
        const index = currentIndex++;
        const item = items[index];
        if (item === undefined) continue;
        results[index] = await fn(item, index);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

/**
 * Execute with timeout — wraps a promise with a deadline.
 * 
 * If the promise doesn't settle within the timeout, it's
 * rejected with a TimeoutError. The original promise is
 * NOT cancelled (Node.js doesn't support promise cancellation),
 * but its result is ignored.
 */
export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number,
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message?: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(
        message ?? `Operation timed out after ${timeoutMs}ms`,
        timeoutMs,
      ));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Retry a function with exponential backoff.
 * 
 * Used by the engine's retry system when a provider fails
 * with a retryable error. Each retry waits longer than the
 * previous one (backoff * 2^attempt).
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts: number;
    backoffMs: number;
    maxBackoffMs?: number;
    retryableCheck?: (error: unknown) => boolean;
    onRetry?: (attempt: number, error: unknown) => void;
  },
): Promise<T> {
  const { maxAttempts, backoffMs, maxBackoffMs = 30000, retryableCheck, onRetry } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if this error is retryable
      if (retryableCheck && !retryableCheck(error)) {
        throw error;
      }

      // If this was the last attempt, throw
      if (attempt === maxAttempts - 1) {
        throw error;
      }

      // Calculate backoff delay
      const delayMs = Math.min(backoffMs * Math.pow(2, attempt), maxBackoffMs);

      // Notify about retry
      if (onRetry) {
        onRetry(attempt + 1, error);
      }

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * Simple sleep utility for backoff delays.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a debounced version of a function.
 * 
 * Useful for rate-limited health checks and metrics collection
 * that shouldn't fire too frequently.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  let timer: NodeJS.Timeout | undefined;

  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = undefined;
    }, delayMs);
  };
}
