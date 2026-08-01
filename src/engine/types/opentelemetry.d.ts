/**
 * Type declarations for OpenTelemetry packages (optional dependencies).
 *
 * @opentelemetry/api and @opentelemetry/sdk-trace-node are not
 * bundled — they are loaded via dynamic import at runtime only
 * when the user has installed them. These type declarations allow
 * TypeScript to compile without the actual packages present.
 *
 * Note: Top-level type aliases are used instead of `import()` type
 * annotations inside declare module blocks, to comply with
 * @typescript-eslint/consistent-type-imports which forbids `import()`
 * type annotation syntax.
 */

// ─── Top-level type aliases for cross-module references ────────────────
// These aliases extract types from the @opentelemetry/api module
// declaration below, so that other module declarations (sdk-trace-node,
// sdk-trace-base) can reference them without using `import()` syntax.

type OTelSpanStatusCode = 0 | 1 | 2;
type OTelSpanAttributes = Record<string, string | number | boolean>;
type OTelSpanContext = { traceId: string; spanId: string };
type OTelSpan = {
  spanContext(): OTelSpanContext;
  setAttribute(key: string, value: string | number | boolean): OTelSpan;
  setAttributes(attributes: OTelSpanAttributes): OTelSpan;
  setStatus(status: { code: OTelSpanStatusCode; message?: string }): OTelSpan;
  recordException(exception: Error, attributes?: OTelSpanAttributes): OTelSpan;
  end(endTime?: Date): void;
  isRecording(): boolean;
};
type OTelSpanOptions = { attributes?: OTelSpanAttributes; startTime?: Date };
type OTelContext = {
  getValue(key: symbol): unknown;
  setValue(key: symbol, value: unknown): OTelContext;
  deleteValue(key: symbol): OTelContext;
};
type OTelTracer = {
  startSpan(name: string, options?: OTelSpanOptions, context?: OTelContext): OTelSpan;
};

declare module '@opentelemetry/api' {
  export enum SpanStatusCode {
    UNSET = 0,
    OK = 1,
    ERROR = 2,
  }

  export interface SpanAttributes {
    [key: string]: string | number | boolean;
  }

  export interface SpanOptions {
    attributes?: SpanAttributes;
    startTime?: Date;
  }

  export interface Span {
    spanContext(): SpanContext;
    setAttribute(key: string, value: string | number | boolean): Span;
    setAttributes(attributes: SpanAttributes): Span;
    setStatus(status: { code: SpanStatusCode; message?: string }): Span;
    recordException(exception: Error, attributes?: SpanAttributes): Span;
    end(endTime?: Date): void;
    isRecording(): boolean;
  }

  export interface SpanContext {
    traceId: string;
    spanId: string;
  }

  export interface Tracer {
    startSpan(name: string, options?: SpanOptions, context?: Context): Span;
  }

  export interface Context {
    getValue(key: symbol): unknown;
    setValue(key: symbol, value: unknown): Context;
    deleteValue(key: symbol): Context;
  }

  export const trace: {
    getTracer(name?: string, version?: string): Tracer;
    setTracerProvider(provider: unknown): void;
  };

  export const context: {
    active(): Context;
    with(span: Span, context?: Context): Context;
  };
}

declare module '@opentelemetry/sdk-trace-node' {
  export interface TracerProviderConfig {
    spanProcessors?: SpanProcessor[];
  }

  export class NodeTracerProvider {
    constructor(config?: TracerProviderConfig);
    register(): void;
    shutdown(): Promise<void>;
    forceFlush(): Promise<void>;
    getTracer(name?: string, version?: string): Tracer;
  }
}

declare module '@opentelemetry/sdk-trace-base' {
  export interface SpanProcessor {
    onStart(span: Span, parentContext: Context): void;
    onEnd(span: Span): void;
    shutdown(): Promise<void>;
    forceFlush(): Promise<void>;
  }

  export class SimpleSpanProcessor implements SpanProcessor {
    constructor(exporter: unknown);
    onStart(span: Span, parentContext: Context): void;
    onEnd(span: Span): void;
    shutdown(): Promise<void>;
    forceFlush(): Promise<void>;
  }
}
