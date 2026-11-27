// apps\game-client\src\features\plugins\pluginScriptRunner.ts
import type { PluginBundledScript, PluginRuntimeApi, PluginId } from '@shatteredarchive/types-client';
import type { AnyUserScript, UserScriptLanguage } from '../userScripts/types';
import { runUserScript } from '../userScripts/runtime';
import { getSessionState, subscribeSession, SessionState } from '../connection/sessionGate';

type TimerMap = Record<string, number>;

function stableId(pluginId: PluginId, script: PluginBundledScript) {
  return `${pluginId}:${script.kind}:${script.name}`;
}

function toAnyUserScript(pluginId: PluginId, script: PluginBundledScript): AnyUserScript {
  const id = stableId(pluginId, script);
  const enabled = script.enabledByDefault ?? true;
  const language = script.language as UserScriptLanguage;

  if (script.kind === 'trigger') {
    return {
      id,
      kind: 'trigger',
      name: script.name,
      enabled,
      language,
      source: script.source,
      eventName: script.eventName ?? '',
      matchText: script.matchText ?? '',
    };
  }

  if (script.kind === 'alias') {
    return {
      id,
      kind: 'alias',
      name: script.name,
      enabled,
      language,
      source: script.source,
      alias: script.alias ?? '',
    };
  }

  // timer
  return {
    id,
    kind: 'timer',
    name: script.name,
    enabled,
    language,
    source: script.source,
    intervalMs: script.intervalMs ?? 0,
  };
}

export function startPluginBundledScripts(
  pluginId: PluginId,
  scripts: PluginBundledScript[],
  pluginApi: PluginRuntimeApi,
) {
  const timers: TimerMap = {};
  const disposers: Array<() => void> = [];
  const intervalScripts: Array<{ id: string; script: AnyUserScript; intervalMs: number }> = [];

  const runNow = async (s: AnyUserScript, api: PluginRuntimeApi) => {
    await runUserScript(s, {
      sendCommand: api.sendCommand,
      log: api.log,
      error: api.error,
      httpGetJson: api.httpGetJson,
    });
  };

  for (const s of scripts ?? []) {
    const any = toAnyUserScript(pluginId, s);

    if (!any.enabled) continue;

    if (any.kind === 'trigger') {
      const eventName = any.eventName ?? '';
      if (!eventName) continue;

      const matchText = any.matchText ?? '';

      const off = pluginApi.onEvent(eventName, async (payload) => {
        // matchText check (supports either string payload or {text:string} payload)
        if (matchText) {
          const p = payload as any;
          const text = typeof p === 'string' ? p : String(p?.text ?? '');
          if (!text.includes(matchText)) return;
        }

        await runNow(any, pluginApi);
      });

      disposers.push(off);
    } else if (any.kind === 'timer') {
      const intervalMs = Number(any.intervalMs ?? 0);
      if (!Number.isFinite(intervalMs) || intervalMs <= 0) continue;

      intervalScripts.push({ id: stableId(pluginId, s), script: any, intervalMs });
    } else if (any.kind === 'alias') {
      // Aliases are hooked up by the app's command input handling.
      // We expose handlers in getAliasScripts().
      continue;
    }
  }

  const clearTimers = () => {
    for (const k of Object.keys(timers)) {
      window.clearInterval(timers[k]);
      delete timers[k];
    }
  };

  // Intervals exist only while the session is live, so a restart begins with a full interval.
  const syncTimers = (state: SessionState) => {
    clearTimers();
    if (state !== 'live') return;

    for (const { id, script, intervalMs } of intervalScripts) {
      timers[id] = window.setInterval(() => {
        void runNow(script, pluginApi);
      }, intervalMs);
    }
  };

  if (intervalScripts.length > 0) {
    disposers.push(subscribeSession((change) => syncTimers(change.state)));
    syncTimers(getSessionState());
  }

  const stop = () => {
    for (const d of disposers) d();
    clearTimers();
  };

  const getAliasScripts = (): Array<{ alias: string; run: (inputText: string) => void }> => {
    const aliases = (scripts ?? []).filter((x) => x.kind === 'alias');
    return aliases.map((a) => {
      const any = toAnyUserScript(pluginId, a);

      return {
        alias: String(a.alias ?? ''),
        run: (_inputText: string) => {
          // run the alias script; if the script wants to send to game, it can call api.sendCommand itself
          void runNow(any, pluginApi);
        },
      };
    });
  };

  return { stop, getAliasScripts };
}
