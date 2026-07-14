// @generated from Constants.cs (MortalRaces, RemortRaces) + curated category/family/alignment — do not edit by hand.
// Regenerate: pnpm --filter @shatteredarchive/kingdom-tactics-engine codegen

export interface DslMortalRace { readonly id: number; readonly key: string; readonly name: string; readonly category: string; }
export interface DslRemortRace {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly family: string;
  readonly alignment: 'Good' | 'Neutral' | 'Evil';
  readonly resists: readonly string[];
  readonly traits: readonly string[];
}

export const MORTAL_RACES = [
  { id: 1, key: 'Human', name: 'Human', category: 'Human' },
  { id: 2, key: 'ShalonestiElf', name: 'Shalonesti Elf', category: 'Elf' },
  { id: 3, key: 'DarkElf', name: 'Dark Elf', category: 'Elf' },
  { id: 4, key: 'WildElf', name: 'Wild Elf', category: 'Elf' },
  { id: 5, key: 'SeaElf', name: 'Sea Elf', category: 'Elf' },
  { id: 6, key: 'HalfElf', name: 'Half Elf', category: 'Elf' },
  { id: 10, key: 'MountainDwarf', name: 'Mountain Dwarf', category: 'Dwarf' },
  { id: 11, key: 'HillDwarf', name: 'Hill Dwarf', category: 'Dwarf' },
  { id: 12, key: 'DarkDwarf', name: 'Dark Dwarf', category: 'Dwarf' },
  { id: 13, key: 'Mul', name: 'Mul', category: 'Dwarf' },
  { id: 15, key: 'Minotaur', name: 'Minotaur', category: 'Minotaur' },
  { id: 16, key: 'Ogre', name: 'Ogre', category: 'Ogre' },
  { id: 17, key: 'GiantOgre', name: 'Giant Ogre', category: 'Ogre' },
  { id: 18, key: 'HalfOgre', name: 'Half Ogre', category: 'Ogre' },
  { id: 20, key: 'Yinn', name: 'Yinn', category: 'Yinn' },
  { id: 21, key: 'Goblin', name: 'Goblin', category: 'Goblin' },
  { id: 22, key: 'HobGoblin', name: 'Hobgoblin', category: 'Goblin' },
  { id: 23, key: 'Bugbear', name: 'Bugbear', category: 'Goblin' },
  { id: 25, key: 'TinkerGnome', name: 'Tinker Gnome', category: 'Gnome' },
  { id: 26, key: 'DeepGnome', name: 'Deep Gnome', category: 'Gnome' },
  { id: 30, key: 'Kender', name: 'Kender', category: 'Kender' },
  { id: 31, key: 'Wemic', name: 'Wemic', category: 'Leonine' },
  { id: 32, key: 'Felar', name: 'Felar', category: 'Leonine' },
  { id: 35, key: 'Troll', name: 'Troll', category: 'Limited' },
  { id: 36, key: 'GullyDwarf', name: 'Gully Dwarf', category: 'Limited' },
  { id: 37, key: 'Ariel', name: 'Ariel', category: 'Limited' },
  { id: 38, key: 'Pixie', name: 'Pixie', category: 'Limited' },
  { id: 39, key: 'Centaur', name: 'Centaur', category: 'Limited' },
  { id: 40, key: 'Orc', name: 'Orc', category: 'Limited' },
  { id: 41, key: 'Bakali', name: 'Bakali', category: 'Limited' },
  { id: 50, key: 'Arboren', name: 'Arboren', category: 'Other' },
  { id: 61, key: 'Lagoda', name: 'Lagodae', category: 'Other' },
  { id: 62, key: 'Lepori', name: 'Lepori', category: 'Other' },
] as const satisfies readonly DslMortalRace[];
export type MortalRaceKey = (typeof MORTAL_RACES)[number]['key'];

