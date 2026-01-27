// apps/game-client/src/features/event-emitter/event-dispatcher.ts

import { ListenOptions } from "../../types/event-emitter-types/event-listen-options";
import { getRegistry } from "./event-get-registry";
import { getStackTrace } from "./event-get-stack-trace";
import { shouldTraceDispatch } from "./event-should-trace-dispatch";

/**
 * Default keys so callers don't have to invent them.
 * These are stable and work well with HMR.
 */
function defaultKey(name: string, suffix?: string): string {
  return suffix ? `${name}::${suffix}` : `${name}`;
}

export function registerListener(
  key: string,
  target: EventTarget,
  name: string,
  listener: EventListener,
  options?: boolean | AddEventListenerOptions,
  captureStack?: boolean,
) {
  const registry = getRegistry();

  // If something is already registered under this key, remove it first (HMR-safe)
  const existing = registry.listeners.get(key);
  if (existing) {
    try {
      existing.target.removeEventListener(existing.name, existing.listener, existing.options as any);
    } catch {
      // ignore
    }
    registry.listeners.delete(key);
  }

  // Store + attach
  registry.listeners.set(key, {
    target,
    name,
    listener,
    options,
    stack: captureStack ? getStackTrace() : undefined,
  });

  try {
    target.addEventListener(name, listener, options as any);
  } catch {
    // ignore
  }
}

export function unregisterListener(
  key: string,
  target: EventTarget,
  name: string,
  listener: EventListener,
  options?: boolean | AddEventListenerOptions,
) {
  const registry = getRegistry();

  const existing = registry.listeners.get(key);
  if (existing && existing.target === target && existing.name === name && existing.listener === listener) {
    registry.listeners.delete(key);
  }

  try {
    target.removeEventListener(name, listener, options as any);
  } catch {
    // ignore
  }
}

/**
 * ------------------------------------------------------------
 * Dispatch + Redispatch
 * ------------------------------------------------------------
 */

export function DispatchEvent<T extends object>(name: string, payload: T) {
  try {
    if (shouldTraceDispatch()) {
      console.debug(`[DispatchEvent] ${name}`, payload, new Error('DispatchEvent trace').stack);
    }

    window.dispatchEvent(
      new CustomEvent(name, {
        detail: {
          ...payload,
        },
      }),
    );
  } catch (err) {
    console.error('error while dispatching event', { name, payload, err });
  }
}

export function RedispatchEvent<TIn extends object, TExtra extends object = {}>(
  ev: Event,
  nextName: string,
  extra?: TExtra,
): void {
  const detail = (ev as CustomEvent<TIn>).detail;

  DispatchEvent(nextName, {
    ...(detail as any),
    ...(extra as any),
  } as TIn & TExtra);
}

/**
 * ------------------------------------------------------------
 * Listen helpers
 * ------------------------------------------------------------
 */

export function ListenOnce<T>(name: string, handler: (payload: T) => void, options?: ListenOptions): void {
  const key = options?.key ?? defaultKey(name, 'once');

  const listener = (ev: Event) => {
    const ce = ev as CustomEvent<T>;
    handler(ce.detail);

    // remove self
    unregisterListener(key, window, name, listener as EventListener);
  };

  registerListener(key, window, name, listener as EventListener, undefined, options?.captureStack);
}

export function ListenEvent<T>(name: string, handler: (payload: T) => void, options?: ListenOptions): () => void {
  const key = options?.key ?? defaultKey(name, 'event');

  const listener = (ev: Event) => {
    const ce = ev as CustomEvent<T>;
    handler(ce.detail);
  };

  registerListener(key, window, name, listener as EventListener, undefined, options?.captureStack);

  return () => {
    unregisterListener(key, window, name, listener as EventListener);
  };
}

export function ListenEventAsync<T>(
  name: string,
  handler: (payload: T) => Promise<void>,
  options?: ListenOptions,
): () => void {
  const key = options?.key ?? defaultKey(name, 'eventAsync');

  const listener = (ev: Event) => {
    const ce = ev as CustomEvent<T>;

    void handler(ce.detail).catch((err) => {
      console.error(`error in async listener for ${name}`, { err });
    });
  };

  registerListener(key, window, name, listener as EventListener, undefined, options?.captureStack);

  return () => {
    unregisterListener(key, window, name, listener as EventListener);
  };
}

/**
 * Listen + Redispatch (no mapping)
 * Creates a passthrough listener for organizing workflows
 */
export function ListenRedispatch<TIn extends object, TExtra extends object = {}>(
  fromName: string,
  toName: string,
  extra?: TExtra,
  options?: ListenOptions,
): () => void {
  const key = options?.key ?? `${fromName}=>${toName}`;

  const listener = (ev: Event) => {
    RedispatchEvent<TIn, TExtra>(ev, toName, extra);
  };

  registerListener(key, window, fromName, listener as EventListener, undefined, options?.captureStack);

  return () => {
    unregisterListener(key, window, fromName, listener as EventListener);
  };
}

/**
 * Listen + Redispatch WITH mapping
 * Useful when event shapes differ
 */
export function ListenRedispatchMap<TIn extends object, TOut extends object>(
  fromName: string,
  toName: string,
  map: (detail: TIn) => TOut,
  options?: ListenOptions,
): () => void {
  const key = options?.key ?? `${fromName}=>${toName}::map`;

  const listener = (ev: Event) => {
    const detail = (ev as CustomEvent<TIn>).detail;
    DispatchEvent<TOut>(toName, map(detail));
  };

  registerListener(key, window, fromName, listener as EventListener, undefined, options?.captureStack);

  return () => {
    unregisterListener(key, window, fromName, listener as EventListener);
  };
}

export function ListenDomEvent<E extends Event>(
  name: string,
  handler: (ev: E) => void,
  options?: ListenOptions,
): () => void {
  const key = options?.key ?? defaultKey(name, 'dom');

  const listener = (ev: Event) => {
    handler(ev as E);
  };

  registerListener(key, window, name, listener as EventListener, undefined, options?.captureStack);

  return () => {
    unregisterListener(key, window, name, listener as EventListener);
  };
}

export function ListenTargetDomEvent<E extends Event>(
  target: EventTarget,
  name: string,
  handler: (ev: E) => void,
  options?: ListenOptions & {
    listenerOptions?: boolean | AddEventListenerOptions;
  },
): () => void {
  const key = options?.key ?? `${name}::target`;

  const listener = (ev: Event) => {
    handler(ev as E);
  };

  registerListener(key, target, name, listener as EventListener, options?.listenerOptions, options?.captureStack);

  return () => {
    unregisterListener(key, target, name, listener as EventListener, options?.listenerOptions);
  };
}

/**
 * ------------------------------------------------------------
 * Debug helper (optional)
 * ------------------------------------------------------------
 */
export function __debugDumpListeners(): Array<{ key: string; name: string; hasStack: boolean }> {
  const registry = getRegistry();
  return Array.from(registry.listeners.entries()).map(([key, entry]) => ({
    key,
    name: entry.name,
    hasStack: !!entry.stack,
  }));
}
