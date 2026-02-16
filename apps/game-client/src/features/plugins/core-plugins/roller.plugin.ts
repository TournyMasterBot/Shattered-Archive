// apps\game-client\src\features\plugins\core-plugins\roller.plugin.ts
import type { IPluginModule, PluginExportInfo, PluginRuntimeApi } from '@shatteredarchive/types-client';

type ParsedRoll = {
  str?: number;
  int?: number;
  wis?: number;
  dex?: number;
  con?: number;
  total?: number;
  rawLine: string;
  ts: number;
};

function stripAnsi(s: string): string {
  if (!s || !s.includes('\x1b')) return s;
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function readNumber(cfg: Record<string, unknown>, key: string): number | undefined {
  const v = cfg[key];

  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : undefined;
  }

  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }

  return undefined;
}

function readBool(cfg: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = cfg[key];
  return typeof v === 'boolean' ? v : fallback;
}

/* ----------------------------------------
   Formatting helpers (LOGGING ONLY)
----------------------------------------- */
function mark(ok: boolean) {
  return ok ? '✓' : '✗';
}

function fmt(v?: number) {
  return typeof v === 'number' ? v : '—';
}

/**
 * Parse a stat roll line.
 * Requires at least 3 stats to be present.
 */
function parseStatsLine(line: string): ParsedRoll | null {
  const raw = line ?? '';
  const text = stripAnsi(raw);
  const lower = text.toLowerCase();

  if (!lower.includes('str') || !lower.includes('int')) return null;

  const find = (key: 'str' | 'int' | 'wis' | 'dex' | 'con'): number | undefined => {
    const re = new RegExp(`\\b${key}\\b\\s*[:=]?\\s*(\\d{1,3})`, 'i');
    const m = text.match(re);
    if (!m) return undefined;
    const n = Number(m[1]);
    return Number.isFinite(n) ? clampInt(n, 0, 999) : undefined;
  };

  const str = find('str');
  const int = find('int');
  const wis = find('wis');
  const dex = find('dex');
  const con = find('con');

  const foundCount = [str, int, wis, dex, con].filter((v) => typeof v === 'number').length;
  if (foundCount < 3) return null;

  const total = [str, int, wis, dex, con].filter((v): v is number => typeof v === 'number').reduce((a, b) => a + b, 0);

  return {
    str,
    int,
    wis,
    dex,
    con,
    total,
    rawLine: text,
    ts: Date.now(),
  };
}

/**
 * DSL-style decision prompt.
 */
function isDecisionPrompt(line: string): boolean {
  const t = stripAnsi(line ?? '').toLowerCase();
  return t.includes('keep these stats') || t.includes('your selection?') || t.includes('keep these');
}

function meetsThresholds(roll: ParsedRoll, cfg: Record<string, unknown>): boolean {
  const totalTarget = readNumber(cfg, 'totalTarget');

  const minStr = readNumber(cfg, 'minStr');
  const minInt = readNumber(cfg, 'minInt');
  const minWis = readNumber(cfg, 'minWis');
  const minDex = readNumber(cfg, 'minDex');
  const minCon = readNumber(cfg, 'minCon');

  if (typeof totalTarget === 'number') {
    if (typeof roll.total !== 'number' || roll.total < totalTarget) return false;
  }

  const check = (min: number | undefined, value: number | undefined) => {
    if (typeof min !== 'number') return true;
    if (typeof value !== 'number') return false;
    return value >= min;
  };

  if (!check(minStr, roll.str)) return false;
  if (!check(minInt, roll.int)) return false;
  if (!check(minWis, roll.wis)) return false;
  if (!check(minDex, roll.dex)) return false;
  if (!check(minCon, roll.con)) return false;

  return true;
}

