/**
 * TikTok Provider Registration — Phase 1
 *
 * Registers TikTok providers with the global ProviderRegistry.
 *
 * Provider order (first registered = primary):
 *   1. tiktok-api-dl (FREE, no API keys, V2→V3→V1 internal fallback)
 *   2. tikhub (emergency fallback — paid, quota-limited)
 *   3. rapidapi (emergency fallback — paid)
 *
 * This is the ONLY place where TikTok providers are registered.
 * No hardcoded switch statements. Dynamic, config-driven.
 */

import { getRegistry } from '../../registry';
import { TikTokApiDlAdapter } from './tiktokApiDl';
import { TikTokTikHubAdapter } from './tikhub';
import { TikTokRapidAPIAdapter } from './rapidapi';

/**
 * Register all TikTok providers with the registry.
 * Order matters: first registered = primary, second = fallback.
 *
 * After registration, the DownloadService will:
 * 1. Try the primary provider (tiktok-api-dl — FREE)
 * 2. If primary fails, try tikhub (emergency fallback)
 * 3. If tikhub fails, try rapidapi (emergency fallback)
 * 4. If all fail, throw DOWNLOAD_FAILED
 */
export function registerTikTokProviders(): void {
  const registry = getRegistry();

  // Primary provider (FREE — no API keys, triple internal fallback)
  registry.register('tiktok', new TikTokApiDlAdapter());

  // Emergency fallback providers (keep existing — they still work when quota is available)
  registry.register('tiktok', new TikTokTikHubAdapter());
  registry.register('tiktok', new TikTokRapidAPIAdapter());

  console.log('[TikTokProviders] Registered tiktok-api-dl (primary) + TikHub (fallback) + RapidAPI (fallback) for TikTok platform');
}
