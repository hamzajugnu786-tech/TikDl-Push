/**
 * NovaDL Engine — Redis Cache Adapter
 *
 * Production-grade distributed caching using Redis.
 * Required for multi-node deployments where cache coherence
 * across instances is important. Uses ioredis for robust
 * connection handling, pipelining, and cluster support.
 */

import type Redis from 'ioredis';
import { createHash } from 'node:crypto';
import type { CacheEntry, ICacheAdapter } from '../types/index';

export class RedisCacheAdapter implements ICacheAdapter {
  private _client: Redis | null = null;
  private _redisUrl: string;
  private _prefix = 'novadl:cache:';
  private _defaultTtlMs: number;
  private _connected = false;

  constructor(redisUrl: string, defaultTtlMs: number = 3600000) {
    this._redisUrl = redisUrl;
    this._defaultTtlMs = defaultTtlMs;
  }

  /** Lazily load and initialize the Redis client */
  private async _loadRedisClient(): Promise<Redis> {
    if (this._client) return this._client;

    const ioredisModule = await import('ioredis');
    const RedisClass: typeof Redis = ioredisModule.default ?? ioredisModule;

    this._client = new RedisClass(this._redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => Math.min(times * 200, 2000),
      lazyConnect: true,
    });

    this._client.on('connect', () => { this._connected = true; });
    this._client.on('error', (err: Error) => {
      console.error('[NovaDL Redis Cache] Connection error:', err.message);
    });
    this._client.on('close', () => { this._connected = false; });

    return this._client;
  }

  /** Ensure the Redis client is connected before operations */
  private async _ensureConnected(): Promise<Redis> {
    const client = await this._loadRedisClient();
    if (!this._connected) {
      await client.connect();
      this._connected = true;
    }
    return client;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const client = await this._ensureConnected();
    const redisKey = this._prefix + key;
    const data = await client.get(redisKey);

    if (!data) return null;

    try {
      const entry = JSON.parse(data) as CacheEntry<T>;

      // Validate checksum integrity
      if (entry.checksum) {
        const currentChecksum = RedisCacheAdapter._computeChecksum(entry.value);
        if (currentChecksum !== entry.checksum) {
          await client.del(redisKey);
          return null;
        }
      }

      return entry;
    } catch {
      // Corrupted data — remove it
      await client.del(redisKey);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlMs?: number, tags?: string[]): Promise<void> {
    const client = await this._ensureConnected();
    const redisKey = this._prefix + key;
    const effectiveTtl = ttlMs ?? this._defaultTtlMs;

    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + effectiveTtl),
      hits: 0,
      tags,
      checksum: RedisCacheAdapter._computeChecksum(value),
    };

    const pipeline = client.pipeline();

    // Set the entry with TTL
    pipeline.set(redisKey, JSON.stringify(entry), 'PX', effectiveTtl);

    // Index by tags for tag-based retrieval
    if (tags && tags.length > 0) {
      for (const tag of tags) {
        pipeline.sadd(this._prefix + 'tag:' + tag, redisKey);
      }
    }

    await pipeline.exec();
  }

  async delete(key: string): Promise<boolean> {
    const client = await this._ensureConnected();
    const redisKey = this._prefix + key;
    const result = await client.del(redisKey);
    return result > 0;
  }

  async clear(): Promise<void> {
    const client = await this._ensureConnected();
    // Delete all keys with our prefix using SCAN
    const stream = client.scanStream({ match: this._prefix + '*', count: 100 });
    const keys: string[] = [];

    stream.on('data', (resultKeys: string[]) => {
      keys.push(...resultKeys);
    });

    await new Promise<void>((resolve) => {
      stream.on('end', async () => {
        if (keys.length > 0) {
          await client.del(...keys);
        }
        resolve();
      });
    });
  }

  async has(key: string): Promise<boolean> {
    const client = await this._ensureConnected();
    const redisKey = this._prefix + key;
    return await client.exists(redisKey) === 1;
  }

  async size(): Promise<number> {
    const client = await this._ensureConnected();
    // Count keys with our prefix
    const keys = await client.keys(this._prefix + '*');
    return keys.length;
  }

  async getByTag(tag: string): Promise<CacheEntry[]> {
    const client = await this._ensureConnected();
    const tagKey = this._prefix + 'tag:' + tag;
    const redisKeys = await client.smembers(tagKey);

    const results: CacheEntry[] = [];
    for (const redisKey of redisKeys) {
      const data = await client.get(redisKey);
      if (data) {
        try {
          const entry = JSON.parse(data) as CacheEntry;
          results.push(entry);
        } catch {
          // Skip corrupted entries
        }
      }
    }

    return results;
  }

  /** Gracefully close the Redis connection */
  async disconnect(): Promise<void> {
    if (this._client) {
      await this._client.quit();
      this._connected = false;
    }
  }

  /** Compute SHA-256 checksum of a cached value for integrity validation */
  private static _computeChecksum(value: unknown): string {
    const serialized = JSON.stringify(value);
    return createHash('sha256').update(serialized).digest('hex').substring(0, 16);
  }
}
