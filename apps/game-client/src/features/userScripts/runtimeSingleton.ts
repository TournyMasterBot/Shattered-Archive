// apps/game-client/src/features/userScripts/runtimeSingleton.ts
import { AccessibilitySettings, getAccessibilitySettings } from '../accessibility/accessibility-settings-store';
import { UserScriptRuntime } from './userScriptRuntime';
import { ListenRedispatch, ListenRedispatchMap } from '../event-emitter/event-dispatcher';

let windowEventsRegistered = false;

// ✅ matches what useGameConnection emits right now
type GameRemoteServerRaw = {
  type: 'raw';
  receivedTimestamp: string;
  payload: string;
};

type GameRemoteServerGmcp = {
  type: 'gmcp';
  receivedTimestamp: string;
  payload: string;
};

type GameRemoteServerError = {
  type: 'error';
  payload: {
    receivedTimestamp: string;
    message: string;
  };
};

type GameRemoteServerClose = {
  type: 'socket-closed' | 'server-closed';
  payload: {
    receivedTimestamp: string;
    reason?: string;
  };
};

// re-dispatch shapes
type ShatteredArchiveRawData = {
  rawText: string;
  userText: string;
  fromUserScript: false;
};

type ShatteredArchiveGmcpData = {
  rawText: string;
  fromUserScript: false;
};

type ShatteredArchiveServerError = {
  message: string;
};

type ShatteredArchiveServerClosed = {
  reason?: string;
};

export class RuntimeSingleton {
  private static _instance: RuntimeSingleton | null = null;

  public static get Instance(): RuntimeSingleton {
    if (!RuntimeSingleton._instance) RuntimeSingleton._instance = new RuntimeSingleton();
    return RuntimeSingleton._instance;
  }

  public static get Runtime(): UserScriptRuntime {
    return RuntimeSingleton.Instance.GetUserScriptRuntime;
  }

  private userScriptRuntime: UserScriptRuntime;
  private settings: AccessibilitySettings = getAccessibilitySettings();

  private constructor() {
    this.userScriptRuntime = new UserScriptRuntime({
      aliasSplitChar: this.settings.commandSplitChar,
    });

    this.hydrateRuntime('default');
    this.attachWindowEvents();
  }

  public get GetUserScriptRuntime(): UserScriptRuntime {
    return this.userScriptRuntime;
  }

  private hydrateRuntime(connectionId?: string | null) {
    this.userScriptRuntime.clear();
    const scripts = this.userScriptRuntime.loadScriptsFromStorage(connectionId);
    for (const s of scripts) this.userScriptRuntime.upsertScript(s);
  }

  private attachWindowEvents(): void {
    if (windowEventsRegistered) {
      console.warn('Prevented double-window-attach request in runtimeSingleton');
      return;
    }

    console.log('Attaching runtime singleton window events');

    // ✅ RAW -> shatteredarchive:raw-data (mapped)
    ListenRedispatchMap<GameRemoteServerRaw, ShatteredArchiveRawData>(
      'game:remote-server:raw',
      'shatteredarchive:raw-data',
      (detail) => ({
        rawText: detail.payload,
        userText: detail.payload,
        fromUserScript: false,
      }),
    );

    // ✅ GMCP -> shatteredarchive:gmcp-data (mapped)
    ListenRedispatchMap<GameRemoteServerGmcp, ShatteredArchiveGmcpData>(
      'game:remote-server:gmcp',
      'shatteredarchive:gmcp-data',
      (detail) => ({
        rawText: detail.payload,
        fromUserScript: false,
      }),
    );

    // ERROR -> shatteredarchive:server-error
    ListenRedispatchMap<GameRemoteServerError, ShatteredArchiveServerError>(
      'game:remote-server:error',
      'shatteredarchive:server-error',
      (detail) => ({
        message: detail.payload?.message ?? 'Unknown server error',
      }),
    );

    // CLOSE -> shatteredarchive:server-closed
    ListenRedispatchMap<GameRemoteServerClose, ShatteredArchiveServerClosed>(
      'game:remote-server:close',
      'shatteredarchive:server-closed',
      (detail) => ({
        reason: detail.payload?.reason,
      }),
    );

    // Connection changed -> hydrate scripts
    window.addEventListener('shatteredarchive:connection-changed', (e: any) => {
      const nextId = e?.detail?.connectionId ?? 'default';
      this.hydrateRuntime(nextId);
    });

    window.addEventListener('shatteredarchive:userScripts-updated', (e: any) => {
      const connectionId = e?.detail?.connectionId ?? 'default';
      this.hydrateRuntime(connectionId);
    });

    windowEventsRegistered = true;
  }
}

//

/*
(function initUserScriptRuntimeHydration() {
  // Initialze the runtime with a default connection
  hydrateRuntime('default');

  // Add listener for connection changed to change the hydrated connection
  window.addEventListener('shatteredarchive:connection-changed', (e: any) => {
    const nextId = e?.detail?.connectionId ?? 'default';
    hydrateRuntime(nextId);
  });

  // Add listener for game userscripts being updated
  window.addEventListener('shatteredarchive:userScripts-updated', (e: any) => {
    const connectionId = e?.detail?.connectionId ?? 'default';
    hydrateRuntime(connectionId);
  });

  // TMB TODO : Add listener for data from web socket
});
*/

/*
window.addEventListener('sa:accessibility-updated', (e: any) => {
  const next = e?.detail;
  userScriptRuntime.setAliasSplitChar(next?.commandSplitChar);
});

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
    const lines = splitIntoLines(text);
    for (const line of lines) {
      userScriptRuntime.dispatchEvent({ name: 'text:line', payload: { text: line } });
      if (line === 'You flee from combat!') {
        try {
          userScriptRuntime.dispatchEvent({ name: 'event:flee', payload: { text: line } });
          window.dispatchEvent(new CustomEvent('game:flee', { detail: line }));
        } catch {
          // ignore
        }
      } else if (line.includes('is DEAD!!')) {
        try {
          userScriptRuntime.dispatchEvent({ name: 'event:creature-death', payload: { text: line } });
          window.dispatchEvent(new CustomEvent('game:creature-death', { detail: line }));
        } catch {
          // ignore
        }
      }
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
*/
