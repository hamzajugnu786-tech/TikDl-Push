/**
 * TikTok Provider Registration — Phase 1
 *
 * Registers TikTok providers with the global ProviderRegistry.
 * TikHub is primary, RapidAPI is fallback.
 *
 * This is the ONLY place where TikTok providers are registered.
 * No hardcoded switch statements. Dynamic, config-driven.
 */

import { getRegistry } from '../../registry';
import { TikTokTikHubAdapter } from './tikhub';
import { TikTokRapidAPIAdapter } from './rapidapi';

/**
 * Register all TikTok providers with the registry.
 * Order matters: first registered = primary, second = fallback.
 *
 * After registration, the DownloadService will:
 * 1. Try the primary provider (TikHub)
 * 2. If primary fails, try the fallback (RapidAPI)
 * 3. If both fail, throw DOWNLOAD_FAILED
 */
export function registerTikTokProviders(): void {
  const registry = getRegistry();

  // Primary provider (first registered = highest priority)
  registry.register('tiktok', new TikTokTikHubAdapter());

  // Fallback provider
  registry.register('tiktok', new TikTokRapidAPIAdapter());

  console.log('[TikTokProviders] Registered TikHub (primary) + RapidAPI (fallback) for TikTok platform');
}
