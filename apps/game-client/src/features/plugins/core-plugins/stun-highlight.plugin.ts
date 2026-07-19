// apps\game-client\src\features\plugins\core-plugins\stun-highlight.plugin.ts
import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';

/**
 * Stun Highlight — squelches the original (ANSI-laden) text of selected
 * stun/knockdown lines and re-emits them recolored, so they stand out in the
 * scroll instead of blending into normal combat spam. Each line is
 * independently toggleable.
 *
 * All patterns below were verified against the real server log corpus
 * (C:\Projects\DSL\GameLogs\ShatteredArchive\Docker\game-server\2026\07\01
 * through \19, ~500k text lines) before shipping. Per that scan, THREE of
 * the lines the user supplied were NOT found anywhere in the corpus — not
 * even under a broadened keyword search — and are therefore NOT included:
 *   - Gore (mount/beast attack) "...into the air!" — zero hits, including a
 *     broadened (gore|trample|charge|ram)+(air|flying) search. The only
 *     "gore" hits in the corpus are unrelated flavor text ("splattering
 *     gore") and OOC chat.
 *   - Bash "...causing it to fall flat on its face." (the it-gendered
 *     variant) — zero hits; only the him/her variants were confirmed.
 *   - Trip "You fall flat on your face!" — zero hits under either the exact
 *     string or a broadened "fall flat" search.
 *   - The entire "Jest and charm" group (3 lines) — zero hits under a
 *     broadened master/charm/jest/nice? keyword search across the whole
 *     corpus. Everything found under those keywords was unrelated (account
 *     menus, a Court Jester NPC, OOC chat, room "(Charmed)" corpse tags).
 * These are excluded rather than shipped unproven, per the house rule of
 * never shipping a line-match pattern that hasn't been confirmed against
 * real text. If these skills are just rare (not wrong), supply the exact
 * wording from a fresh capture and they can be added.
 *
 * One nuance worth knowing from the confirmed "Bash ... causing him/her to
 * fall flat" lines: the real log shows these as "You evade X's bash,
 * causing him to fall flat on his face." — i.e. the ATTACKER trips over
 * their own missed bash, not the player being stunned. That's exactly why
 * the user grouped it under yellow (minor/comedic) rather than red
 * (actually stunned) — self vs. other severity, not a data error.
 *
 * All omit rules use `matchText` (literal substring), not `pattern` regex —
 * every confirmed line here is a fixed literal, so there's no need for the
 * `$`-anchor/multiline-flag regex gotcha that suppressive plugins matching
 * templated (name-containing) lines have to handle.
 *
 * Inherited architecture note (same as every other suppressive plugin in
 * this codebase, e.g. weapon-flag-squelch/highlighter): the terminal omit
 * check applies to the FULL raw-data chunk as received, not per line. If a
 * needle matches anywhere in a multi-line chunk, the whole chunk's terminal
 * write is skipped — any other unrelated line bundled in that same network
 * write would also be hidden. In practice the server appears to emit these
 * particular combat messages as isolated single-line chunks (matches the
 * behavior weapon-flag-squelch already relies on), so this hasn't been an
 * observed problem, but it's not something this plugin newly introduces or
 * can fully rule out.
 */

// ── Types ─────────────────────────────────────────────────────────────────

interface StunLine {
  configKey: string;
  categoryLabel: string;
  variantLabel: string;
  matchText: string;
  color: string; // DSL color code, e.g. '{R'
  defaultEnabled: boolean;
}

// ── Confirmed lines only ────────────────────────────────────────────────

