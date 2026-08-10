/**
 * NovaDL Provider Registry — Phase 1
 *
 * Dynamic provider registry that supports unlimited providers.
 * No hardcoded switch statements. Provider registration is dynamic.
 *
 * Current providers:
 *   TikTok: TikHub (primary), RapidAPI (fallback)
 *
 * Future providers (registered but not implemented yet):
 *   Instagram, Facebook, YouTube, Twitter, Pinterest, Snapchat, etc.
 *
 * Provider selection is configuration-driven, loaded from the DB
 * Settings table or env vars. The admin can enable/disable providers,
 * change priority, set fallback chains — all without modifying source code.
 */

import { NovaDLProvider, ProviderHealth, ProviderCapabilities } from './types';
import { db } from '@/lib/db';

// ============================================================================
// REGISTRY CLASS
// ============================================================================

export class ProviderRegistry {
  /** Map of platform → ordered array of providers (first = primary) */
  private providers: Map<string, NovaDLProvider[]> = new Map();

  /** Map of provider name → provider instance (for quick lookup) */
  private providersByName: Map<string, NovaDLProvider> = new Map();

  /** Whether configuration has been loaded from DB */
  private configLoaded = false;

  /**
   * Register a provider for a platform.
   * Multiple providers per platform are allowed (for fallback chains).
   * Providers are ordered by priority (first = primary).
   */
  register(platform: string, provider: NovaDLProvider): void {
    const existing = this.providers.get(platform) || [];

    // Avoid duplicate registration by name
    if (existing.some(p => p.name === provider.name)) {
      console.warn(`[Registry] Provider "${provider.name}" already registered for platform "${platform}". Skipping.`);
      return;
    }

    existing.push(provider);
    this.providers.set(platform, existing);
    this.providersByName.set(provider.name, provider);

    console.log(`[Registry] Registered provider "${provider.name}" for platform "${platform}" (priority: ${existing.length})`);
  }

  /**
   * Get all providers for a platform, ordered by priority.
   * Returns empty array if platform is not registered.
   */
  getProviders(platform: string): NovaDLProvider[] {
    return this.providers.get(platform) || [];
  }

