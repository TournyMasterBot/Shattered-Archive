// apps\game-client\src\features\userScripts\runtimeSingleton.ts
import { getAccessibilitySettings } from '../accessibility/accessibility-settings-store';
import { UserScriptRuntime } from './userScriptRuntime';
import type { AnyUserScript } from './types';
import { ROUTED_WINDOW_EVENTS } from '../plugins/routed-gmcp-events';

const settings = getAccessibilitySettings();

export const userScriptRuntime = new UserScriptRuntime({
  aliasSplitChar: settings.commandSplitChar,
});

window.addEventListener('sa:accessibility-updated', (e: any) => {
  const next = e?.detail;
  userScriptRuntime.setAliasSplitChar(next?.commandSplitChar);
});

const STORAGE_KEY_PREFIX = 'shatteredArchive.userScripts.';

function getStorageKey(connectionId?: string | null) {
  const safe = connectionId && connectionId.trim().length > 0 ? connectionId.trim() : 'default';
  return `${STORAGE_KEY_PREFIX}${safe}`;
}

function loadScriptsFromStorage(connectionId?: string | null): AnyUserScript[] {
  try {
    const raw = window.localStorage.getItem(getStorageKey(connectionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AnyUserScript[]) : [];
  } catch {
    return [];
  }
}

function hydrateRuntime(connectionId?: string | null) {
  // Replace runtime scripts with what’s in storage for this connection
  userScriptRuntime.clear();

  const scripts = loadScriptsFromStorage(connectionId);
  for (const s of scripts) {
    userScriptRuntime.upsertScript(s);
  }
}

/**
 * Keep runtime synced with:
 * - initial page load
 * - connection changes
 * - sandbox saves (localStorage writes)
 */
(function initUserScriptRuntimeHydration() {
  // initial hydrate (default connection)
  hydrateRuntime('default');

  window.addEventListener('game:connection-changed', (e: any) => {
    const nextId = e?.detail?.connectionId ?? 'default';
    hydrateRuntime(nextId);
  });

  // Listen to any localStorage update (including other tabs and same tab via manual dispatch)
  window.addEventListener('storage', (e: StorageEvent) => {
    if (!e.key) return;
    if (!e.key.startsWith(STORAGE_KEY_PREFIX)) return;

    // key format: shatteredArchive.userScripts.{connectionId}
    const connectionId = e.key.slice(STORAGE_KEY_PREFIX.length) || 'default';
    hydrateRuntime(connectionId);
  });

  // Same-tab writes do not trigger `storage`, so we also provide a manual event hook.
  // We’ll fire this from useUserScriptSandbox when it saves.
  window.addEventListener('game:userScripts-updated', (e: any) => {
    const connectionId = e?.detail?.connectionId ?? 'default';
    hydrateRuntime(connectionId);
  });

  function splitIntoLines(chunk: string): string[] {
    // normalize to \n, then split; keep it simple and stable
    const text = (chunk ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n');

    // drop final empty line caused by trailing newline
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

    return lines;
  }

  // Bridge terminal output into user-script triggers
  window.addEventListener('game:terminal-data', (ev: any) => {
    const detail = ev?.detail;

    // Avoid triggers firing from plugin logs (optional but recommended)
    if (detail?.__fromPlugin) return;

    const text = String(detail?.text ?? '');
    if (!text) return;
    userScriptRuntime.dispatchEvent({
      name: ev?.type ?? 'game:terminal-data',
      payload: detail,
    });
    const lines = splitIntoLines(text);
    for (const line of lines) {
      // Payload can be string OR {text}, depending on what you want later
      userScriptRuntime.dispatchEvent({ name: 'text:line', payload: { text: line } });
    }
  });

  // Bridge other routed window events into user-script triggers
  for (const name of ROUTED_WINDOW_EVENTS) {
    window.addEventListener(name, (ev: any) => {
      const payload = ev?.detail;

      userScriptRuntime.dispatchEvent({
        name,
        payload,
      });
    });
  }
})();
