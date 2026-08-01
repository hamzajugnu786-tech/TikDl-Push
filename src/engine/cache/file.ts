/**
 * NovaDL Engine — File-Based Cache Adapter
 * 
 * Persistent disk cache for single-server deployments that
 * need cache to survive restarts. Uses the filesystem directly
 * with JSON files per cache entry.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { CacheEntry, ICacheAdapter } from '../types/index';

export class FileCacheAdapter implements ICacheAdapter {
  private _directory: string;
  private _defaultTtlMs: number;

  constructor(directory: string = '/tmp/novadl-cache', defaultTtlMs: number = 3600000) {
    this._directory = directory;
    this._defaultTtlMs = defaultTtlMs;
    this._ensureDirectory();
  }

  private async _ensureDirectory(): Promise<void> {
    if (!existsSync(this._directory)) {
      await fs.mkdir(this._directory, { recursive: true });
    }
  }

  private _filePath(key: string): string {
    // Sanitize key for filesystem safety
    const safeKey = key.replace(/[^\w.-]/g, '_');
    return join(this._directory, `${safeKey}.json`);
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const filePath = this._filePath(key);

    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const entry = JSON.parse(data) as CacheEntry<T>;

      // Check TTL
      if (entry.expiresAt && new Date(entry.expiresAt) <= new Date()) {
        await fs.unlink(filePath).catch(() => {}); // Silent delete
        return null;
      }

      // Validate checksum integrity
      if (entry.checksum) {
        const currentChecksum = FileCacheAdapter._computeChecksum(entry.value);
        if (currentChecksum !== entry.checksum) {
          await fs.unlink(filePath).catch(() => {}); // Corrupted entry
          return null;
        }
      }

      // Update hit count
      entry.hits = (entry.hits ?? 0) + 1;
      await fs.writeFile(filePath, JSON.stringify(entry), 'utf-8');

      return entry;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlMs?: number, tags?: string[]): Promise<void> {
    await this._ensureDirectory();
    const filePath = this._filePath(key);

    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + (ttlMs ?? this._defaultTtlMs)),
      hits: 0,
      tags,
      checksum: FileCacheAdapter._computeChecksum(value),
    };

    await fs.writeFile(filePath, JSON.stringify(entry), 'utf-8');
  }

  async delete(key: string): Promise<boolean> {
    const filePath = this._filePath(key);
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this._directory);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(join(this._directory, file));
        }
      }
    } catch {
      // Directory may not exist
    }
  }

  async has(key: string): Promise<boolean> {
    const filePath = this._filePath(key);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const entry = JSON.parse(data) as CacheEntry;
      if (entry.expiresAt && new Date(entry.expiresAt) <= new Date()) {
        await fs.unlink(filePath).catch(() => {});
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async size(): Promise<number> {
    try {
      const files = await fs.readdir(this._directory);
      return files.filter((f) => f.endsWith('.json')).length;
    } catch {
      return 0;
    }
  }

  async getByTag(tag: string): Promise<CacheEntry[]> {
    const results: CacheEntry[] = [];
    try {
      const files = await fs.readdir(this._directory);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const data = await fs.readFile(join(this._directory, file), 'utf-8');
        const entry = JSON.parse(data) as CacheEntry;
        if (entry.tags?.includes(tag)) {
          if (!entry.expiresAt || new Date(entry.expiresAt) > new Date()) {
            results.push(entry);
          } else {
            // Clean up expired entry
            await fs.unlink(join(this._directory, file)).catch(() => {});
          }
        }
      }
    } catch {
      // Ignore errors
    }
    return results;
  }

  /** Compute SHA-256 checksum of a cached value for integrity validation */
  private static _computeChecksum(value: unknown): string {
    const serialized = JSON.stringify(value);
    return createHash('sha256').update(serialized).digest('hex').substring(0, 16);
  }
}
