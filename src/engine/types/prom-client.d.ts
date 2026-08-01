/**
 * Type declarations for prom-client (optional dependency).
 * 
 * prom-client is not bundled — it is loaded via dynamic import
 * at runtime only when the user has installed it. These type
 * declarations allow TypeScript to compile without the actual
 * package present.
 */

declare module 'prom-client' {
  export class Registry {
    registerMetric(metric: Metric): void;
    getMetricsAsJSON(): MetricValue[];
    metrics(): string;
    contentType: string;
    resetMetrics(): void;
    clear(): void;
  }

  export interface Metric {
    name: string;
    help: string;
    type: string;
    labelNames: string[];
    collect(): void;
  }

  export interface MetricValue {
    name: string;
    help: string;
    type: string;
    values: Array<{
      labels: Record<string, string>;
      value: number;
    }>;
  }

  export interface CounterConfiguration {
    name: string;
    help: string;
    labelNames?: string[];
    registers?: Registry[];
  }

  export class Counter {
    constructor(configuration: CounterConfiguration);
    inc(value?: number): void;
    inc(labels: Record<string, string>, value?: number): void;
    reset(): void;
  }

  export interface HistogramConfiguration {
    name: string;
    help: string;
    labelNames?: string[];
    buckets?: number[];
    registers?: Registry[];
  }

  export class Histogram {
    constructor(configuration: HistogramConfiguration);
    observe(value: number): void;
    observe(labels: Record<string, string>, value: number): void;
    reset(): void;
  }

  export interface GaugeConfiguration {
    name: string;
    help: string;
    labelNames?: string[];
    registers?: Registry[];
  }

  export class Gauge {
    constructor(configuration: GaugeConfiguration);
    set(value: number): void;
    set(labels: Record<string, string>, value: number): void;
    inc(value?: number): void;
    inc(labels: Record<string, string>, value?: number): void;
    dec(value?: number): void;
    dec(labels: Record<string, string>, value?: number): void;
    reset(): void;
  }

  export interface DefaultMetricsCollectorConfiguration {
    register?: Registry;
    prefix?: string;
    gcDurationBuckets?: number[];
    eventLoopMonitoringPrecisionBuckets?: number[];
  }

  export function collectDefaultMetrics(configuration?: DefaultMetricsCollectorConfiguration): void;

  export const register: Registry;
}
