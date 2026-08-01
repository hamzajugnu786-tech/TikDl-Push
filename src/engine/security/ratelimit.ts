/**
 * NovaDL Engine — Rate Limiting Module
 *
 * Provides sliding-window rate limiting with an in-memory adapter
 * and a configurable RateLimiter class that wraps any IRateLimitAdapter.
 *
 * Features:
 *  - Sliding window algorithm (not fixed window) for smoother enforcement
 *  - Per-IP and per-key limiting
 *  - Thread-safe concurrent access via atomic-style increment patterns
 *  - Configurable limits and window durations from SecurityConfig
 */

import type { IRateLimitAdapter, RateLimitResult, SecurityConfig } from '../types/index';

// ─── Sliding Window Entry ───────────────────────────────────────────

/**
 * Internal entry tracking timestamps of requests within a sliding window.
 */
interface SlidingWindowEntry {
  /** Timestamps of individual requests (used for sliding window calculation) */
  timestamps: number[];
  /** When this entry was last updated */
  lastUpdated: number;
}

// ─── Memory Rate Limit Adapter ───────────────────────────────────────

/**
 * In-memory sliding-window rate limit adapter implementing IRateLimitAdapter.
 *
 * Uses a Map of keys → sliding window entries, where each entry stores
 * the timestamps of all requests within the current window. The count
 * is derived by filtering timestamps that fall within [now - windowMs, now].
 *
 * This approach provides true sliding-window semantics (as opposed to
 * fixed-window), where the rate limit is based on the actual number of
 * requests in the last `windowMs` milliseconds at the time of checking.
 *
 * Concurrent access safety:
 *  - All mutating operations (increment, reset, clear) are synchronous
 *  - check() computes the count atomically from the stored timestamps
 *  - No async locks needed because JavaScript is single-threaded in Node.js
 */
export class MemoryRateLimitAdapter implements IRateLimitAdapter {
  private readonly store: Map<string, SlidingWindowEntry> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  /**
   * Creates a new in-memory rate limit adapter.
   *
   * @param maxRequests - Maximum requests allowed within the window
   * @param windowMs    - Sliding window duration in milliseconds
   */
  constructor(maxRequests: number = 100, windowMs: number = 60_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Checks whether a request for the given key is allowed under
   * the current rate limit, without incrementing the count.
   *
   * @param key - The rate-limit key (e.g., IP address or client identifier)
   * @returns RateLimitResult with allowed status, remaining quota, and reset time
   */
  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    const entry = this.store.get(key);

    if (!entry) {
      // No previous requests — fully allowed
      return {
        allowed: true,
        remaining: this.maxRequests,
        resetAt: new Date(now + this.windowMs),
        total: this.maxRequests,
      };
    }

    // Filter timestamps to only those within the current window
    const activeTimestamps = entry.timestamps.filter((ts) => ts > windowStart);

    // Update the entry in-place (removes expired timestamps)
    entry.timestamps = activeTimestamps;
    entry.lastUpdated = now;

    const currentCount = activeTimestamps.length;
    const remaining = Math.max(0, this.maxRequests - currentCount);

    // Find the earliest timestamp in the window to compute resetAt
    const earliestInWindow = activeTimestamps.length > 0
      ? activeTimestamps[0] ?? now
      : now;

    // Reset time is when the oldest request in the window expires
    const resetAt = new Date(earliestInWindow + this.windowMs);

    return {
      allowed: currentCount < this.maxRequests,
      remaining,
      resetAt,
      total: this.maxRequests,
    };
  }

  /**
   * Increments the request count for the given key by recording
   * the current timestamp in its sliding window.
   *
   * @param key - The rate-limit key to increment
   */
  async increment(key: string): Promise<void> {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    const entry = this.store.get(key);

    if (!entry) {
      // First request for this key
      this.store.set(key, {
        timestamps: [now],
        lastUpdated: now,
      });
      return;
    }

    // Remove expired timestamps before adding the new one
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);
    entry.timestamps.push(now);
    entry.lastUpdated = now;
  }

  /**
   * Resets the rate limit counter for a specific key, removing
   * all recorded timestamps.
   *
   * @param key - The rate-limit key to reset
   */
  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  /**
   * Clears all rate limit entries, resetting every key.
   */
  async clear(): Promise<void> {
    this.store.clear();
  }

  /**
   * Returns the number of active keys currently tracked.
   * Useful for monitoring and diagnostics.
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Performs garbage collection by removing entries whose windows
   * have fully expired. Should be called periodically to prevent
   * unbounded memory growth.
   *
   * @returns Number of expired entries removed
   */
  gc(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.store) {
      // If all timestamps are older than the window, this entry is stale
      const windowStart = now - this.windowMs;
      const activeTimestamps = entry.timestamps.filter((ts) => ts > windowStart);

      if (activeTimestamps.length === 0) {
        this.store.delete(key);
        removed++;
      } else {
        entry.timestamps = activeTimestamps;
      }
    }

    return removed;
  }
}

