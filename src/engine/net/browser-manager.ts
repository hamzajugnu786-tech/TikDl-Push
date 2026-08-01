/**
 * NovaDL Engine — Browser Manager (Playwright Fallback)
 *
 * A browser fallback manager that uses Playwright (dynamically imported)
 * for browser-based extraction when API or CLI providers fail. Playwright
 * is NOT a required dependency — the manager gracefully handles its absence.
 *
 * Features:
 * - Headless Chromium mode for production
 * - Cookie injection from CookieManager
 * - Context pool for concurrent extraction
 * - Automatic idle shutdown
 */

import { TypedEmitter } from '../utils/events';
import { ProviderError } from '../providers/base';
import type { ProviderErrorCode } from '../providers/base';

import type { CookieEntry } from './cookie-manager';

// ─── Browser Types ───────────────────────────────────────────────────

export interface BrowserManagerConfig {
  /** Maximum number of concurrent browser contexts */
  maxContexts: number;
  /** Idle timeout in ms — browser shuts down after this period of no activity */
  idleTimeoutMs: number;
  /** Default page load timeout in ms */
  pageTimeoutMs: number;
  /** Playwright browser launch options */
  launchOptions: PlaywrightLaunchOptions;
  /** Whether to automatically shut down browser on idle */
  autoShutdown: boolean;
}

export interface PlaywrightLaunchOptions {
  headless: boolean;
  chromiumArgs?: string[];
  executablePath?: string;
  proxy?: BrowserProxyConfig;
}

export interface BrowserProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

export interface BrowserContextConfig {
  id: string;
  cookies?: CookieEntry[];
  userAgent?: string;
  viewport?: { width: number; height: number };
  locale?: string;
  extraHttpHeaders?: Record<string, string>;
}

export interface BrowserExtractOptions {
  /** Wait strategy: 'load', 'domcontentloaded', 'networkidle', or a selector */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  /** Timeout for page navigation in ms */
  timeoutMs?: number;
  /** JavaScript to evaluate on the page after load */
  evaluateJs?: string;
  /** Selector to wait for before extracting */
  waitForSelector?: string;
  /** Time to wait for selector in ms */
  waitForSelectorTimeoutMs?: number;
}

export interface BrowserExtractResult {
  url: string;
  html: string;
  title: string;
  cookies: BrowserCookieResult[];
  evaluatedResult?: unknown;
  durationMs: number;
  contextId: string;
}

export interface BrowserCookieResult {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
}

export const DEFAULT_BROWSER_MANAGER_CONFIG: BrowserManagerConfig = {
  maxContexts: 5,
  idleTimeoutMs: 60_000,
  pageTimeoutMs: 30_000,
  launchOptions: {
    headless: true,
    chromiumArgs: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
    ],
  },
  autoShutdown: true,
};

// ─── Events ────────────────────────────────────────────────────────────

export interface BrowserManagerEvents {
  'browser:launched': { timestamp: number };
  'browser:shutdown': { timestamp: number; reason: 'idle' | 'manual' | 'error' };
  'browser:unavailable': { error: string };
  'context:created': { contextId: string };
  'context:closed': { contextId: string };
  'extract:success': { url: string; contextId: string; durationMs: number };
  'extract:fail': { url: string; contextId: string; error: string };
}

// ─── BrowserManager ──────────────────────────────────────────────────

export class BrowserManager extends TypedEmitter<BrowserManagerEvents> {
  private _config: BrowserManagerConfig;
  private _browser: PlaywrightBrowser | null = null;
  private _contexts: Map<string, PlaywrightBrowserContext> = new Map();
  private _playwrightAvailable: boolean | null = null;
  private _idleTimer: ReturnType<typeof setTimeout> | null = null;
  private _pageTimeoutMs: number;
  private _launchPromise: Promise<PlaywrightBrowser> | null = null;

  constructor(config: Partial<BrowserManagerConfig> = {}) {
    super();
    this._config = { ...DEFAULT_BROWSER_MANAGER_CONFIG, ...config };
    this._pageTimeoutMs = this._config.pageTimeoutMs;
  }

  // ─── Playwright Type Aliases ───────────────────────────────────────
  // These are typed as minimal interfaces so we don't need to import
  // Playwright types directly (it's optional). The actual types will
  // be validated at runtime when Playwright is dynamically imported.

  // ─── Lifecycle ─────────────────────────────────────────────────────

  /**
   * Launch browser (lazy, only when needed). If Playwright is not
   * installed, throws ProviderError with CONFIG_ERROR code.
   */
  async initialize(): Promise<void> {
    await this.launchBrowser();
  }

  /**
   * Check if Playwright is available without actually importing it.
   * Returns true if Playwright can be dynamically imported.
   */
  async isAvailable(): Promise<boolean> {
    if (this._playwrightAvailable !== null) {
      return this._playwrightAvailable;
    }

    try {
      const playwrightModule = 'playwright';
      await import(/* webpackIgnore: true */ playwrightModule);
      this._playwrightAvailable = true;
      return true;
    } catch {
      this._playwrightAvailable = false;
      this.emit('browser:unavailable', { error: 'Playwright is not installed' });
      return false;
    }
  }

