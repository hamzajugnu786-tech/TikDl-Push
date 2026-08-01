/**
 * NovaDL Engine — Health Monitor
 *
 * Tracks provider health with auto-disable and auto-recovery:
 * - When a provider exceeds 5 consecutive failures, it is automatically disabled.
 * - When a previously disabled provider's health check succeeds, it is automatically re-enabled.
 * - Emits health_change events with old and new statuses.
 * - getStatus() now uses actual provider health data from health checks.
 */

import { TypedEmitter } from '../utils/events';
import type { ProviderHealth, ProviderStatus } from '../types/index';
import type { ProviderRegistry } from '../providers/registry';
import type { NovaLogger } from './logger';

/** Threshold of consecutive failures before auto-disabling a provider */
const AUTO_DISABLE_THRESHOLD = 5;

export interface HealthMonitorEvents {
  'health:check': { providerCount: number; healthyCount: number; degradedCount: number; unhealthyCount: number };
  'health:provider_change': { providerId: string; oldStatus: ProviderStatus; newStatus: ProviderStatus };
}

export interface EngineHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptimeMs: number;
  providers: Record<string, ProviderHealth>;
  activeExtractions: number;
  lastChecked: Date;
}

export class HealthMonitor extends TypedEmitter<HealthMonitorEvents> {
  private _registry: ProviderRegistry;
  private _logger: NovaLogger;
  private _checkIntervalMs: number;
  private _intervalTimer: NodeJS.Timeout | undefined;
  private _startTime: Date;
  private _activeExtractions = 0;

  /** Per-provider cached health data populated during health checks */
  private _providerHealthMap: Map<string, ProviderHealth> = new Map();

  /** Per-provider previous status for detecting changes */
  private _previousStatusMap: Map<string, ProviderStatus> = new Map();

  constructor(registry: ProviderRegistry, logger: NovaLogger, checkIntervalMs: number = 30000) {
    super();
    this._registry = registry;
    this._logger = logger.child({ component: 'health-monitor' });
    this._checkIntervalMs = checkIntervalMs;
    this._startTime = new Date();
  }

  start(): void {
    this._logger.info('Starting health monitoring', { intervalMs: this._checkIntervalMs });
    this._runChecks();
    this._intervalTimer = setInterval(() => { this._runChecks(); }, this._checkIntervalMs);
  }

  stop(): void {
    if (this._intervalTimer) {
      clearInterval(this._intervalTimer);
      this._intervalTimer = undefined;
    }
    this._logger.info('Health monitoring stopped');
  }

  private async _runChecks(): Promise<void> {
    // Check ALL providers (including disabled ones) for auto-recovery
    const allProviders = this._registry.getAll();
    const enabledProviders = this._registry.getEnabled();

    this._logger.debug('Running health checks', {
      totalProviders: allProviders.length,
      enabledProviders: enabledProviders.length,
    });

    for (const provider of allProviders) {
      try {
        const newHealth = await provider.healthCheck();
        const newStatus = newHealth.status;

        // Store the health data
        this._providerHealthMap.set(provider.id, newHealth);

        // Detect status change
        const oldStatus = this._previousStatusMap.get(provider.id) ?? 'unknown';

        if (oldStatus !== newStatus) {
          this.emit('health:provider_change', {
            providerId: provider.id,
            oldStatus,
            newStatus,
          });
          this._previousStatusMap.set(provider.id, newStatus);
        }

        this._registry.updateHealth(provider.id, newHealth);

        // ─── Auto-disable ──────────────────────────────────────────────
        if (provider.config.enabled && (newHealth.consecutiveFailures ?? 0) >= AUTO_DISABLE_THRESHOLD) {
          this._logger.warn(`Auto-disabling provider ${provider.id} after ${AUTO_DISABLE_THRESHOLD} consecutive failures`, {
            providerId: provider.id,
            consecutiveFailures: newHealth.consecutiveFailures,
          });
          this._registry.disable(provider.id);

          // Emit status change to disabled
          this.emit('health:provider_change', {
            providerId: provider.id,
            oldStatus: newStatus,
            newStatus: 'disabled',
          });
          this._previousStatusMap.set(provider.id, 'disabled');
        }

        // ─── Auto-recovery ──────────────────────────────────────────────
        if (!provider.config.enabled && newStatus === 'healthy' && (newHealth.consecutiveSuccesses ?? 0) >= 1) {
          this._logger.info(`Auto-re-enabling provider ${provider.id} after successful health check`, {
            providerId: provider.id,
            consecutiveSuccesses: newHealth.consecutiveSuccesses,
          });
          this._registry.enable(provider.id);

          // Emit status change from disabled to healthy
          this.emit('health:provider_change', {
            providerId: provider.id,
            oldStatus: 'disabled',
            newStatus: 'healthy',
          });
          this._previousStatusMap.set(provider.id, 'healthy');
        }

        this._logger.info(`Provider ${provider.id} health: ${this._previousStatusMap.get(provider.id) ?? newStatus}`, {
          providerId: provider.id,
          status: this._previousStatusMap.get(provider.id) ?? newStatus,
          consecutiveFailures: newHealth.consecutiveFailures,
          consecutiveSuccesses: newHealth.consecutiveSuccesses,
        });
      } catch (error) {
        this._logger.warn(`Health check failed for provider ${provider.id}`, {
          providerId: provider.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Compute aggregate counts for the health:check event
    let healthyCount = 0;
    let degradedCount = 0;
    let unhealthyCount = 0;
    const enabled = this._registry.getEnabled();

    for (const provider of enabled) {
      const health = this._providerHealthMap.get(provider.id);
      const status = health?.status ?? 'unknown';
      if (status === 'healthy') healthyCount++;
      else if (status === 'degraded') degradedCount++;
      else unhealthyCount++;
    }

    this.emit('health:check', {
      providerCount: enabled.length,
      healthyCount,
      degradedCount,
      unhealthyCount,
    });
  }

  getStatus(): EngineHealthStatus {
    const enabled = this._registry.getEnabled();

    const providerHealth: Record<string, ProviderHealth> = {};
    let healthyCount = 0;
    let degradedCount = 0;

    for (const provider of enabled) {
      const storedHealth = this._providerHealthMap.get(provider.id);
      if (storedHealth) {
        providerHealth[provider.id] = storedHealth;
        if (storedHealth.status === 'healthy') healthyCount++;
        else if (storedHealth.status === 'degraded') degradedCount++;
      } else {
        providerHealth[provider.id] = {
          status: 'unknown' as ProviderStatus,
          lastChecked: new Date(),
        };
      }
    }

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (enabled.length === 0) {
      status = 'unhealthy';
    } else if (healthyCount === enabled.length) {
      status = 'healthy';
    } else if (healthyCount + degradedCount > 0) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      uptimeMs: Date.now() - this._startTime.getTime(),
      providers: providerHealth,
      activeExtractions: this._activeExtractions,
      lastChecked: new Date(),
    };
  }

  incrementActiveExtractions(): void { this._activeExtractions++; }
  decrementActiveExtractions(): void { this._activeExtractions = Math.max(0, this._activeExtractions - 1); }
}
