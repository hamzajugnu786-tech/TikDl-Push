/**
 * NovaDL Engine — Network Subsystem Barrel Export
 *
 * Single import point for cookie manager, proxy manager,
 * and browser fallback manager.
 */

// ─── Cookie Manager ──────────────────────────────────────────────────
export { PersistentCookieJar, DEFAULT_COOKIE_MANAGER_CONFIG } from './cookie-manager';
export type {
  CookieEntry,
  CookieJarState,
  CookieManagerConfig,
  CookieManagerEvents,
} from './cookie-manager';

// ─── Proxy Manager ────────────────────────────────────────────────────
export { ProxyManager, DEFAULT_PROXY_MANAGER_CONFIG } from './proxy-manager';
export type {
  ProxyProtocol,
  ProxyHealthStatus,
  ProxyConfig,
  ProxyStats,
  ProxyManagerConfig,
  ProxyManagerEvents,
  ProxyAgentDescriptor,
} from './proxy-manager';

// ─── Browser Manager ──────────────────────────────────────────────────
export { BrowserManager, DEFAULT_BROWSER_MANAGER_CONFIG } from './browser-manager';
export type {
  BrowserManagerConfig,
  PlaywrightLaunchOptions,
  BrowserProxyConfig,
  BrowserContextConfig,
  BrowserExtractOptions,
  BrowserExtractResult,
  BrowserCookieResult,
  BrowserManagerEvents,
} from './browser-manager';
