import type { PluginBundledScript, PluginRuntimeApi, PluginId } from '@shatteredarchive/types-client';
import type { AnyUserScript, UserScriptLanguage } from '../userScripts/types';
import { runUserScript } from '../userScripts/runtime';

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

      const id = stableId(pluginId, s);

      timers[id] = window.setInterval(() => {
        void runNow(any, pluginApi);
      }, intervalMs);
    } else if (any.kind === 'alias') {
      // Aliases are hooked up by the app's command input handling.
      // We expose handlers in getAliasScripts().
      continue;
    }
  }

  const stop = () => {
    for (const d of disposers) d();
    for (const k of Object.keys(timers)) window.clearInterval(timers[k]);
  };

  const getAliasScripts = (): Array<{ alias: string; run: (inputText: string) => void }> => {
    const aliases = (scripts ?? []).filter((x) => x.kind === 'alias');
    return aliases.map((a) => {
      const any = toAnyUserScript(pluginId, a);

      return {
        alias: String(a.alias ?? ''),
        run: (inputText: string) => {
          // run the alias script; if the script wants to send to game, it can call api.sendCommand itself
          void runNow(any, pluginApi);
        },
      };
    });
  };

  return { stop, getAliasScripts };
}
