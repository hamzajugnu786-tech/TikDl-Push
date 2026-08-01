/**
 * NovaDL Initialization — Integrated with Real NovaDL Engine
 *
 * Bootstraps the NovaDL service layer on application startup:
 * 1. Initialize the real NovaDL engine (native extractors → TikHub → RapidAPI)
 * 2. Register old provider adapters as fallback
 * 3. Load provider configuration from DB Settings
 *
 * Provider priority order:
 *   Native TikTok Extractor (priority 1) → TikHub (priority 10) → RapidAPI (priority 15)
 *
 * The engine handles all extraction logic internally with its own
 * fallback chain. The old provider registry is kept as a secondary
 * fallback if the engine itself fails to initialize.
 */

import { getEngine, isEngineInitialized } from './engine-bridge';
import { registerTikTokProviders } from './providers/adapters/tiktok';
import { getRegistry } from './providers/registry';

let initialized = false;

/**
 * Initialize the NovaDL service layer.
 *
 * 1. Initialize the real NovaDL engine (with native extractors)
 * 2. Register old provider adapters as fallback
 * 3. Load DB configuration
 *
 * This should be called once, early in the application lifecycle.
 * It's safe to call multiple times — subsequent calls are no-ops.
 */
export async function initializeNovaDL(): Promise<void> {
  if (initialized) {
    return;
  }

  console.log('[NovaDL] Initializing service layer with real NovaDL engine...');

  // Step 1: Initialize the real NovaDL engine
  try {
    const engine = await getEngine();
    const providers = engine.getProviders();
    console.log(`[NovaDL] Engine initialized with ${providers.length} providers:`);
    for (const p of providers) {
      console.log(`[NovaDL]   - ${p.id} (priority: ${p.priority}, platforms: ${p.platforms.join(', ')})`);
    }
  } catch (error) {
    console.error('[NovaDL] Engine initialization failed:', error);
    console.warn('[NovaDL] Falling back to old provider registry only');
  }

  // Step 2: Register old provider adapters as fallback
  registerTikTokProviders();

  // Step 3: Load provider configuration from DB
  const registry = getRegistry();
  await registry.loadFromConfig();

  // Step 4: Log registration summary
  const platforms = registry.getAllPlatforms();
  for (const platform of platforms) {
    const providers = registry.getProviders(platform);
    console.log(`[NovaDL] Fallback registry for "${platform}": ${providers.map(p => p.name).join(' → ')}`);
  }

  initialized = true;
  console.log('[NovaDL] Initialization complete. Engine ready:', isEngineInitialized());
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
