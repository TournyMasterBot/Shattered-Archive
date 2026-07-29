/**
 * GENERATED FILE — do not edit by hand.
 * Mirror of the compiled group_table in merc-mud/2.4/src/const.c, produced by
 * `pnpm --filter @shatteredarchive/merc-area gen-skills-stock`
 * (scripts/gen-skills-stock.ts). Source table: 27 groups.
 */

export interface StockGroupRow {
  name: string;
  ratings: readonly number[]; // per class, -1 = unavailable, 0 = free/auto (basics)
  members: readonly string[]; // exact stock skill or group names
}

export const STOCK_GROUPS: readonly StockGroupRow[] = [
  { name: "rom basics", ratings: [0, 0, 0, 0], members: ["scrolls", "staves", "wands", "recall"] },
  { name: "mage basics", ratings: [0, -1, -1, -1], members: ["dagger"] },
  { name: "cleric basics", ratings: [-1, 0, -1, -1], members: ["mace"] },
  { name: "thief basics", ratings: [-1, -1, 0, -1], members: ["dagger", "steal"] },
  { name: "warrior basics", ratings: [-1, -1, -1, 0], members: ["sword", "second attack"] },
  { name: "mage default", ratings: [40, -1, -1, -1], members: ["lore", "beguiling", "combat", "detection", "enhancement", "illusion", "maladictions", "protective", "transportation", "weather"] },
  { name: "cleric default", ratings: [-1, 40, -1, -1], members: ["flail", "attack", "creation", "curative", "benedictions", "detection", "healing", "maladictions", "protective", "shield block", "transportation", "weather"] },
  { name: "thief default", ratings: [-1, -1, 40, -1], members: ["mace", "sword", "backstab", "disarm", "dodge", "second attack", "trip", "hide", "peek", "pick lock", "sneak"] },
  { name: "warrior default", ratings: [-1, -1, -1, 40], members: ["weaponsmaster", "shield block", "bash", "disarm", "enhanced damage", "parry", "rescue", "third attack"] },
  { name: "weaponsmaster", ratings: [40, 40, 40, 20], members: ["axe", "dagger", "flail", "mace", "polearm", "spear", "sword", "whip"] },
  { name: "attack", ratings: [-1, 5, -1, 8], members: ["demonfire", "dispel evil", "dispel good", "earthquake", "flamestrike", "heat metal", "ray of truth"] },
  { name: "beguiling", ratings: [4, -1, 6, -1], members: ["calm", "charm person", "sleep"] },
  { name: "benedictions", ratings: [-1, 4, -1, 8], members: ["bless", "calm", "frenzy", "holy word", "remove curse"] },
  { name: "combat", ratings: [6, -1, 10, 9], members: ["acid blast", "burning hands", "chain lightning", "chill touch", "colour spray", "fireball", "lightning bolt", "magic missile", "shocking grasp"] },
  { name: "creation", ratings: [4, 4, 8, 8], members: ["continual light", "create food", "create spring", "create water", "create rose", "floating disc"] },
  { name: "curative", ratings: [-1, 4, -1, 8], members: ["cure blindness", "cure disease", "cure poison"] },
  { name: "detection", ratings: [4, 3, 6, -1], members: ["detect evil", "detect good", "detect hidden", "detect invis", "detect magic", "detect poison", "farsight", "identify", "know alignment", "locate object"] },
  { name: "draconian", ratings: [8, -1, -1, -1], members: ["acid breath", "fire breath", "frost breath", "gas breath", "lightning breath"] },
  { name: "enchantment", ratings: [6, -1, -1, -1], members: ["enchant armor", "enchant weapon", "fireproof", "recharge"] },
  { name: "enhancement", ratings: [5, -1, 9, 9], members: ["giant strength", "haste", "infravision", "refresh"] },
  { name: "harmful", ratings: [-1, 3, -1, 6], members: ["cause critical", "cause light", "cause serious", "harm"] },
  { name: "healing", ratings: [-1, 3, -1, 6], members: ["cure critical", "cure light", "cure serious", "heal", "mass healing", "refresh"] },
  { name: "illusion", ratings: [4, -1, 7, -1], members: ["invis", "mass invis", "ventriloquate"] },
  { name: "maladictions", ratings: [5, 5, 9, 9], members: ["blindness", "change sex", "curse", "energy drain", "plague", "poison", "slow", "weaken"] },
  { name: "protective", ratings: [4, 4, 7, 8], members: ["armor", "cancellation", "dispel magic", "fireproof", "protection evil", "protection good", "sanctuary", "shield", "stone skin"] },
  { name: "transportation", ratings: [4, 4, 8, 9], members: ["fly", "gate", "nexus", "pass door", "portal", "summon", "teleport", "word of recall"] },
  { name: "weather", ratings: [4, 4, 8, 8], members: ["call lightning", "control weather", "faerie fire", "faerie fog", "lightning bolt"] },
];
