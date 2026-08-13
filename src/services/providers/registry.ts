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

  /**
   * Set of provider names explicitly disabled via per-provider config key
   * `provider_enabled_<name>` = 'false'.
   *
   * IMPORTANT: Disabled providers are NEVER removed from `providers` /
   * `providersByName`. They remain registered so that:
   *   - The admin UI can still list them as "Disabled"
   *   - Re-enabling them later is a constant-time set-membership flip
   *     (no need to re-call registerTikTokProviders(), which is gated
   *     behind `if (initialized) return` in init.ts).
   *   - Vercel serverless instances recover correctly on next cold start.
   */
  private disabledNames: Set<string> = new Set();

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
   *
   * NOTE: This returns ALL registered providers, INCLUDING disabled ones.
   * Callers that need to actually execute a download must use
   * getEnabledProviders() instead. This method is kept for telemetry,
   * health checks, and admin UI listing.
   */
  getProviders(platform: string): NovaDLProvider[] {
    return this.providers.get(platform) || [];
  }

  /**
   * Get all providers for a platform that are NOT disabled via per-provider
   * config. This is the list the DownloadService must use for actual
   * execution — disabled providers are excluded from the runtime race.
   */
  getEnabledProviders(platform: string): NovaDLProvider[] {
    const all = this.providers.get(platform) || [];
    return all.filter(p => !this.disabledNames.has(p.name));
  }

  /**
   * Get all registered platform identifiers.
   */
  getAllPlatforms(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get a specific provider by its unique name.
   * Returns the provider even if disabled — callers needing execution
   * eligibility must also call isProviderEnabled().
   */
  getProviderByName(name: string): NovaDLProvider | undefined {
    return this.providersByName.get(name);
  }

  /**
   * Whether a registered provider is enabled (not in the disabled set).
   * Unknown providers return false.
   */
  isProviderEnabled(name: string): boolean {
    if (!this.providersByName.has(name)) return false;
    return !this.disabledNames.has(name);
  }

  /**
   * Check if a platform is registered and has at least one enabled provider.
   * (A platform with all providers disabled is considered unsupported.)
   */
  isPlatformSupported(platform: string): boolean {
    const providers = this.getEnabledProviders(platform);
    return providers.length > 0;
  }

  /**
   * Get a snapshot of all configured providers across all platforms,
   * with their enabled/disabled state. Used by /api/health and /api/admin/config
   * to provide a consistent, telemetry-independent provider list to the admin UI.
   */
  getConfiguredProviders(): Array<{ name: string; platform: string; enabled: boolean }> {
    const result: Array<{ name: string; platform: string; enabled: boolean }> = [];
    for (const [platform, providers] of this.providers.entries()) {
      for (const p of providers) {
        result.push({
          name: p.name,
          platform,
          enabled: !this.disabledNames.has(p.name),
        });
      }
    }
    return result;
  }

  /**
   * Load provider configuration from the database Settings table.
   *
   * Per-provider enable/disable (PRIMARY mechanism — what the admin UI uses):
   *   provider_enabled_<name>  → "true" | "false"
   *   (missing key = enabled by default — never blocks existing setups)
   *
   * Legacy platform-level keys (still respected for backward compat, but
   * admin UI no longer writes these):
   *   provider_<platform>_enabled   → "false" disables ALL providers for that platform
   *   provider_<platform>_primary   → primary provider name
   *   provider_<platform>_fallback  → fallback provider name
   *
   * CRITICAL: This method is NON-DESTRUCTIVE. It only mutates `disabledNames`
   * (a Set) and optionally reorders the providers array. It NEVER deletes
   * providers from the in-memory registry, so:
   *   - Re-enabling a provider is a constant-time set-membership flip
   *   - reloadConfig() can be called repeatedly without data loss
   *   - Vercel serverless instances recover correctly on next cold start
   */
  async loadFromConfig(): Promise<void> {
    if (this.configLoaded) return;

    try {
      const settings = await db.settings.findMany();
      const settingsMap = new Map(settings.map(s => [s.key, s.value]));

      // Reset disabled set — recompute from DB on every reload
      this.disabledNames = new Set();

      // Step 1: Apply platform-level disable (legacy compat).
      // If `provider_<platform>_enabled === 'false'`, ALL providers for that
      // platform are marked disabled (but NOT removed from the registry).
      for (const [platform, providers] of this.providers.entries()) {
        const platformEnabledKey = `provider_${platform}_enabled`;
        if (settingsMap.get(platformEnabledKey) === 'false') {
          for (const p of providers) {
            this.disabledNames.add(p.name);
          }
          console.log(`[Registry] Platform "${platform}" disabled via legacy key — marked ${providers.length} providers disabled.`);
        }
      }

      // Step 2: Apply per-provider enable/disable (PRIMARY mechanism).
      // Keys: `provider_enabled_<name>` = 'true' | 'false'
      // 'false' → add to disabledNames. 'true' → remove from disabledNames
      // (allows re-enabling a provider that was disabled by platform-level key).
      for (const s of settings) {
        if (!s.key.startsWith('provider_enabled_')) continue;
        const name = s.key.slice('provider_enabled_'.length);
        if (!name) continue;
        if (!this.providersByName.has(name)) continue; // unknown provider, ignore
        if (s.value === 'false') {
          this.disabledNames.add(name);
        } else if (s.value === 'true') {
          this.disabledNames.delete(name);
        }
      }

      // Step 3: Apply per-provider priority reordering (legacy compat).
      // Reorder each platform's provider array based on
      // provider_<platform>_primary / provider_<platform>_fallback.
      for (const [platform, providers] of this.providers.entries()) {
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
          for (const p of providers) {
            if (!reordered.some(rp => rp.name === p.name)) {
              reordered.push(p);
            }
          }
          if (reordered.length > 0) {
            this.providers.set(platform, reordered);
          }
        }
      }

      const disabledList = Array.from(this.disabledNames);
      console.log(`[Registry] Config loaded. Disabled providers: ${disabledList.length ? disabledList.join(', ') : '(none)'}`);

      this.configLoaded = true;
    } catch (error) {
      console.error('[Registry] Failed to load config from DB:', error);
      // Fail safe: leave providers in their default (enabled) state.
      this.disabledNames = new Set();
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
