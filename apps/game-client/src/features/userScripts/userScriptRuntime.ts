// apps/game-client/src/features/userScripts/userScriptRuntime.ts

import { AnyUserScript, ScriptSandboxApi, TriggerContextEvent } from './types';
import { runTimerScript, runUserScript } from './runtime';
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

// ---- Identity snapshot (GMCP-only) --------------------------------------

type IdentitySnapshot = {
  characterName?: string;
  updatedAt?: number;
};

function getIdentitySnapshot(): IdentitySnapshot {
  const w = window as any;
  w.__SA_IDENTITY__ = w.__SA_IDENTITY__ || {};
  return w.__SA_IDENTITY__ as IdentitySnapshot;
}

function setIdentitySnapshot(patch: Partial<IdentitySnapshot>) {
  const w = window as any;
  const cur = getIdentitySnapshot();
  const next: IdentitySnapshot = { ...cur, ...patch, updatedAt: Date.now() };
  w.__SA_IDENTITY__ = next;
  DispatchEvent('shatteredarchive:identity-updated', next);
}

function toCleanString(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

function extractCharacterFromLoginData(data: any): { characterName?: string } {
  const characterName =
    toCleanString(data?.name) ||
    toCleanString(data?.characterName) ||
    toCleanString(data?.character_name) ||
    toCleanString(data?.charName) ||
    toCleanString(data?.char_name) ||
    toCleanString(data?.character) ||
    toCleanString(data?.char) ||
    toCleanString(data?.player);

  return { characterName: characterName || undefined };
}

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

function safeConnectionId(connectionId?: string | null) {
  return connectionId && connectionId.trim().length > 0 ? connectionId.trim() : 'default';
}

function stripOuterQuotes(s: string): string {
  const v = s ?? '';
  if (v.length >= 2) {
    const a = v[0];
    const b = v[v.length - 1];
    if ((a === "'" && b === "'") || (a === '"' && b === '"')) {
      return v.slice(1, -1);
    }
  }
  return v;
}

function unwrapBraceValue(expectedName: string, raw: string): { value: string; key?: string } | null {
  const s = (raw ?? '').trim();
  if (s.length < 2) return null;
  if (s[0] !== '{' || s[s.length - 1] !== '}') return null;

  const inner = s.slice(1, -1).trim();
  if (!inner) return { value: '' };

  const colonIdx = inner.indexOf(':');
  if (colonIdx === -1) {
    return { value: stripOuterQuotes(inner).trim() };
  }

  const k = inner.slice(0, colonIdx).trim();
  const v = inner.slice(colonIdx + 1).trim();

  const key = k.replace(/^["']|["']$/g, '').trim();
  const value = stripOuterQuotes(v).trim();

  if (key && expectedName && key.toLowerCase() === expectedName.toLowerCase()) {
    return { value, key };
  }

  return { value, key: key || undefined };
}

function normalizeCapturedVar(expectedName: string, raw: string): string {
  const t = (raw ?? '').trim();
  if (!t) return '';

  const unwrapped = unwrapBraceValue(expectedName, t);
  if (unwrapped) return (unwrapped.value ?? '').trim();

  const q = stripOuterQuotes(t).trim();
  return q;
}

function parseInlineObjectVars(input: string): { command: string; vars: Record<string, string> } | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;

  const m = /^(\S+)\s*(.*)$/.exec(raw);
  if (!m) return null;

  const command = m[1];
  let rest = (m[2] ?? '').trim();
  if (!rest) return null;

  if (rest[0] !== '{' || rest[rest.length - 1] !== '}') return null;

  const inner = rest.slice(1, -1);
  const vars: Record<string, string> = {};
  let i = 0;

  const skipWs = () => {
    while (i < inner.length && /\s/.test(inner[i])) i++;
  };

  const readIdent = (): string => {
    skipWs();
    const start = i;
    while (i < inner.length && /[A-Za-z0-9_]/.test(inner[i])) i++;
    return inner.slice(start, i);
  };

  const readQuoted = (quote: "'" | '"'): string => {
    i++;
    const start = i;
    while (i < inner.length) {
      if (inner[i] === quote) {
        const out = inner.slice(start, i);
        i++;
        return out;
      }
      i++;
    }
    return inner.slice(start);
  };

  const readValue = (): string => {
    skipWs();
    if (i >= inner.length) return '';

    const ch = inner[i];
    if (ch === "'" || ch === '"') {
      return readQuoted(ch);
    }

    const start = i;
    while (i < inner.length && inner[i] !== ',') i++;
    return inner.slice(start, i).trim();
  };

  while (i < inner.length) {
    skipWs();
    if (i >= inner.length) break;

    if (inner[i] === ',') {
      i++;
      continue;
    }

    const key = readIdent();
    if (!key) {
      while (i < inner.length && inner[i] !== ',') i++;
      continue;
    }

    skipWs();
    if (inner[i] !== ':') {
      while (i < inner.length && inner[i] !== ',') i++;
      continue;
    }

    i++;
    const value = readValue();
    vars[key] = value;

    skipWs();
    if (inner[i] === ',') i++;
  }

  if (!command || Object.keys(vars).length === 0) return null;
  return { command, vars };
}

function parseDoAfter(input: string): { delayMs: number; type: 'world' | 'alias'; command: string } | null {
  const m = /^\s*doAfter\s*\(\s*(\d+)\s*,\s*(world|alias)\s*,\s*(.+?)\s*\)\s*$/i.exec(input);
  if (!m) return null;

  const delayMs = parseInt(m[1], 10);
  if (!Number.isFinite(delayMs) || delayMs < 0) return null;

  const type = m[2].toLowerCase() as 'world' | 'alias';
  const command = stripOuterQuotes(m[3].trim());
  if (!command) return null;

  return { delayMs, type, command };
}

function compileAliasTemplate(template: string): { re: RegExp; vars: string[]; command?: string } | null {
  const raw = safeTrim(template);
  if (!raw) return null;

  const varNames: string[] = [];
  const parts: string[] = [];

  const commandMatch = /^\s*([^\s{]+)/.exec(raw);
  const command = commandMatch?.[1];

  const tokenRe = /\{([a-zA-Z0-9_]+)\}/g;
  const tokens: Array<{ name: string; index: number; len: number }> = [];

  {
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(raw)) !== null) {
      const name = safeTrim(m[1]);
      if (!name) continue;
      tokens.push({ name, index: m.index, len: m[0].length });
    }
  }

  if (tokens.length === 0) return null;

  let lastIndex = 0;

  for (let t = 0; t < tokens.length; t++) {
    const tok = tokens[t];
    const lit = raw.slice(lastIndex, tok.index);
    if (lit) parts.push(escapeRegexLiteral(lit).replace(/\s+/g, '\\s+'));

    const isLast = t === tokens.length - 1;

    varNames.push(tok.name);

    if (isLast) {
      parts.push('(.+)');
    } else {
      parts.push('(\\{[^}]+\\}|"[^"]*"|\'[^\']*\'|\\S+)');
    }

    lastIndex = tok.index + tok.len;
  }

  const tail = raw.slice(lastIndex);
  if (tail) parts.push(escapeRegexLiteral(tail).replace(/\s+/g, '\\s+'));

  const pattern = `^\\s*${parts.join('')}\\s*$`;
  return { re: new RegExp(pattern, 'i'), vars: varNames, command };
}

/* -------------------------------- runtime ------------------------------ */

export class UserScriptRuntime {
  private scripts: Map<string, AnyUserScript> = new Map();
  private readonly sendCommand: SendCommandFn;
  private readonly onScriptError?: (err: ScriptErrorInfo) => void;

  private aliasSplitChar: string;
  private timerElapsedById: Map<string, number> = new Map();
  private lastTick: number;

  private triggerUnsubs: Map<string, () => void> = new Map();

  private aliasTemplateCache: Map<string, { re: RegExp; vars: string[]; command?: string } | null> = new Map();

  private activeConnectionId: string = 'default';
  private timerNextFireAt: Map<string, number> = new Map();
  private timerIntervalById: Map<string, number> = new Map();
  private aliasFallback?: (input: string) => boolean;
  private doAfterTimers: Set<ReturnType<typeof setTimeout>> = new Set();

  constructor(options: UserScriptRuntimeOptions = {}) {
    this.sendCommand =
      options.sendCommand ??
      ((cmd) => {
        DispatchEvent('shatteredarchive:send-command', { cmd });
      });

    this.onScriptError = options.onScriptError;
    this.lastTick = Date.now();
    this.aliasSplitChar = normalizeSplitChar(options.aliasSplitChar);
    this.aliasFallback = options.aliasFallback;

    this.attachWindowEvents();
  }

  private attachWindowEvents() {
    console.log('Attaching user script runtime events');

    ListenEvent<any>('shatteredarchive:raw-data', (payload) => {
      void this.processRawEvent(payload);
    });

    ListenEvent<any>('shatteredarchive:gmcp-data', (payload) => {
      void this.processGmcpEvent(payload);
    });

    /* DEBUG
    ListenRedispatch('shatteredarchive:gmcp-data', 'shatteredarchive:write-console', {
      fromUserScript: false,
    });
    */

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

    getGlobalVarsSnapshot(next);
    this.rebuildOmitRules();
  }

  private rebuildOmitRules(): void {
    const rules: OmitRule[] = [];

    for (const s of this.scripts.values()) {
      if (s.kind !== 'trigger' || !s.enabled) continue;

      const trig: any = s;
      if (trig.omitFromOutput !== true) continue;

      const eventName = safeTrim(String(trig.eventName ?? ''));
      if (!eventName) continue;

      const dontRequireMatchText = trig.dontRequireMatchText === true;
      const template = safeTrim(String(trig.matchText ?? ''));

      if (dontRequireMatchText) {
        rules.push({
          id: s.id,
          eventName,
          omitAll: true,
          caseInsensitive: trig.caseInsensitive ?? false,
        });
        continue;
      }

      if (!template) continue;

      const expanded = expandMatchTextWithGlobals(template, (key) => getGlobalVarStore(this.activeConnectionId, key));
      if (!expanded) continue;

      rules.push({
        id: s.id,
        eventName,
        matchText: expanded,
        caseInsensitive: trig.caseInsensitive ?? false,
      });
    }

    setOmitRules(rules, this.activeConnectionId);
  }

  public replaceAllScripts(scripts: AnyUserScript[]): void {
    this.scripts.clear();
    this.aliasTemplateCache.clear();

    this.timerElapsedById.clear();
    this.lastTick = Date.now();

    for (const s of scripts ?? []) this.scripts.set(s.id, s);
    this.rebuildTriggerListeners();
    this.rebuildOmitRules();
  }

  private reloadFromStorage(connectionId?: string | null) {
    const loaded = this.loadScriptsFromStorage(connectionId);
    this.scripts.clear();
    this.aliasTemplateCache.clear();

    this.timerElapsedById.clear();
    this.lastTick = Date.now();

    for (const s of loaded) this.scripts.set(s.id, s);
    this.rebuildTriggerListeners();
    this.rebuildOmitRules();
  }

  public rebuildTimers(): void {
    this.timerNextFireAt.clear();
    this.timerIntervalById.clear();
    this.lastTick = Date.now();
  }

  public cancelDoAfterTimers(): void {
    for (const id of this.doAfterTimers) {
      clearTimeout(id);
    }
    this.doAfterTimers.clear();
  }

  public scheduleDoAfter(delayMs: number, type: 'world' | 'alias', command: string): void {
    const timerId = setTimeout(() => {
      this.doAfterTimers.delete(timerId);
      if (type === 'alias') {
        this.executeAlias(command);
      } else {
        this.sendCommand(command);
      }
    }, delayMs);
    this.doAfterTimers.add(timerId);
  }

  public rebuildTriggerListeners(): void {
    for (const off of this.triggerUnsubs.values()) {
      try {
        off();
      } catch {}
    }
    this.triggerUnsubs.clear();

    const byEvent = new Map<string, AnyUserScript[]>();

    for (const script of this.scripts.values()) {
      if (script.kind !== 'trigger') continue;
      if (!script.enabled) continue;

      const trig: any = script;
      const eventName = safeTrim(trig.eventName);
      if (!eventName) continue;

      const dontRequireMatchText = trig.dontRequireMatchText === true;
      const matchText = safeTrim(trig.matchText);

      if (!dontRequireMatchText && !matchText) continue;

      const list = byEvent.get(eventName) ?? [];
      list.push(script);
      byEvent.set(eventName, list);
    }

    for (const [eventName, scripts] of byEvent.entries()) {
      const key = `UserScriptRuntime::triggers::${eventName}`;

      const off = ListenEvent<any>(
        eventName,
        (payload) => {
          for (const s of scripts) {
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

    return text.indexOf(expanded) > -1;
  }

  getStorageKey(connectionId?: string | null) {
    const safe = safeConnectionId(connectionId);
    return `${STORAGE_KEY_PREFIX_USERSCRIPTS}${safe}`;
  }

  loadScriptsFromStorage(connectionId?: string | null): AnyUserScript[] {
    try {
      this.activeConnectionId = safeConnectionId(connectionId);
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

    const specialEventType = await this.processForSpecialLines(rawText);

    const plain = stripAnsi(rawText);

    const omitRaw = shouldOmitLine('shatteredarchive:raw-data', plain);
    const omitSpecial = specialEventType ? shouldOmitLine(specialEventType, plain) : false;

    const omit = omitRaw || omitSpecial;

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

    if (!omit) {
      DispatchEvent('shatteredarchive:write-terminal', payload);
    }
  }

  async processForSpecialLines(line: string): Promise<string | undefined> {
    let eventName: string | undefined = undefined;

    if (line.indexOf('is DEAD!!') > -1) {
      eventName = 'event:creature-death';
      DispatchEvent(eventName, { text: line });
      return eventName;
    } else if (line.indexOf('You flee from combat!') > -1) {
      eventName = 'event:flee:success';
      DispatchEvent(eventName, { text: line });
      return eventName;
    } else if (
      line.indexOf("PANIC! You couldn't escape!") > -1 ||
      line.indexOf('You cannot escape from combat!!!') > -1
    ) {
      eventName = 'event:flee:failed';
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
        rawText: line,
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
        this.dispatchGmcpEvent('game:affects-trueup', affectDataPhrase.length, rawText);
        return;
      } else if (rawText.startsWith(addAffectPhrase)) {
        this.dispatchGmcpEvent('game:affect-added', addAffectPhrase.length, rawText);
        return;
      } else if (rawText.startsWith(removeAffectPhrase)) {
        this.dispatchGmcpEvent('game:affect-removed', removeAffectPhrase.length, rawText);
        return;
      } else if (rawText.startsWith(loginDataPhrase)) {
        try {
          const jsonPart = rawText.slice(loginDataPhrase.length).trim();
          const data = JSON.parse(jsonPart);

          // Snapshot for late subscribers
          const w = window as any;
          w.__SA_EVENT_SNAPSHOTS__ = w.__SA_EVENT_SNAPSHOTS__ || {};
          w.__SA_EVENT_SNAPSHOTS__['game:character-login'] = data;

          // Dispatch the standard event
          DispatchEvent('game:character-login', data);

          // Store GMCP-only identity for UI consumers
          const { characterName } = extractCharacterFromLoginData(data);
          if (characterName) {
            setIdentitySnapshot({ characterName });
          }

          return;
        } catch (err) {
          console.warn('[GMCP] Failed to parse login_data payload', { rawText, err });
          return;
        }
      }
    } catch (err) {
      console.warn('[GMCP] Failed to parse payload', { rawText, err });
    }

    return;
  }

  dispatchGmcpEvent<T extends object>(eventName: string, length: number, rawText: string): void {
    try {
      console.log('Dispatching event', {
        eventName,
        rawText,
      });
      const jsonPart = rawText.slice(length).trim();
      const data = JSON.parse(jsonPart) as T;
      const w = window as any;

      w.__SA_EVENT_SNAPSHOTS__ = w.__SA_EVENT_SNAPSHOTS__ || {};
      w.__SA_EVENT_SNAPSHOTS__[eventName] = data;

      DispatchEvent(eventName, data);
    } catch (err) {
      console.log('Failed to dispatch GMCP event', {
        eventName,
        length,
        rawText,
      });
    }
  }

  /* -------------------------------- aliases ------------------------------- */

  private getCompiledAliasTemplate(
    scriptId: string,
    alias: string,
  ): { re: RegExp; vars: string[]; command?: string } | null {
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

      const trimmedPart = rawPart.trim();

      const doAfterParsed = parseDoAfter(trimmedPart);
      if (doAfterParsed) {
        this.scheduleDoAfter(doAfterParsed.delayMs, doAfterParsed.type, doAfterParsed.command);
        continue;
      }

      const normalizedInput = trimmedPart.toLowerCase();

      const objectVarsParsed = parseInlineObjectVars(trimmedPart);
      const objectCommandLower = objectVarsParsed?.command?.toLowerCase();
      const objectVars = objectVarsParsed?.vars;

      let matched = false;

      for (const script of this.scripts.values()) {
        if (script.kind !== 'alias' || !script.enabled) continue;

        const aliasRaw = String((script as any).alias ?? '');
        const aliasTrim = aliasRaw.trim();
        if (!aliasTrim) continue;

        if (aliasTrim.toLowerCase() === normalizedInput) {
          matched = true;
          anyAliasMatched = true;

          this.executeScript(script, {
            event: { name: 'shatteredarchive:alias-fired', payload: { input: rawPart, vars: {} } },
          });
          break;
        }

        if (objectVarsParsed && aliasTrim.toLowerCase() === objectCommandLower) {
          matched = true;
          anyAliasMatched = true;

          const varsOut: Record<string, string> = {};
          for (const [k, v] of Object.entries(objectVars ?? {})) {
            varsOut[k] = String(v ?? '');
          }

          this.executeScript(script, {
            event: {
              name: 'shatteredarchive:alias-fired',
              payload: { input: rawPart, alias: aliasRaw, vars: varsOut },
            },
          });
          break;
        }

        const compiled = this.getCompiledAliasTemplate(script.id, aliasRaw);
        if (!compiled) continue;

        if (objectVarsParsed && compiled.command && compiled.command.toLowerCase() === objectCommandLower) {
          const varsOut: Record<string, string> = {};
          let ok = true;

          for (const vName of compiled.vars) {
            const rawVal = (objectVars ?? {})[vName];
            if (rawVal == null) {
              ok = false;
              break;
            }
            varsOut[vName] = normalizeCapturedVar(vName, String(rawVal));
          }

          if (!ok) continue;

          matched = true;
          anyAliasMatched = true;

          this.executeScript(script, {
            event: {
              name: 'shatteredarchive:alias-fired',
              payload: { input: rawPart, alias: aliasRaw, vars: varsOut },
            },
          });
          break;
        }

        const m = compiled.re.exec(trimmedPart);
        if (!m) continue;

        const vars: Record<string, string> = {};
        for (let i = 0; i < compiled.vars.length; i++) {
          const varName = compiled.vars[i];
          const rawVal = String(m[i + 1] ?? '');
          vars[varName] = normalizeCapturedVar(varName, rawVal);
        }

        matched = true;
        anyAliasMatched = true;

        this.executeScript(script, {
          event: { name: 'shatteredarchive:alias-fired', payload: { input: rawPart, alias: aliasRaw, vars } },
        });
        break;
      }

      if (!matched) {
        const consumed = this.aliasFallback?.(rawPart) ?? false;
        if (!consumed) this.sendCommand(rawPart);
      }
    }

    return anyAliasMatched;
  }

  /* -------------------------------- timers -------------------------------- */

  public tickTimers(): void {
    const now = Date.now();
    this.lastTick = now;

    const active = new Set<string>();

    for (const script of this.scripts.values()) {
      if (script.kind !== 'timer' || !script.enabled) continue;

      const interval = Number((script as any).intervalMs ?? 0);
      if (!Number.isFinite(interval) || interval <= 0) continue;

      active.add(script.id);

      const prevInterval = this.timerIntervalById.get(script.id);
      if (prevInterval !== interval) {
        this.timerIntervalById.set(script.id, interval);
        this.timerNextFireAt.set(script.id, now + interval);
        continue;
      }

      const nextAt = this.timerNextFireAt.get(script.id) ?? now + interval;

      if (now >= nextAt) {
        this.timerNextFireAt.set(script.id, now + interval);
        this.executeScript(script);
      } else {
        this.timerNextFireAt.set(script.id, nextAt);
      }
    }

    for (const id of Array.from(this.timerNextFireAt.keys())) {
      if (!active.has(id)) {
        this.timerNextFireAt.delete(id);
        this.timerIntervalById.delete(id);
      }
    }
  }

  /* ------------------------------- execution ------------------------------ */

  private executeScript(script: AnyUserScript, extraContext?: { event?: TriggerContextEvent }): void {
    if (!script.enabled) return;

    const payloadVars =
      extraContext?.event && typeof (extraContext.event as any)?.payload === 'object'
        ? ((extraContext.event as any).payload?.vars as Record<string, string> | undefined)
        : undefined;

    const vars = payloadVars && typeof payloadVars === 'object' ? payloadVars : {};

    const apiRef = {} as ScriptSandboxApi;

    Object.assign(apiRef, {
      sendCommand: (cmd: string) => {
        const doAfterParsed = parseDoAfter((cmd ?? '').trim());
        if (doAfterParsed) {
          this.scheduleDoAfter(doAfterParsed.delayMs, doAfterParsed.type, doAfterParsed.command);
          return;
        }
        this.sendCommand(cmd);
      },
      doAfter: (delayMs: number, type: 'world' | 'alias', command: string) => {
        this.scheduleDoAfter(delayMs, type, command);
      },
      event: extraContext?.event,
      log: (...args: unknown[]) => console.log(`[Script:${script.name}]`, ...args),
      error: (...args: unknown[]) => console.error(`[Script:${script.name}]`, ...args),

      getGlobalVar: (key: string) => getGlobalVarStore(this.activeConnectionId, String(key ?? '')),
      setGlobalVar: (key: string, value: unknown) =>
        setGlobalVarStore(this.activeConnectionId, String(key ?? ''), value),
      deleteGlobalVar: (key: string) => deleteGlobalVarStore(this.activeConnectionId, String(key ?? '')),

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

export default UserScriptRuntime;
