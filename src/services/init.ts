/**
 * NovaDL Initialization — Phase 1
 *
 * Bootstraps the NovaDL service layer on application startup:
 * 1. Register all providers (currently TikTok only)
 * 2. Load provider configuration from DB Settings
 * 3. The DownloadService, PlatformDetector, and Logger are
 *    auto-initialized via their singleton getters.
 *
 * This module is called ONCE at startup, typically from the
 * download API route or a Next.js middleware.
 *
 * ⚠️  The old providers/ directory is NOT removed yet.
 *     It remains active until Step 8 (API route switch) is verified.
 *     After that, the old providers are deprecated and removed in cleanup.
 */

import { registerTikTokProviders } from './providers/adapters/tiktok';
import { getRegistry } from './providers/registry';

let initialized = false;

/**
 * Initialize the NovaDL service layer.
 * Registers providers and loads DB configuration.
 *
 * This should be called once, early in the application lifecycle.
 * It's safe to call multiple times — subsequent calls are no-ops.
 */
export async function initializeNovaDL(): Promise<void> {
  if (initialized) {
    console.log('[NovaDL] Already initialized. Skipping.');
    return;
  }

  console.log('[NovaDL] Initializing service layer...');

  // Step 1: Register all providers
  // Currently TikTok only. Future platforms register here too.
  registerTikTokProviders();

  // Step 2: Load provider configuration from DB
  // This reads the Settings table and may reorder/disable providers.
  const registry = getRegistry();
  await registry.loadFromConfig();

  // Step 3: Log registration summary
  const platforms = registry.getAllPlatforms();
  for (const platform of platforms) {
    const providers = registry.getProviders(platform);
    console.log(`[NovaDL] Platform "${platform}": ${providers.map(p => p.name).join(' → ')} (primary → fallback chain)`);
  }

  initialized = true;
  console.log('[NovaDL] Initialization complete.');
}

/**
 * Check if NovaDL has been initialized.
 */
export function isNovaDLInitialized(): boolean {
  return initialized;
}

/**
 * Force re-initialization (for testing or config reload).
 */
export function resetNovaDL(): void {
  initialized = false;
}