// ─── Rate Limiter ────────────────────────────────────────────────────

/**
 * High-level rate limiter that wraps any IRateLimitAdapter
 * with config-based defaults from SecurityConfig.
 *
 * Provides convenience methods for per-IP and per-key limiting,
 * and manages the adapter lifecycle including periodic garbage collection
 * for memory-based adapters.
 */
export class RateLimiter {
  private readonly adapter: IRateLimitAdapter;
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private gcTimer?: ReturnType<typeof setInterval>;

  /**
   * Creates a new RateLimiter.
   *
   * @param adapter - The underlying rate limit adapter (memory, Redis, etc.)
   * @param config  - Security configuration providing rate limit defaults
   */
  constructor(adapter: IRateLimitAdapter, config: SecurityConfig) {
    this.adapter = adapter;
    this.maxRequests = config.rateLimit.max;
    this.windowMs = config.rateLimit.windowMs;
  }

  /**
   * Checks whether a request from the given IP address is allowed.
   * Uses the "ip:<address>" key format for per-IP tracking.
   *
   * @param ip - The client IP address
   * @returns RateLimitResult indicating whether the request is allowed
   */
  async checkIp(ip: string): Promise<RateLimitResult> {
    const key = `ip:${ip}`;
    return this.adapter.check(key);
  }

  /**
   * Checks whether a request for the given arbitrary key is allowed.
   *
   * @param key - Any client-defined key (user ID, API key, etc.)
   * @returns RateLimitResult indicating whether the request is allowed
   */
  async checkKey(key: string): Promise<RateLimitResult> {
    return this.adapter.check(key);
  }

  /**
   * Records a request from the given IP address by incrementing its counter.
   *
   * @param ip - The client IP address
   */
  async recordIp(ip: string): Promise<void> {
    const key = `ip:${ip}`;
    await this.adapter.increment(key);
  }

  /**
   * Records a request for the given arbitrary key.
   *
   * @param key - Any client-defined key
   */
  async recordKey(key: string): Promise<void> {
    await this.adapter.increment(key);
  }

  /**
   * Convenience method that checks + increments in one call.
   * Returns the rate limit result BEFORE incrementing, so the caller
   * can decide whether to proceed or reject the request.
   *
   * @param ip - The client IP address
   * @returns RateLimitResult (check is done before increment)
   */
  async limitIp(ip: string): Promise<RateLimitResult> {
    const result = await this.checkIp(ip);
    // Always increment the counter, even if blocked
    // This ensures the client's rate limit window is accurate
    await this.recordIp(ip);
    return result;
  }

  /**
   * Convenience method that checks + increments for an arbitrary key.
   *
   * @param key - Any client-defined key
   * @returns RateLimitResult (check is done before increment)
   */
  async limitKey(key: string): Promise<RateLimitResult> {
    const result = await this.checkKey(key);
    await this.recordKey(key);
    return result;
  }

  /**
   * Resets the rate limit for a specific IP address.
   *
   * @param ip - The client IP address
   */
  async resetIp(ip: string): Promise<void> {
    const key = `ip:${ip}`;
    await this.adapter.reset(key);
  }

  /**
   * Resets the rate limit for a specific key.
   *
   * @param key - Any client-defined key
   */
  async resetKey(key: string): Promise<void> {
    await this.adapter.reset(key);
  }

  /**
   * Clears all rate limit entries.
   */
  async clearAll(): Promise<void> {
    await this.adapter.clear();
  }

  /**
   * Starts periodic garbage collection for memory-based adapters.
   * Only effective when the adapter is a MemoryRateLimitAdapter.
   *
   * @param intervalMs - GC interval in milliseconds (default: 60 seconds)
   */
  startGC(intervalMs: number = 60_000): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
    }

    if (this.adapter instanceof MemoryRateLimitAdapter) {
      this.gcTimer = setInterval(() => {
        (this.adapter as MemoryRateLimitAdapter).gc();
      }, intervalMs);

      // Don't prevent process exit
      if (this.gcTimer && typeof this.gcTimer === 'object' && 'unref' in this.gcTimer) {
        this.gcTimer.unref();
      }
    }
  }

  /**
   * Stops periodic garbage collection.
   */
  stopGC(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = undefined;
    }
  }

  /**
   * Returns the configured maximum requests per window.
   */
  get max(): number {
    return this.maxRequests;
  }

  /**
   * Returns the configured window duration in milliseconds.
   */
  get window(): number {
    return this.windowMs;
  }
}
