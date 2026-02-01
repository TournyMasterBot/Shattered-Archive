// apps/game-client/src/features/userScripts/userScriptRuntime.ts

import { AnyUserScript, ScriptSandboxApi, TriggerContextEvent } from './types';
import { runUserScript } from './runtime';
import { DispatchEvent, ListenEvent, ListenRedispatch } from '../event-emitter/event-dispatcher';
import { SendCommandFn } from '../../types/userscript-types/send-command-function';
import { ScriptErrorInfo } from '../../types/userscript-types/script-error-info';
import { UserScriptRuntimeOptions } from '../../types/userscript-types/user-script-runtime-options';
import { ProbeOpponentConditionLine } from '../combat/probe-opponent-condition';
import { probeChatRange } from '../chat/chat-probe';
import { stripAnsi } from '../autoleveling/autoleveling-text';
import { dslToAnsi } from '../chat/dsl-to-ansi';
import { DamageEventPayload, parseDamageLine, parseDamageSource, tryParseTarget } from '../combat/damage/damage-map';
import { ProbeLevelUpLine } from '../level/probe-level-up';

// Global vars + global runtime
import {
  getGlobalVar as getGlobalVarStore,
  setGlobalVar as setGlobalVarStore,
  deleteGlobalVar as deleteGlobalVarStore,
  getGlobalVarsStorageKey,
  getGlobalVarsSnapshot,
} from './globalScriptsStore';
import { invokeGlobalById } from './globalRuntime';
import { OmitRule, setOmitRules, shouldOmitLine } from './triggerOmitStore';
import { safeTrim } from './safeTrim';
import { expandMatchTextWithGlobals } from './expand-global-vars';

export const STORAGE_KEY_PREFIX_USERSCRIPTS = 'shatteredArchive.userScripts.';

const RAW_EVENT_NAME = 'shatteredarchive:raw-data';

const tickPhrase = 'tick ';
const charDataPhrase = 'char_data ';
const roomDataPhrase = 'room_data ';
const removeAffectPhrase = 'remove_affect ';
const addAffectPhrase = 'add_affect ';
const affectDataPhrase = 'affect_data ';
const loginDataPhrase = 'login_data ';

/* ------------------------------- helpers ------------------------------- */

function normalizeSplitChar(v: string | undefined): string {
  const s = (v ?? ';').trim();
  if (!s) return ';';
  return s.slice(0, 1);
}

function pickMatchTextFromPayload(payload: any): string {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload?.text === 'string') return payload.text;
  if (typeof payload?.rawText === 'string') return payload.rawText;
  if (typeof payload?.line === 'string') return payload.line;
  return '';
}

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compile an alias template like:
 *   "target {TARGET}"
 * into a regex and list of variable names.
 *
 * Captures are token-based (\S+) to keep this simple and predictable.
 */
function compileAliasTemplate(template: string): { re: RegExp; vars: string[] } | null {
  const raw = safeTrim(template);
  if (!raw) return null;

  const varNames: string[] = [];
  const parts: string[] = [];

  const tokenRe = /\{([a-zA-Z0-9_]+)\}/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = tokenRe.exec(raw)) !== null) {
    const lit = raw.slice(lastIndex, m.index);
    if (lit) parts.push(escapeRegexLiteral(lit).replace(/\s+/g, '\\s+'));

    const name = safeTrim(m[1]);
    if (name) {
      varNames.push(name);
      parts.push('(\\S+)');
    } else {
      parts.push(escapeRegexLiteral(m[0]));
    }

    lastIndex = m.index + m[0].length;
  }

  const tail = raw.slice(lastIndex);
  if (tail) parts.push(escapeRegexLiteral(tail).replace(/\s+/g, '\\s+'));

  if (varNames.length === 0) return null;

  const pattern = `^\\s*${parts.join('')}\\s*$`;
  return { re: new RegExp(pattern, 'i'), vars: varNames };
}

function safeConnectionId(connectionId?: string | null) {
  return connectionId && connectionId.trim().length > 0 ? connectionId.trim() : 'default';
}

/* -------------------------------- runtime ------------------------------ */

export class UserScriptRuntime {
  private scripts: Map<string, AnyUserScript> = new Map();
  private readonly sendCommand: SendCommandFn;
  private readonly onScriptError?: (err: ScriptErrorInfo) => void;

  private aliasSplitChar: string;
  private lastTick: number;

  private triggerUnsubs: Map<string, () => void> = new Map();

  // cache compiled templates by script id
  private aliasTemplateCache: Map<string, { re: RegExp; vars: string[] } | null> = new Map();

