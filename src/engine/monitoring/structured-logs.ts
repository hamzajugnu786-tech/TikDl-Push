/**
 * NovaDL Engine — Enhanced Structured Logging
 *
 * Extends NovaLogger with request tracing, provider correlation,
 * and timing awareness. Every log entry is enriched with a
 * consistent set of correlation fields (traceId, requestId,
 * providerId, platform, durationMs) so that distributed traces
 * and log streams can be unified in observability platforms.
 *
 * Usage:
 *   const tracer = new StructuredTraceLogger(logger);
 *   tracer.withTrace('abc123', { requestId: 'req-1' })
 *     .info('Extraction completed', { durationMs: 1200, platform: 'tiktok' });
 */

import type { NovaLogger } from './logger';
import type { Platform } from '../types/index';

// ─── Correlation fields ─────────────────────────────────────────────
/** Fields that appear in every structured log entry for traceability */
export interface CorrelationFields {
  traceId?: string;
  requestId?: string;
  providerId?: string;
  platform?: Platform | string;
  durationMs?: number;
}

// ─── StructuredTraceLogger ────────────────────────────────────────────
/**
 * Wraps NovaLogger with automatic correlation field injection.
 * Instead of passing traceId/requestId/providerId as ad-hoc
 * data fields on every call, the caller sets them once via
 * withTrace() and every subsequent log entry includes them.
 */
export class StructuredTraceLogger {
  private _logger: NovaLogger;
  private _correlation: CorrelationFields = {};

  constructor(logger: NovaLogger) {
    this._logger = logger;
  }

  // ─── Correlation setters ───────────────────────────────────────────

  /** Set the trace correlation fields for all future log entries */
  withTrace(traceId: string, fields?: CorrelationFields): StructuredTraceLogger {
    this._correlation = {
      ...this._correlation,
      traceId,
      ...fields,
    };
    return this;
  }

  /** Set the request ID for all future log entries */
  withRequestId(requestId: string): StructuredTraceLogger {
    this._correlation.requestId = requestId;
    return this;
  }

  /** Set the provider ID for all future log entries */
  withProviderId(providerId: string): StructuredTraceLogger {
    this._correlation.providerId = providerId;
    return this;
  }

  /** Set the platform for all future log entries */
  withPlatform(platform: Platform | string): StructuredTraceLogger {
    this._correlation.platform = platform;
    return this;
  }

  /** Clear all correlation fields */
  clearCorrelation(): void {
    this._correlation = {};
  }

  // ─── Logging methods ──────────────────────────────────────────────

  /** Merge extra data with the current correlation fields and log at trace level */
  trace(msg: string, data?: Record<string, unknown>): void {
    this._logger.trace(msg, { ...this._correlation, ...data });
  }

  /** Merge extra data with the current correlation fields and log at debug level */
  debug(msg: string, data?: Record<string, unknown>): void {
    this._logger.debug(msg, { ...this._correlation, ...data });
  }

  /** Merge extra data with the current correlation fields and log at info level */
  info(msg: string, data?: Record<string, unknown>): void {
    this._logger.info(msg, { ...this._correlation, ...data });
  }

  /** Merge extra data with the current correlation fields and log at warn level */
  warn(msg: string, data?: Record<string, unknown>): void {
    this._logger.warn(msg, { ...this._correlation, ...data });
  }

  /** Merge extra data with the current correlation fields and log at error level */
  error(msg: string, data?: Record<string, unknown>): void {
    this._logger.error(msg, { ...this._correlation, ...data });
  }

  /** Merge extra data with the current correlation fields and log at fatal level */
  fatal(msg: string, data?: Record<string, unknown>): void {
    this._logger.fatal(msg, { ...this._correlation, ...data });
  }

  // ─── Timing helpers ────────────────────────────────────────────────

  /**
   * Create a timer that, when stopped, automatically logs the
   * durationMs field along with the current correlation fields.
   */
  startTimer(): TraceTimer {
    return new TraceTimer(this);
  }

  // ─── Child logger ──────────────────────────────────────────────────

  /** Create a child structured logger that inherits current correlation fields */
  child(bindings: Record<string, unknown>): StructuredTraceLogger {
    const childLogger = this._logger.child(bindings);
    const childTrace = new StructuredTraceLogger(childLogger);
    childTrace._correlation = { ...this._correlation };
    return childTrace;
  }

  // ─── Accessors ──────────────────────────────────────────────────────

  /** Get the current correlation fields */
  getCorrelation(): CorrelationFields {
    return { ...this._correlation };
  }
}

// ─── TraceTimer ────────────────────────────────────────────────────
/**
 * A timer utility that captures the elapsed duration and
 * automatically emits a structured log entry with durationMs
 * when stop() is called.
 */
export class TraceTimer {
  private _traceLogger: StructuredTraceLogger;
  private _startTime: number;

  constructor(traceLogger: StructuredTraceLogger) {
    this._traceLogger = traceLogger;
    this._startTime = Date.now();
  }

  /** Stop the timer and return the elapsed duration in milliseconds */
  stop(): number {
    const durationMs = Date.now() - this._startTime;
    return durationMs;
  }

  /** Stop the timer and immediately log at the specified level with durationMs */
  stopAndLog(level: 'trace' | 'debug' | 'info' | 'warn' | 'error' = 'info', msg: string, data?: Record<string, unknown>): number {
    const durationMs = this.stop();
    this._traceLogger[level](msg, { ...data, durationMs });
    return durationMs;
  }
}

// ─── RequestLoggerFactory ──────────────────────────────────────────
/**
 * Factory for creating per-request structured trace loggers.
 * Each API request gets a unique requestId that propagates
 * through every log entry for that request's lifetime.
 */
export class RequestLoggerFactory {
  private _baseLogger: NovaLogger;

  constructor(baseLogger: NovaLogger) {
    this._baseLogger = baseLogger;
  }

  /** Create a StructuredTraceLogger pre-populated with a requestId */
  forRequest(requestId: string, traceId?: string): StructuredTraceLogger {
    const traceLogger = new StructuredTraceLogger(this._baseLogger);
    traceLogger.withRequestId(requestId);
    if (traceId) traceLogger.withTrace(traceId);
    return traceLogger;
  }

  /** Create a StructuredTraceLogger pre-populated with a providerId */
  forProvider(providerId: string, platform?: Platform | string): StructuredTraceLogger {
    const traceLogger = new StructuredTraceLogger(this._baseLogger);
    traceLogger.withProviderId(providerId);
    if (platform) traceLogger.withPlatform(platform);
    return traceLogger;
  }
}
