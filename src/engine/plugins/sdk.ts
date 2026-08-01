/**
 * NovaDL Engine — Plugin SDK
 *
 * The plugin system is NovaDL's extensibility backbone. It allows
 * developers to add new providers, hook into the extraction pipeline,
 * and extend the engine's behavior without modifying core code.
 *
 * Design principles:
 * - Plugins are isolated: they can't break the core engine
 * - Plugins communicate through hooks, not direct calls
 * - Plugins can register new providers dynamically
 * - Plugins can be enabled/disabled without restarting
 * - Plugin lifecycle is managed: install → activate → deactivate → uninstall
 */

import { TypedEmitter } from '../utils/events';
import type {
  IPlugin,
  PluginHook,
  PluginHookHandler,
  PluginContext,
  PipelineContext,
  ExtractionRequest,
  ExtractionResult,
  NovaDLConfig,
} from '../types/index';
import type { IProvider } from '../providers/base';
import type { NovaLogger } from '../monitoring/logger';
import type { ProviderRegistry } from '../providers/registry';

// ─── Engine Interface (avoids circular deps) ────────────────────────────
/**
 * EngineLike — The subset of the NovaDLEngine API that plugins need.
 *
 * Defined here to avoid circular dependencies between the plugin system
 * and the core engine. Plugins receive this interface through PluginContext,
 * giving them controlled access to engine capabilities.
 */
export interface EngineLike {
  getConfig(): NovaDLConfig;
  getLogger(): NovaLogger;
  getRegistry(): ProviderRegistry;
  extract(request: ExtractionRequest): Promise<ExtractionResult>;
}

// ─── Plugin Lifecycle ────────────────────────────────────────────────
export type PluginState = 'installed' | 'active' | 'deactivating' | 'inactive' | 'error';

export interface PluginEntry {
  plugin: IPlugin;
  state: PluginState;
  config: Record<string, unknown>;
  installedAt: Date;
  activatedAt?: Date;
  error?: string;
}

// ─── Plugin Events ──────────────────────────────────────────────────
export interface PluginLoaderEvents {
  'plugin:installed': { pluginId: string };
  'plugin:uninstalled': { pluginId: string };
}

// ─── Plugin Context ──────────────────────────────────────────────────
/**
 * PluginContextImpl — The API surface exposed to plugins.
 *
 * Plugins receive this context during installation and use it
 * to register hooks, providers, and access engine services.
 * This is the ONLY way plugins interact with the engine,
 * ensuring isolation and controlled extensibility.
 */
export class PluginContextImpl implements PluginContext {
  private _engine: EngineLike;
  private _registry: ProviderRegistry;
  private _logger: NovaLogger;
  private _config: Record<string, unknown>;
  private _hooks: Map<PluginHook, PluginHookHandler[]> = new Map();

  constructor(
    pluginId: string,
    engine: EngineLike,
    registry: ProviderRegistry,
    logger: NovaLogger,
    config: Record<string, unknown>,
  ) {
    this._engine = engine;
    this._registry = registry;
    this._logger = logger.child({ plugin: pluginId });
    this._config = config;
  }

  /** Register a hook handler for a specific pipeline event */
  on(hook: PluginHook, handler: PluginHookHandler): void {
    const handlers = this._hooks.get(hook) ?? [];
    handlers.push(handler);
    this._hooks.set(hook, handlers);
  }

  /** Unregister a hook handler */
  off(hook: PluginHook, handler: PluginHookHandler): void {
    const handlers = this._hooks.get(hook) ?? [];
    const index = handlers.indexOf(handler);
    if (index >= 0) {
      handlers.splice(index, 1);
    }
    this._hooks.set(hook, handlers);
  }

  /** Register a new provider via the plugin system */
  registerProvider(provider: IProvider): void {
    if (!this._registry.has(provider.id)) {
      this._registry.register(provider);
      this._logger.info(`Plugin registered provider: ${provider.id}`, {
        providerId: provider.id,
        providerName: provider.name,
      });
    } else {
      this._logger.warn(`Provider ${provider.id} already registered, skipping`, {
        providerId: provider.id,
      });
    }
  }

  /** Get an existing provider from the registry */
  getProvider(id: string): IProvider | undefined {
    return this._registry.get(id);
  }

  /** Access the engine's structured logger */
  get logger(): NovaLogger {
    return this._logger;
  }

  /** Access plugin-specific configuration */
  get config(): Record<string, unknown> {
    return this._config;
  }

  /** Get all registered hooks for this plugin */
  getHooks(): Map<PluginHook, PluginHookHandler[]> {
    return this._hooks;
  }

  /** Access the engine reference (for advanced plugins) */
  get engine(): EngineLike {
    return this._engine;
  }
}

