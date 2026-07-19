// apps\game-client\src\features\plugins\core-plugins\combat-compression.plugin.ts
import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';

/**
 * Combat Compression — suppresses selected classes of combat-log lines to
 * reduce scroll volume during extended fights.
 *
 * All patterns below were verified against the real server log corpus
 * (C:\Projects\DSL\GameLogs\ShatteredArchive\Docker\game-server\2026\07\01
 * through \18, ~488k text lines) before shipping. Per that scan:
 *   - Every pattern the user supplied was confirmed EXCEPT the "senses
 *     [target]'s attack coming and avoids its blow" avoidance line — the
 *     real wording uses the literal word "your" in that slot, not a
 *     possessive target name (e.g. "Maccus senses your attack coming and
 *     avoids its blow."). The regex below is corrected to match; 62 real
 *     occurrences confirmed.
 *   - The bard "senses they're about to be hit and deflects the blow" line
 *     was also confirmed (66 occurrences) — no self ("you're") variant was
 *     found in the corpus, so only the third-person form is included.
 *   - The mana condition tier ("full magical ability") and the third death
 *     form ("You hear something's death cry.") were both flagged unconfirmed
 *     by the source reference but DID turn up in the real corpus (52 and 93
 *     occurrences respectively) — included.
 *
 * Default squelch policy: only the Avoidance group defaults ON. That's the
 * literal ask ("squelch all damage avoidance lines to help compress
 * combat") — dodge/parry/block/deflect lines carry no information beyond
 * "nothing happened," making them the highest-noise, lowest-signal class.
 * Damage, Condition, Death, and Flee/Rescue lines are included as toggles
 * (broader scope, confirmed by the user) but default OFF/visible: they
 * carry information most players want mid-fight (who's winning, health
 * tier, kills, disengages), so hiding them by default would surprise more
 * than it'd help. Opt-in squelching is available per line for players who
 * want a fully silent combat log.
 *
 * All rules use the 'm' (multiline) regex flag. Raw-data payloads arrive as
 * a single line INCLUDING its trailing "\n" — without multiline mode, a
 * trailing `$` anchor would never match, because the line is not literally
 * at the end of the string. `m` makes `$` match before that trailing
 * newline.
 */

// ── Types ─────────────────────────────────────────────────────────────────

interface LinePattern {
  configKey: string;
  categoryLabel: string;
  variantLabel: string;
  pattern: string;
  defaultSquelch: boolean;
}

// ── Patterns (regex source strings; 'm' flag applied uniformly) ────────────

