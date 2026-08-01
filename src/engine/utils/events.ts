/**
 * NovaDL Engine — Typed Event Emitter
 *
 * A typed wrapper around eventemitter3 that accepts object
 * payloads instead of positional args. This provides full
 * type safety while remaining compatible with eventemitter3's
 * runtime behavior.
 *
 * The generic parameter T should be an interface mapping event
 * names to their payload types. The constraint is intentionally
 * loose (no `extends Record<string, unknown>`) because TypeScript
 * interfaces without explicit index signatures don't satisfy that
 * constraint — yet they are the most natural way to define event
 * maps. Type safety is enforced at the method level via
 * `K extends string & keyof T`, which ensures only valid event
 * names are accepted.
 *
 * Usage:
 *   interface MyEvents {
 *     'click': { x: number; y: number };
 *     'hover': { target: string };
 *   }
 *   const emitter = new TypedEmitter<MyEvents>();
 *   emitter.emit('click', { x: 10, y: 20 });
 *   emitter.on('click', (data) => { console.log(data.x); });
 */

import { EventEmitter } from 'eventemitter3';

export class TypedEmitter<T = Record<string, unknown>> {
  private _emitter = new EventEmitter();

  /** Subscribe to a typed event */
  on<K extends string & keyof T>(event: K, handler: (data: T[K]) => void): void {
    this._emitter.on(event, handler as (...args: unknown[]) => void);
  }

  /** Unsubscribe from a typed event */
  off<K extends string & keyof T>(event: K, handler: (data: T[K]) => void): void {
    this._emitter.off(event, handler as (...args: unknown[]) => void);
  }

  /** Emit a typed event with object payload */
  emit<K extends string & keyof T>(event: K, data: T[K]): boolean {
    return this._emitter.emit(event, data);
  }

  /** Remove all listeners for a specific event */
  removeAllListeners<K extends string & keyof T>(event?: K): void {
    this._emitter.removeAllListeners(event);
  }

  /** Get listener count for an event */
  listenerCount<K extends string & keyof T>(event: K): number {
    return this._emitter.listenerCount(event);
  }
}