  /**
   * Get all registered platform identifiers.
   */
  getAllPlatforms(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get a specific provider by its unique name.
   */
  getProviderByName(name: string): NovaDLProvider | undefined {
    return this.providersByName.get(name);
  }

  /**
   * Check if a platform is registered and has at least one enabled provider.
   */
  isPlatformSupported(platform: string): boolean {
    const providers = this.providers.get(platform);
    return !!providers && providers.length > 0;
  }

  /**
   * Load provider configuration from the database Settings table.
   *
   * Reads settings with keys:
   *   provider_<platform>_primary   → primary provider name
   *   provider_<platform>_fallback  → fallback provider name
   *   provider_<platform>_enabled   → "true" or "false"
   *
   * Falls back to environment variables for defaults:
   *   PROVIDER_NAME → primary provider (existing env var, reused)
   *   PROVIDER_FALLBACK → fallback provider (new env var)
   */
  async loadFromConfig(): Promise<void> {
    if (this.configLoaded) return;

    try {
      const settings = await db.settings.findMany();
      const settingsMap = new Map(settings.map(s => [s.key, s.value]));

      // Check if provider config exists in DB
      const hasDbConfig = settings.some(s => s.key.startsWith('provider_'));

      if (hasDbConfig) {
        // Load from DB configuration
        console.log('[Registry] Loading provider configuration from DB Settings');

        for (const [platform, providers] of this.providers.entries()) {
          const enabledKey = `provider_${platform}_enabled`;
          const enabled = settingsMap.get(enabledKey);

          if (enabled === 'false') {
            console.log(`[Registry] Platform "${platform}" is disabled in config. Removing all providers.`);
            this.providers.delete(platform);
            for (const p of providers) {
              this.providersByName.delete(p.name);
            }
            continue;
          }

          // Reorder providers based on DB priority settings
          const primaryKey = `provider_${platform}_primary`;
          const fallbackKey = `provider_${platform}_fallback`;
          const primaryName = settingsMap.get(primaryKey);
          const fallbackName = settingsMap.get(fallbackKey);

          if (primaryName || fallbackName) {
            const reordered: NovaDLProvider[] = [];

            if (primaryName) {
              const primary = providers.find(p => p.name === primaryName);
              if (primary) reordered.push(primary);
            }

            if (fallbackName) {
              const fallback = providers.find(p => p.name === fallbackName);
              if (fallback && !reordered.some(p => p.name === fallback.name)) {
                reordered.push(fallback);
              }
            }

            // Add any remaining providers not specified in config
            for (const p of providers) {
              if (!reordered.some(rp => rp.name === p.name)) {
                reordered.push(p);
              }
            }

            if (reordered.length > 0) {
              this.providers.set(platform, reordered);
            }
          }

          // Filter out providers explicitly disabled per-provider:
          // provider_<platform>_<name>_enabled = "false"
          const currentProviders = this.providers.get(platform) || [];
          const filteredProviders: NovaDLProvider[] = [];
          for (const p of currentProviders) {
            const perProviderKey = `provider_${platform}_${p.name}_enabled`;
            const perProviderEnabled = settingsMap.get(perProviderKey);
            if (perProviderEnabled === 'false') {
              console.log(`[Registry] Provider "${p.name}" disabled in DB config. Removing from registry.`);
              this.providersByName.delete(p.name);
              continue;
            }
            filteredProviders.push(p);
          }
          if (filteredProviders.length > 0) {
            this.providers.set(platform, filteredProviders);
          } else if (currentProviders.length > 0) {
            // All providers for this platform were disabled — keep registry empty for this platform
            this.providers.set(platform, filteredProviders);
          }
        }
      } else {
        // No DB config — fall back to environment variables
        console.log('[Registry] No DB provider config found. Using environment defaults.');
        // Existing providers are already registered in the correct order
        // (TikHub primary, RapidAPI fallback) via the registration call.
        // The PROVIDER_NAME env var is already respected by the old getProvider().
        // In Phase 1, we keep the same default behavior.
      }

      this.configLoaded = true;
    } catch (error) {
      console.error('[Registry] Failed to load config from DB:', error);
      // Fall back to current registration order (env var defaults)
      this.configLoaded = true;
    }
  }

  /**
   * Reload configuration (called when admin saves provider settings).
   */
  async reloadConfig(): Promise<void> {
    this.configLoaded = false;
    await this.loadFromConfig();
  }

  /**
   * Run health checks on all registered providers.
   * Returns a map of provider name → ProviderHealth.
   */
  async healthCheckAll(): Promise<Map<string, ProviderHealth & { platform: string }>> {
    const results = new Map<string, ProviderHealth & { platform: string }>();

    for (const [name, provider] of this.providersByName.entries()) {
      try {
        const health = await provider.healthCheck();
        results.set(name, { ...health, platform: provider.platform });
      } catch (error) {
        results.set(name, {
          status: 'offline',
          latency: 0,
          availability: 0,
          errorRate: 1,
          successRate: 0,
          retryCount: 0,
          lastCheck: new Date(),
          platform: provider.platform,
        });
      }
    }

    return results;
  }

  /**
   * Get capabilities for a specific platform.
   * Aggregates capabilities from all providers for that platform.
   */
  getPlatformCapabilities(platform: string): ProviderCapabilities | null {
    const providers = this.getProviders(platform);
    if (providers.length === 0) return null;

    // Aggregate capabilities from all providers (union)
    const aggregated: ProviderCapabilities = {
      supportsVideo: false,
      supportsAudio: false,
      supportsImages: false,
      supportsSlides: false,
      supportsStories: false,
      supportsReels: false,
      supportsShorts: false,
      supportsPlaylist: false,
      supportsLive: false,
      supportsCaptions: false,
      supportsMetadata: false,
    };

    for (const provider of providers) {
      const caps = provider.capabilities();
      for (const key of Object.keys(aggregated) as (keyof ProviderCapabilities)[]) {
        if (caps[key]) aggregated[key] = true;
      }
    }

    return aggregated;
  }
}

// ============================================================================
// GLOBAL REGISTRY SINGLETON
// ============================================================================

/**
 * Global singleton registry instance.
 * This is the one instance used throughout the application.
 * Providers are registered once at startup, then the registry is used
 * by DownloadService, health checks, and the admin dashboard.
 */
let globalRegistry: ProviderRegistry | null = null;

export function getRegistry(): ProviderRegistry {
  if (!globalRegistry) {
    globalRegistry = new ProviderRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global registry (for testing or reloading).
 */
export function resetRegistry(): void {
  globalRegistry = null;
}
