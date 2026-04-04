// apps/game-client/src/features/plugins/core-plugins/highlighter.plugin.ts
//
// Colors player names by organization whenever they appear on configurable
// trigger lines (e.g. who lists, farsight, scan, gossip).
//
// Config textarea format (one rule per line):
//   <regex pattern> | next    — color all following lines until blank/prompt
//   <regex pattern> | line    — color names only on the matched line itself
//
// Defaults correspond to DSL_PNP_Highlighter.custom.lua trigger patterns.
//
// Aliases:
//   set status <name> [enemy|neutral|ally]  — tag a player for annotation
//   set team <name> <tag>                   — assign a team label (use 'none' to clear)

import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';
import { stripAnsi } from '../../autoleveling/autoleveling-text';
import { getPerson, setPerson } from './peopleDb';

// ── Organization → DSL color mapping ──────────────────────────────────

const CLAN_COLORS: Record<string, string> = {
  'Black Robes': '{D',
  'Red Robes':   '{R',
  'White Robes': '{W',
  'Bloodlust':   '{r',
  'Shalonesti':  '{G',
  'Justice':     '{b',
  'Knighthood':  '{B',
  'Shadow':      '{D',
  'Slayers':     '{Y',
  'Wargar':      '{C',
  'Chaos':       '{D',
  'Loner':       '{W',
  'Renegade':    '{W',
  'Dragon':      '{G',
  'Demon':       '{D',
  'Angel':       '{W',
  'Balanx':      '{B',
};

const STATUS_SIGNS: Record<string, string> = { enemy: '*', ally: '+' };

// ── Default rules (from DSL_PNP_Highlighter.custom.lua) ───────────────

const DEFAULT_RULES = [
  "# Rules: <regex> | next  OR  <regex> | line",
  "# 'next' highlights all who-list lines that follow until a blank line or prompt.",
  "# 'line' highlights names within only the matched line.",
  "#",
  "^Players near you:$ | next",
  "^You quest out with your magic in search of others\\.$ | next",
  "^Looking around you see:$ | next",
  "^[\\w']+ clan gossips '.*'$ | line",
].join('\n');

// ── Rule parsing ───────────────────────────────────────────────────────

interface HighlightRule {
  pattern: RegExp;
  kind: 'next' | 'line';
  source: string;
}

function parseRules(raw: string): HighlightRule[] {
  const rules: HighlightRule[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const sep = t.lastIndexOf('|');
    if (sep === -1) continue;
    const pat = t.slice(0, sep).trim();
    const kind = t.slice(sep + 1).trim().toLowerCase();
    if (kind !== 'next' && kind !== 'line') continue;
    try {
      rules.push({ pattern: new RegExp(pat, 'i'), kind: kind as 'next' | 'line', source: pat });
    } catch {
      // skip invalid regex
    }
  }
  return rules;
}

// ── Name colorizing ────────────────────────────────────────────────────

// Matches a capitalised word, optionally with an apostrophe (Jor'Mox) or
// possessive suffix (Jor'Mox's).
const NAME_RE = /\b([A-Z][a-z]+(?:'[a-zA-Z]+)?(?:'s)?)\b/g;

function buildColoredName(raw: string): string | null {
  let lookupName = raw;
  if (raw.endsWith("'s") || raw.endsWith("'S")) {
    lookupName = raw.slice(0, -2);
  }

  const person = getPerson(lookupName);
  if (!person) return null;

  const sign = STATUS_SIGNS[person.status ?? ''] ?? '';
  const teamTag = person.team ? `{W[{x${person.team}{W]{x ` : '';
  const display = raw + sign;

  if (person.orgType === 'clan' && person.org) {
    const color = CLAN_COLORS[person.org] ?? '{W';
    return `${teamTag}${color}${display}{x`;
  }

  if (person.orgType === 'kingdom') {
    const prefix = person.org ? `{C(${person.org}){x ` : '';
    return `${teamTag}${prefix}{W${display}{x`;
  }

  return null;
}

function colorizeText(text: string): { result: string; changed: boolean } {
  let result = text;
  let changed = false;

  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  NAME_RE.lastIndex = 0;

  while ((match = NAME_RE.exec(text)) !== null) {
    const raw = match[1];
    if (seen.has(raw)) continue;
    seen.add(raw);

    const colored = buildColoredName(raw);
    if (!colored) continue;

    // Replace all occurrences of this exact token
    result = result.split(raw).join(colored);
    changed = true;
  }

  return { result, changed };
}

// ── Plugin factory ─────────────────────────────────────────────────────

