/**
 * Typed flag/sector tables for the room editor, ported from the earlier
 * standalone prototype (merc-mud/2.4-builder/src/data/defs.js), which this
 * app supersedes. Bit values match merc.h.
 */

export interface FlagDef {
  name: string;
  bit: number;
  label: string;
}

const A = 1,
  B = 2,
  C = 4,
  D = 8,
  E = 16,
  F = 32,
  G = 64,
  H = 128,
  I = 256,
  J = 512,
  K = 1024,
  L = 2048,
  M = 4096,
  N = 8192,
  O = 16384,
  P = 32768,
  Q = 65536,
  R = 131072,
  S = 262144,
  T = 524288,
  U = 1048576,
  V = 2097152,
  W = 4194304,
  X = 8388608,
  Y = 16777216,
  Z = 33554432,
  AA = 67108864,
  BB = 134217728,
  CC = 268435456,
  DD = 536870912;

export const ROOM_FLAGS: FlagDef[] = [
  { name: 'dark', bit: A, label: 'Dark' },
  { name: 'no_mob', bit: C, label: 'No Mob' },
  { name: 'indoors', bit: D, label: 'Indoors' },
  { name: 'private', bit: J, label: 'Private' },
  { name: 'safe', bit: K, label: 'Safe' },
  { name: 'solitary', bit: L, label: 'Solitary' },
  { name: 'pet_shop', bit: M, label: 'Pet Shop' },
  { name: 'no_recall', bit: N, label: 'No Recall' },
  { name: 'imp_only', bit: O, label: 'Imp Only' },
  { name: 'gods_only', bit: P, label: 'Gods Only' },
  { name: 'heroes_only', bit: Q, label: 'Heroes Only' },
  { name: 'newbies_only', bit: R, label: 'Newbies Only' },
  { name: 'law', bit: S, label: 'Law' },
  { name: 'nowhere', bit: T, label: 'Nowhere' },
];

export const SECTOR_TYPES: { value: number; label: string }[] = [
  { value: 0, label: 'Inside' },
  { value: 1, label: 'City' },
  { value: 2, label: 'Field' },
  { value: 3, label: 'Forest' },
  { value: 4, label: 'Hills' },
  { value: 5, label: 'Mountain' },
  { value: 6, label: 'Water (swim)' },
  { value: 7, label: 'Water (boat)' },
  { value: 9, label: 'Air' },
  { value: 10, label: 'Desert' },
];

export const DOOR_NAMES = [
  'North',
  'East',
  'South',
  'West',
  'Up',
  'Down',
  'Northeast',
  'Northwest',
  'Southeast',
  'Southwest',
] as const;

export const LOCK_STATES: { value: number; label: string }[] = [
  { value: 0, label: 'Open passage' },
  { value: 1, label: 'Door' },
  { value: 2, label: 'Door (pickproof)' },
  { value: 3, label: 'Door (no pass)' },
  { value: 4, label: 'Door (no pass, pickproof)' },
];

// ── Mob flag vectors (merc.h ACT_* / AFF_* / OFF_* / IMM_*) ──────────────────

export const ACT_FLAGS: FlagDef[] = [
  { name: 'sentinel', bit: B, label: 'Sentinel' },
  { name: 'scavenger', bit: C, label: 'Scavenger' },
  { name: 'aggressive', bit: F, label: 'Aggressive' },
  { name: 'stay_area', bit: G, label: 'Stay Area' },
  { name: 'wimpy', bit: H, label: 'Wimpy' },
  { name: 'pet', bit: I, label: 'Pet' },
  { name: 'train', bit: J, label: 'Trainer' },
  { name: 'practice', bit: K, label: 'Practicer' },
  { name: 'undead', bit: O, label: 'Undead' },
  { name: 'cleric', bit: Q, label: 'Cleric AI' },
  { name: 'mage', bit: R, label: 'Mage AI' },
  { name: 'thief', bit: S, label: 'Thief AI' },
  { name: 'warrior', bit: T, label: 'Warrior AI' },
  { name: 'noalign', bit: U, label: 'No Align' },
  { name: 'nopurge', bit: V, label: 'No Purge' },
  { name: 'outdoors', bit: W, label: 'Outdoors Only' },
  { name: 'indoors', bit: Y, label: 'Indoors Only' },
  { name: 'healer', bit: AA, label: 'Healer' },
  { name: 'gain', bit: BB, label: 'Skill Gainer' },
  { name: 'update_always', bit: CC, label: 'Update Always' },
  { name: 'changer', bit: DD, label: 'Changer' },
];