  // ─── Context Management ────────────────────────────────────────────

  /**
   * Create a new browser context with optional cookies.
   * Returns the context ID for tracking.
   */
  async createContext(cookies?: CookieEntry[]): Promise<string> {
    const browser = await this.ensureBrowser();

    // Enforce max context limit
    if (this._contexts.size >= this._config.maxContexts) {
      // Close the oldest context to make room
      const oldestId = this._contexts.keys().next().value;
      if (oldestId) {
        await this.closeContext(oldestId);
      }
    }

    const contextId = `ctx-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    // Inject cookies if provided
    if (cookies && cookies.length > 0) {
      const playwrightCookies = this.convertCookiesForPlaywright(cookies);
      await context.addCookies(playwrightCookies);
    }

    this._contexts.set(contextId, context);
    this.emit('context:created', { contextId });

    this.resetIdleTimer();
    return contextId;
  }

  /**
   * Extract media by loading a page in the browser.
   * If no contextId is provided, a temporary context is created and closed.
   */
  async extractWithBrowser(
    url: string,
    contextId?: string,
    options: BrowserExtractOptions = {},
  ): Promise<BrowserExtractResult> {
    const startTime = Date.now();

    let usedContextId = contextId;
    let isTemporaryContext = false;

    if (!usedContextId) {
      usedContextId = await this.createContext();
      isTemporaryContext = true;
    }

    const context = this._contexts.get(usedContextId);
    if (!context) {
      throw new ProviderError(
        `Browser context "${usedContextId}" not found`,
        'browser-manager',
        'CONFIG_ERROR' as ProviderErrorCode,
        false,
      );
    }

    try {
      const page = await context.newPage();
      page.setDefaultTimeout(this._pageTimeoutMs);

      const waitUntil = options.waitUntil ?? 'domcontentloaded';
      const timeoutMs = options.timeoutMs ?? this._pageTimeoutMs;

      await page.goto(url, { waitUntil, timeout: timeoutMs });

      // Wait for a specific selector if requested
      if (options.waitForSelector) {
        const selectorTimeout = options.waitForSelectorTimeoutMs ?? this._pageTimeoutMs;
        await page.waitForSelector(options.waitForSelector, { timeout: selectorTimeout });
      }

      // Evaluate JavaScript if provided
      let evaluatedResult: unknown = undefined;
      if (options.evaluateJs) {
        evaluatedResult = await page.evaluate(options.evaluateJs);
      }

      // Get page content
      const html = await page.content();
      const title = await page.title();

      // Get cookies from context
      const contextCookies = await context.cookies();
      const cookiesResult: BrowserCookieResult[] = contextCookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite as string,
      }));

      await page.close();

      const durationMs = Date.now() - startTime;
      this.emit('extract:success', { url, contextId: usedContextId, durationMs });

      this.resetIdleTimer();

      return {
        url,
        html,
        title,
        cookies: cookiesResult,
        evaluatedResult,
        durationMs,
        contextId: usedContextId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (isTemporaryContext) {
        await this.closeContext(usedContextId);
      }

      this.emit('extract:fail', { url, contextId: usedContextId, error: message });

      throw new ProviderError(
        `Browser extraction failed for "${url}": ${message}`,
        'browser-manager',
        'NETWORK' as ProviderErrorCode,
        true,
      );
    } finally {
      if (isTemporaryContext) {
        await this.closeContext(usedContextId).catch(() => {});
      }
    }
  }

  /**
   * Close a specific browser context by ID.
   */
  async closeContext(contextId: string): Promise<void> {
    const context = this._contexts.get(contextId);
    if (!context) return;

    try {
      await context.close();
    } catch {
      // Context may already be closed
    }

    this._contexts.delete(contextId);
    this.emit('context:closed', { contextId });
    this.resetIdleTimer();
  }

  /**
   * Close the browser and all contexts.
   */
  async shutdown(): Promise<void> {
    this.cancelIdleTimer();

    // Close all contexts first
    for (const contextId of Array.from(this._contexts.keys())) {
      await this.closeContext(contextId);
    }

    // Close the browser
    if (this._browser) {
      try {
        await this._browser.close();
      } catch {
        // Browser may already be closed
      }
      this._browser = null;
      this._launchPromise = null;
      this.emit('browser:shutdown', { timestamp: Date.now(), reason: 'manual' });
    }
  }

  /**
   * Get list of active context IDs.
   */
  getActiveContexts(): string[] {
    return Array.from(this._contexts.keys());
  }

  /**
   * Set page load timeout for all future page navigations.
   */
  setPageTimeout(timeoutMs: number): void {
    this._pageTimeoutMs = timeoutMs;
  }

  // ─── Internals ─────────────────────────────────────────────────────

  /**
   * Ensure browser is launched, lazily initializing it if needed.
   * Uses a singleton launch promise to prevent concurrent launches.
   */
  private async ensureBrowser(): Promise<PlaywrightBrowser> {
    if (this._browser) return this._browser;

    if (this._launchPromise) return this._launchPromise;

    this._launchPromise = this.launchBrowser();
    return this._launchPromise;
  }

  /**
   * Launch the Chromium browser via Playwright dynamic import.
   */
  private async launchBrowser(): Promise<PlaywrightBrowser> {
    if (this._browser) return this._browser;

    const available = await this.isAvailable();
    if (!available) {
      throw new ProviderError(
        'Playwright is not installed. Install it with: npm install playwright',
        'browser-manager',
        'CONFIG_ERROR' as ProviderErrorCode,
        false,
      );
    }

    try {
      // Dynamic import — Playwright is optional
      // Using a variable-based import to avoid bundler resolution errors
      // when playwright is not installed
      const playwrightModule = 'playwright';
      const { chromium } = await import(/* webpackIgnore: true */ playwrightModule);

      const launchOptions: Record<string, unknown> = {
        headless: this._config.launchOptions.headless,
        args: this._config.launchOptions.chromiumArgs,
      };

      if (this._config.launchOptions.executablePath) {
        launchOptions.executablePath = this._config.launchOptions.executablePath;
      }

      if (this._config.launchOptions.proxy) {
        launchOptions.proxy = this._config.launchOptions.proxy;
      }

      this._browser = await chromium.launch(launchOptions);
      this.emit('browser:launched', { timestamp: Date.now() });

      this.resetIdleTimer();
      return this._browser!;
    } catch (err) {
      this._launchPromise = null;
      const message = err instanceof Error ? err.message : String(err);
      throw new ProviderError(
        `Failed to launch Playwright browser: ${message}`,
        'browser-manager',
        'CONFIG_ERROR' as ProviderErrorCode,
        false,
      );
    }
  }

  /**
   * Reset the idle timer. When it expires, the browser shuts down.
   */
  private resetIdleTimer(): void {
    if (!this._config.autoShutdown) return;

    this.cancelIdleTimer();

    this._idleTimer = setTimeout(() => {
      this.idleShutdown();
    }, this._config.idleTimeoutMs);
  }

  /**
   * Cancel the current idle timer.
   */
  private cancelIdleTimer(): void {
    if (this._idleTimer !== null) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }

  /**
   * Shut down the browser after idle timeout.
   */
  private async idleShutdown(): Promise<void> {
    if (this._contexts.size > 0) {
      // Still active contexts — reset timer
      this.resetIdleTimer();
      return;
    }

    this._idleTimer = null;

    if (this._browser) {
      try {
        await this._browser.close();
      } catch {
        // Already closed
      }
      this._browser = null;
      this._launchPromise = null;
      this.emit('browser:shutdown', { timestamp: Date.now(), reason: 'idle' });
    }
  }

  /**
   * Convert CookieEntry objects from CookieManager to Playwright cookie format.
   */
  private convertCookiesForPlaywright(cookies: CookieEntry[]): PlaywrightCookieAddParam[] {
    return cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: this.mapSameSite(c.sameSite),
      expires: c.expires ? c.expires / 1000 : -1, // Playwright uses seconds, -1 = session
    }));
  }

  /**
   * Map sameSite values to Playwright's format.
   */
  private mapSameSite(sameSite?: 'strict' | 'lax' | 'none'): 'Strict' | 'Lax' | 'None' {
    switch (sameSite) {
      case 'strict': return 'Strict';
      case 'lax': return 'Lax';
      case 'none': return 'None';
      default: return 'Lax';
    }
  }
}

// ─── Playwright Type Stubs ───────────────────────────────────────────
// Minimal type definitions for Playwright types we interact with.
// These avoid importing Playwright types directly (optional dependency).

interface PlaywrightBrowser {
  newContext(options?: Record<string, unknown>): Promise<PlaywrightBrowserContext>;
  close(): Promise<void>;
}

interface PlaywrightBrowserContext {
  newPage(): Promise<PlaywrightPage>;
  addCookies(cookies: PlaywrightCookieAddParam[]): Promise<void>;
  cookies(urls?: string[]): Promise<PlaywrightCookieResult[]>;
  close(): Promise<void>;
}

interface PlaywrightPage {
  goto(url: string, options?: Record<string, unknown>): Promise<PlaywrightResponse>;
  waitForSelector(selector: string, options?: Record<string, unknown>): Promise<PlaywrightElementHandle>;
  evaluate(expression: string): Promise<unknown>;
  content(): Promise<string>;
  title(): Promise<string>;
  close(): Promise<void>;
  setDefaultTimeout(timeout: number): void;
}

interface PlaywrightResponse {
  url(): string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface PlaywrightElementHandle {
  // Minimal stub — Playwright element handle proxy
}

interface PlaywrightCookieAddParam {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
  expires: number;
}

interface PlaywrightCookieResult {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
}