const PATTERNS: LinePattern[] = [
  // Damage (unified damage-verb line, self+other, all severity tiers)
  {
    configKey: 'squelchDamageLines',
    categoryLabel: 'Damage',
    variantLabel: 'unified miss/hit/kill-tier damage verb line',
    pattern: `^(You|[\\w\\-\\s,']+?)(?:(?<=You)r|'s)?(?:\\s?((?<=Your )[\\w\\s]+?|(?<='s )[\\w\\s]+?|))(?: do[es]*| [\\>\\<\\=\\*]+|) (miss|scratch|graze|hit|injure|wound|maul|decimate|devastate|maim|MUTILATE|DISEMBOWEL|DISMEMBER|MASSACRE|MANGLE|DEMOLISH|DEVASTATE|OBLITERATE|ANNIHILATE|ERADICATE|GHASTLY|HORRID|DREADFUL|HIDEOUS|INDESCRIBABLE|UNSPEAKABLE)[esES]*(?: things to| [\\>\\<\\=\\*]+|) ([\\w\\-\\s,']+)([\\.\\.!]+)$`,
    defaultSquelch: false,
  },

  // Avoidance
  {
    configKey: 'squelchAvoidDodge',
    categoryLabel: 'Avoidance',
    variantLabel: '"X dodges Y\'s attack." line',
    pattern: `(You|[\\w\\-,\\s']+) (dodge)s? (your|[\\w\\-,\\s']+) attack\\.$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchAvoidParry',
    categoryLabel: 'Avoidance',
    variantLabel: '"X parries Y\'s attack." line',
    pattern: `(You|[\\w\\-,\\s']+) (parry|parries) (your|[\\w\\-,\\s']+) attack\\.$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchAvoidBlock',
    categoryLabel: 'Avoidance',
    variantLabel: '"X blocks Y\'s attack ..." line',
    pattern: `(You|[\\w\\-,\\s']+) (block)[s]? (your|[\\w\\-,\\s']+) attack .*\\.$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchAvoidBardDeflect',
    categoryLabel: 'Avoidance',
    variantLabel: '"senses they\'re about to be hit and deflects the blow" (bard) line',
    pattern: `^[\\w\\-\\s,']+ senses they.?re about to be hit and deflects the blow\\.$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchAvoidSenseAttack',
    categoryLabel: 'Avoidance',
    variantLabel: '"senses your attack coming and avoids its blow" line',
    pattern: `^[\\w\\-\\s,']+ senses (your|[\\w\\-\\s,']+) attack coming and avoids its blow\\.$`,
    defaultSquelch: true,
  },

  // Condition
  {
    configKey: 'squelchConditionHp',
    categoryLabel: 'Condition',
    variantLabel: 'HP condition tier line (excellent → awful, self+third-person)',
    pattern: `(?:is in excellent condition|are in excellent condition|has a few scratches|have a few scratches|has some small wounds|have some small wounds|has some big nasty wounds|have some big nasty wounds|has quite a few wounds|have quite a few wounds|looks pretty hurt|look pretty hurt|is in awful condition|are in awful condition)`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchConditionMana',
    categoryLabel: 'Condition',
    variantLabel: '"full magical ability" mana condition tier line',
    pattern: `full magical ability`,
    defaultSquelch: false,
  },

  // Death
  {
    configKey: 'squelchDeathBang',
    categoryLabel: 'Death',
    variantLabel: '"X is DEAD!!" line',
    pattern: `is DEAD!!$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchDeathGround',
    categoryLabel: 'Death',
    variantLabel: '"X hits the ground ... DEAD." line',
    pattern: `hits the ground \\.\\.\\. DEAD\\.$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchDeathCry',
    categoryLabel: 'Death',
    variantLabel: '"You hear something\'s death cry." line',
    pattern: `You hear something's death cry\\.`,
    defaultSquelch: false,
  },

  // Flee / rescue / escape-fail / target-fled
  {
    configKey: 'squelchFleeCombat',
    categoryLabel: 'Flee/Rescue',
    variantLabel: '"You flee from combat!" line',
    pattern: `^You flee from combat!$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchFleeEscapeFail',
    categoryLabel: 'Flee/Rescue',
    variantLabel: '"You cannot escape from combat!!!" line',
    pattern: `^You cannot escape from combat!!!$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchFleeRescues',
    categoryLabel: 'Flee/Rescue',
    variantLabel: '"X rescues you!" line',
    pattern: `rescues you!$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchFleeHasFled',
    categoryLabel: 'Flee/Rescue',
    variantLabel: '"X has fled!" line',
    pattern: `^[\\w\\-\\s,']+ has fled!$`,
    defaultSquelch: false,
  },
];

// ── Default config ──────────────────────────────────────────────────────────

const DEFAULT_TOGGLES: Record<string, boolean> = Object.fromEntries(
  PATTERNS.map((p) => [p.configKey, p.defaultSquelch]),
);

// ── Plugin ──────────────────────────────────────────────────────────────────

export function createCombatCompressionPlugin(): IPluginModule {
  return {
    manifest: {
      id: 'combat-compression',
      name: 'Combat Compression',
      version: '0.1.0',
      description:
        'Suppresses selected combat-log line classes (Damage, Avoidance, Condition, Death, Flee/Rescue) to reduce scroll volume during fights. Avoidance lines (dodge/parry/block/deflect) are squelched by default; the rest are opt-in.',
    },

    configSchema: {
      defaults: {
        ...DEFAULT_TOGGLES,
        debug: false,
      },
      fields: [
        ...PATTERNS.map((p) => ({
          key: p.configKey,
          type: 'boolean' as const,
          label: `${p.categoryLabel} — ${p.variantLabel}`,
          description: `Suppress this line. Default: ${p.defaultSquelch ? 'squelched' : 'visible'}.`,
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
          label: 'Sync squelch rules',
          description: 'Re-registers suppression rules from the current saved config. Use this after toggling lines.',
        },
      ],
    },

    onEnable(api: PluginRuntimeApi) {
      const syncOmitRules = () => {
        const cfg = api.getConfig();
        const rules: Array<{ pattern: string; flags: string }> = [];

        for (const p of PATTERNS) {
          const enabled = typeof cfg[p.configKey] === 'boolean' ? (cfg[p.configKey] as boolean) : p.defaultSquelch;
          if (!enabled) continue;
          rules.push({ pattern: p.pattern, flags: 'm' });
        }

        api.registerOmitRules(rules);

        if (cfg.debug === true) {
          api.log(`[Combat Compression] active rules: ${rules.length}/${PATTERNS.length}`);
        }
      };

      syncOmitRules();
      api.registerAction('sync-rules', syncOmitRules);

      return () => {
        api.registerOmitRules([]);
      };
    },
  };
}
