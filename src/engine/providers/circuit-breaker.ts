/**
 * NovaDL Engine — Circuit Breaker Pattern
 *
 * Protects the system from cascading failures by temporarily
 * blocking requests to providers that are failing. When a provider
 * exceeds the failure threshold, its circuit opens and all requests
 * are immediately rejected. After a configurable timeout period, the
 * circuit enters half-open state to test if the provider has recovered.
 *
 * States:
 *   CLOSED     — Normal operation. Track consecutive failures; open circuit if threshold exceeded.
 *   OPEN       — Failing. All requests rejected. Auto-transition to HALF_OPEN after timeout.
 *   HALF_OPEN  — Testing recovery. Limited requests allowed.
 *                Close on successThreshold consecutive successes; re-open on any failure.
 */

import { TypedEmitter } from '../utils/events';

// ─── Circuit State ────────────────────────────────────────────────

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

// ─── Configuration ────────────────────────────────────────────────

export interface CircuitBreakerConfig {
  /** Number of consecutive failures to open the circuit. Default: 5 */
  failureThreshold: number;
  /** Number of consecutive successes in HALF_OPEN to close the circuit. Default: 3 */
  successThreshold: number;
  /** Time in ms before transitioning from OPEN to HALF_OPEN. Default: 60000 */
  timeoutMs: number;
  /** Maximum concurrent requests allowed in HALF_OPEN state. Default: 1 */
  halfOpenMaxRequests: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  timeoutMs: 60000,
  halfOpenMaxRequests: 1,
};

// ─── Circuit Info ─────────────────────────────────────────────────

export interface ProviderCircuitInfo {
  providerId: string;
  state: CircuitState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  halfOpenRequests: number;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  openedAt: Date | null;
  stateChangedAt: Date | null;
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
}

// ─── Internal Tracking ────────────────────────────────────────────

interface CircuitData {
  state: CircuitState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  halfOpenRequests: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  openedAt: number | null;
  stateChangedAt: number | null;
}

// ─── Circuit Breaker Events ──────────────────────────────────────

export interface CircuitBreakerEvents {
  'circuit:opened': { providerId: string; reason: string; failures: number };
  'circuit:closed': { providerId: string; successes: number };
  'circuit:half_open': { providerId: string; afterTimeoutMs: number };
  'circuit:state_change': { providerId: string; oldState: CircuitState; newState: CircuitState };
  'circuit:rejected': { providerId: string; state: CircuitState };
}

// ─── CircuitBreaker ──────────────────────────────────────────────

export class CircuitBreaker extends TypedEmitter<CircuitBreakerEvents> {
  private _config: CircuitBreakerConfig;
  private _circuits: Map<string, CircuitData> = new Map();

