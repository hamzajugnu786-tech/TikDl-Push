/**
 * NovaDL Engine — OpenTelemetry Tracer
 *
 * Production-grade distributed tracing integration using the
 * OpenTelemetry SDK. Both @opentelemetry/api and
 * @opentelemetry/sdk-trace-node are loaded dynamically at
 * runtime — if they are not installed, all methods gracefully
 * degrade to no-ops. This follows the same lazy-load pattern
 * used by RedisCacheAdapter for ioredis.
 *
 * Span naming convention: "novadl.extract.{platform}"
 * Standard attributes: provider.id, platform, url, status, duration_ms
 */

import type { Span, SpanStatusCode, SpanAttributes, Tracer } from '@opentelemetry/api';
import type { NodeTracerProvider, TracerProviderConfig } from '@opentelemetry/sdk-trace-node';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { NovaLogger } from './logger';
import { TypedEmitter } from '../utils/events';
import type { Platform } from '../types/index';

// ─── Events ────────────────────────────────────────────────────────
export interface OTelTracerEvents {
  'tracer:initialized': { serviceName: string };
  'tracer:shutdown': { serviceName: string };
  'span:started': { spanName: string; traceId: string };
  'span:ended': { spanName: string; traceId: string; durationMs: number };
  'span:error': { spanName: string; traceId: string; errorMessage: string };
}

/** Default span attributes applied to every NovaDL extraction span */
const DEFAULT_SPAN_ATTRIBUTES: SpanAttributes = {
  'service.namespace': 'novadl',
};

/** Build the standard span name for an extraction on a given platform */
export function extractionSpanName(platform: Platform): string {
  return `novadl.extract.${platform}`;
}

/** Configuration for tracer initialization */
export interface OTelTracerOptions {
  spanProcessors?: SpanProcessor[];
}

export class OpenTelemetryTracer extends TypedEmitter<OTelTracerEvents> {
  private _logger: NovaLogger;
  private _serviceName: string;
  private _tracerProvider: NodeTracerProvider | null = null;
  private _tracer: Tracer | null = null;
  private _spanStatusCodeEnum: typeof SpanStatusCode | null = null;
  private _initialized = false;
  private _spanStartTimes: Map<string, number> = new Map();

  constructor(logger: NovaLogger) {
    super();
    this._logger = logger.child({ component: 'otel-tracer' });
    this._serviceName = 'novadl-engine';
  }

  // ─── Lifecycle ────────────────────────────────────────────────────

  /**
   * Dynamically load @opentelemetry/api and @opentelemetry/sdk-trace-node,
   * create a NodeTracerProvider, register it globally, and obtain a tracer.
   */
  async initialize(serviceName: string, options?: OTelTracerOptions): Promise<void> {
    if (this._initialized) return;

    this._serviceName = serviceName;

    try {
      const apiModuleName = '@opentelemetry/api';
      const apiModule = await import(/* webpackIgnore: true */ apiModuleName);
      const api: typeof import('@opentelemetry/api') = apiModule.default ?? apiModule;

      const sdkModuleName = '@opentelemetry/sdk-trace-node';
      const sdkModule = await import(/* webpackIgnore: true */ sdkModuleName);
      const sdk: typeof import('@opentelemetry/sdk-trace-node') = sdkModule.default ?? sdkModule;

      const providerConfig: TracerProviderConfig | undefined = options?.spanProcessors
        ? { spanProcessors: options.spanProcessors }
        : undefined;

      this._tracerProvider = new sdk.NodeTracerProvider(providerConfig);
      this._tracerProvider.register();

      this._tracer = api.trace.getTracer(this._serviceName, '1.0.0');
      this._spanStatusCodeEnum = api.SpanStatusCode;

      this._initialized = true;
      this.emit('tracer:initialized', { serviceName });
      this._logger.info('OpenTelemetry tracer initialized', { serviceName });
    } catch (error) {
      this._logger.warn('OpenTelemetry packages not available — distributed tracing disabled', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ─── Span management ──────────────────────────────────────────────

  /** Start a new span with optional attributes */
  startSpan(name: string, attributes?: SpanAttributes): Span | null {
    if (!this._tracer) return null;

    const mergedAttributes: SpanAttributes = {
      ...DEFAULT_SPAN_ATTRIBUTES,
      ...attributes,
    };

    const span = this._tracer.startSpan(name, { attributes: mergedAttributes });

    const spanId = span.spanContext().spanId;
    this._spanStartTimes.set(spanId, Date.now());

    const traceId = span.spanContext().traceId;
    this.emit('span:started', { spanName: name, traceId });

    return span;
  }

  /** End a span with optional additional attributes */
  endSpan(span: Span | null, attributes?: SpanAttributes): void {
    if (!span) return;

    if (attributes) {
      span.setAttributes(attributes);
    }

    span.end();

    const spanId = span.spanContext().spanId;
    const startTime = this._spanStartTimes.get(spanId);
    const durationMs = startTime ? Date.now() - startTime : 0;
    this._spanStartTimes.delete(spanId);

    const traceId = span.spanContext().traceId;
    this.emit('span:ended', {
      spanName: spanId,
      traceId,
      durationMs,
    });
  }

  /** Record an error on a span and set status to ERROR */
  recordError(span: Span | null, error: Error): void {
    if (!span || !this._spanStatusCodeEnum) return;

    span.recordException(error);
    span.setStatus({
      code: this._spanStatusCodeEnum.ERROR,
      message: error.message,
    });

    const traceId = span.spanContext().traceId;
    this.emit('span:error', {
      spanName: traceId,
      traceId,
      errorMessage: error.message,
    });
  }

  /** Gracefully shut down the tracer provider, flushing pending spans */
  async shutdown(): Promise<void> {
    if (!this._tracerProvider) return;

    try {
      await this._tracerProvider.shutdown();
      this._initialized = false;
      this._tracerProvider = null;
      this._tracer = null;
      this._spanStatusCodeEnum = null;
      this.emit('tracer:shutdown', { serviceName: this._serviceName });
      this._logger.info('OpenTelemetry tracer shutdown complete');
    } catch (error) {
      this._logger.warn('Error during OpenTelemetry tracer shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Check if OTel packages were successfully loaded */
  isAvailable(): boolean {
    return this._initialized && this._tracer !== null;
  }
}
