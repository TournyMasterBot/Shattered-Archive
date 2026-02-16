import { Registry } from '../../types/event-emitter-types/event-registry';
import { REGISTRY_KEY } from '../../types/event-emitter-types/event-registry-key';
import { ListenerEntry } from '../../types/event-emitter-types/listener-entry';

/**
 * ------------------------------------------------------------
 * HMR-safe listener registry
 *
 * Browsers provide NO way to ask "is this already subscribed?"
 * so we keep our own registry on globalThis so it survives HMR.
 * ------------------------------------------------------------
 */
export function getRegistry(): Registry {
  const g = globalThis as any;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = {
      listeners: new Map<string, ListenerEntry>(),
    } as Registry;
  }
  return g[REGISTRY_KEY] as Registry;
}
