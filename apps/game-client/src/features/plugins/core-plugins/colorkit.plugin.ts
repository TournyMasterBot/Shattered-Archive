// apps\game-client\src\features\plugins\core-plugins\colorkit.plugin.ts
import type { IPluginModule, PluginEvent, PluginRuntimeApi } from '@shatteredarchive/types-client';
import { stripAnsi } from '../../autoleveling/autoleveling-text';

/**
 * Color Kit — colorize matched lines without writing trigger scripts.
 *
 * Rule format (config textarea): one rule per line.
 *   <match text> | <dsl color> [| <event name>]
 *
 * - <match text>   Substring to look for in the incoming line (case-insensitive).
 * - <dsl color>    A single DSL color code: r, R, g, G, y, Y, b, B, m, M, c, C,
 *                  D, w, W, p, o, n, u, etc. Do NOT include the leading {.
 * - <event name>   Optional. Defaults to shatteredarchive:raw-data.
 *                  Use event:line if your trigger was originally on that event.
 *
 * Lines starting with # are comments and are ignored.
 *
 * Example:
 *   DISARMS you and sends your weapon flying! | r
 *   The white aura around your body fades     | r
 *   You feel yourself slowing down.           | y
 *   looks very ill.                           | B
 *   is surrounded by a pink outline.          | B | event:line
 */

// ── Types ─────────────────────────────────────────────────────────────────

interface ColorRule {
  matchText: string; // lowercase for comparison
  rawMatchText: string; // original case preserved for omit registration
  color: string; // single DSL color char, e.g. "r", "B"
  eventName: string; // event to listen on
}

// ── DSL color code validation ───────────────────────────────────────────────

const VALID_DSL_COLORS = new Set([
  'r',
  'R',
  'g',
  'G',
  'y',
  'Y',
  'b',
  'B',
  'm',
  'M',
  'c',
  'C',
  'D',
  'w',
  'W',
  'p',
  'o',
  'n',
  'u',
  'x',
]);

function normalizeColor(raw: string): string | null {
  const s = raw.trim();
  // Accept either "r" or "{r" — strip the leading { if present
  const code = s.startsWith('{') ? s.slice(1) : s;
  return VALID_DSL_COLORS.has(code) ? code : null;
}

// ── Parsing ─────────────────────────────────────────────────────────────────

function parseRules(raw: unknown): ColorRule[] {
  if (typeof raw !== 'string') return [];

  const rules: ColorRule[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split('|').map((p) => p.trim());
    const rawMatchText = parts[0] ?? '';
    const colorRaw = parts[1] ?? '';
    const eventName = parts[2]?.trim() || 'shatteredarchive:raw-data';

    if (!rawMatchText || !colorRaw) continue;

    const color = normalizeColor(colorRaw);
    if (!color) continue;

    rules.push({
      matchText: rawMatchText.toLowerCase(),
      rawMatchText,
      color,
      eventName,
    });
  }
  return rules;
}

// ── Default config ──────────────────────────────────────────────────────────

export const DEFAULT_COLOR_RULES = [
  '# Format: match text | color [| event name]',
  '# Color codes: r=dark red, R=bright red, g=dark green, G=bright green,',
  '#   y=dark yellow, Y=bright yellow, b=dark blue, B=bright blue,',
  '#   m=dark magenta, M=bright magenta, c=dark cyan, C=bright cyan,',
  '#   D=dark grey, w=light grey, W=white, p=pink, o=orange',
  '# Event defaults to shatteredarchive:raw-data if omitted.',
  '#',
  '# DISARMS you and sends your weapon flying! | r',
  '# The white aura around your body fades | r',
  '# You feel yourself slowing down. | y',
  '# looks very ill. | B',
  '# is surrounded by a pink outline. | B',
].join('\n');

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRawText(evt: PluginEvent): string {
  const p = evt.payload as any;
  // raw-data payload: { rawText, text }
  // event:line payload: { text, rawText }
  return String(p?.rawText ?? p?.text ?? '');
}

// ── Plugin ──────────────────────────────────────────────────────────────────

export function createColorKitPlugin(): IPluginModule {
  return {
    manifest: {
      id: 'colorkit',
      name: 'Color Kit',
      version: '0.1.0',
      description:
        'Colorize matched lines without writing trigger scripts. One rule per line: match text | color code.',
    },

    configSchema: {
      defaults: {
        rules: DEFAULT_COLOR_RULES,
        debug: false,
      },
      fields: [
        {
          key: 'rules',
          type: 'textarea',
          label: 'Color rules',
          description:
            'One rule per line: match text | color | event (event optional, defaults to raw-data). Lines starting with # are comments.',
          placeholder: 'DISARMS you and sends your weapon flying! | r\nThe white aura around your body fades | r',
        },
        {
          key: 'debug',
          type: 'boolean',
          label: 'Debug logging',
          description: 'Log each matched rule to the script console.',
        },
      ],
      actions: [
        {
          key: 'sync-colors',
          label: 'Sync colors',
          description: 'Re-registers omit rules from the current saved config. Use this after changing the rule list.',
        },
      ],
    },

    onEnable(api: PluginRuntimeApi) {
      const cfg = api.getConfig();
      const colorRules = parseRules(cfg.rules);

      // Register all omit rules up-front so the terminal suppresses original output
      // for every configured match.
      const syncOmitRules = () => {
        const latest = parseRules(api.getConfig().rules);
        api.registerOmitRules(
          latest.map((r) => ({
            matchText: r.rawMatchText,
            eventName: r.eventName,
            caseInsensitive: true,
          })),
        );
      };

      syncOmitRules();

      api.registerAction('sync-colors', syncOmitRules);

      return () => {
        api.registerOmitRules([]);
      };
    },

    onEvent(api: PluginRuntimeApi, evt: PluginEvent): void {
      const cfg = api.getConfig();
      const debug = cfg.debug === true;
      const colorRules = parseRules(cfg.rules);

      // Only handle the events our rules care about
      const hasRule = colorRules.some((r) => r.eventName === evt.name);
      if (!hasRule) return;

      const rawText = getRawText(evt);
      if (!rawText) return;

      const plain = stripAnsi(rawText).toLowerCase();

      for (const rule of colorRules) {
        if (rule.eventName !== evt.name) continue;
        if (!plain.includes(rule.matchText)) continue;

        if (debug) {
          api.log(`[Color Kit] matched "${rule.rawMatchText}" → {${rule.color}}`);
        }

        // Strip trailing newline, colorize, reset, re-add newline
        const stripped = stripAnsi(rawText).replace(/\r?\n$/, '');
        api.writeTerminal(`{${rule.color}${stripped}{x\n`);

        // First match wins — don't apply multiple colors to one line
        return;
      }
    },
  };
}
