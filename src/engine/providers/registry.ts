/**
 * NovaDL Engine — Provider Registry
 */

import { TypedEmitter } from '../utils/events';
import type {
  Platform,
  MediaType,
  MediaFormat,
  ProviderConfig,
  ProviderHealth,
  ProviderInfo,
  ProviderStatus,
} from '../types/index';
import type { IProvider } from './base';

export interface RegistryEvents {
  'provider:registered': { providerId: string };
  'provider:unregistered': { providerId: string };
  'provider:enabled': { providerId: string };
  'provider:disabled': { providerId: string };
  'provider:health_change': { providerId: string; oldStatus: ProviderStatus; newStatus: ProviderStatus };
}

export class ProviderRegistry extends TypedEmitter<RegistryEvents> {
  private _providers: Map<string, IProvider> = new Map();
  private _configs: Map<string, ProviderConfig> = new Map();
  private _priorityOrder: string[] = [];

  // ─── Registration ──────────────────────────────────────────────────
  register(provider: IProvider): void {
    const id = provider.id;
    if (this._providers.has(id)) {
      throw new Error(`Provider '${id}' is already registered. Unregister it first.`);
    }
    this._providers.set(id, provider);
    this._configs.set(id, provider.config);
    this._rebuildPriorityOrder();
    this.emit('provider:registered', { providerId: id });
  }

  unregister(providerId: string): boolean {
    const existed = this._providers.has(providerId);
    this._providers.delete(providerId);
    this._configs.delete(providerId);
    this._rebuildPriorityOrder();
    if (existed) this.emit('provider:unregistered', { providerId });
    return existed;
  }

  // ─── Lookup ────────────────────────────────────────────────────────
  get(providerId: string): IProvider | undefined {
    return this._providers.get(providerId);
  }

  getAll(): IProvider[] {
    return this._priorityOrder
      .map((id) => this._providers.get(id))
      .filter((p): p is IProvider => p !== undefined);
  }

  getEnabled(): IProvider[] {
    return this.getAll().filter((p) => p.config.enabled);
  }

  // ─── Platform-Based Selection ──────────────────────────────────────
  getByPlatform(platform: Platform): IProvider[] {
    return this.getEnabled().filter((p) => p.supports(platform));
  }

  getByPlatformAndCapability(platform: Platform, mediaType?: MediaType, format?: MediaFormat): IProvider[] {
    let providers = this.getByPlatform(platform);
    if (mediaType) providers = providers.filter((p) => p.canDeliver(mediaType, format));
    return providers;
  }

  // ─── Enable/Disable ────────────────────────────────────────────────
  enable(providerId: string): boolean {
    const provider = this._providers.get(providerId);
    if (!provider) return false;
    if (!provider.config.enabled) {
      provider.config.enabled = true;
      this._rebuildPriorityOrder();
      this.emit('provider:enabled', { providerId });
    }
    return true;
  }

  disable(providerId: string): boolean {
    const provider = this._providers.get(providerId);
    if (!provider) return false;
    if (provider.config.enabled) {
      provider.config.enabled = false;
      this._rebuildPriorityOrder();
      this.emit('provider:disabled', { providerId });
    }
    return true;
  }

  // ─── Priority Management ────────────────────────────────────────────
  setPriority(providerId: string, priority: number): boolean {
    const provider = this._providers.get(providerId);
    if (!provider) return false;
    provider.config.priority = priority;
    this._configs.set(providerId, provider.config);
    this._rebuildPriorityOrder();
    return true;
  }

  // ─── Health Tracking ────────────────────────────────────────────────
  updateHealth(_providerId: string, _health: ProviderHealth): void {
    // Health data is stored in the provider itself
  }

  // ─── Info ────────────────────────────────────────────────────────────
  getInfo(): ProviderInfo[] {
    return this.getAll().map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      enabled: p.config.enabled,
      priority: p.config.priority,
      platforms: p.config.platforms,
      capabilities: p.getCapabilities(),
      health: { status: 'unknown' as ProviderStatus, lastChecked: new Date() },
    }));
  }

  // ─── Internal ────────────────────────────────────────────────────────
  private _rebuildPriorityOrder(): void {
    const entries = [...this._providers.entries()];
    entries.sort(([, a], [, b]) => {
      const enabledA = a.config.enabled ? 0 : 10000;
      const enabledB = b.config.enabled ? 0 : 10000;
      if (enabledA !== enabledB) return enabledA - enabledB;
      return a.config.priority - b.config.priority;
    });
    this._priorityOrder = entries.map(([id]) => id);
  }

  get size(): number { return this._providers.size; }
  get enabledSize(): number { return this.getEnabled().length; }
  has(providerId: string): boolean { return this._providers.has(providerId); }
}