export const REMORT_RACES = [
  { id: 1, key: 'GoldDragon', name: 'GoldDragon', family: 'metallic-dragon', alignment: 'Good', resists: ['Fire', 'Poison'], traits: [] },
  { id: 2, key: 'SilverDragon', name: 'SilverDragon', family: 'metallic-dragon', alignment: 'Good', resists: ['Cold'], traits: [] },
  { id: 3, key: 'BrassDragon', name: 'BrassDragon', family: 'metallic-dragon', alignment: 'Good', resists: ['Charm', 'Fire'], traits: [] },
  { id: 4, key: 'BronzeDragon', name: 'BronzeDragon', family: 'metallic-dragon', alignment: 'Good', resists: ['Lightning'], traits: [] },
  { id: 5, key: 'CopperDragon', name: 'CopperDragon', family: 'metallic-dragon', alignment: 'Good', resists: ['Acid'], traits: [] },
  { id: 6, key: 'SteelDragon', name: 'SteelDragon', family: 'metallic-dragon', alignment: 'Good', resists: ['Physical'], traits: [] },
  { id: 10, key: 'RedDragon', name: 'RedDragon', family: 'chromatic-dragon', alignment: 'Evil', resists: ['Fire'], traits: [] },
  { id: 11, key: 'BlackDragon', name: 'BlackDragon', family: 'chromatic-dragon', alignment: 'Evil', resists: ['Acid'], traits: [] },
  { id: 12, key: 'BlueDragon', name: 'BlueDragon', family: 'chromatic-dragon', alignment: 'Evil', resists: ['Lightning'], traits: [] },
  { id: 13, key: 'GreenDragon', name: 'GreenDragon', family: 'chromatic-dragon', alignment: 'Evil', resists: ['Poison'], traits: [] },
  { id: 14, key: 'WhiteDragon', name: 'WhiteDragon', family: 'chromatic-dragon', alignment: 'Evil', resists: ['Cold'], traits: [] },
  { id: 15, key: 'BrownDragon', name: 'BrownDragon', family: 'chromatic-dragon', alignment: 'Evil', resists: ['Fire'], traits: [] },
  { id: 16, key: 'CrystalDragon', name: 'CrystalDragon', family: 'gem-dragon', alignment: 'Neutral', resists: ['Light', 'Harm'], traits: [] },
  { id: 17, key: 'TopazDragon', name: 'TopazDragon', family: 'gem-dragon', alignment: 'Neutral', resists: ['Drain'], traits: [] },
  { id: 20, key: 'Archangel', name: 'Archangel', family: 'angel', alignment: 'Good', resists: [], traits: [] },
  { id: 21, key: 'LesserAngel', name: 'LesserAngel', family: 'angel', alignment: 'Good', resists: [], traits: [] },
  { id: 30, key: 'HeadBalanx', name: 'HeadBalanx', family: 'balanx', alignment: 'Neutral', resists: [], traits: [] },
  { id: 31, key: 'LesserBalanx', name: 'LesserBalanx', family: 'balanx', alignment: 'Neutral', resists: [], traits: [] },
  { id: 40, key: 'DemonLord', name: 'DemonLord', family: 'demon', alignment: 'Evil', resists: [], traits: [] },
  { id: 41, key: 'LesserDemon', name: 'LesserDemon', family: 'demon', alignment: 'Evil', resists: [], traits: [] },
  { id: 50, key: 'FrostGiant', name: 'FrostGiant', family: 'giant', alignment: 'Good', resists: [], traits: ['unlimited-mana', 'permadeath'] },
  { id: 51, key: 'CloudGiant', name: 'CloudGiant', family: 'giant', alignment: 'Neutral', resists: [], traits: ['unlimited-mana', 'permadeath'] },
  { id: 52, key: 'FireGiant', name: 'FireGiant', family: 'giant', alignment: 'Evil', resists: [], traits: ['unlimited-mana', 'permadeath'] },
] as const satisfies readonly DslRemortRace[];
export type RemortRaceKey = (typeof REMORT_RACES)[number]['key'];