/** ACT_IS_NPC — always set on mobiles; the editor keeps it out of the grid. */
export const ACT_IS_NPC = A;

export const AFFECT_FLAGS: FlagDef[] = [
  { name: 'blind', bit: A, label: 'Blind' },
  { name: 'invisible', bit: B, label: 'Invisible' },
  { name: 'detect_evil', bit: C, label: 'Detect Evil' },
  { name: 'detect_invis', bit: D, label: 'Detect Invis' },
  { name: 'detect_magic', bit: E, label: 'Detect Magic' },
  { name: 'detect_hidden', bit: F, label: 'Detect Hidden' },
  { name: 'detect_good', bit: G, label: 'Detect Good' },
  { name: 'sanctuary', bit: H, label: 'Sanctuary' },
  { name: 'faerie_fire', bit: I, label: 'Faerie Fire' },
  { name: 'infrared', bit: J, label: 'Infrared' },
  { name: 'curse', bit: K, label: 'Curse' },
  { name: 'poison', bit: M, label: 'Poison' },
  { name: 'protect_evil', bit: N, label: 'Protect Evil' },
  { name: 'protect_good', bit: O, label: 'Protect Good' },
  { name: 'sneak', bit: P, label: 'Sneak' },
  { name: 'hide', bit: Q, label: 'Hide' },
  { name: 'sleep', bit: R, label: 'Sleep' },
  { name: 'charm', bit: S, label: 'Charm' },
  { name: 'flying', bit: T, label: 'Flying' },
  { name: 'pass_door', bit: U, label: 'Pass Door' },
  { name: 'haste', bit: V, label: 'Haste' },
  { name: 'calm', bit: W, label: 'Calm' },
  { name: 'plague', bit: X, label: 'Plague' },
  { name: 'weaken', bit: Y, label: 'Weaken' },
  { name: 'dark_vision', bit: Z, label: 'Dark Vision' },
  { name: 'berserk', bit: AA, label: 'Berserk' },
  { name: 'swim', bit: BB, label: 'Swim' },
  { name: 'regeneration', bit: CC, label: 'Regeneration' },
  { name: 'slow', bit: DD, label: 'Slow' },
];

export const OFF_FLAGS: FlagDef[] = [
  { name: 'area_attack', bit: A, label: 'Area Attack' },
  { name: 'backstab', bit: B, label: 'Backstab' },
  { name: 'bash', bit: C, label: 'Bash' },
  { name: 'berserk', bit: D, label: 'Berserk' },
  { name: 'disarm', bit: E, label: 'Disarm' },
  { name: 'dodge', bit: F, label: 'Dodge' },
  { name: 'fade', bit: G, label: 'Fade' },
  { name: 'fast', bit: H, label: 'Fast' },
  { name: 'kick', bit: I, label: 'Kick' },
  { name: 'dirt_kick', bit: J, label: 'Dirt Kick' },
  { name: 'parry', bit: K, label: 'Parry' },
  { name: 'rescue', bit: L, label: 'Rescue' },
  { name: 'tail', bit: M, label: 'Tail' },
  { name: 'trip', bit: N, label: 'Trip' },
  { name: 'crush', bit: O, label: 'Crush' },
  { name: 'assist_all', bit: P, label: 'Assist All' },
  { name: 'assist_align', bit: Q, label: 'Assist Align' },
  { name: 'assist_race', bit: R, label: 'Assist Race' },
  { name: 'assist_players', bit: S, label: 'Assist Players' },
  { name: 'assist_guard', bit: T, label: 'Assist Guard' },
  { name: 'assist_vnum', bit: U, label: 'Assist VNUM' },
];

