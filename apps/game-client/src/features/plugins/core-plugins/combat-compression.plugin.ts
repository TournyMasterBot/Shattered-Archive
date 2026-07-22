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
 * 2026-07-21 addendum: added Disarm (fail/weapon/shield) and Ambient
 * (arrival/movement) categories, and broadened Flee/Rescue's rescue pattern
 * from "rescues you!$" to any rescuer/rescuee — all cross-checked against
 * @reference-data/CapturedPatterns_Reference.txt (an unverified community
 * pattern list) and then independently confirmed present, with this game's
 * exact wording, in the real server log corpus before being added. Disarm
 * Fail defaults ON (same "nothing happened" rationale as Avoidance); Disarm
 * Weapon/Shield and Ambient default OFF (real state change / traffic info).
 *
 * 2026-07-21 addendum #2: added Avoidance's "seems unaffected" (resist,
 * no-op), Ambient's mount/look/bolt-arc/tagged-arrival lines, Item Use
 * (quaff/get-from-container/drink/wield/wear/stop-using — mechanical
 * actions whose real state change already has its own Status/Condition
 * line), Status (buffs/debuffs), Incapacitation (third-person stun/blind/
 * knockdown — the OTHER combatant, unlike text-to-speech's SELF_STUN_
 * MATCHERS), and Disarm's third-person "X disarms Y!" success line — all
 * mined and verified against the real Coliseum-arena corpus (built for
 * text-to-speech's Arena Observer Mode, which reuses these categories to
 * decide what a spectator hears). Item Use defaults ON (redundant with the
 * effect line that follows); Status/Incapacitation/Disarm-other default OFF
 * (real, informative state changes) — same policy as their siblings above.
 *
 * All rules use the 'm' (multiline) regex flag. Raw-data payloads arrive as
 * a single line INCLUDING its trailing "\n" — without multiline mode, a
 * trailing `$` anchor would never match, because the line is not literally
 * at the end of the string. `m` makes `$` match before that trailing
 * newline.
 */

// ── Types ─────────────────────────────────────────────────────────────────

export interface LinePattern {
  configKey: string;
  categoryLabel: string;
  variantLabel: string;
  pattern: string;
  defaultSquelch: boolean;
}

// ── Patterns (regex source strings; 'm' flag applied uniformly) ────────────