  constructor(config?: Partial<CircuitBreakerConfig>) {
    super();
    this._config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  // ─── Execution Gate ─────────────────────────────────────────────

  /**
   * Check if a request can be executed for the given provider.
   * Returns false when circuit is OPEN (reject all) or when
   * HALF_OPEN max requests have been reached.
   * Returns true and increments half-open request counter when
   * HALF_OPEN capacity is available.
   */
  canExecute(providerId: string): boolean {
    const circuit = this._getOrCreateCircuit(providerId);

    // ── OPEN: reject unless timeout has elapsed ────────────────────
    if (circuit.state === 'OPEN') {
      const now = Date.now();
      const openedAt = circuit.openedAt ?? now;
      if (now - openedAt >= this._config.timeoutMs) {
        // Auto-transition to HALF_OPEN — provider may have recovered
        this._transitionTo(providerId, 'HALF_OPEN', circuit);
        // Now check half-open capacity below
      } else {
        this.emit('circuit:rejected', { providerId, state: 'OPEN' });
        return false;
      }
    }

    // ── HALF_OPEN: allow limited test requests ─────────────────────
    if (circuit.state === 'HALF_OPEN') {
      if (circuit.halfOpenRequests >= this._config.halfOpenMaxRequests) {
        this.emit('circuit:rejected', { providerId, state: 'HALF_OPEN' });
        return false;
      }
      circuit.halfOpenRequests += 1;
      return true;
    }

    // ── CLOSED: always allow ───────────────────────────────────────
    return true;
  }

  // ─── State Query ────────────────────────────────────────────────

  /**
   * Get the current circuit state for a provider.
   * Triggers auto-transition from OPEN to HALF_OPEN if timeout has elapsed.
   */
  getState(providerId: string): CircuitState {
    const circuit = this._getOrCreateCircuit(providerId);
    // Trigger auto-transition check
    if (circuit.state === 'OPEN' && circuit.openedAt !== null) {
      if (Date.now() - circuit.openedAt >= this._config.timeoutMs) {
        this._transitionTo(providerId, 'HALF_OPEN', circuit);
      }
    }
    return circuit.state;
  }

  /**
   * Get detailed circuit information for a provider.
   * Includes timestamps, thresholds, and current counters.
   */
  getProviderCircuitInfo(providerId: string): ProviderCircuitInfo {
    const circuit = this._getOrCreateCircuit(providerId);
    // Trigger auto-transition check
    if (circuit.state === 'OPEN' && circuit.openedAt !== null) {
      if (Date.now() - circuit.openedAt >= this._config.timeoutMs) {
        this._transitionTo(providerId, 'HALF_OPEN', circuit);
      }
    }
    return {
      providerId,
      state: circuit.state,
      consecutiveFailures: circuit.consecutiveFailures,
      consecutiveSuccesses: circuit.consecutiveSuccesses,
      halfOpenRequests: circuit.halfOpenRequests,
      lastFailureTime: circuit.lastFailureTime !== null ? new Date(circuit.lastFailureTime) : null,
      lastSuccessTime: circuit.lastSuccessTime !== null ? new Date(circuit.lastSuccessTime) : null,
      openedAt: circuit.openedAt !== null ? new Date(circuit.openedAt) : null,
      stateChangedAt: circuit.stateChangedAt !== null ? new Date(circuit.stateChangedAt) : null,
      failureThreshold: this._config.failureThreshold,
      successThreshold: this._config.successThreshold,
      timeoutMs: this._config.timeoutMs,
    };
  }

  // ─── Recording Methods ──────────────────────────────────────────

  /**
   * Record a successful extraction. In HALF_OPEN state, consecutive
   * successes accumulate toward the successThreshold. When threshold
   * is reached, circuit transitions to CLOSED (provider recovered).
   * In CLOSED state, success resets consecutive failure counter.
   */
  recordSuccess(providerId: string): void {
    const circuit = this._getOrCreateCircuit(providerId);

    circuit.lastSuccessTime = Date.now();
    circuit.consecutiveFailures = 0;
    circuit.consecutiveSuccesses += 1;

    if (circuit.state === 'HALF_OPEN') {
      if (circuit.consecutiveSuccesses >= this._config.successThreshold) {
        this._transitionTo(providerId, 'CLOSED', circuit);
        this.emit('circuit:closed', {
          providerId,
          successes: circuit.consecutiveSuccesses,
        });
      }
    }
    // CLOSED state: success already resets failures (done above)
  }

  /**
   * Record a failed extraction. In HALF_OPEN state, any failure
   * immediately reopens the circuit. In CLOSED state, consecutive
   * failures accumulate toward the failureThreshold.
   */
  recordFailure(providerId: string): void {
    const circuit = this._getOrCreateCircuit(providerId);

    circuit.lastFailureTime = Date.now();
    circuit.consecutiveSuccesses = 0;
    circuit.consecutiveFailures += 1;

    if (circuit.state === 'HALF_OPEN') {
      // Even one failure in half-open immediately reopens the circuit
      this._transitionTo(providerId, 'OPEN', circuit);
      this.emit('circuit:opened', {
        providerId,
        reason: 'half_open_failure',
        failures: circuit.consecutiveFailures,
      });
    } else if (circuit.state === 'CLOSED') {
      if (circuit.consecutiveFailures >= this._config.failureThreshold) {
        this._transitionTo(providerId, 'OPEN', circuit);
        this.emit('circuit:opened', {
          providerId,
          reason: 'threshold_exceeded',
          failures: circuit.consecutiveFailures,
        });
      }
    }
    // OPEN state: already open, just increment counter
  }

  // ─── Manual Control ──────────────────────────────────────────────

  /** Manually force the circuit OPEN — useful for admin overrides */
  forceOpen(providerId: string): void {
    const circuit = this._getOrCreateCircuit(providerId);
    if (circuit.state !== 'OPEN') {
      const oldState = circuit.state;
      circuit.openedAt = Date.now();
      circuit.stateChangedAt = Date.now();
      circuit.consecutiveSuccesses = 0;
      circuit.halfOpenRequests = 0;
      circuit.state = 'OPEN';
      this.emit('circuit:state_change', { providerId, oldState, newState: 'OPEN' });
      this.emit('circuit:opened', { providerId, reason: 'manual', failures: circuit.consecutiveFailures });
    }
  }

  /** Manually force the circuit CLOSED — useful for admin overrides */
  forceClose(providerId: string): void {
    const circuit = this._getOrCreateCircuit(providerId);
    if (circuit.state !== 'CLOSED') {
      const oldState = circuit.state;
      circuit.openedAt = null;
      circuit.stateChangedAt = Date.now();
      circuit.consecutiveFailures = 0;
      circuit.consecutiveSuccesses = 0;
      circuit.halfOpenRequests = 0;
      circuit.state = 'CLOSED';
      this.emit('circuit:state_change', { providerId, oldState, newState: 'CLOSED' });
      this.emit('circuit:closed', { providerId, successes: 0 });
    }
  }

  // ─── Configuration ──────────────────────────────────────────────

  /** Get the current circuit breaker configuration */
  getConfig(): CircuitBreakerConfig {
    return { ...this._config };
  }

  // ─── Internal ────────────────────────────────────────────────────

  private _getOrCreateCircuit(providerId: string): CircuitData {
    const existing = this._circuits.get(providerId);
    if (existing) return existing;
    const newCircuit: CircuitData = {
      state: 'CLOSED',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      halfOpenRequests: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      openedAt: null,
      stateChangedAt: null,
    };
    this._circuits.set(providerId, newCircuit);
    return newCircuit;
  }

  private _transitionTo(providerId: string, newState: CircuitState, circuit: CircuitData): void {
    const oldState = circuit.state;
    circuit.state = newState;
    circuit.stateChangedAt = Date.now();

    if (newState === 'OPEN') {
      circuit.openedAt = Date.now();
      circuit.halfOpenRequests = 0;
      // Don't reset consecutive failures — they're useful for diagnostics
    } else if (newState === 'HALF_OPEN') {
      circuit.consecutiveSuccesses = 0;
      circuit.halfOpenRequests = 0;
      const afterTimeoutMs = circuit.openedAt !== null ? Date.now() - circuit.openedAt : 0;
      this.emit('circuit:half_open', { providerId, afterTimeoutMs });
    } else if (newState === 'CLOSED') {
      circuit.openedAt = null;
      circuit.consecutiveFailures = 0;
      circuit.halfOpenRequests = 0;
    }

    this.emit('circuit:state_change', { providerId, oldState, newState });
  }
}
