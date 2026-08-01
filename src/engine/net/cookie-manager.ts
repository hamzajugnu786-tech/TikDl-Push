/**
 * NovaDL Engine — Persistent Cookie Jar
 *
 * A persistent cookie manager that stores cookies per domain,
 * handles HTTP cookie parsing, expiry, disk persistence, and
 * auto-refresh via lightweight HEAD requests.
 */

import { TypedEmitter } from '../utils/events';
import { ProviderError } from '../providers/base';
import type { ProviderErrorCode } from '../providers/base';

import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

// ─── Cookie Types ────────────────────────────────────────────────────

export interface CookieEntry {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  expires?: number;   // Unix timestamp in ms, undefined = session cookie
  maxAge?: number;    // Seconds until expiry
  createdAt: number;  // Unix timestamp in ms
}

export interface CookieJarState {
  version: 1;
  updatedAt: number;
  domains: Record<string, CookieEntry[]>;
}

export interface CookieManagerConfig {
  /** Path to JSON file for persisting cookies */
  filePath: string;
  /** Default auto-refresh interval in ms (0 = disabled by default) */
  defaultRefreshIntervalMs: number;
  /** Domains to auto-refresh, mapped to their base URL */
  refreshUrls: Record<string, string>;
}

export const DEFAULT_COOKIE_MANAGER_CONFIG: CookieManagerConfig = {
  filePath: path.join(process.cwd(), 'data', 'cookies.json'),
  defaultRefreshIntervalMs: 0,
  refreshUrls: {},
};

// ─── Events ────────────────────────────────────────────────────────────

export interface CookieManagerEvents {
  'cookie:set': { domain: string; name: string; value: string };
  'cookie:removed': { domain: string; name: string; reason: 'expired' | 'cleared' | 'overwritten' };
  'cookie:refresh:success': { domain: string; cookiesReceived: number };
  'cookie:refresh:fail': { domain: string; error: string };
  'cookie:loaded': { domainCount: number; totalCookies: number };
  'cookie:saved': { domainCount: number; totalCookies: number };
}

// ─── PersistentCookieJar ──────────────────────────────────────────────

export class PersistentCookieJar extends TypedEmitter<CookieManagerEvents> {
  private _config: CookieManagerConfig;
  private _domains: Record<string, CookieEntry[]> = {};
  private _autoRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private _initialized = false;

  constructor(config: Partial<CookieManagerConfig> = {}) {
    super();
    this._config = { ...DEFAULT_COOKIE_MANAGER_CONFIG, ...config };
  }

  // ─── Cookie Parsing ─────────────────────────────────────────────────

  /**
   * Parse a Set-Cookie header string into a CookieEntry.
   *
   * Set-Cookie format:
   *   name=value; Expires=...; Max-Age=...; Domain=...; Path=...;
   *   Secure; HttpOnly; SameSite=...
   */
  private parseSetCookieHeader(domain: string, cookieString: string): CookieEntry {
    const parts = cookieString.split(';').map((p) => p.trim()).filter((p) => p.length > 0);
    const nameValue = parts[0] ?? '';
    const eqIndex = nameValue.indexOf('=');

    const name = eqIndex >= 0 ? nameValue.substring(0, eqIndex) : nameValue;
    const value = eqIndex >= 0 ? nameValue.substring(eqIndex + 1) : '';

    const entry: CookieEntry = {
      name,
      value,
      domain,
      path: '/',
      secure: false,
      httpOnly: false,
      createdAt: Date.now(),
    };

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i] ?? '';
      const partEqIndex = part.indexOf('=');
      const attrName = partEqIndex >= 0 ? part.substring(0, partEqIndex).toLowerCase() : part.toLowerCase();
      const attrValue = partEqIndex >= 0 ? part.substring(partEqIndex + 1) : '';

