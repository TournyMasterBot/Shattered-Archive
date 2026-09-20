// apps/game-client/src/features/hudLayout/characterIcon.ts
//
// Best-effort emoji lookup for the current character's class/race, purely
// decorative flair next to the character name in CompactLayoutShell's
// terminal panel title. Class is tried first: it's usually the stronger
// gameplay signal (a "Transmuter" reads as a mage even for a race, like
// Pixie, that doesn't say much on its own), falling back to race for
// classes with no distinctive icon of their own. Keys are the exact
// race/class names from this game's `race list` / `class list` commands,
// looked up case-insensitively — extend these two maps directly if a
// value is missing or you'd rather have a different icon. A value may be a
// single emoji or a short pair (e.g. Armsman's sword and shield) when one
// glyph can't carry the concept; callers just interpolate the string.

const CLASS_ICONS: Record<string, string> = {
  mage: '🧙',
  cleric: '🙏',
  thief: '🗡️',
  warrior: '⚔️',
  dragon: '🐉',
  bladesinger: '🎶',
  battlerager: '😤',
  necromancer: '💀',
  transmuter: '🔮',
  invoker: '⚡',
  paladin: '🛡️',
  monk: '🥋',
  assassin: '🔪',
  crusader: '✝️',
  druid: '🌿',
  ranger: '🏹',
  barbarian: '🪓',
  shaman: '🪶',
  warlock: '😈',
  witch: '🧹',
  bard: '🎵',
  illusionist: '🎭',
  angel: '😇',
  draconian: '🦎',
  citizen: '🧑',
  swashbuckler: '🤺',
  demon: '😈',
  balanx: '⚖️',
  'anti-paladin': '🖤',
  jongleur: '🤹',
  enchantor: '✨',
  charlatan: '🎩',
  priest: '🙏',
  giant: '🏔️',
  shadowknight: '🌑',
  bandit: '🦹',
  runesmith: '🔨',
  eldritch: '🌀',
  battlemage: '🪄',
  nightshade: '☠️',
  skald: '📯',
  armsman: '🗡️🛡️',
  dragonslayer: '⚔️',
  pirate: '🏴‍☠️',
  defiler: '🥀',
  mentalist: '🧠',
  confessor: '📿',
  shadowmage: '🌒',
  samurai: '🎌',
  wujen: '🀄',
  brewmaster: '🍺',
  shukenja: '⛩️',
  ninja: '🥷',
  ovate: '🌾',
};

const RACE_ICONS: Record<string, string> = {
  human: '🧑',
  goblin: '👺',
  'deep gnome': '🪨',
  'shalonesti elf': '🧝',
  'half elf': '🧝',
  'dark elf': '🧝',
  'wild elf': '🧝',
  'hill dwarf': '⛏️',
  'mountain dwarf': '⛏️',
  kender: '🎒',
  ogre: '👹',
  'giant ogre': '👹',
  'half ogre': '👹',
  minotaur: '🐂',
  yinn: '🐿️',
  'dark dwarf': '⛏️',
  'tinker gnome': '🔧',
  'sea elf': '🧜',
  'black dragon': '🐉',
  'blue dragon': '🐉',
  'green dragon': '🐉',
  'red dragon': '🐉',
  'white dragon': '🐉',
  'brass dragon': '🐉',
  'bronze dragon': '🐉',
  'copper dragon': '🐉',
  'gold dragon': '🐉',
  'silver dragon': '🐉',
  demon: '😈',
  angel: '😇',
  'aurak draconian': '🦎',
  'baaz draconian': '🦎',
  'bozak draconian': '🦎',
  balanx: '⚖️',
  felar: '🐱',
  wemic: '🦁',
  'cloud giant': '🏔️',
  'frost giant': '🏔️',
  'fire giant': '🏔️',
  bugbear: '👺',
  hobgoblin: '👺',
  mul: '💪',
  'gully dwarf': '⛏️',
  centaur: '🐴',
  ariel: '🦅',
  pixie: '🧚',
  bakali: '🐍',
  'brown dragon': '🐉',
  'steel dragon': '🐉',
  troll: '🧌',
  orc: '🪓',
  arboren: '🌳',
  'crystal dragon': '🐉',
  lagodae: '🐸',
  lepori: '🐰',
  'topaz dragon': '🐉',
  'amethyst dragon': '🐉',
  'emerald dragon': '🐉',
};

export interface CharacterIconInput {
  raceName?: string | null;
  className?: string | null;
}

export function getCharacterIcon({ raceName, className }: CharacterIconInput): string | null {
  const cls = className?.trim().toLowerCase();
  if (cls && CLASS_ICONS[cls]) return CLASS_ICONS[cls];

  const race = raceName?.trim().toLowerCase();
  if (race && RACE_ICONS[race]) return RACE_ICONS[race];

  return null;
}
