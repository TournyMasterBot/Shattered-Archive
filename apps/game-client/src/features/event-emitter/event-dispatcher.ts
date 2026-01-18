// apps/game-client/src/features/event-emitter/event-dispatcher.ts

export enum AllEvents {}
export enum ServiceEvents {}
export enum UserScriptEvents {}

/**
 * ------------------------------------------------------------
 * HMR-safe listener registry
 *
 * Browsers provide NO way to ask "is this already subscribed?"
 * so we keep our own registry on globalThis so it survives HMR.
 * ------------------------------------------------------------
 */

type ListenerEntry = {
  name: string;
  listener: EventListener;
  stack?: string;
};

type Registry = {
  listeners: Map<string, ListenerEntry>;
};

const REGISTRY_KEY = '__shatteredArchive_event_dispatcher_registry__';

function getRegistry(): Registry {
  const g = globalThis as any;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = {
      listeners: new Map<string, ListenerEntry>(),
    } as Registry;
  }
  return g[REGISTRY_KEY] as Registry;
}

function getStackTrace(): string | undefined {
  try {
    const err = new Error('listener stack');
    return err.stack;
  } catch {
    return undefined;
  }
}

function shouldTraceDispatch(): boolean {
  try {
    // Set: localStorage.setItem('sa.events.trace', '1')
    // Unset: localStorage.removeItem('sa.events.trace')
    return String(window.localStorage.getItem('sa.events.trace') ?? '') === '1';
  } catch {
    return false;
  }
}

/**
 * Optional options bag for dedupe/debug.
 * If you don't pass options, nothing changes from your original behavior.
 */
type ListenOptions = {
  /**
   * Unique key used to dedupe this subscription across HMR reloads.
   * If provided, we will auto-unsubscribe any prior listener with the same key.
   */
  key?: string;

  /**
   * Capture a stack trace for debug visibility.
   * Useful to see who registered a listener.
   */
  captureStack?: boolean;
};

/**
 * Default keys so callers don't have to invent them.
 * These are stable and work well with HMR.
 */
function defaultKey(name: string, suffix?: string): string {
  return suffix ? `${name}::${suffix}` : `${name}`;
}

function registerListener(key: string, name: string, listener: EventListener, captureStack?: boolean) {
  const registry = getRegistry();

  // If something is already registered under this key, remove it first (HMR-safe)
  const existing = registry.listeners.get(key);
  if (existing) {
    try {
      window.removeEventListener(existing.name, existing.listener);
    } catch {
      // ignore
    }
    registry.listeners.delete(key);
  }

  registry.listeners.set(key, {
    name,
    listener,
    stack: captureStack ? getStackTrace() : undefined,
  });
}

function unregisterListener(key: string, name: string, listener: EventListener) {
  const registry = getRegistry();

  const existing = registry.listeners.get(key);
  if (existing && existing.name === name && existing.listener === listener) {
    registry.listeners.delete(key);
  }

  try {
    window.removeEventListener(name, listener);
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
      // Gives you a "source" trace without changing event contracts.
      // This is the closest thing to "who called DispatchEvent?"
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
    unregisterListener(key, name, listener as EventListener);
  };

  registerListener(key, name, listener as EventListener, options?.captureStack);
  window.addEventListener(name, listener as EventListener);
}

export function ListenEvent<T>(name: string, handler: (payload: T) => void, options?: ListenOptions): () => void {
  const key = options?.key ?? defaultKey(name, 'event');

  const listener = (ev: Event) => {
    const ce = ev as CustomEvent<T>;
    handler(ce.detail);
  };

  registerListener(key, name, listener as EventListener, options?.captureStack);
  window.addEventListener(name, listener as EventListener);

  return () => {
    unregisterListener(key, name, listener as EventListener);
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

  registerListener(key, name, listener as EventListener, options?.captureStack);
  window.addEventListener(name, listener as EventListener);

  return () => {
    unregisterListener(key, name, listener as EventListener);
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

  registerListener(key, fromName, listener as EventListener, options?.captureStack);
  window.addEventListener(fromName, listener as EventListener);

  return () => {
    unregisterListener(key, fromName, listener as EventListener);
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

  registerListener(key, fromName, listener as EventListener, options?.captureStack);
  window.addEventListener(fromName, listener as EventListener);

  return () => {
    unregisterListener(key, fromName, listener as EventListener);
  };
}

/**
 * ------------------------------------------------------------
 * Debug helper (optional)
 * ------------------------------------------------------------
 * Not required, but can be useful.
 */
export function __debugDumpListeners(): Array<{ key: string; name: string; hasStack: boolean }> {
  const registry = getRegistry();
  return Array.from(registry.listeners.entries()).map(([key, entry]) => ({
    key,
    name: entry.name,
    hasStack: !!entry.stack,
  }));
}
