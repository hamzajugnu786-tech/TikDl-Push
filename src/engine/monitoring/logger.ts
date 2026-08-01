/**
 * NovaDL Engine — Structured Logger
 *
 * Production-grade structured logging using pino for
 * high-performance JSON output. Supports multiple transports,
 * debug mode, and child loggers for component-specific logging.
 */

import pino from 'pino';
import type { Logger } from 'pino';
import type { NovaDLConfig } from '../types/index';

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

export interface NovaLogEntry {
  level: LogLevel;
  msg: string;
  timestamp: string;
  component?: string;
  traceId?: string;
  requestId?: string;
  providerId?: string;
  platform?: string;
  durationMs?: number;
  [key: string]: unknown;
}

/** Console-based fallback logger interface matching pino's core API surface */
interface ConsoleFallback {
  trace: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  fatal: (obj: Record<string, unknown>, msg?: string) => void;
  child: (bindings: Record<string, unknown>) => ConsoleFallback;
  level: LogLevel;
  flush: (callback: () => void) => void;
}

export class NovaLogger {
  private _level: LogLevel;
  private _debug: boolean;
  private _pino!: Logger | ConsoleFallback;
  private _defaultFields: Record<string, unknown> = {};

  constructor(config: NovaDLConfig | { logLevel: LogLevel; debug: boolean }) {
    const logConfig = 'server' in config ? config.server : config;
    this._level = logConfig.logLevel;
    this._debug = logConfig.debug;

    this._initPino();
  }

  private _initPino(): void {
    try {
      const options = {
        level: this._level,
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
          level(label: string) {
            return { level: label };
          },
        },
        serializers: {
          err: pino.stdSerializers.err,
          req: pino.stdSerializers.req,
          res: pino.stdSerializers.res,
        },
      };

      if (this._debug) {
        // Pretty-print for development
        this._pino = pino(options, pino.transport({
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }));
      } else {
        this._pino = pino(options);
      }
    } catch {
      // Fallback: console-based logger if pino initialization fails
      this._pino = this._createConsoleFallback();
    }
  }

  private _createConsoleFallback(): ConsoleFallback {
    const level = this._level;

    return {
      trace: (obj: Record<string, unknown>, msg?: string) => {
        if (level === 'trace') console.log('[TRACE]', obj, msg ?? '');
      },
      debug: (obj: Record<string, unknown>, msg?: string) => {
        if (level === 'trace' || level === 'debug') console.log('[DEBUG]', obj, msg ?? '');
      },
      info: (obj: Record<string, unknown>, msg?: string) => {
        console.info('[INFO]', obj, msg ?? '');
      },
      warn: (obj: Record<string, unknown>, msg?: string) => {
        console.warn('[WARN]', obj, msg ?? '');
      },
      error: (obj: Record<string, unknown>, msg?: string) => {
        console.error('[ERROR]', obj, msg ?? '');
      },
      fatal: (obj: Record<string, unknown>, msg?: string) => {
        console.error('[FATAL]', obj, msg ?? '');
      },
      child: () => this._createConsoleFallback(),
      level: level,
      flush: (callback: () => void) => { callback(); },
    };
  }

  /** Create a child logger with additional context bindings */
  child(bindings: Record<string, unknown>): NovaLogger {
    const childLogger = new NovaLogger({ logLevel: this._level, debug: this._debug });
    childLogger._defaultFields = { ...this._defaultFields, ...bindings };
    childLogger._pino = this._pino.child(bindings);
    return childLogger;
  }

  /** Log at trace level — very detailed, only for debugging */
  trace(msg: string, data?: Record<string, unknown>): void {
    this._pino.trace({ ...this._defaultFields, ...data }, msg);
  }

  /** Log at debug level — development and troubleshooting info */
  debug(msg: string, data?: Record<string, unknown>): void {
    this._pino.debug({ ...this._defaultFields, ...data }, msg);
  }

  /** Log at info level — normal operational messages */
  info(msg: string, data?: Record<string, unknown>): void {
    this._pino.info({ ...this._defaultFields, ...data }, msg);
  }

  /** Log at warn level — potential issues that aren't errors */
  warn(msg: string, data?: Record<string, unknown>): void {
    this._pino.warn({ ...this._defaultFields, ...data }, msg);
  }

  /** Log at error level — failures that need attention */
  error(msg: string, data?: Record<string, unknown>): void {
    this._pino.error({ ...this._defaultFields, ...data }, msg);
  }

  /** Log at fatal level — unrecoverable failures */
  fatal(msg: string, data?: Record<string, unknown>): void {
    this._pino.fatal({ ...this._defaultFields, ...data }, msg);
  }

  /** Set the log level dynamically */
  setLevel(level: LogLevel): void {
    this._level = level;
    this._pino.level = level;
  }

  /** Get the current log level */
  getLevel(): LogLevel {
    return this._level;
  }

  /** Flush buffered log entries */
  async flush(): Promise<void> {
    await new Promise<void>((resolve) => this._pino.flush(resolve));
  }
}
