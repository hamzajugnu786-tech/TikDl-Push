/**
 * Production Rate Limiter — Production Security & Infrastructure
 *
 * Replaces the in-memory rate limiter with a production-ready solution
 * that persists across server restarts.
 *
 * Architecture:
 * - Primary: In-memory cache (fast reads, no DB overhead)
 * - Fallback/Persistence: SQLite via Prisma (survives server restarts)
 * - On startup: Load existing rate limit entries from DB into memory
 * - On request: Check in-memory first, persist count to DB on write
 * - Cleanup: Periodic purge of expired entries from both memory and DB
 *
 * Rate limit configuration (unchanged from previous):
 * - 20 requests per hour per IP address
 * - Login: 5 attempts per minute per IP address
 *
 * No Redis dependency required — SQLite handles persistence.
 */

import { db } from '@/lib/db';

// ============================================================================
// RATE LIMIT ENTRY INTERFACE
// ============================================================================

interface RateLimitEntry {
  /** IP address (or hashed identifier) */
  key: string;
  /** Number of requests in current window */
  count: number;
  /** Timestamp when the current window resets */
  resetTime: number;
}

// ============================================================================
// RATE LIMITER CLASS
// ============================================================================

export class RateLimiter {
  /** In-memory cache for fast reads */
  private memoryCache: Map<string, RateLimitEntry> = new Map();

  /** Maximum requests allowed per window */
  private maxRequests: number;

  /** Window duration in milliseconds */
  private windowMs: number;

  /** Prisma model name for persistence */
  private modelName: string;

  /** Whether DB persistence is enabled */
  private persistToDb: boolean;

  /** Cleanup interval timer */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /** Whether initial DB load has been completed */
  private initialized = false;

  constructor(options: {
    maxRequests: number;
    windowMs: number;
    persistToDb?: boolean;
  }) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;
    this.persistToDb = options.persistToDb ?? true;