export function createHighlighterPlugin(): IPluginModule {
  let rules: HighlightRule[] = [];
  let nextMode = false;

  // Lines matching `^\[\s*\d+` are who-list entries — suppressed during next-mode
  const WHO_LINE_OMIT = { pattern: '^\\[\\s*\\d+' };

  function buildOmitRules(currentRules: HighlightRule[], includeWhoLine: boolean) {
    const lineOmits = currentRules
      .filter((r) => r.kind === 'line')
      .map((r) => ({ pattern: r.source }));
    return includeWhoLine ? [...lineOmits, WHO_LINE_OMIT] : lineOmits;
  }

  function applyRules(api: PluginRuntimeApi, newRules: HighlightRule[]) {
    rules = newRules;
    api.registerOmitRules(buildOmitRules(rules, nextMode));
  }

  function onEnable(api: PluginRuntimeApi): () => void {
    const cfg = api.getConfig();
    rules = parseRules(String(cfg.rules ?? DEFAULT_RULES));
    nextMode = false;
    api.registerOmitRules(buildOmitRules(rules, false));

    // "Sync Rules" button — re-parse config without disable/enable cycle
    api.registerAction('sync-rules', () => {
      const latest = api.getConfig();
      applyRules(api, parseRules(String(latest.rules ?? DEFAULT_RULES)));
      api.log('Highlight rules synced.');
    });

    const off = api.onEvent('shatteredarchive:raw-data', (payload: any) => {
      const rawText = String(payload?.rawText ?? payload?.text ?? '');
      if (!rawText) return;

      const plain = stripAnsi(rawText).replace(/\r/g, '');
      const debug = cfg.debug === true;

      for (const line of plain.split('\n')) {
        const t = line.trimEnd();

        // Empty line ends next-mode
        if (!t) {
          if (nextMode) {
            nextMode = false;
            api.registerOmitRules(buildOmitRules(rules, false));
            if (debug) api.log('next-mode ended (empty line)');
          }
          continue;
        }

        // Prompt-like line ends next-mode (e.g. <6/6hp 3/3sp>)
        if (/\d+hp/.test(t)) {
          if (nextMode) {
            nextMode = false;
            api.registerOmitRules(buildOmitRules(rules, false));
            if (debug) api.log('next-mode ended (prompt)');
          }
          continue;
        }

        // 'line' rule — colorize this line (original suppressed by omit rules)
        const lineRule = rules.find((r) => r.kind === 'line' && r.pattern.test(t));
        if (lineRule) {
          const { result, changed } = colorizeText(t);
          if (changed) {
            if (debug) api.log(`line rule matched: "${t}"`);
            api.writeTerminal(result + '{x\n');
          }
          continue;
        }

        // 'next' rule — enter next-mode; show the trigger line itself unmodified
        const nextRule = rules.find((r) => r.kind === 'next' && r.pattern.test(t));
        if (nextRule) {
          if (debug) api.log(`next-mode triggered: "${t}"`);
          nextMode = true;
          api.registerOmitRules(buildOmitRules(rules, true));
          continue;
        }

        // In next-mode — suppress who-list entry and write coloured version
        if (nextMode && /^\[\s*\d+/.test(t)) {
          const { result, changed } = colorizeText(t);
          // Always write something (original is suppressed by omit rule)
          api.writeTerminal((changed ? result + '{x' : t) + '\n');
        }
      }
    });

    return () => {
      off();
      rules = [];
      nextMode = false;
      api.registerOmitRules([]);
    };
  }

  function onAlias(api: PluginRuntimeApi, input: string): boolean | undefined {
    const t = input.trim();

    // set status <name> [enemy|neutral|ally]
    const statusMatch = t.match(
      /^set\s+status\s+(['"]?)([^'"]+)\1(?:\s+(enemy|neutral|ally))?\s*$/i,
    );
    if (statusMatch) {
      const name = statusMatch[2].trim();
      const requested = statusMatch[3]?.toLowerCase() as 'enemy' | 'neutral' | 'ally' | undefined;
      const person = getPerson(name);
      if (!person) {
        api.writeTerminal(`{R"${name}" not found in People database.{x\n`);
      } else {
        const newStatus =
          requested ?? (person.status === 'enemy' ? 'neutral' : 'enemy');
        setPerson(person.name, { status: newStatus });
        api.writeTerminal(`Status of {W${person.name}{x set to ${newStatus}.\n`);
      }
      return true;
    }

    // set team <name> <tag>  (use 'none' to clear)
    const teamMatch = t.match(/^set\s+team\s+([\w']+)\s+(.+)$/i);
    if (teamMatch) {
      const name = teamMatch[1].trim();
      const tag = teamMatch[2].trim().toLowerCase() === 'none' ? undefined : teamMatch[2].trim();
      const person = getPerson(name);
      if (!person) {
        api.writeTerminal(`{R"${name}" not found in People database.{x\n`);
      } else {
        setPerson(person.name, { team: tag });
        api.writeTerminal(
          tag
            ? `{W${person.name}{x assigned to team ${tag}.\n`
            : `Team for {W${person.name}{x cleared.\n`,
        );
      }
      return true;
    }

    return false;
  }

  return {
    manifest: {
      id: 'highlighter',
      name: 'Highlighter',
      version: '0.1.0',
      description:
        'Colors player names by organization on who lists, farsight, scan, and gossip lines. Requires the People plugin to be enabled.',
    },

    configSchema: {
      defaults: {
        rules: DEFAULT_RULES,
        debug: false,
      },
      fields: [
        {
          key: 'rules',
          type: 'textarea',
          label: 'Highlight rules',
          description:
            'One rule per line: <regex> | next  or  <regex> | line. Lines starting with # are comments.',
        },
        {
          key: 'debug',
          type: 'boolean',
          label: 'Debug logging',
          description: 'Log rule matches and next-mode transitions.',
        },
      ],
      actions: [
        {
          key: 'sync-rules',
          label: 'Sync Rules',
          description: 'Apply rule edits without restarting the plugin.',
        },
      ],
    },

    onEnable,
    onAlias,
  };
}
