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
 * Rate limit configuration:
 * - Download: 20 requests per hour per IP address
 * - Login: 10 failed attempts per 10 minutes per IP address
 *
 * ⚠️  CRITICAL FIX: Each limiter instance uses a unique DB key prefix
 *     (e.g. 'ratelimit_dl_' and 'ratelimit_login_') to prevent
 *     cross-contamination between different rate limiters sharing
 *     the same Settings table.
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

  /** Whether DB persistence is enabled */
  private persistToDb: boolean;

  /** DB key prefix — MUST be unique per limiter instance to prevent cross-contamination */
  private keyPrefix: string;

  /** Cleanup interval timer */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /** Whether initial DB load has been completed */
  private initialized = false;

  constructor(options: {
    maxRequests: number;
    windowMs: number;
    persistToDb?: boolean;
    /** Unique prefix for DB keys (e.g. 'ratelimit_dl_', 'ratelimit_login_') */
    keyPrefix?: string;
  }) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;
    this.persistToDb = options.persistToDb ?? true;
    this.keyPrefix = options.keyPrefix || 'ratelimit_';
  }

  /**
   * Initialize the rate limiter by loading existing entries from DB.
   * Called once at application startup (lazy — triggered by first check).
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.persistToDb) {
      try {
        // One-time migration: clean up old-format 'ratelimit_' entries
        // that existed before we added per-limiter prefixes.
        // These old entries (key='ratelimit_<hash>') are orphaned and cause
        // cross-contamination between download and login rate limiters.
        try {
          const oldEntries = await db.settings.findMany({
            where: { key: { startsWith: 'ratelimit_' } },
          });
          for (const entry of oldEntries) {
            // Delete entries that use the old flat prefix (not ratelimit_dl_ or ratelimit_login_)
            if (!entry.key.startsWith('ratelimit_dl_') && !entry.key.startsWith('ratelimit_login_')) {
              await db.settings.delete({ where: { key: entry.key } }).catch(() => {});
            }
          }
        } catch {
          // Migration failure is non-critical — don't block initialization
        }

        // Load ONLY entries belonging to this limiter instance (by key prefix)
        const entries = await db.settings.findMany({
          where: { key: { startsWith: this.keyPrefix } },
        });

        let loadedCount = 0;
        for (const entry of entries) {
          const key = entry.key.replace(this.keyPrefix, '');
          try {
            const data = JSON.parse(entry.value) as RateLimitEntry;

            // Only load entries that haven't expired yet
            if (data.resetTime > Date.now()) {
              this.memoryCache.set(key, data);
              loadedCount++;
            } else {
              // Delete expired entries from DB
              await db.settings.delete({ where: { key: entry.key } }).catch(() => {});
            }
          } catch {
            // Malformed entry — delete it
            await db.settings.delete({ where: { key: entry.key } }).catch(() => {});
          }
        }

        console.log(`[RateLimiter:${this.keyPrefix}] Loaded ${loadedCount} active entries from DB`);
      } catch (error) {
        console.error(`[RateLimiter:${this.keyPrefix}] Failed to load entries from DB:`, error);
        // Continue with empty memory cache — rate limiting still works
      }
    }

    // Start periodic cleanup
    this.startCleanup();

    this.initialized = true;
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Check if a request should be allowed AND increment the counter.
   * Returns true if the request is allowed, false if rate limited.
   *
   * This is the standard rate-limit-check method for download requests
   * where every attempt counts against the limit.
   *
   * For login rate limiting, prefer isLimited() + increment() / reset()
   * to only count FAILED attempts and reset on success.
   */
  async check(key: string): Promise<boolean> {
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
      // Rate limit exceeded — do NOT increment, just reject
      return false;
    }

    // Increment count
    entry.count++;
    this.memoryCache.set(key, entry);
    await this.persistEntry(key, entry);
    return true;
  }

  /**
   * Check if a key is currently rate-limited WITHOUT incrementing the counter.
   * Use this for login flows where you only want to increment on FAILED attempts.
   *
   * Returns true if the key is rate-limited (blocked), false if allowed.
   */
  async isLimited(key: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();

    const now = Date.now();
    const entry = this.memoryCache.get(key);

    if (!entry || now > entry.resetTime) {
      // No entry or expired — not limited
      return false;
    }

    return entry.count >= this.maxRequests;
  }

  /**
   * Increment the counter for a key (e.g. after a failed login attempt).
   * Does NOT check if the limit is exceeded — just increments.
   * Use isLimited() first to check, then increment() to record the failure.
   */
  async increment(key: string): Promise<void> {
    if (!this.initialized) await this.initialize();

    const now = Date.now();
    const entry = this.memoryCache.get(key);

    if (!entry || now > entry.resetTime) {
      // New window — start with count=1 (this failed attempt)
      const newEntry: RateLimitEntry = {
        key,
        count: 1,
        resetTime: now + this.windowMs,
      };
      this.memoryCache.set(key, newEntry);
      await this.persistEntry(key, newEntry);
    } else {
      // Existing window — increment
      entry.count++;
      this.memoryCache.set(key, entry);
      await this.persistEntry(key, entry);
    }
  }

  /**
   * Get remaining requests for a key.
   * Returns { remaining: number, resetTime: number, total: number }.
   */
  getStatus(key: string): { remaining: number; resetTime: number; total: number } | null {
    const entry = this.memoryCache.get(key);
    if (!entry || Date.now() > entry.resetTime) {
      return { remaining: this.maxRequests, resetTime: Date.now() + this.windowMs, total: this.maxRequests };
    }
    return {
      remaining: Math.max(0, this.maxRequests - entry.count),
      resetTime: entry.resetTime,
      total: this.maxRequests,
    };
  }

  /**
   * Reset rate limit for a specific key.
   * Used for: admin action, or successful login (reset failed-attempt counter).
   */
  async reset(key: string): Promise<void> {
    this.memoryCache.delete(key);
    if (this.persistToDb) {
      await db.settings.delete({
        where: { key: `${this.keyPrefix}${key}` },
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
   * Uses the Settings table with the instance's keyPrefix.
   */
  private async persistEntry(key: string, entry: RateLimitEntry): Promise<void> {
    if (!this.persistToDb) return;

    try {
      await db.settings.upsert({
        where: { key: `${this.keyPrefix}${key}` },
        update: { value: JSON.stringify(entry) },
        create: { key: `${this.keyPrefix}${key}`, value: JSON.stringify(entry) },
      });
    } catch (error) {
      // DB persistence failure should NEVER block rate limiting
      // The in-memory cache still works correctly
      console.error(`[RateLimiter:${this.keyPrefix}] DB persist failed:`, error);
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

      // Clean DB entries — ONLY those belonging to this limiter instance
      if (this.persistToDb) {
        db.settings.findMany({
          where: { key: { startsWith: this.keyPrefix } },
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
      keyPrefix: 'ratelimit_dl_',
    });
  }
  return downloadLimiter;
}

/** Login rate limiter: 10 failed attempts per 10 minutes per IP */
let loginLimiter: RateLimiter | null = null;

export function getLoginRateLimiter(): RateLimiter {
  if (!loginLimiter) {
    loginLimiter = new RateLimiter({
      maxRequests: 10,
      windowMs: 10 * 60 * 1000, // 10 minutes
      persistToDb: true,
      keyPrefix: 'ratelimit_login_',
    });
  }
  return loginLimiter;
}
