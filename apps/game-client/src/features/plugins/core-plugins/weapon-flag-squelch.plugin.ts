// apps\game-client\src\features\plugins\core-plugins\weapon-flag-squelch.plugin.ts
import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';

/**
 * Weapon Flag Squelch — suppresses weapon-flag proc echo lines from the terminal.
 *
 * Patterns sourced from @reference-data/CapturedPatterns_Reference.txt. Each
 * individual proc line has its own toggle (not just a per-flag master switch),
 * since a flag can echo more than one distinct message (e.g. Frost has both a
 * "freezes" line and a separate "cold touch of ice" line). All are squelched
 * by default EXCEPT Poison, whose lines are left visible by default (DSL2's
 * own addition — no PNP equivalent — so it's treated as opt-in rather than
 * noise to hide).
 *
 * The Mana Drain "self" line is marked in the reference as unconfirmed
 * against the log corpus — included anyway since it's the documented
 * expected format, but flag for removal if it never fires or proves wrong.
 * (Unholy wrath was also marked unconfirmed in the reference; confirmed live
 * via the 2026-07-18 server log — 4 real occurrences.)
 *
 * The Shocking "self" line ("You are shocked by ...") was MISSING from the
 * reference entirely — the documented "X is shocked by a" pattern only
 * covers third-person/other-target grammar. Confirmed via the 2026-07-18 log
 * (3 real occurrences, all second-person "You are"), which also showed zero
 * occurrences of the third-person form — so that one is now unconfirmed
 * rather than the self line. Both are kept; only the self line's default was
 * added new.
 *
 * Sharp and Vorpal are documented as producing no echo at all, so there is
 * nothing to squelch for them — intentionally not included here.
 *
 * All rules use the 'm' (multiline) regex flag. Raw-data payloads arrive as a
 * single line INCLUDING its trailing "\n" — without multiline mode, a
 * trailing `$` anchor would never match, because the line is not literally at
 * the end of the string. `m` makes `$` match before that trailing newline.
 */

// ── Types ─────────────────────────────────────────────────────────────────

interface FlagPattern {
  configKey: string;
  categoryLabel: string; // flag group, for field ordering/labeling only
  variantLabel: string; // which distinct echo line within the group
  pattern: string;
  defaultSquelch: boolean;
}

// ── Patterns (regex source strings; 'm' flag applied uniformly) ────────────