  // active connection for global vars / global runtime
  private activeConnectionId: string = 'default';

  constructor(options: UserScriptRuntimeOptions = {}) {
    this.sendCommand =
      options.sendCommand ??
      ((cmd) => {
        DispatchEvent('shatteredarchive:send-command', { cmd });
      });

    this.onScriptError = options.onScriptError;
    this.lastTick = Date.now();
    this.aliasSplitChar = normalizeSplitChar(options.aliasSplitChar);

    this.attachWindowEvents();
  }

  private attachWindowEvents() {
    console.log('Attaching user script runtime events');

    // Raw text lines from the server (mapped by runtimeSingleton)
    ListenEvent<any>('shatteredarchive:raw-data', (payload) => {
      void this.processRawEvent(payload);
    });

    // GMCP -> parse + emit real events
    ListenEvent<any>('shatteredarchive:gmcp-data', (payload) => {
      void this.processGmcpEvent(payload);
    });

    // gmcp console logger
    ListenRedispatch('shatteredarchive:gmcp-data', 'shatteredarchive:write-console', {
      fromUserScript: false,
    });

    // When the sandbox UI (or runtime itself) saves scripts, reload + rebuild listeners.
    ListenEvent<any>('shatteredarchive:userScripts-updated', (payload) => {
      const connectionId = payload?.connectionId;
      this.reloadFromStorage(connectionId);
    });

    ListenEvent<{ key?: string }>('shatteredarchive:globalVars-updated', (payload) => {
      const key = String(payload?.key ?? '');
      if (!key) return;

      const expected = getGlobalVarsStorageKey(this.activeConnectionId);
      if (key !== expected) return;

      this.rebuildOmitRules();
    });
  }

  public setActiveConnectionId(connectionId: string | null | undefined): void {
    const next = safeConnectionId(connectionId);
    this.activeConnectionId = next;

    // ensure globals are warmed for this connection
    getGlobalVarsSnapshot(next);

    this.rebuildOmitRules();
  }

  private rebuildOmitRules(): void {
    // IMPORTANT:
    // Omit rules must be compiled using the *resolved* globals (e.g. "{target}" -> "weed").
    // Otherwise, after refresh you'll have "{target}" in the omit engine and nothing matches.
    const rules: OmitRule[] = [];

    for (const s of this.scripts.values()) {
      if (s.kind !== 'trigger' || !s.enabled) continue;

      const trig: any = s;
      if (trig.omitFromOutput !== true) continue;

      const template = String(trig.matchText ?? '').trim();
      if (!template) continue;

      const expanded = expandMatchTextWithGlobals(template, (key) => getGlobalVarStore(this.activeConnectionId, key));
      if (!expanded) continue;

      rules.push({
        id: s.id,
        eventName: String(trig.eventName ?? ''),
        matchText: expanded,
        caseInsensitive: trig.caseInsensitive ?? false,
      });
    }
    console.log("Invoking setOmitRules from rebuildOmitRules", {
      rules,
      activeConnectionId: this.activeConnectionId
    })
    setOmitRules(rules, this.activeConnectionId);
  }

  public replaceAllScripts(scripts: AnyUserScript[]): void {
    this.scripts.clear();
    this.aliasTemplateCache.clear();
    for (const s of scripts ?? []) this.scripts.set(s.id, s);
    this.rebuildTriggerListeners();
    this.rebuildOmitRules();
  }

  private reloadFromStorage(connectionId?: string | null) {
    const loaded = this.loadScriptsFromStorage(connectionId);
    this.scripts.clear();
    this.aliasTemplateCache.clear();
    for (const s of loaded) this.scripts.set(s.id, s);
    this.rebuildTriggerListeners();
    this.rebuildOmitRules();
  }