// ─── Plugin Loader & Manager ──────────────────────────────────────────
export class PluginLoader extends TypedEmitter<PluginLoaderEvents> {
  private _plugins: Map<string, PluginEntry> = new Map();
  private _contexts: Map<string, PluginContextImpl> = new Map();
  private _registry: ProviderRegistry;
  private _logger: NovaLogger;
  private _engine: EngineLike;

  constructor(engine: EngineLike, registry: ProviderRegistry, logger: NovaLogger) {
    super();
    this._engine = engine;
    this._registry = registry;
    this._logger = logger.child({ component: 'plugin-loader' });
  }

  /** Install and activate a plugin */
  async install(plugin: IPlugin, config: Record<string, unknown> = {}): Promise<void> {
    const manifest = plugin.manifest;
    const id = manifest.id;

    if (this._plugins.has(id)) {
      throw new Error(`Plugin '${id}' is already installed`);
    }

    this._logger.info(`Installing plugin: ${manifest.name} (${id})`, {
      pluginId: id,
      version: manifest.version,
    });

    // Create the plugin context
    const context = new PluginContextImpl(
      id,
      this._engine,
      this._registry,
      this._logger,
      config,
    );

    // Install the plugin
    try {
      plugin.install(context);
    } catch (error) {
      this._logger.error(`Plugin installation failed: ${id}`, {
        pluginId: id,
        error: error instanceof Error ? error.message : String(error),
      });

      this._plugins.set(id, {
        plugin,
        state: 'error',
        config,
        installedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }

    // Store the plugin entry and context
    const entry: PluginEntry = {
      plugin,
      state: 'active',
      config,
      installedAt: new Date(),
      activatedAt: new Date(),
    };

    this._plugins.set(id, entry);
    this._contexts.set(id, context);

    this.emit('plugin:installed', { pluginId: id });
    this._logger.info(`Plugin activated: ${manifest.name}`, { pluginId: id });
  }

  /** Uninstall a plugin — deactivates it and removes all hooks */
  async uninstall(pluginId: string): Promise<boolean> {
    const entry = this._plugins.get(pluginId);
    if (!entry) return false;

    this._logger.info(`Uninstalling plugin: ${pluginId}`, { pluginId });

    // Deactivate first
    if (entry.state === 'active') {
      await this._deactivate(pluginId);
    }

    // Call plugin's uninstall hook
    if (entry.plugin.uninstall) {
      try {
        entry.plugin.uninstall();
      } catch (error) {
        this._logger.warn(`Plugin uninstall hook failed: ${pluginId}`, {
          pluginId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Remove from registry
    this._plugins.delete(pluginId);
    this._contexts.delete(pluginId);

    this.emit('plugin:uninstalled', { pluginId });
    return true;
  }

  /** Deactivate a plugin (disable hooks but keep it installed) */
  private async _deactivate(pluginId: string): Promise<void> {
    const entry = this._plugins.get(pluginId);
    if (!entry) return;

    entry.state = 'deactivating';

    // Plugin's hooks remain registered but won't be called
    // when the plugin state is not 'active'
    entry.state = 'inactive';

    this._logger.info(`Plugin deactivated: ${pluginId}`, { pluginId });
  }

  /** Re-activate a deactivated plugin */
  async activate(pluginId: string): Promise<boolean> {
    const entry = this._plugins.get(pluginId);
    if (!entry) return false;
    if (entry.state === 'active') return true;
    if (entry.state === 'error') return false;

    entry.state = 'active';
    entry.activatedAt = new Date();

    this._logger.info(`Plugin re-activated: ${pluginId}`, { pluginId });
    return true;
  }

  /** Execute a hook for all active plugins */
  async executeHook(hook: PluginHook, context: PipelineContext, ...args: unknown[]): Promise<void> {
    for (const [id, entry] of this._plugins) {
      if (entry.state !== 'active') continue;

      const pluginContext = this._contexts.get(id);
      if (!pluginContext) continue;

      const handlers = pluginContext.getHooks().get(hook) ?? [];
      for (const handler of handlers) {
        try {
          await handler(context, ...args);
        } catch (error) {
          this._logger.warn(`Plugin hook execution failed`, {
            pluginId: id,
            hook,
            error: error instanceof Error ? error.message : String(error),
          });
          // Don't let plugin errors break the pipeline
        }
      }
    }
  }

  /** Get all installed plugins */
  getPlugins(): PluginEntry[] {
    return [...this._plugins.values()];
  }

  /** Get a specific plugin */
  getPlugin(id: string): PluginEntry | undefined {
    return this._plugins.get(id);
  }

  /** Check if a plugin is installed */
  isInstalled(id: string): boolean {
    return this._plugins.has(id);
  }

  /** Check if a plugin is active */
  isActive(id: string): boolean {
    const entry = this._plugins.get(id);
    return entry?.state === 'active';
  }
}