export function createRollerPlugin(): IPluginModule {
  let lastRoll: ParsedRoll | null = null;
  let lastRollTs: number | null = null;
  let lastPromptTs: number | null = null;

  // Helper to always get the latest config from the plugin API
  function getConfigFromApi(api: PluginRuntimeApi) {
    // This will always return the latest config (defaults + userConfig)
    return api.getConfig();
  }

  return {
    manifest: {
      id: 'roller',
      name: 'Roller',
      version: '0.0.1',
      description: 'Auto-accept/reject stat rolls based on thresholds.',
      supportsExport: true,
    },

    configSchema: {
      defaults: {
        totalTarget: 245,
        minStr: 0,
        minInt: 0,
        minWis: 0,
        minDex: 0,
        minCon: 0,
        debug: false,
      },
      fields: [
        {
          key: 'totalTarget',
          type: 'number',
          label: 'Total stat target',
          description: 'Minimum total required to accept.',
          optional: false,
          min: 0,
          max: 999,
          step: 1,
        },
        { key: 'minStr', type: 'number', label: 'Min STR', optional: true, min: 0, max: 999 },
        { key: 'minInt', type: 'number', label: 'Min INT', optional: true, min: 0, max: 999 },
        { key: 'minWis', type: 'number', label: 'Min WIS', optional: true, min: 0, max: 999 },
        { key: 'minDex', type: 'number', label: 'Min DEX', optional: true, min: 0, max: 999 },
        { key: 'minCon', type: 'number', label: 'Min CON', optional: true, min: 0, max: 999 },
        {
          key: 'debug',
          type: 'boolean',
          label: 'Debug logging',
          description: 'Logs every routed terminal line and parsing decisions.',
        },
      ],
    },

    assets: {
      css: `
.sa-plugin-roller-badge {
  padding: 2px 6px;
  border: 1px solid #333;
  border-radius: 4px;
  font-size: 12px;
  opacity: 0.9;
}
`,
      scripts: [],
    },

    onEvent: (api: PluginRuntimeApi, evt) => {
      if (!evt || evt.name !== 'shatteredarchive:raw-data') {
        return;
      }

      const cfg = getConfigFromApi(api);
      const debug = readBool(cfg, 'debug', false);

      const p = evt.payload as any;
      if (p?.__fromPlugin) return;
      const line = String(p?.text ?? p ?? '');
      if (!line) return;

      if (debug) {
        api.log('[Roller][debug] got terminal line:', JSON.stringify(line));
      }

      const now = Date.now();
      const parsed = parseStatsLine(line);
      if (parsed) {
        lastRoll = parsed;
        lastRollTs = now;
        return;
      }

      if (isDecisionPrompt(line)) {
        lastPromptTs = now;
        // Only respond if we have a recent roll (within 5 seconds) and the prompt was seen after the roll
        if (!lastRoll || !lastRollTs || now - lastRollTs > 5000) {
          if (debug) api.log('[Roller][debug] Ignoring prompt: no recent stat roll');
          return;
        }
        if (!lastPromptTs || lastPromptTs < lastRollTs) {
          if (debug) api.log('[Roller][debug] Ignoring prompt: prompt not after roll');
          return;
        }

        const ok = meetsThresholds(lastRoll, cfg);
        const decision = ok ? 'Y' : 'N';

        if (lastRoll) {
          const totalTarget = readNumber(cfg, 'totalTarget');
          const minStr = readNumber(cfg, 'minStr');
          const minInt = readNumber(cfg, 'minInt');
          const minWis = readNumber(cfg, 'minWis');
          const minDex = readNumber(cfg, 'minDex');
          const minCon = readNumber(cfg, 'minCon');

          api.log(
            `[Roller] ` +
              `Total ${mark(typeof totalTarget === 'number' ? (lastRoll.total ?? 0) >= totalTarget : true)} ${fmt(lastRoll.total)}/${fmt(totalTarget)} | ` +
              `STR ${mark(typeof minStr === 'number' ? (lastRoll.str ?? 0) >= minStr : true)} ${fmt(lastRoll.str)}/${fmt(minStr)} | ` +
              `INT ${mark(typeof minInt === 'number' ? (lastRoll.int ?? 0) >= minInt : true)} ${fmt(lastRoll.int)}/${fmt(minInt)} | ` +
              `WIS ${mark(typeof minWis === 'number' ? (lastRoll.wis ?? 0) >= minWis : true)} ${fmt(lastRoll.wis)}/${fmt(minWis)} | ` +
              `DEX ${mark(typeof minDex === 'number' ? (lastRoll.dex ?? 0) >= minDex : true)} ${fmt(lastRoll.dex)}/${fmt(minDex)} | ` +
              `CON ${mark(typeof minCon === 'number' ? (lastRoll.con ?? 0) >= minCon : true)} ${fmt(lastRoll.con)}/${fmt(minCon)}`,
          );
        }

        api.sendCommand(decision);
        lastRoll = null;
        lastRollTs = null;
        lastPromptTs = null;
      }
    },

    exportPlugin: (): PluginExportInfo => ({
      format: 'shattered-archive-plugin-v1',
      pluginId: 'roller',
      name: 'Roller',
      version: '0.0.1',
      description: 'Auto-accept/reject stat rolls based on thresholds.',
      payload: {},
    }),
  };
}