      switch (attrName) {
        case 'expires':
          const expiresDate = new Date(attrValue);
          if (!isNaN(expiresDate.getTime())) {
            entry.expires = expiresDate.getTime();
          }
          break;
        case 'max-age':
          const maxAge = parseInt(attrValue, 10);
          if (!isNaN(maxAge) && maxAge > 0) {
            entry.maxAge = maxAge;
            entry.expires = Date.now() + maxAge * 1000;
          } else if (maxAge <= 0) {
            // max-age=0 or negative means immediate expiry
            entry.expires = 0;
          }
          break;
        case 'domain':
          // Strip leading dot and use as-is; if empty, keep original domain
          entry.domain = attrValue.startsWith('.') ? attrValue.substring(1) : attrValue || domain;
          break;
        case 'path':
          entry.path = attrValue || '/';
          break;
        case 'secure':
          entry.secure = true;
          break;
        case 'httponly':
          entry.httpOnly = true;
          break;
        case 'samesite':
          if (attrValue === 'strict' || attrValue === 'lax' || attrValue === 'none') {
            entry.sameSite = attrValue;
          }
          break;
      }
    }

    return entry;
  }

  // ─── Public API ─────────────────────────────────────────────────────

  /**
   * Parse and store a cookie from a raw Set-Cookie-style string.
   * The domain parameter provides the default domain if the cookie
   * string doesn't include a Domain attribute.
   */
  setCookie(domain: string, cookieString: string): void {
    const entry = this.parseSetCookieHeader(domain, cookieString);

    // If cookie is already expired (expires=0 from max-age<=0), remove it
    if (entry.expires !== undefined && entry.expires <= Date.now()) {
      this.removeCookieByName(entry.domain, entry.name, 'expired');
      return;
    }

    const targetDomain = entry.domain;
    if (!this._domains[targetDomain]) {
      this._domains[targetDomain] = [];
    }

    const existing = this._domains[targetDomain] ?? [];
    const existingIndex = existing.findIndex((c) => c.name === entry.name && c.path === entry.path);

    if (existingIndex >= 0) {
      // Overwrite existing cookie with same name+path
      const oldName = existing[existingIndex]?.name ?? entry.name;
      this.emit('cookie:removed', { domain: targetDomain, name: oldName, reason: 'overwritten' });
      existing[existingIndex] = entry;
    } else {
      existing.push(entry);
    }

    this.emit('cookie:set', { domain: targetDomain, name: entry.name, value: entry.value });
  }

  /**
   * Set a cookie entry directly from a structured CookieEntry object.
   * Useful for storing cookies obtained from browser sessions.
   */
  setCookieEntry(entry: CookieEntry): void {
    if (entry.expires !== undefined && entry.expires <= Date.now()) {
      this.removeCookieByName(entry.domain, entry.name, 'expired');
      return;
    }

    const targetDomain = entry.domain;
    if (!this._domains[targetDomain]) {
      this._domains[targetDomain] = [];
    }

    const existing = this._domains[targetDomain] ?? [];
    const existingIndex = existing.findIndex((c) => c.name === entry.name && c.path === entry.path);

    if (existingIndex >= 0) {
      const oldName = existing[existingIndex]?.name ?? entry.name;
      this.emit('cookie:removed', { domain: targetDomain, name: oldName, reason: 'overwritten' });
      existing[existingIndex] = entry;
    } else {
      existing.push(entry);
    }

    this.emit('cookie:set', { domain: targetDomain, name: entry.name, value: entry.value });
  }

  /**
   * Parse all Set-Cookie headers from a fetch Response and store them.
   */
  setCookiesFromResponse(domain: string, response: Response): void {
    const setCookieHeaders = response.headers.getSetCookie();
    for (const header of setCookieHeaders) {
      this.setCookie(domain, header);
    }
  }

  /**
   * Get all applicable cookies for a URL as a Cookie header string.
   * Only returns cookies whose domain matches and path is a prefix
   * of the URL path. Secure cookies are only included for HTTPS URLs.
   */
  getCookiesForUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;
      const urlPath = parsed.pathname;
      const isSecure = parsed.protocol === 'https:';
      const now = Date.now();

      const applicable: CookieEntry[] = [];

      for (const [domain, cookies] of Object.entries(this._domains)) {
        // Check domain match: either exact match or subdomain match
        if (hostname === domain || hostname.endsWith(`.${domain}`)) {
          for (const cookie of cookies) {
            // Skip expired cookies
            if (cookie.expires !== undefined && cookie.expires <= now) {
              continue;
            }
            // Skip secure cookies for non-HTTPS URLs
            if (cookie.secure && !isSecure) {
              continue;
            }
            // Check path prefix match
            if (urlPath.startsWith(cookie.path) || (cookie.path === '/' && urlPath !== '')) {
              applicable.push(cookie);
            }
          }
        }
      }

      if (applicable.length === 0) return '';

      return applicable
        .map((c) => `${c.name}=${c.value}`)
        .join('; ');
    } catch {
      return '';
    }
  }

  /**
   * Get all non-expired cookies for a specific domain.
   */
  getCookiesForDomain(domain: string): string {
    const cookies = this._domains[domain];
    if (!cookies) return '';

    const now = Date.now();
    const valid = cookies.filter((c) => c.expires === undefined || c.expires > now);

    if (valid.length === 0) return '';

    return valid
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
  }

  /**
   * Get all valid CookieEntry objects for a domain (excluding expired).
   * Useful for passing cookies to browser contexts.
   */
  getValidCookiesForDomain(domain: string): CookieEntry[] {
    const cookies = this._domains[domain];
    if (!cookies) return [];

    const now = Date.now();
    return cookies.filter((c) => c.expires === undefined || c.expires > now);
  }

  /**
   * Get all raw CookieEntry objects for a domain (including expired).
   * Useful for debugging or inspection.
   */
  getRawCookiesForDomain(domain: string): CookieEntry[] {
    return this._domains[domain] ?? [];
  }

  /**
   * Make a HEAD request to a platform URL to refresh cookies.
   * The response Set-Cookie headers will be parsed and stored.
   */
  async refreshDomain(domain: string): Promise<number> {
    const refreshUrl = this._config.refreshUrls[domain];
    if (!refreshUrl) {
      throw new ProviderError(
        `No refresh URL configured for domain "${domain}"`,
        'cookie-manager',
        'CONFIG_ERROR' as ProviderErrorCode,
        false,
      );
    }

    try {
      const response = await fetch(refreshUrl, {
        method: 'HEAD',
        redirect: 'follow',
      });

      this.setCookiesFromResponse(domain, response);

      const received = response.headers.getSetCookie().length;
      this.emit('cookie:refresh:success', { domain, cookiesReceived: received });
      return received;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit('cookie:refresh:fail', { domain, error: message });
      throw new ProviderError(
        `Cookie refresh failed for domain "${domain}": ${message}`,
        'cookie-manager',
        'NETWORK' as ProviderErrorCode,
        true,
      );
    }
  }

  /**
   * Refresh all domains that have configured refresh URLs.
   */
  async refreshAll(): Promise<Record<string, number>> {
    const results: Record<string, number> = {};
    const domains = Object.keys(this._config.refreshUrls);

    for (const domain of domains) {
      try {
        results[domain] = await this.refreshDomain(domain);
      } catch {
        results[domain] = 0;
      }
    }

    // Purge expired cookies after refresh
    this.purgeExpired();

    return results;
  }

  /**
   * Clear all cookies for a specific domain.
   */
  clearDomain(domain: string): void {
    const cookies = this._domains[domain];
    if (cookies) {
      for (const cookie of cookies) {
        this.emit('cookie:removed', { domain, name: cookie.name, reason: 'cleared' });
      }
      delete this._domains[domain];
    }
  }

  /**
   * Clear all cookies for all domains.
   */
  clearAll(): void {
    for (const domain of Object.keys(this._domains)) {
      this.clearDomain(domain);
    }
  }

  // ─── Disk Persistence ──────────────────────────────────────────────

  /**
   * Load persisted cookies from the JSON file on disk.
   */
  async loadFromDisk(): Promise<void> {
    try {
      const dir = path.dirname(this._config.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (!fs.existsSync(this._config.filePath)) {
        this._domains = {};
        this._initialized = true;
        return;
      }

      const raw = fs.readFileSync(this._config.filePath, 'utf-8');
      const state: CookieJarState = JSON.parse(raw);

      if (state.version !== 1) {
        throw new ProviderError(
          `Unsupported cookie jar version: ${state.version}`,
          'cookie-manager',
          'CONFIG_ERROR' as ProviderErrorCode,
          false,
        );
      }

      this._domains = state.domains;

      // Purge expired cookies on load
      this.purgeExpired();

      const domainCount = Object.keys(this._domains).length;
      const totalCookies = Object.values(this._domains).reduce((sum, arr) => sum + arr.length, 0);
      this.emit('cookie:loaded', { domainCount, totalCookies });

      this._initialized = true;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new ProviderError(
        `Failed to load cookies from disk: ${message}`,
        'cookie-manager',
        'PARSE_ERROR' as ProviderErrorCode,
        true,
      );
    }
  }

  /**
   * Save current cookies to the JSON file on disk.
   */
  async saveToDisk(): Promise<void> {
    const state: CookieJarState = {
      version: 1,
      updatedAt: Date.now(),
      domains: this._domains,
    };

    try {
      const dir = path.dirname(this._config.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const json = JSON.stringify(state, null, 2);
      fs.writeFileSync(this._config.filePath, json, 'utf-8');

      const domainCount = Object.keys(this._domains).length;
      const totalCookies = Object.values(this._domains).reduce((sum, arr) => sum + arr.length, 0);
      this.emit('cookie:saved', { domainCount, totalCookies });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ProviderError(
        `Failed to save cookies to disk: ${message}`,
        'cookie-manager',
        'NETWORK' as ProviderErrorCode,
        true,
      );
    }
  }

  // ─── Auto-Refresh ──────────────────────────────────────────────────

  /**
   * Start periodic auto-refresh of cookies for all configured domains.
   * @param intervalMs - Interval in milliseconds between refresh cycles.
   *   If 0, uses the default from config.
   */
  startAutoRefresh(intervalMs: number = 0): void {
    this.stopAutoRefresh();

    const interval = intervalMs || this._config.defaultRefreshIntervalMs;
    if (interval <= 0) return;

    this._autoRefreshTimer = setInterval(() => {
      // Fire and forget — errors are emitted as events
      this.refreshAll().catch(() => {});
    }, interval);
  }

  /**
   * Stop periodic auto-refresh.
   */
  stopAutoRefresh(): void {
    if (this._autoRefreshTimer !== null) {
      clearInterval(this._autoRefreshTimer);
      this._autoRefreshTimer = null;
    }
  }

  // ─── Internals ─────────────────────────────────────────────────────

  /**
   * Remove all expired cookies from all domains.
   */
  private purgeExpired(): void {
    const now = Date.now();

    for (const domain of Object.keys(this._domains)) {
      const cookies = this._domains[domain] ?? [];
      const valid = cookies.filter((c) => {
        if (c.expires !== undefined && c.expires <= now) {
          this.emit('cookie:removed', { domain, name: c.name, reason: 'expired' });
          return false;
        }
        return true;
      });

      if (valid.length === 0) {
        delete this._domains[domain];
      } else {
        this._domains[domain] = valid;
      }
    }
  }

  /**
   * Remove a single cookie by name from a domain, emitting an event.
   */
  private removeCookieByName(domain: string, name: string, reason: 'expired' | 'cleared' | 'overwritten'): void {
    const cookies = this._domains[domain];
    if (!cookies) return;

    const index = cookies.findIndex((c) => c.name === name);
    if (index >= 0) {
      this.emit('cookie:removed', { domain, name, reason });
      cookies.splice(index, 1);
      if (cookies.length === 0) {
        delete this._domains[domain];
      }
    }
  }

  /**
   * Get the number of domains with stored cookies.
   */
  getDomainCount(): number {
    return Object.keys(this._domains).length;
  }

  /**
   * Get the total number of stored cookies across all domains.
   */
  getTotalCookieCount(): number {
    return Object.values(this._domains).reduce((sum, arr) => sum + arr.length, 0);
  }

  /**
   * Check if the jar has been initialized (loaded from disk).
   */
  isInitialized(): boolean {
    return this._initialized;
  }
}
