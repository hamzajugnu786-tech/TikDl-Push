/**
 * NovaDL Engine — Request Timer Tracker
 *
 * Shared module for tracking request start times across
 * API routes and middleware without relying on Fastify
 * request decoration or (request as any) casts.
 *
 * Includes periodic cleanup to prevent memory leaks from
 * abandoned or timed-out requests.
 */

const requestTimers: Map<string, number> = new Map();

const MAX_TIMER_AGE_MS = 60_000; // 1 minute — requests should never take longer
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/** Record the start time for a request */
export function setRequestStart(requestId: string): void {
  requestTimers.set(requestId, Date.now());
}

/** Get the start time for a request */
export function getRequestStart(requestId: string): number | undefined {
  return requestTimers.get(requestId);
}

/** Calculate latency in ms for a request */
export function getLatencyMs(requestId: string): number {
  const start = requestTimers.get(requestId);
  if (start === undefined) return 0;
  return Date.now() - start;
}

/** Clean up timer for a completed request */
export function deleteRequestStart(requestId: string): void {
  requestTimers.delete(requestId);
}

/** Start periodic cleanup of stale timers (prevents memory leaks) */
export function startTimerCleanup(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, startTime] of requestTimers) {
      if (now - startTime > MAX_TIMER_AGE_MS) {
        requestTimers.delete(id);
      }
    }
  }, 30_000); // Clean every 30 seconds
}

/** Stop periodic cleanup */
export function stopTimerCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