  private rebuildTriggerListeners(): void {
    // dispose old listeners
    for (const off of this.triggerUnsubs.values()) {
      try {
        off();
      } catch {}
    }
    this.triggerUnsubs.clear();

    // Group enabled triggers by eventName
    const byEvent = new Map<string, AnyUserScript[]>();

    for (const script of this.scripts.values()) {
      if (script.kind !== 'trigger') continue;
      if (!script.enabled) continue;

      const trig: any = script;
      const eventName = safeTrim(trig.eventName);
      if (!eventName) continue;

      const dontRequireMatchText = trig.dontRequireMatchText === true;
      const matchText = safeTrim(trig.matchText);

      // If they didn't opt out, require matchText
      if (!dontRequireMatchText && !matchText) continue;

      const list = byEvent.get(eventName) ?? [];
      list.push(script);
      byEvent.set(eventName, list);
    }

    // Attach 1 listener per eventName
    for (const [eventName, scripts] of byEvent.entries()) {
      const key = `UserScriptRuntime::triggers::${eventName}`;

      const off = ListenEvent<any>(
        eventName,
        (payload) => {
          for (const s of scripts) {
            // Re-check current state (scripts might have changed since this rebuild)
            const current = this.scripts.get(s.id);
            if (!current || current.kind !== 'trigger' || !current.enabled) continue;

            const curTrig: any = current;
            if (!this.triggerPassesMatch(curTrig, payload)) continue;

            this.executeScript(current, {
              event: { name: eventName, payload },
            });
          }
        },
        { key, captureStack: false },
      );

      // store unsub by eventName (since it's one per event)
      this.triggerUnsubs.set(eventName, off);
    }

    this.rebuildOmitRules();
  }

  private triggerPassesMatch(trig: any, payload: any): boolean {
    const dontRequireMatchText = trig.dontRequireMatchText === true;
    if (dontRequireMatchText) return true;

    const matchTextRaw = expandMatchTextWithGlobals(safeTrim(trig.matchText), (key) =>
      getGlobalVarStore(this.activeConnectionId, key),
    );
    if (!matchTextRaw) return false;

    const expanded = expandMatchTextWithGlobals(matchTextRaw, (key) => getGlobalVarStore(this.activeConnectionId, key));
    if (!expanded) return false;

    const text = pickMatchTextFromPayload(payload);
    if (!text) return false;

    // DO NOT lowercase / strip ANSI here. This is a raw substring match.
    return text.indexOf(expanded) > -1;
  }

  getStorageKey(connectionId?: string | null) {
    const safe = safeConnectionId(connectionId);
    return `${STORAGE_KEY_PREFIX_USERSCRIPTS}${safe}`;
  }