const LINES: StunLine[] = [
  // Red — stun actually landed on you
  {
    configKey: 'highlightBashSelfSentFlying',
    categoryLabel: 'Red — Bash',
    variantLabel: '"You are sent flying by the impact!" (self)',
    matchText: 'You are sent flying by the impact!',
    color: '{R',
    defaultEnabled: true,
  },
  {
    configKey: 'highlightBashOtherSentFlying',
    categoryLabel: 'Red — Bash',
    variantLabel: '"X is sent flying by the impact!" (other-target)',
    matchText: 'is sent flying by the impact!',
    color: '{R',
    defaultEnabled: true,
  },
  {
    configKey: 'highlightTripTripsYou',
    categoryLabel: 'Red — Trip',
    variantLabel: '"X trips you and you go down!" line',
    matchText: 'trips you and you go down!',
    color: '{R',
    defaultEnabled: true,
  },

  // Yellow — minor/comedic (attacker's own bash missed and tripped them up)
  {
    configKey: 'highlightBashEvadeCausingHim',
    categoryLabel: 'Yellow — Bash (evaded)',
    variantLabel: '"...bash, causing him to fall flat on his face." line',
    matchText: 'bash, causing him to fall flat on his face.',
    color: '{Y',
    defaultEnabled: true,
  },
  {
    configKey: 'highlightBashEvadeCausingHer',
    categoryLabel: 'Yellow — Bash (evaded)',
    variantLabel: '"...bash, causing her to fall flat on her face." line',
    matchText: 'bash, causing her to fall flat on her face.',
    color: '{Y',
    defaultEnabled: true,
  },
];

// ── Default config ──────────────────────────────────────────────────────────

const DEFAULT_TOGGLES: Record<string, boolean> = Object.fromEntries(
  LINES.map((l) => [l.configKey, l.defaultEnabled]),
);

// ── Plugin ──────────────────────────────────────────────────────────────────

export function createStunHighlightPlugin(): IPluginModule {
  return {
    manifest: {
      id: 'stun-highlight',
      name: 'Stun Highlight',
      version: '0.1.0',
      description:
        'Recolors stun/knockdown lines (bash, trip) so they stand out from normal combat scroll — red for a real stun landing on you, yellow for the attacker tripping over their own missed bash. Each line individually toggleable.',
    },

    configSchema: {
      defaults: {
        ...DEFAULT_TOGGLES,
        debug: false,
      },
      fields: [
        ...LINES.map((l) => ({
          key: l.configKey,
          type: 'boolean' as const,
          label: `${l.categoryLabel} — ${l.variantLabel}`,
          description: `Squelch the original and re-emit it in ${l.color === '{R' ? 'red' : 'yellow'}. Default: ${l.defaultEnabled ? 'on' : 'off'}.`,
        })),
        {
          key: 'debug',
          type: 'boolean',
          label: 'Debug logging',
          description: 'Log the active rule count to the script console.',
        },
      ],
      actions: [
        {
          key: 'sync-rules',
          label: 'Sync highlight rules',
          description: 'Re-registers suppression rules from the current saved config. Use this after toggling lines.',
        },
      ],
    },

    onEnable(api: PluginRuntimeApi) {
      const syncOmitRules = () => {
        const cfg = api.getConfig();
        const rules: Array<{ matchText: string; caseInsensitive?: boolean }> = [];

        for (const l of LINES) {
          const enabled = typeof cfg[l.configKey] === 'boolean' ? (cfg[l.configKey] as boolean) : l.defaultEnabled;
          if (!enabled) continue;
          rules.push({ matchText: l.matchText, caseInsensitive: false });
        }

        api.registerOmitRules(rules);

        if (cfg.debug === true) {
          api.log(`[Stun Highlight] active rules: ${rules.length}/${LINES.length}`);
        }
      };

      syncOmitRules();
      api.registerAction('sync-rules', syncOmitRules);

      const off = api.onEvent('shatteredarchive:raw-data', (payload: any) => {
        const rawText = String(payload?.rawText ?? payload?.text ?? '');
        if (!rawText) return;

        const cfg = api.getConfig();
        const plain = rawText.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');

        for (const rawLine of plain.split('\n')) {
          const line = rawLine.trimEnd();
          if (!line) continue;

          for (const l of LINES) {
            const enabled = typeof cfg[l.configKey] === 'boolean' ? (cfg[l.configKey] as boolean) : l.defaultEnabled;
            if (!enabled) continue;
            if (!line.includes(l.matchText)) continue;

            api.writeTerminal(`${l.color}${line}{x\n`);
            if (cfg.debug === true) api.log(`[Stun Highlight] matched "${l.configKey}": "${line}"`);
            break;
          }
        }
      });

      return () => {
        off();
        api.registerOmitRules([]);
      };
    },
  };
}