const PATTERNS: FlagPattern[] = [
  // Frost (C)
  {
    configKey: 'squelchFrostFreezes',
    categoryLabel: 'Frost (C)',
    variantLabel: '"X freezes Y." line',
    pattern: `^([\\w\\-\\s,'"]+) freezes ([\\w\\-\\s,'"]+)\\.$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchFrostColdTouch',
    categoryLabel: 'Frost (C)',
    variantLabel: '"cold touch ... surrounds you with ice" line',
    pattern: `^The cold touch of ([\\w\\-\\s,']+) surrounds you with ice`,
    defaultSquelch: true,
  },

  // Flaming (F)
  {
    configKey: 'squelchFlamingBurnedBy',
    categoryLabel: 'Flaming (F)',
    variantLabel: '"X is burned by Y." line',
    pattern: `^([\\w\\-\\s,']+) is burned by ([\\w\\-\\s,']+)\\.$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchFlamingSearsFlesh',
    categoryLabel: 'Flaming (F)',
    variantLabel: '"sears your flesh" line',
    pattern: `^([\\w\\-\\s,']+) sears your flesh`,
    defaultSquelch: true,
  },

  // Shocking (L)
  {
    configKey: 'squelchShockingStruckByLightning',
    categoryLabel: 'Shocking (L)',
    variantLabel: '"struck by lightning from" line',
    pattern: `^([\\w\\-\\s,']+) is struck by lightning from ([\\w\\-\\s,']+)\\.$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchShockingShockedByA',
    categoryLabel: 'Shocking (L)',
    variantLabel: '"X is shocked by a ..." (other-target) line — unconfirmed by 2026-07-18 log',
    pattern: `^([\\w\\-\\s,']+) is shocked by a`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchShockingYouAreShockedByA',
    categoryLabel: 'Shocking (L)',
    variantLabel: '"You are shocked by ..." (self-target) line — confirmed 2026-07-18',
    pattern: `^You are shocked by`,
    defaultSquelch: true,
  },

  // Vampiric (H)
  {
    configKey: 'squelchVampiricDrawsLife',
    categoryLabel: 'Vampiric (H)',
    variantLabel: '"draws life from" line',
    pattern: `^([\\w\\-\\s,'"]+) draws life from ([\\w\\-\\s,'"]+)\\.$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchVampiricFeelDrawingLifeAway',
    categoryLabel: 'Vampiric (H)',
    variantLabel: '"you feel ... drawing your life away" (self) line',
    pattern: `^You feel ([\\w\\-\\s,']+) drawing your life away`,
    defaultSquelch: true,
  },

  // Stunning (S)
  {
    configKey: 'squelchStunningKnockedToGround',
    categoryLabel: 'Stunning (S)',
    variantLabel: '"knocked to the ground by" line',
    pattern: `^([\\w\\-\\s,'"]+) is knocked to the ground by ([\\w\\-\\s,'"]+)\\.$`,
    defaultSquelch: true,
  },

  // Mana drain (M)
  {
    configKey: 'squelchManaDrainSelf',
    categoryLabel: 'Mana drain (M)',
    variantLabel: '"something drawing your energy away" (self) line',
    pattern: `^You feel something drawing your energy away`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchManaDrainDrawsEnergy',
    categoryLabel: 'Mana drain (M)',
    variantLabel: '"draws energy from" line',
    pattern: `^([\\w\\-\\s,']+) draws energy from ([\\w\\-\\s,']+)\\.$`,
    defaultSquelch: true,
  },

  // Holy (O)
  {
    configKey: 'squelchHolySurgeWrath',
    categoryLabel: 'Holy (O)',
    variantLabel: '"surge of ...\'s holy wrath" (self) line',
    pattern: `^You feel a surge of ([\\w\\-\\s,']+)'s holy wrath race through your body`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchHolyFlashPower',
    categoryLabel: 'Holy (O)',
    variantLabel: '"flash of holy power erupts from" line',
    pattern: `^A flash of holy power erupts from ([\\w\\-\\s,']+) and hits ([\\w\\-\\s,']+)!$`,
    defaultSquelch: true,
  },

  // Unholy (U)
  {
    configKey: 'squelchUnholySurgeWrath',
    categoryLabel: 'Unholy (U)',
    variantLabel: '"surge of ...\'s unholy wrath" (self) line — confirmed 2026-07-18',
    pattern: `^You feel a surge of ([\\w\\-\\s,']+)'s unholy wrath race through your body`,
    defaultSquelch: true,
  },

  // Poison (P) — exempted from squelch-by-default
  {
    configKey: 'squelchPoisonCoats',
    categoryLabel: 'Poison (P)',
    variantLabel: '"coats ... with deadly lifebane poison" line',
    pattern: `^([\\w\\-\\s,']+) coats ([\\w\\-\\s,']+) with deadly lifebane poison\\.$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchPoisonVenom',
    categoryLabel: 'Poison (P)',
    variantLabel: '"is poisoned by the venom on" line',
    pattern: `^([\\w\\-\\s,']+) is poisoned by the venom on ([\\w\\-\\s,']+)\\.$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchPoisonShivers',
    categoryLabel: 'Poison (P)',
    variantLabel: '"shivers and suffers" line',
    pattern: `^([\\w\\-\\s,']+) shivers and suffers\\.$`,
    defaultSquelch: false,
  },
];

// ── Default config ──────────────────────────────────────────────────────────

const DEFAULT_TOGGLES: Record<string, boolean> = Object.fromEntries(
  PATTERNS.map((p) => [p.configKey, p.defaultSquelch]),
);

// ── Plugin ──────────────────────────────────────────────────────────────────

export function createWeaponFlagSquelchPlugin(): IPluginModule {
  return {
    manifest: {
      id: 'weapon-flag-squelch',
      name: 'Weapon Flag Squelch',
      version: '0.3.1',
      description:
        'Suppresses weapon-flag proc echoes (Frost, Flaming, Shocking, Vampiric, Stunning, Mana Drain, Holy, Unholy) from the terminal, with each distinct proc line individually toggleable. Poison lines are left visible by default.',
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
          api.log(`[Weapon Flag Squelch] active rules: ${rules.length}/${PATTERNS.length}`);
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