    // Use the Settings model for rate limit storage (no schema change needed)
    // Keys will be prefixed with 'ratelimit_' for identification
    this.modelName = 'Settings';
  }

  /**
   * Initialize the rate limiter by loading existing entries from DB.
   * Called once at application startup.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.persistToDb) {
      try {
        // Load existing rate limit entries from DB Settings table
        const entries = await db.settings.findMany({
          where: { key: { startsWith: 'ratelimit_' } },
        });

        for (const entry of entries) {
          const key = entry.key.replace('ratelimit_', '');
          const data = JSON.parse(entry.value) as RateLimitEntry;

          // Only load entries that haven't expired yet
          if (data.resetTime > Date.now()) {
            this.memoryCache.set(key, data);
          } else {
            // Delete expired entries from DB
            await db.settings.delete({ where: { key: entry.key } }).catch(() => {});
          }
        }

        console.log(`[RateLimiter] Loaded ${this.memoryCache.size} active entries from DB`);
      } catch (error) {
        console.error('[RateLimiter] Failed to load entries from DB:', error);
        // Continue with empty memory cache — rate limiting still works
      }
    }

    // Start periodic cleanup
    this.startCleanup();

    this.initialized = true;
  }

  /**
   * Check if a request should be allowed based on rate limits.
   * Returns true if the request is allowed, false if rate limited.
   *
   * Flow:
   * 1. Check in-memory cache (fast, no DB hit)
   * 2. If no entry or expired window → start new window
   * 3. If under limit → increment count (persist to DB)
   * 4. If over limit → reject
   */
  async check(key: string): Promise<boolean> {
    // Ensure initialization
    if (!this.initialized) await this.initialize();

    const now = Date.now();
    const entry = this.memoryCache.get(key);

    if (!entry || now > entry.resetTime) {
      // New window or expired window — start fresh
      const newEntry: RateLimitEntry = {
        key,
        count: 1,
        resetTime: now + this.windowMs,
      };

      this.memoryCache.set(key, newEntry);
      await this.persistEntry(key, newEntry);
      return true;
    }

    if (entry.count >= this.maxRequests) {
      // Rate limit exceeded
      return false;
    }

    // Increment count
    entry.count++;
    this.memoryCache.set(key, entry);
    await this.persistEntry(key, entry);
    return true;
  }

  /**
   * Get remaining requests for a key.
   * Returns { remaining: number, resetTime: number } or null if no entry.
   */
  getStatus(key: string): { remaining: number; resetTime: number; total: number } | null {
    const entry = this.memoryCache.get(key);
    if (!entry || Date.now() > entry.resetTime) {
      return { remaining: this.maxRequests, resetTime: Date.now() + this.windowMs, total: this.maxRequests };
    }
    return {
      remaining: this.maxRequests - entry.count,
      resetTime: entry.resetTime,
      total: this.maxRequests,
    };
  }

  /**
   * Reset rate limit for a specific key (admin action).
   */
  async reset(key: string): Promise<void> {
    this.memoryCache.delete(key);
    if (this.persistToDb) {
      await db.settings.delete({
        where: { key: `ratelimit_${key}` },
      }).catch(() => {});
    }
  }

  /**
   * Get all active rate limit entries (for admin dashboard).
   */
  getActiveEntries(): Array<RateLimitEntry & { remaining: number }> {
    const now = Date.now();
    const entries: Array<RateLimitEntry & { remaining: number }> = [];

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.resetTime > now) {
        entries.push({
          ...entry,
          remaining: Math.max(0, this.maxRequests - entry.count),
        });
      }
    }

    return entries;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Persist a rate limit entry to the database.
   * Uses the Settings table with 'ratelimit_' prefix keys.
   */
  private async persistEntry(key: string, entry: RateLimitEntry): Promise<void> {
    if (!this.persistToDb) return;

    try {
      await db.settings.upsert({
        where: { key: `ratelimit_${key}` },
        update: { value: JSON.stringify(entry) },
        create: { key: `ratelimit_${key}`, value: JSON.stringify(entry) },
      });
    } catch (error) {
      // DB persistence failure should NEVER block rate limiting
      // The in-memory cache still works correctly
      console.error('[RateLimiter] DB persist failed:', error);
    }
  }

  /**
   * Start periodic cleanup of expired entries.
   * Runs every window duration to purge stale entries.
   */
  private startCleanup(): void {
    // Clean up every window duration
    const interval = Math.max(this.windowMs, 60_000); // At least 1 minute

    this.cleanupTimer = setInterval(() => {
      const now = Date.now();

      // Clean in-memory cache
      for (const [key, entry] of this.memoryCache.entries()) {
        if (now > entry.resetTime) {
          this.memoryCache.delete(key);
        }
      }

      // Clean DB entries (async, non-blocking)
      if (this.persistToDb) {
        db.settings.findMany({
          where: { key: { startsWith: 'ratelimit_' } },
        }).then(entries => {
          for (const entry of entries) {
            try {
              const data = JSON.parse(entry.value) as RateLimitEntry;
              if (now > data.resetTime) {
                db.settings.delete({ where: { key: entry.key } }).catch(() => {});
              }
            } catch {
              // Malformed entry — delete it
              db.settings.delete({ where: { key: entry.key } }).catch(() => {});
            }
          }
        }).catch(() => {});
      }
    }, interval);
  }

  /**
   * Stop the cleanup timer (for testing or graceful shutdown).
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

// ============================================================================
// GLOBAL RATE LIMITER INSTANCES
// ============================================================================

/** Download rate limiter: 20 requests per hour per IP */
let downloadLimiter: RateLimiter | null = null;

export function getDownloadRateLimiter(): RateLimiter {
  if (!downloadLimiter) {
    downloadLimiter = new RateLimiter({
      maxRequests: 20,
      windowMs: 60 * 60 * 1000, // 1 hour
      persistToDb: true,
    });
  }
  return downloadLimiter;
}

/** Login rate limiter: 5 attempts per minute per IP */
let loginLimiter: RateLimiter | null = null;

export function getLoginRateLimiter(): RateLimiter {
  if (!loginLimiter) {
    loginLimiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60 * 1000, // 1 minute
      persistToDb: true,
    });
  }
  return loginLimiter;
}