/** Shared layout for IMM_* / RES_* / VULN_* vectors. */
export const RESIST_FLAGS: FlagDef[] = [
  { name: 'summon', bit: A, label: 'Summon' },
  { name: 'charm', bit: B, label: 'Charm' },
  { name: 'magic', bit: C, label: 'Magic' },
  { name: 'weapon', bit: D, label: 'Weapon' },
  { name: 'bash', bit: E, label: 'Bash' },
  { name: 'pierce', bit: F, label: 'Pierce' },
  { name: 'slash', bit: G, label: 'Slash' },
  { name: 'fire', bit: H, label: 'Fire' },
  { name: 'cold', bit: I, label: 'Cold' },
  { name: 'lightning', bit: J, label: 'Lightning' },
  { name: 'acid', bit: K, label: 'Acid' },
  { name: 'poison', bit: L, label: 'Poison' },
  { name: 'negative', bit: M, label: 'Negative' },
  { name: 'holy', bit: N, label: 'Holy' },
  { name: 'energy', bit: O, label: 'Energy' },
  { name: 'mental', bit: P, label: 'Mental' },
  { name: 'disease', bit: Q, label: 'Disease' },
  { name: 'drowning', bit: R, label: 'Drowning' },
  { name: 'light', bit: S, label: 'Light' },
  { name: 'sound', bit: T, label: 'Sound' },
  { name: 'wood', bit: X, label: 'Wood' },
  { name: 'silver', bit: Y, label: 'Silver' },
  { name: 'iron', bit: Z, label: 'Iron' },
];

// ── Mob word fields (verbatim in the file; offer known values, keep unknowns) ─

export const RACES = [
  'human', 'elf', 'dwarf', 'gnome', 'halfling', 'giant', 'minotaur', 'kobold',
  'lizard', 'ogre', 'orc', 'troll', 'vampire', 'werewolf', 'pixie', 'feline',
  'dragon', 'drow', 'duergar',
];

export const ATTACK_TYPES = [
  'none', 'punch', 'slash', 'stab', 'whip', 'claw', 'blast', 'pound', 'crush',
  'grep', 'bite', 'pierce', 'suction', 'beating', 'digestion', 'charge', 'slap',
  'wrath', 'magic', 'divine', 'cleave', 'scratch', 'peck', 'peckb',
  'chop', 'sting', 'smash', 'shbite', 'flbite', 'frbite', 'acbite', 'choke',
  'thump',
];

/**
 * Numeric item types (merc.h ITEM_*) — shops declare what they buy with these
 * numbers (SHOP_DATA.buy_type); 0 = unused slot. Gaps in the numbering are
 * real (merc.h skips 6-7, 14, 16, 21).
 */
export const ITEM_TYPES: { value: number; label: string }[] = [
  { value: 1, label: 'light' },
  { value: 2, label: 'scroll' },
  { value: 3, label: 'wand' },
  { value: 4, label: 'staff' },
  { value: 5, label: 'weapon' },
  { value: 8, label: 'treasure' },
  { value: 9, label: 'armor' },
  { value: 10, label: 'potion' },
  { value: 11, label: 'clothing' },
  { value: 12, label: 'furniture' },
  { value: 13, label: 'trash' },
  { value: 15, label: 'container' },
  { value: 17, label: 'drink container' },
  { value: 18, label: 'key' },
  { value: 19, label: 'food' },
  { value: 20, label: 'money' },
  { value: 22, label: 'boat' },
  { value: 23, label: 'npc corpse' },
  { value: 24, label: 'pc corpse' },
  { value: 25, label: 'fountain' },
  { value: 26, label: 'pill' },
  { value: 27, label: 'protect' },
  { value: 28, label: 'map' },
  { value: 29, label: 'portal' },
  { value: 30, label: 'warp stone' },
  { value: 31, label: 'room key' },
  { value: 32, label: 'gem' },
  { value: 33, label: 'jewelry' },
  { value: 34, label: 'jukebox' },
];

export const POSITIONS = ['stand', 'sit', 'rest', 'sleep', 'fight'];
export const SEXES = ['none', 'male', 'female', 'either'];
export const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'giant'];