  loadScriptsFromStorage(connectionId?: string | null): AnyUserScript[] {
    try {
      // keep active connection in sync with hydration
      this.activeConnectionId = safeConnectionId(connectionId);

      // warm globals for this connection
      getGlobalVarsSnapshot(this.activeConnectionId);

      const raw = window.localStorage.getItem(this.getStorageKey(connectionId));
      if (!raw) return [];

      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as AnyUserScript[]) : [];
    } catch {
      return [];
    }
  }

  setAliasSplitChar(next: string | undefined): void {
    this.aliasSplitChar = normalizeSplitChar(next);
  }

  getAliasSplitChar(): string {
    return this.aliasSplitChar;
  }

  clear(): void {
    this.scripts.clear();
    this.aliasTemplateCache.clear();
    this.rebuildTriggerListeners();
  }

  upsertScript(script: AnyUserScript): void {
    this.scripts.set(script.id, script);
    this.aliasTemplateCache.delete(script.id);
    this.rebuildTriggerListeners();
  }

  upsertScriptAndSave(script: AnyUserScript, connectionId?: string | null): void {
    this.upsertScript(script);
    this.saveScriptsToStorage(connectionId);
  }

  removeScript(id: string): void {
    this.scripts.delete(id);
    this.aliasTemplateCache.delete(id);
    this.rebuildTriggerListeners();
  }

  removeScriptAndSave(id: string, connectionId?: string | null): void {
    this.removeScript(id);
    this.saveScriptsToStorage(connectionId);
  }

  getAllScripts(): AnyUserScript[] {
    return Array.from(this.scripts.values());
  }

  /* ------------------------------ raw stream ------------------------------ */

  async processRawEvent(payload: any): Promise<void> {
    const rawText = String(payload?.rawText ?? '');

    // Derived/special events (damage, death, etc.)
    await this.processForSpecialLines(rawText);

    // Apply omit rules to *server-originated* raw lines
    const omit = shouldOmitLine(rawText);

    // forward to chat probe + terminal
    let end = rawText.length;
    if (end > 0 && rawText.charCodeAt(end - 1) === 10 /* \n */) end--;
    if (end > 0 && rawText.charCodeAt(end - 1) === 13 /* \r */) end--;

    const match = probeChatRange(rawText, 0, end);

    if (!omit && match.isChat) {
      DispatchEvent('shatteredarchive:chat-line', {
        rawText,
        receivedTimestamp: payload?.receivedTimestamp,
        ...match,
      });
    }

    // IMPORTANT: if omitted, do not forward original line to terminal
    if (!omit) {
      DispatchEvent('shatteredarchive:write-terminal', payload);
    }
  }

  async processForSpecialLines(line: string): Promise<string | undefined> {
    let eventName: string | undefined = undefined;

    // Creature death
    if (line.indexOf('is DEAD!!') > -1) {
      eventName = 'event:creature-death';
      DispatchEvent(eventName, { text: line });
      return eventName;
    } else if (line.indexOf('You flee from combat!') > -1) {
      eventName = 'event:flee';
      DispatchEvent(eventName, { text: line });
      return eventName;
    }

    const opp = ProbeOpponentConditionLine(line);
    if (opp) {
      eventName = 'event:fighting:opponent';
      DispatchEvent(eventName, {
        ...opp,
      });
      return eventName;
    }

    const damage = this.processForDamageLine(line);
    if (damage) {
      eventName = 'event:damage';
      DispatchEvent(eventName, {
        ...damage,
      });
      return eventName;
    }

    const levelUp = ProbeLevelUpLine(line);
    if (levelUp) {
      eventName = 'event:level-up';
      DispatchEvent(eventName, {
        ...levelUp,
      });
      return eventName;
    }

    return eventName;
  }

  processForDamageLine(line: string): DamageEventPayload | null {
    const parsed = parseDamageLine(line);
    if (!parsed) return null;

    const tokenStartIndex = line.indexOf(parsed.token);
    const source = tokenStartIndex !== -1 ? parseDamageSource(line, tokenStartIndex) : null;

    return {
      key: parsed.key,
      amount: parsed.value,
      index: parsed.index,
      token: parsed.token,
      line,
      source: source ?? undefined,
      target: tryParseTarget(stripAnsi(line)) ?? undefined,
    };
  }

  /* -------------------------------- gmcp -------------------------------- */

  processGmcpEvent(payload: any): void {
    const rawText = String(payload?.rawText ?? '');

    try {
      if (rawText.startsWith(tickPhrase)) {
        this.dispatchGmcpEvent('game:tick', tickPhrase.length, rawText);
        return;
      } else if (rawText.startsWith(charDataPhrase)) {
        this.dispatchGmcpEvent('game:char-data', charDataPhrase.length, rawText);
        return;
      } else if (rawText.startsWith(roomDataPhrase)) {
        this.dispatchGmcpEvent('game:room-data', roomDataPhrase.length, rawText);
        return;
      } else if (rawText.startsWith(affectDataPhrase)) {
        // NOTE: keep this string consistent with ROUTED_WINDOW_EVENTS
        this.dispatchGmcpEvent('game:affects-trueup', affectDataPhrase.length, rawText);
        return;
      } else if (rawText.startsWith(addAffectPhrase)) {
        this.dispatchGmcpEvent('game:affect-added', addAffectPhrase.length, rawText);
        return;
      } else if (rawText.startsWith(removeAffectPhrase)) {
        this.dispatchGmcpEvent('game:affect-removed', removeAffectPhrase.length, rawText);
        return;
      } else if (rawText.startsWith(loginDataPhrase)) {
        this.dispatchGmcpEvent('game:character-login', loginDataPhrase.length, rawText);
        return;
      }
    } catch (err) {
      console.warn('[GMCP] Failed to parse payload', { rawText, err });
    }

    return;
  }

  dispatchGmcpEvent<T extends object>(eventName: string, length: number, rawText: string): void {
    const jsonPart = rawText.slice(length).trim();
    const data = JSON.parse(jsonPart) as T;
    DispatchEvent(eventName, data);
  }

  /* -------------------------------- aliases ------------------------------- */

  private getCompiledAliasTemplate(scriptId: string, alias: string): { re: RegExp; vars: string[] } | null {
    if (this.aliasTemplateCache.has(scriptId)) {
      return this.aliasTemplateCache.get(scriptId) ?? null;
    }
    const compiled = compileAliasTemplate(alias);
    this.aliasTemplateCache.set(scriptId, compiled);
    return compiled;
  }

  executeAlias(input: string): boolean {
    const line = input ?? '';
    const splitChar = this.aliasSplitChar;
    const parts = splitChar ? line.split(splitChar) : [line];

    let anyAliasMatched = false;

    for (const rawPart of parts) {
      if (rawPart.length === 0) {
        this.sendCommand(rawPart);
        continue;
      }

      const normalizedInput = rawPart.trim().toLowerCase();
      let matched = false;

      for (const script of this.scripts.values()) {
        if (script.kind !== 'alias' || !script.enabled) continue;

        const aliasRaw = String((script as any).alias ?? '');
        const aliasTrim = aliasRaw.trim();
        if (!aliasTrim) continue;

        // 1) exact match (original behavior)
        if (aliasTrim.toLowerCase() === normalizedInput) {
          matched = true;
          anyAliasMatched = true;

          this.executeScript(script, {
            event: { name: 'shatteredarchive:alias-fired', payload: { input: rawPart, vars: {} } },
          });
          break;
        }

        // 2) template match: "target {TARGET}"
        const compiled = this.getCompiledAliasTemplate(script.id, aliasRaw);
        if (!compiled) continue;

        const m = compiled.re.exec(rawPart);
        if (!m) continue;

        const vars: Record<string, string> = {};
        for (let i = 0; i < compiled.vars.length; i++) {
          vars[compiled.vars[i]] = String(m[i + 1] ?? '');
        }

        matched = true;
        anyAliasMatched = true;

        this.executeScript(script, {
          event: { name: 'shatteredarchive:alias-fired', payload: { input: rawPart, alias: aliasRaw, vars } },
        });
        break;
      }

      // If no match, send as normal to server
      if (!matched) {
        this.sendCommand(rawPart);
      }
    }

    return anyAliasMatched;
  }

  /* -------------------------------- timers -------------------------------- */

  tickTimers(): void {
    const now = Date.now();
    const delta = now - this.lastTick;
    this.lastTick = now;

    for (const script of this.scripts.values()) {
      if (script.kind !== 'timer' || !script.enabled) continue;
      if (script.intervalMs <= delta) this.executeScript(script);
    }
  }

  /* ------------------------------- execution ------------------------------ */

  private executeScript(script: AnyUserScript, extraContext?: { event?: TriggerContextEvent }): void {
    if (!script.enabled) return;

    // Pull template vars from alias-fired payload (if present)
    const payloadVars =
      extraContext?.event && typeof (extraContext.event as any)?.payload === 'object'
        ? ((extraContext.event as any).payload?.vars as Record<string, string> | undefined)
        : undefined;

    const vars = payloadVars && typeof payloadVars === 'object' ? payloadVars : {};

    // Build api with globals + runGlobal wired to your existing implementations
    const apiRef = {} as ScriptSandboxApi;

    Object.assign(apiRef, {
      sendCommand: this.sendCommand,
      event: extraContext?.event,
      log: (...args: unknown[]) => console.log(`[Script:${script.name}]`, ...args),
      error: (...args: unknown[]) => console.error(`[Script:${script.name}]`, ...args),

      getGlobalVar: (key: string) => getGlobalVarStore(this.activeConnectionId, String(key ?? '')),
      setGlobalVar: (key: string, value: unknown) => setGlobalVarStore(this.activeConnectionId, String(key ?? ''), value),
      deleteGlobalVar: (key: string) => deleteGlobalVarStore(this.activeConnectionId, String(key ?? '')),

      // Lets scripts access alias vars via getNamedVar(...) (Lua/Python rely on this)
      getNamedVar: (name: string) => {
        const k = String(name ?? '');
        const v = (vars as any)[k];
        return v == null ? undefined : String(v);
      },

      runGlobal: async (globalId: string, args?: unknown) => {
        return invokeGlobalById(this.activeConnectionId, globalId, apiRef, args);
      },

      writeTerminal: (dsl: string) => {
        if (!dsl) return;

        try {
          const ansi = dslToAnsi(dsl);
          DispatchEvent('shatteredarchive:write-terminal', {
            rawText: ansi,
            fromUserScript: true,
          });
        } catch (err) {
          console.error('[Script:writeTerminal] failed', err);
        }
      },
    } satisfies ScriptSandboxApi);

    void runUserScript(script, apiRef).catch((err) => {
      const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
      const stack = err instanceof Error && err.stack ? err.stack.toString() : undefined;

      const errorInfo: ScriptErrorInfo = {
        scriptId: script.id,
        scriptName: script.name,
        kind: script.kind,
        message,
        stack,
        timestamp: Date.now(),
      };

      if (this.onScriptError) {
        this.onScriptError(errorInfo);
      } else {
        console.error('[UserScriptRuntime] error', errorInfo);
      }
    });
  }

  /* -------------------------------- storage ------------------------------- */

  private saveScriptsToStorage(connectionId?: string | null): void {
    try {
      const key = this.getStorageKey(connectionId);
      const scripts = this.getAllScripts();

      window.localStorage.setItem(key, JSON.stringify(scripts));

      DispatchEvent<{ connectionId?: string }>('shatteredarchive:userScripts-updated', {
        connectionId: connectionId ?? 'default',
      });
    } catch (err) {
      console.error('Failed to save user scripts', { connectionId, err });
    }
  }
}