// Exported so other plugins (e.g. text-to-speech's combat-compression mode)
// can reuse these verified line patterns instead of re-deriving them.
export const PATTERNS: LinePattern[] = [
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
  {
    configKey: 'squelchAvoidUnaffected',
    categoryLabel: 'Avoidance',
    // No-info resist ("nothing happened"), confirmed via the 2026-07-21
    // arena corpus mining pass (Coliseum fight logs).
    variantLabel: '"X seems unaffected." line',
    pattern: `^[\\w\\-\\s,']+ seems unaffected\\.$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchAvoidUnaffectedBy',
    categoryLabel: 'Avoidance',
    // Confirmed via the 2026-07-21 Bloodbath-arena corpus mining pass.
    variantLabel: '"X is unaffected by Y\'s Z!" line (elemental/spell resist)',
    pattern: `^[\\w\\-\\s,']+ is unaffected by [\\w\\-\\s,']+'s [\\w\\-\\s,']+!$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchAvoidResistsMagic',
    categoryLabel: 'Avoidance',
    variantLabel: '"X resists Y\'s magic!" line',
    pattern: `^(?:He|She|It|They|[\\w\\-\\s,']+) resists (?:your|[\\w\\-\\s,']+) magic!$`,
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
    configKey: 'squelchFleePanic',
    categoryLabel: 'Flee/Rescue',
    // No-info escape-attempt failure ("nothing happened"), like Avoidance —
    // distinct configKey from squelchFleeEscapeFail above (same category,
    // different default) so arena mode can squelch this specific spammy
    // variant (267 occurrences in the Bloodbath corpus mining pass) without
    // touching that one's default. Confirmed 2026-07-21.
    variantLabel: '"PANIC! You couldn\'t escape!" line',
    pattern: `^PANIC! You couldn't escape!$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchFleeRescues',
    categoryLabel: 'Flee/Rescue',
    // Broadened from the original you-only "rescues you!$" — real corpus
    // confirms third-party rescues use the identical tail ("X rescues
    // Vsevolod!", "Someone rescues someone!"), so anchoring to "you" missed
    // most real occurrences.
    variantLabel: '"X rescues Y!" line (any rescuer/rescuee, not just you)',
    pattern: `^[\\w\\-\\s,']+ rescues (?:you|[\\w\\-\\s,']+)!$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchFleeHasFled',
    categoryLabel: 'Flee/Rescue',
    variantLabel: '"X has fled!" line',
    pattern: `^[\\w\\-\\s,']+ has fled!$`,
    defaultSquelch: false,
  },

  // Disarm — passive (done to you) vs. active-skill-use-against-you.
  // Patterns confirmed against the real server log corpus
  // (C:\Projects\DSL\GameLogs\ShatteredArchive\Docker\game-server, full
  // date range) on 2026-07-21.
  {
    configKey: 'squelchDisarmFail',
    categoryLabel: 'Disarm',
    // No-info like Avoidance (nothing happened) — defaults ON.
    variantLabel: '"X tries to disarm Y, but fails." line',
    pattern: `tries to disarm (?:you|[\\w\\-\\s,']+), but fails\\.$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchDisarmWeapon',
    categoryLabel: 'Disarm',
    variantLabel: '"X DISARMS/grabs/controls your weapon ... flying!" line (weapon knocked from your hand)',
    pattern: `(DISARMS you and sends your weapon flying!|grabs your weapon,? and sends it flying!|controls your weapon,? and sends it flying!)$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchDisarmShield',
    categoryLabel: 'Disarm',
    variantLabel: '"X sends your shield flying ..." line (shield knocked from your hand)',
    pattern: `(knocked loose from their hands by|sends your shield flying with a powerful kick!|swings \\w+ weapon viciously at your shield and sends it flying!)`,
    defaultSquelch: false,
  },

  // Ambient room traffic — mob/player arrival + directional wandering.
  // Not combat per se, but the dominant noise source in any multi-mob pull
  // (an untargeted mob floating/walking through mid-fight). Confirmed
  // against the real corpus 2026-07-21 (e.g. "An air elemental floats in.",
  // "Kevyn walks north.").
  {
    configKey: 'squelchAmbientArrival',
    categoryLabel: 'Ambient',
    variantLabel: '"X walks/runs/floats/flies/hops in." line',
    pattern: `^[\\w\\-\\s,']+ (?:walks|runs|floats|flies|hops|grows) in\\.$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchAmbientMovement',
    categoryLabel: 'Ambient',
    variantLabel: '"X walks/runs/floats/flies <direction>." line',
    pattern: `^[\\w\\-\\s,']+ (?:walks|runs|floats|flies) (?:north|south|east|west|northeast|northwest|southeast|southwest|up|down)\\.$`,
    defaultSquelch: false,
  },

  // Ambient extensions — mounted movement, bracket-tagged (e.g. "(Imm)")
  // observer arrivals, look/scan flavor, and a spell-cast precursor with no
  // standalone outcome info. All confirmed via the 2026-07-21 arena corpus
  // mining pass (Coliseum fight logs — see arena-observer mode below).
  {
    configKey: 'squelchAmbientMountArrival',
    categoryLabel: 'Ambient',
    variantLabel: '"X has arrived, riding on a/an Y." line',
    pattern: `has arrived, riding on (?:a|an) [\\w\\-\\s,']+\\.$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchAmbientMountDeparture',
    categoryLabel: 'Ambient',
    variantLabel: '"X leaves <direction>, riding on a/an Y." line',
    pattern: `leaves (?:north|south|east|west|northeast|northwest|southeast|southwest|up|down), riding on (?:a|an) [\\w\\-\\s,']+\\.$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchAmbientMountSoarIn',
    categoryLabel: 'Ambient',
    variantLabel: '"X soars in, riding on a/an Y." line',
    pattern: `soars in, riding on (?:a|an) [\\w\\-\\s,']+\\.$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchAmbientMountGallop',
    categoryLabel: 'Ambient',
    variantLabel: '"a/an X gallops in." line (the mount\'s own arrival broadcast)',
    pattern: `^(?:a|an) [\\w\\-\\s,']+ gallops in\\.$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchAmbientTaggedArrival',
    categoryLabel: 'Ambient',
    variantLabel: '"(tag) X walks/runs/floats/flies/hops/grows in." line (e.g. "(Imm) Xenophon walks in.")',
    pattern: `^\\([\\w\\-\\s,']+\\) [\\w\\-\\s,']+ (?:walks|runs|floats|flies|hops|grows) in\\.$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchAmbientLooksAround',
    categoryLabel: 'Ambient',
    variantLabel: '"X looks all around." line',
    pattern: `^(?:[\\w\\-\\s,']+|Someone) looks all around\\.$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchAmbientBoltArc',
    categoryLabel: 'Ambient',
    // Cast-flavor precursor only — carries no hit/miss/amount info of its
    // own (the actual outcome, if any, arrives as a separate damage or
    // weapon-flag line), and is extremely high-frequency in the corpus.
    variantLabel: '"The bolt arcs to X!" line (spell-cast precursor, no outcome of its own)',
    pattern: `^The bolt arcs to [\\w\\-\\s,']+(?:\\.\\.\\.whoops)?!$`,
    defaultSquelch: false,
  },

  // Item use — mechanical consume/pickup actions. Squelched by default: the
  // resulting state change (buff onset, health change) already has its own
  // line under Status/Condition below, so the action line itself is
  // redundant noise, not lost information.
  {
    configKey: 'squelchItemQuaffPotion',
    categoryLabel: 'Item Use',
    variantLabel: '"X quaffs a/an Y." line',
    pattern: `^[\\w\\-\\s,']+ quaffs (?:a|an) [\\w\\-\\s,']+\\.$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchItemGetFromContainer',
    categoryLabel: 'Item Use',
    variantLabel: '"X gets Y from Z." line (container/corpse loot pickup)',
    pattern: `^[\\w\\-\\s,']+ gets [\\w\\-\\s,']+ from [\\w\\-\\s,']+\\.$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchItemDrinkWater',
    categoryLabel: 'Item Use',
    variantLabel: '"X drinks water from a decanter of endless water." line',
    pattern: `drinks water from a decanter of endless water\\.$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchItemWields',
    categoryLabel: 'Item Use',
    variantLabel: '"X wields a/an/the Y." line (equipping a weapon)',
    pattern: `^[\\w\\-\\s,']+ wields (?:a|an|the) [\\w\\-\\s,'.]+\\.$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchItemWears',
    categoryLabel: 'Item Use',
    variantLabel: '"X wears Y on/around his/her/its ..." line (equipping armor/jewelry)',
    pattern: `^[\\w\\-\\s,']+ wears [\\w\\-\\s,'.]+ (?:on|around) (?:his|her|its|their) [\\w\\-\\s,']+\\.$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchItemStopsUsing',
    categoryLabel: 'Item Use',
    variantLabel: '"X stops using a/an/the Y." line (unequipping)',
    pattern: `^[\\w\\-\\s,']+ stops using (?:a|an|the) [\\w\\-\\s,'.]+\\.$`,
    defaultSquelch: true,
  },

  // Status — buffs/debuffs landing on a combatant. Informative (a real state
  // change), so defaults OFF like Condition/Death.
  {
    configKey: 'squelchStatusWhiteAura',
    categoryLabel: 'Status',
    variantLabel: '"X is surrounded by a white aura." line',
    pattern: `is surrounded by a white aura\\.$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchStatusPinkOutline',
    categoryLabel: 'Status',
    variantLabel: '"X is surrounded by a pink outline." line',
    pattern: `is surrounded by a pink outline\\.$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchStatusStoneskin',
    categoryLabel: 'Status',
    variantLabel: '"X\'s skin turns to stone." line',
    pattern: `'s skin turns to stone\\.$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchStatusHaste',
    categoryLabel: 'Status',
    variantLabel: '"X is moving more quickly." line',
    pattern: `is moving more quickly\\.$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchStatusSlowOnset',
    categoryLabel: 'Status',
    variantLabel: '"X starts to move in slow motion." line',
    pattern: `starts to move in slow motion\\.$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchStatusSlowWearoff',
    categoryLabel: 'Status',
    variantLabel: '"X is moving less slowly." line',
    pattern: `is moving less slowly\\.$`,
    defaultSquelch: false,
  },

  // Incapacitation — third-person stun/blind/knockdown-adjacent lines (the
  // OTHER combatant getting hit, unlike text-to-speech's SELF_STUN_MATCHERS
  // which are first-person "you" only). Informative, defaults OFF.
  {
    configKey: 'squelchIncapImpact',
    categoryLabel: 'Incapacitation',
    variantLabel: '"X is sent flying by the impact!" line (third-person bash)',
    pattern: `is sent flying by the impact!$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchIncapMusclesStop',
    categoryLabel: 'Incapacitation',
    variantLabel: '"X\'s muscles stop responding." line',
    pattern: `'s muscles stop responding\\.$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchIncapDirtBlind',
    categoryLabel: 'Incapacitation',
    variantLabel: '"X is blinded by the dirt in his/her/its eyes!" line',
    pattern: `is blinded by the dirt in (?:his|her|its) eyes!$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchIncapSlammedFace',
    categoryLabel: 'Incapacitation',
    variantLabel: '"X is slammed directly in the face!" line',
    pattern: `is slammed directly in the face!$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchIncapStunnedRecover',
    categoryLabel: 'Incapacitation',
    // First-person self-stun confirmation, distinct wording from
    // text-to-speech's SELF_STUN_MATCHERS (bash/trip only) — confirmed via
    // the 2026-07-21 Bloodbath-arena corpus mining pass.
    variantLabel: '"You are stunned, but will probably recover." line',
    pattern: `^You are stunned, but will probably recover\\.$`,
    defaultSquelch: false,
  },
  {
    configKey: 'squelchIncapKnockedGroundBy',
    categoryLabel: 'Incapacitation',
    variantLabel: '"You are knocked to the ground by X." line',
    pattern: `^You are knocked to the ground by [\\w\\-\\s,']+\\.$`,
    defaultSquelch: false,
  },

  // Disarm — third-person "X disarms Y!" (the active-skill success line,
  // distinct from the passive "your weapon"/"your shield" pair above, which
  // only fire when it happens TO you).
  {
    configKey: 'squelchDisarmOther',
    categoryLabel: 'Disarm',
    variantLabel: '"X disarms Y!" line',
    pattern: `^[\\w\\-\\s,']+ disarms [\\w\\-\\s,']+!$`,
    defaultSquelch: false,
  },

  // Attack Flavor — named special-attack cast/impact flavor with no debuff/
  // buff information of its own (the actual damage, if any, is a separate
  // Damage-category line). Squelched by default: same "just a blow, reskinned"
  // rationale as Damage, confirmed high-frequency in both arena corpora
  // (2026-07-21 mining passes — up to 838 occurrences for the roundhouse
  // punch alone).
  {
    configKey: 'squelchAttackRoundhousePunch',
    categoryLabel: 'Attack Flavor',
    variantLabel: '"X rears back and throws a massive roundhouse punch!" line',
    pattern: `rears back and throws a massive roundhouse punch!$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchAttackThunderclap',
    categoryLabel: 'Attack Flavor',
    variantLabel: '"X raises his arms to the sky and a deafening thunderclap sounds!" line',
    pattern: `raises his arms to the sky and a deafening thunderclap sounds!$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchAttackHissingSnakes',
    categoryLabel: 'Attack Flavor',
    variantLabel: '"X raises his hand, and two hissing snakes shoot forth!" line',
    pattern: `raises his hand, and two hissing snakes shoot forth!$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchAttackBlindingRay',
    categoryLabel: 'Attack Flavor',
    variantLabel: '"X raises his hand, and a blinding ray of light shoots forth!" line',
    pattern: `raises his hand, and a blinding ray of light shoots forth!$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchAttackFlamingCone',
    categoryLabel: 'Attack Flavor',
    variantLabel: '"X invokes a flaming cone of fire!" line',
    pattern: `invokes a flaming cone of fire!$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchAttackFreezingCone',
    categoryLabel: 'Attack Flavor',
    variantLabel: '"X invokes a freezing cone of cold!" line',
    pattern: `invokes a freezing cone of cold!$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchAttackGourdThrow',
    categoryLabel: 'Attack Flavor',
    variantLabel: '"X throws a gourd right at Y! It shatters..." line',
    pattern: `throws a gourd right at [\\w\\-\\s,']+!\\s*It shatters, covering [\\w\\-\\s,']+ with a foul smelling liquid!$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchAttackStakeThrow',
    categoryLabel: 'Attack Flavor',
    variantLabel: '"X throws a stake right at Y/you! It embeds itself..." line',
    pattern: `throws a stake right at (?:you|[\\w\\-\\s,']+)!\\s*It embeds itself in (?:your|his|her|its) body!$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchAttackMacePrayer',
    categoryLabel: 'Attack Flavor',
    variantLabel: '"X prays to the gods of the light, and then swings his mace towards Y!" line',
    pattern: `prays to the gods of the light, and then swings his mace towards [\\w\\-\\s,']+!$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchAttackWhipLash',
    categoryLabel: 'Attack Flavor',
    variantLabel: '"X rears back and tries to lash out with their whip!" line',
    pattern: `rears back and tries to lash out with their whip!$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchAttackLightningBoltCast',
    categoryLabel: 'Attack Flavor',
    variantLabel: '"A lightning bolt leaps from X\'s hand and arcs to Y." line (cast flavor, not the damage tier)',
    pattern: `^A lightning bolt leaps from [\\w\\-\\s,']+ hand and arcs to [\\w\\-\\s,']+\\.$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchAttackBlizzardFlavor',
    categoryLabel: 'Attack Flavor',
    variantLabel: '"Your blizzard rains ice upon X!" line (cast flavor, not the damage tier)',
    pattern: `^Your blizzard rains ice upon [\\w\\-\\s,']+!$`,
    defaultSquelch: true,
  },

  // UI Noise — command echoes/errors, scan/where/group listings, and score-
  // adjacent block dumps. None of this is combat-relevant; it's ordinary
  // client noise that happens to occur while standing in an arena room.
  // Squelched by default. Confirmed via the 2026-07-21 Bloodbath-arena
  // corpus mining pass (a real participant's own feed, unlike the Coliseum's
  // pre-curated spectator broadcast, includes all of this).
  {
    configKey: 'squelchUiLooksAroundHeader',
    categoryLabel: 'UI Noise',
    variantLabel: '"Looking around you see:" line',
    pattern: `^Looking around you see:$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchUiScanNearby',
    categoryLabel: 'UI Noise',
    variantLabel: '"X, nearby to the <direction>." line (scan output)',
    pattern: `^[\\w\\-\\s,']+, nearby to the (?:north|south|east|west|northeast|northwest|southeast|southwest)\\.$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchUiScanRightHere',
    categoryLabel: 'UI Noise',
    variantLabel: '"X, right here." line (scan output)',
    pattern: `^[\\w\\-\\s,']+, right here\\.$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchUiGroupHeader',
    categoryLabel: 'UI Noise',
    variantLabel: '"X\'s group:" line',
    pattern: `^[\\w\\-\\s,']+'s group:$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchUiGroupStatusRow',
    categoryLabel: 'UI Noise',
    variantLabel: '"[level Class] Name  X% hp  Y% mana  Z% mv" line (group status row)',
    pattern: `^\\[\\d+ [\\w']+\\] [\\w\\-\\s,']+\\s+\\d+% hp\\s+\\d+% mana\\s+\\d+% mv$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchUiAffectsHeader',
    categoryLabel: 'UI Noise',
    variantLabel: '"You are (not) affected by the following spells:" line',
    pattern: `^You are (?:not )?affected by the following spells:$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchUiAffectsModifies',
    categoryLabel: 'UI Noise',
    variantLabel: '": modifies X by Y for Z cycles..." line (affects block body)',
    pattern: `^\\s*: modifies .+ by .+ for .+ cycles.*$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchUiCommandFeedback',
    categoryLabel: 'UI Noise',
    variantLabel: 'Generic command echo/error lines ("Ok.", "You failed.", "You can\'t find it.", etc.)',
    pattern: `^(?:Ok|You failed|You can't find it|They aren't here|You aren't fighting anyone|No way!\\s*You are still fighting|In your dreams, or what|Cast the spell on whom)[.!?]?$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchUiSyntaxHelp',
    categoryLabel: 'UI Noise',
    variantLabel: '"Syntax: ..." line (command help text)',
    pattern: `^Syntax: .+$`,
    defaultSquelch: true,
  },
  {
    configKey: 'squelchUiAfkTag',
    categoryLabel: 'UI Noise',
    variantLabel: '"<AFK>" line',
    pattern: `^<AFK>$`,
    defaultSquelch: true,
  },
];

// The verified unified damage-verb line, pulled out under its own name for
// consumers (text-to-speech's combat-compression mode) that need to parse
// source/verb/target out of a damage line rather than just squelch it.
export const DAMAGE_LINE_PATTERN = PATTERNS.find((p) => p.configKey === 'squelchDamageLines')!.pattern;

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
        'Suppresses selected combat-log line classes (Damage, Avoidance, Condition, Death, Flee/Rescue, Disarm, Ambient, Item Use, Status, Incapacitation, Attack Flavor, UI Noise) to reduce scroll volume during fights. Avoidance, failed-disarm/escape, item-use (quaff/wield/wear/stop-using/get-from-container), Attack Flavor (named special-attack cast flavor), and UI Noise (command echoes, scan/group/affects listings) lines are squelched by default (no info beyond "nothing happened", or redundant with a following effect line); the rest are opt-in.',
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