// ── Object flag vectors (merc.h ITEM_* / WEAPON_*) ───────────────────────────

export const EXTRA_FLAGS: FlagDef[] = [
  { name: 'glow', bit: A, label: 'Glow' },
  { name: 'hum', bit: B, label: 'Hum' },
  { name: 'evil', bit: E, label: 'Evil' },
  { name: 'invis', bit: F, label: 'Invisible' },
  { name: 'magic', bit: G, label: 'Magic' },
  { name: 'nodrop', bit: H, label: 'No Drop' },
  { name: 'bless', bit: I, label: 'Bless' },
  { name: 'anti_good', bit: J, label: 'Anti Good' },
  { name: 'anti_evil', bit: K, label: 'Anti Evil' },
  { name: 'anti_neutral', bit: L, label: 'Anti Neutral' },
  { name: 'noremove', bit: M, label: 'No Remove' },
  { name: 'inventory', bit: N, label: 'Inventory' },
  { name: 'nopurge', bit: O, label: 'No Purge' },
  { name: 'rot_death', bit: P, label: 'Rot on Death' },
  { name: 'vis_death', bit: Q, label: 'Vis on Death' },
  { name: 'nonmetal', bit: S, label: 'Non-Metal' },
  { name: 'nolocate', bit: T, label: 'No Locate' },
  { name: 'melt_drop', bit: U, label: 'Melt Drop' },
  { name: 'sell_extract', bit: W, label: 'Sell Extract' },
  { name: 'burn_proof', bit: Y, label: 'Burn Proof' },
  { name: 'nouncurse', bit: Z, label: 'No Uncurse' },
];

export const WEAR_FLAGS: FlagDef[] = [
  { name: 'take', bit: A, label: 'Take' },
  { name: 'finger', bit: B, label: 'Finger' },
  { name: 'neck', bit: C, label: 'Neck' },
  { name: 'body', bit: D, label: 'Body' },
  { name: 'head', bit: E, label: 'Head' },
  { name: 'legs', bit: F, label: 'Legs' },
  { name: 'feet', bit: G, label: 'Feet' },
  { name: 'hands', bit: H, label: 'Hands' },
  { name: 'arms', bit: I, label: 'Arms' },
  { name: 'shield', bit: J, label: 'Shield' },
  { name: 'about', bit: K, label: 'About Body' },
  { name: 'waist', bit: L, label: 'Waist' },
  { name: 'wrist', bit: M, label: 'Wrist' },
  { name: 'wield', bit: N, label: 'Wield' },
  { name: 'hold', bit: O, label: 'Hold' },
  { name: 'no_sac', bit: P, label: 'No Sac' },
  { name: 'float', bit: Q, label: 'Float' },
];

export const WEAPON_FLAGS: FlagDef[] = [
  { name: 'flaming', bit: A, label: 'Flaming' },
  { name: 'frost', bit: B, label: 'Frost' },
  { name: 'vampiric', bit: C, label: 'Vampiric' },
  { name: 'sharp', bit: D, label: 'Sharp' },
  { name: 'vorpal', bit: E, label: 'Vorpal' },
  { name: 'two_hands', bit: F, label: 'Two-Handed' },
  { name: 'shocking', bit: G, label: 'Shocking' },
  { name: 'poison', bit: H, label: 'Poison' },
];

export const WEAPON_TYPES = ['exotic', 'sword', 'dagger', 'spear', 'mace', 'axe', 'flail', 'whip', 'polearm'];

export const LIQUIDS = [
  'water', 'beer', 'wine', 'ale', 'dark ale', 'whisky', 'drinking water',
  'fresh juice', 'milk', 'tea', 'coffee', 'blood', 'salt water', 'cola',
];

export const OBJECT_CONDITIONS: { value: string; label: string }[] = [
  { value: 'P', label: 'Perfect (100%)' },
  { value: 'G', label: 'Good (90%)' },
  { value: 'A', label: 'Average (75%)' },
  { value: 'W', label: 'Worn (50%)' },
  { value: 'D', label: 'Damaged (25%)' },
  { value: 'B', label: 'Bad (10%)' },
  { value: 'R', label: 'Ruined (0%)' },
];
