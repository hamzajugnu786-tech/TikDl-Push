/**
 * NovaDL Engine — In-Memory LRU Cache Adapter
 * 
 * Zero-dependency caching for single-instance deployments.
 * Uses an LRU eviction policy with TTL-based expiration.
 * Thread-safe via async operations (no true concurrent access
 * issues in Node.js single-thread model, but we still use
 * proper async signatures for consistency with the adapter interface).
 */

import type { CacheEntry, ExtractionResult, ICacheAdapter } from '../types/index';
import { createHash } from 'node:crypto';

interface InternalCacheEntry<T> extends CacheEntry<T> {
  accessCount: number;
  lastAccessed: Date;
}

export class MemoryCacheAdapter implements ICacheAdapter {
  private _cache: Map<string, InternalCacheEntry<unknown>> = new Map();
  private _maxEntries: number;
  private _defaultTtlMs: number;
  private _cleanupInterval: NodeJS.Timeout | undefined;

  constructor(maxEntries: number = 10000, defaultTtlMs: number = 3600000) {
    this._maxEntries = maxEntries;
    this._defaultTtlMs = defaultTtlMs;
    this._startCleanup();
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const entry = this._cache.get(key);
    if (!entry) return null;

    // Check TTL expiration
    if (entry.expiresAt && entry.expiresAt <= new Date()) {
      this._cache.delete(key);
      return null;
    }

    // Validate checksum integrity
    if (entry.checksum) {
      const currentChecksum = MemoryCacheAdapter._computeChecksum(entry.value);
      if (currentChecksum !== entry.checksum) {
        this._cache.delete(key);
        return null;
      }
    }

    // Update access metadata
    entry.hits++;
    entry.lastAccessed = new Date();

    // Move to end of Map (most recently used) for LRU ordering
    this._cache.delete(key);
    this._cache.set(key, entry);

    return {
      key: entry.key,
      value: entry.value as T,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
      hits: entry.hits,
      tags: entry.tags,
    };
  }

  async set<T>(key: string, value: T, ttlMs?: number, tags?: string[]): Promise<void> {
    // Enforce max entries — evict LRU entries if needed
    while (this._cache.size >= this._maxEntries) {
      // Map iterates in insertion order, so first entry is LRU
      const firstKey = this._cache.keys().next().value;
      if (firstKey !== undefined) {
        this._cache.delete(firstKey);
      }
    }

    const now = new Date();
    const expiresAt = ttlMs
      ? new Date(now.getTime() + ttlMs)
      : new Date(now.getTime() + this._defaultTtlMs);

    const entry: InternalCacheEntry<T> = {
      key,
      value,
      createdAt: now,
      expiresAt,
      hits: 0,
      tags: tags ?? [],
      checksum: MemoryCacheAdapter._computeChecksum(value),
      accessCount: 0,
      lastAccessed: now,
    };

    this._cache.set(key, entry as InternalCacheEntry<unknown>);
  }

  async delete(key: string): Promise<boolean> {
    return this._cache.delete(key);
  }

  async clear(): Promise<void> {
    this._cache.clear();
  }

  async has(key: string): Promise<boolean> {
    const entry = this._cache.get(key);
    if (!entry) return false;

    // Check TTL
    if (entry.expiresAt && entry.expiresAt <= new Date()) {
      this._cache.delete(key);
      return false;
    }

    return true;
  }

  async size(): Promise<number> {
    return this._cache.size;
  }

  async getByTag(tag: string): Promise<CacheEntry[]> {
    const results: CacheEntry[] = [];
    for (const entry of this._cache.values()) {
      if (entry.tags?.includes(tag)) {
        // Check TTL
        if (!entry.expiresAt || entry.expiresAt > new Date()) {
          results.push({
            key: entry.key,
            value: entry.value as ExtractionResult,
            createdAt: entry.createdAt,
            expiresAt: entry.expiresAt,
            hits: entry.hits,
            tags: entry.tags,
          });
        }
      }
    }
    return results;
  }

  /** Stop the background cleanup timer */
  stopCleanup(): void {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = undefined;
    }
  }

  /** Start periodic TTL cleanup */
  private _startCleanup(): void {
    // Run cleanup every 60 seconds
    this._cleanupInterval = setInterval(() => {
      this._cleanupExpired();
    }, 60000);
  }

  /** Remove all expired entries */
  private _cleanupExpired(): void {
    const now = new Date();
    for (const [key, entry] of this._cache) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        this._cache.delete(key);
      }
    }
  }

  /** Compute SHA-256 checksum of a cached value for integrity validation */
  private static _computeChecksum(value: unknown): string {
    const serialized = JSON.stringify(value);
    return createHash('sha256').update(serialized).digest('hex').substring(0, 16);
  }
}
