// apps/game-client/src/features/plugins/core-plugins/warlock-alphabet.plugin.ts
import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';

/**
 * Warlock Alphabet Helper
 *
 * Warlocks brew spells by placing items into a cauldron. Each spell has a "recipe"
 * defined as a multiset of letters (its UniqueID). The letter an item contributes to
 * the brew is determined by applying the BREWER'S CIPHER to the first letter of the
 * item's lore name. Example (with cipher A→K): "apple" contributes K, not A.
 *
 * The brewer's cipher is a fixed 26-letter substitution that maps item first letters
 * to brew letters. Configure it in the plugin's "Brewer cipher" field as a 26-character
 * string (position 1 = what A maps to, position 2 = what B maps to, etc.).
 *
 * A warlock's "alphabet" is the personal set of items they have chosen (or discovered)
 * for each brew letter they need. The plugin tracks these assignments per named alphabet.
 *
 * Alphabets can be CATEGORY-SPECIFIC: different spell tiers or categories may require
 * items of specific types (food, gem, weapon, etc.) or level ranges. This plugin
 * supports multiple named alphabets to track each category separately.
 *
 * ── HOW UIDs ARE GENERATED ──────────────────────────────────────────────────────
 *
 *  The UniqueID for each spell is derived from the spell name spelled backwards
 *  (GenerateBrewSheet.cs). Process:
 *    1. Reverse the spell name character-by-character ("Bark Skin" → "nikS kraB").
 *    2. Strip stop words: "of", "the", "and", "in", "to".
 *    3. Keep only letters, uppercased ("NIKSKRAB" → letter multiset {A,B,I,K,K,N,R,S}).
 *    4. Find the SHORTEST sub-multiset of those letters that no other brewable spell
 *       also contains. That is the UID ("KK", because no other spell backward name
 *       contains two or more K's).
 *
 * ── INSERTION ORDER & THE CAULDRON REVERSAL ─────────────────────────────────────
 *
 *  The cauldron reverses the display order of items inserted into it. To produce the
 *  correct spell, items MUST be inserted in the order given by the UID string — the
 *  cauldron then displays them reversed, which reconstructs the spell name.
 *
 *  Example: "bless" uid = "SSELB"
 *    Insert order:    S, S, E, L, B
 *    Cauldron shows:  B, L, E, S, S  =  BLESS  ✓
 *
 *  Grouping same-letter items together (S,S,E,L,B → correct here by accident) can
 *  fail for UIDs with interleaved repeats, e.g. "MRALA" (alarm):
 *    Correct:  M, R, A, L, A  →  cauldron: A, L, A, R, M  =  ALARM  ✓
 *    Wrong:    M, R, A, A, L  →  cauldron: L, A, A, R, M  =  LAARM  ✗
 *
 *  The "wa brew" command always follows UID character order to get this right.
 *
 * ── BREW MECHANICS (IMPORTANT) ─────────────────────────────────────────────────
 *
 *  Each brew produces one GOURD. A gourd can have 1, 2, or 3 spell effects:
 *
 *  Effect 1 (deterministic):
 *    Fully controlled by the UID. Place items in UID order → cauldron reversal →
 *    correct spell. This is what "wa brew" automates.
 *
 *  Effect 2 (rule-governed, not yet defined):
 *    A gourd may receive a second spell effect determined by rules that are not yet
 *    fully understood. Do not rely on this being predictable.
 *
 *  Effect 3 (always random):
 *    If a gourd receives a third spell effect, it is ALWAYS FULLY RANDOM regardless
 *    of what items were used.
 *
 * ── ALPHABET ESTABLISHMENT ──────────────────────────────────────────────────────
 *
 *  "Establishing your alphabet" means selecting one item for each letter you need.
 *  The plugin helps by:
 *    1. Showing which letters each target spell requires (from its UID).
 *    2. Tracking which letters you have items for and which are missing.
 *    3. Suggesting candidate items for missing letters (browse the server item DB).
 *    4. Recording test brews to track which items are working as expected.
 *
 *  Level and category constraints are NOT automatically enforced by this plugin —
 *  if a brew produces an unexpected spell or fails, that may indicate the item's
 *  level or category does not satisfy the spell's requirements. Record it with
 *  `wa log` and adjust your item selection.
 *
 * ── ITEM LOOKUP ─────────────────────────────────────────────────────────────────
 *
 *  Browse all game items at: https://shatteredarchive.com/items/all-items
 *  JSON search: GET https://shatteredarchive.com/internal/brew-items?name=&type=&level=
 *    - name: partial match on item name
 *    - type: item_type (food, drink, gem, weapon, armor, etc.)
 *    - level: exact level filter
 *
 * ── COMMANDS ────────────────────────────────────────────────────────────────────
 *
 *   wa solve                                      — show alphabet: assigned items per letter
 *   wa missing                                    — show letters with no item assigned
 *   wa lookup <spell name>                        — show recipe items for a spell
 *   wa brew <spell name>                          — send brew commands (fresh cauldron!)
 *   wa recipe save "spell1" "spell2"              — record a known dual-spell gourd recipe
 *   wa recipe show                                — list all saved gourd recipes
 *   wa recipe show "spell1" "spell2"              — show brew commands for a saved gourd recipe
 *   wa set <letter> <item label>                  — assign a letter to an item
 *   wa clear <letter>                             — remove a letter assignment
 *   wa items                                      — list configured items and their letters
 *   wa log <spell> using <item> [item ...]        — record a test brew result
 *   wa experiments                                — show recorded brew experiments
 *   wa suggest [n]                                — list n brewable spells given current items
 *   wa spells [brewable] [letter]                 — list spells in the database
 *   wa match <letters>                            — find spells matching a UID (e.g. wa match KK)
 *   wa spell-add <spell name> <UID>               — add a spell to your user list
 *   wa use <alphabet>                             — switch active named alphabet
 *   wa reset confirm                              — wipe active alphabet state
 *
 *  Spell names with spaces: wa lookup "Bark Skin" or wa lookup Bark Skin
 *  Item labels with spaces: wa set K "kale chips"
 *  Inline UID in deduce:   wa deduce spook KOOP using apple apple  (auto-adds unknown spells)
 */

// ── Spell database ─────────────────────────────────────────────────────────────
//
// Source: https://docs.google.com/spreadsheets/d/19WYAdZeszdJWXFEb2kt3ZF9HYTz_t12afM4eQ65N2Tc
// Algorithm: GenerateBrewSheet.cs (backward name → shortest unique letter sub-multiset)
//
// CORRECTIONS: If `wa brew` produces an unexpected result, the UID may be stale.
// Use `wa log` to record what actually happened, and `wa set` to adjust item assignments.

interface SpellEntry {
  uid: string; // primary recipe (letter multiset)
  alt?: string; // alternate valid recipe
  brewable: boolean; // true = confirmed brewable
}

const SPELL_DB: Record<string, SpellEntry> = {
  'abandon hope': { uid: 'AADP', brewable: false },
  absorption: { uid: 'ABIOO', brewable: false },
  'acid blast': { uid: 'BCDT', brewable: true },
  alarm: { uid: 'MRALA', alt: 'ALARM', brewable: true },
  'alter armor': { uid: 'ELRRRT', brewable: false },
  'alter beast': { uid: 'ABSTT', brewable: false },
  'alter elements': { uid: 'LLSTT', brewable: true },
  'alter self': { uid: 'FLLT', brewable: false },
  amnesia: { uid: 'AISENMA', brewable: false },
  'ancestral honor': { uid: 'AAOOT', brewable: false },
  'ancient vow': { uid: 'CVW', brewable: false },
  'animal spirit': { uid: 'AAIIIP', brewable: false },
  'animate dead': { uid: 'AAAD', alt: 'AAADD', brewable: true },
  'animate object': { uid: 'AAJ', brewable: false },
  'antimagic shell': { uid: 'AACGH', brewable: false },
  'aura of pain': { uid: 'AAAO', brewable: false },
  'bark skin': { uid: 'KK', brewable: true },
  beastform: { uid: 'ABFMR', brewable: true },
  'bind golem': { uid: 'BGM', brewable: false },
  'black curse': { uid: 'BKU', brewable: true },
  blackstaff: { uid: 'BFF', brewable: false },
  blend: { uid: 'DNELB', brewable: true },
  bless: { uid: 'SSELB', brewable: true },
  'blessing of peace': { uid: 'BFG', brewable: false },
  blindness: { uid: 'SSENDNILB', brewable: false },
  blizzard: { uid: 'BDZ', brewable: true },
  blizzra: { uid: 'ARZZILB', brewable: true },
  blur: { uid: 'RULB', brewable: false },
  'bodrums boils': { uid: 'BBD', brewable: false },
  'bone blight': { uid: 'BBH', brewable: false },
  'brain fever': { uid: 'ABV', brewable: false },
  breaking: { uid: 'BGK', brewable: false },
  brimstone: { uid: 'ENOTSMIRB', brewable: false },
  'burning hands': { uid: 'BHU', brewable: true },
  'call lightning': { uid: 'GLLL', brewable: true },
  'call wild': { uid: 'CILW', brewable: true },
  calm: { uid: 'MLAC', brewable: false },
  cancellation: { uid: 'EILLO', brewable: true },
  'cause critical': { uid: 'CCCS', brewable: true },
  'cause decay': { uid: 'CCSY', brewable: true },
  'cause fatality': { uid: 'AAAL', alt: 'AAAF', brewable: true },
  'cause light': { uid: 'CGHSU', brewable: true },
  'cause serious': { uid: 'ACOUU', brewable: true },
  'chain lightning': { uid: 'GGHH', alt: 'CHAINL', brewable: true },
  'change sex': { uid: 'GX', brewable: false },
  'charm person': { uid: 'CHMOP', brewable: false },
  chasm: { uid: 'MSAHC', brewable: false },
  'chill touch': { uid: 'CCHL', brewable: true },
  'cliaths hammer': { uid: 'CHHM', brewable: false },
  'color spray': { uid: 'CLRRY', brewable: false },
  'compelled repentance': { uid: 'ADPP', brewable: false },
  'cone of cold': { uid: 'CCFOO', alt: 'CFC', brewable: true },
  'cone of fire': { uid: 'CFFOO', alt: 'CNFF', brewable: true },
  'cone of lightning': { uid: 'CFH', brewable: true },
  'continual light': { uid: 'ACLLU', brewable: false },
  'control metal': { uid: 'CLMTT', brewable: true },
  'control weather': { uid: 'CLNW', brewable: false },
  'corpse host': { uid: 'CEHSS', brewable: false },
  'corrosive skin': { uid: 'CKV', brewable: false },
  courage: { uid: 'EGARUOC', brewable: false },
  'create cauldron': { uid: 'AACDN', brewable: true },
  'create food': { uid: 'ADFRT', brewable: false },
  'create holy symbol': { uid: 'BYY', alt: 'CYY', brewable: true },
  'create ranger staff': { uid: 'AAAG', brewable: false },
  'create rose': { uid: 'ESORETAERC', brewable: true },
  'create runehammer': { uid: 'CHMU', brewable: false },
  'create runestaff': { uid: 'AAFFU', brewable: false },
  'create spring': { uid: 'ACGPT', brewable: false },
  'create tree': { uid: 'CEEEETT', brewable: true },
  'create water': { uid: 'AACRW', brewable: true },
  'cure blindness': { uid: 'BCDU', brewable: true },
  'cure bugbear bite': { uid: 'ABB', brewable: true },
  'cure critical': { uid: 'CCCRR', brewable: true },
  'cure deafness': { uid: 'ADEEEF', brewable: false },
  'cure disease': { uid: 'ADEEEIS', brewable: true },
  'cure fatigue': { uid: 'FUU', brewable: true },
  'cure light': { uid: 'CGLR', brewable: false },
  'cure poison': { uid: 'CNPSU', brewable: false },
  'cure serious': { uid: 'ORRUU', brewable: true },
  curse: { uid: 'ESRUC', brewable: false },
  damned: { uid: 'DENMAD', brewable: false },
  'dark bolt': { uid: 'BDK', brewable: false },
  'dark empower': { uid: 'DKP', brewable: false },
  'dark energy': { uid: 'GKY', brewable: false },
  'dark essence': { uid: 'CDEK', brewable: false },
  'dark heal': { uid: 'AADEK', brewable: false },
  'dark immunity': { uid: 'KMY', brewable: false },
  darkness: { uid: 'SSENKRAD', brewable: false },
  'death shroud': { uid: 'DDHU', brewable: false },
  deflection: { uid: 'DEFLT', brewable: false },
  demonfire: { uid: 'DEFM', brewable: true },
  destruction: { uid: 'CDIRTU', brewable: false },
  'detect evil': { uid: 'CDLV', brewable: false },
  'detect good': { uid: 'CDDG', brewable: true },
  'detect hidden': { uid: 'DDD', brewable: true },
  'detect invis': { uid: 'CDSV', brewable: false },
  'detect magic': { uid: 'CCGM', brewable: true },
  'detect poison': { uid: 'NOSIOPTCETED', brewable: false },
  'detect vampire': { uid: 'APV', brewable: false },
  devotion: { uid: 'NOITOVED', brewable: false },
  disenchant: { uid: 'TNAHCNESID', brewable: true },
  disjunction: { uid: 'CDJ', brewable: true },
  'dispel curse': { uid: 'CDIPU', brewable: false },
  'dispel evil': { uid: 'ELLV', brewable: false },
  'dispel fog': { uid: 'DFP', brewable: false },
  'dispel good': { uid: 'DDP', brewable: true },
  'dispel magic': { uid: 'ADGP', brewable: true },
  'dispel neutral': { uid: 'ADIPU', alt: 'PRAISU', brewable: true },
  'dispel protection': { uid: 'CDIPP', alt: 'PPOOEE', brewable: true },
  'divine intervention': { uid: 'NNNV', brewable: false },
  'divine protection': { uid: 'NNPV', alt: 'TTV', brewable: true },
  'divine staff': { uid: 'DFV', brewable: false },
  'dragon fear': { uid: 'AADEF', brewable: false },
  drown: { uid: 'NWORD', brewable: false },
  earthquake: { uid: 'HQ', alt: 'QK', brewable: true },
  'eclipse being': { uid: 'BCEII', brewable: false },
  embalm: { uid: 'MLABME', brewable: false },
  empath: { uid: 'HTAPME', brewable: true },
  'empower weapon': { uid: 'PPW', brewable: false },
  'enchant armor': { uid: 'MNNRR', brewable: true },
  enchantgem: { uid: 'CGMNN', brewable: false },
  'enchanting touch': { uid: 'CCGU', brewable: true },
  'enchant weapon': { uid: 'CHPW', brewable: true },
  endurance: { uid: 'ACDNNRU', brewable: false },
  'enduring wrath': { uid: 'DGTW', brewable: false },
  'energy drain': { uid: 'GIY', brewable: false },
  'energy storm': { uid: 'EGMY', brewable: false },
  'engulf wind': { uid: 'FGW', brewable: false },
  'enhanced constitution': { uid: 'ACCHS', brewable: false },
  'enhanced recovery': { uid: 'CHV', brewable: false },
  'enhance seed': { uid: 'CEEEES', brewable: false },
  enlarge: { uid: 'EGRALNE', alt: 'EERLG', brewable: true },
  entangle: { uid: 'EEGLNN', brewable: false },
  excommunicate: { uid: 'AIX', brewable: false },
  'faerie fire': { uid: 'AEEFII', brewable: true },
  'faerie flames': { uid: 'EFFM', brewable: true },
  'faerie fog': { uid: 'FFGI', brewable: false },
  'fake illness': { uid: 'FKN', brewable: false },
  'false image': { uid: 'EFGM', brewable: true },
  farsight: { uid: 'FHIR', brewable: false },
  fasting: { uid: 'GNITSAF', brewable: false },
  fear: { uid: 'RAEF', brewable: true },
  'feign death': { uid: 'DEFH', brewable: true },
  fervor: { uid: 'FORRV', brewable: false },
  'find familiar': { uid: 'DFFM', brewable: true },
  fireball: { uid: 'BFLL', brewable: false },
  firebolt: { uid: 'BFILT', brewable: false },
  'fire bomb': { uid: 'BBF', brewable: false },
  fireproof: { uid: 'FFP', brewable: true },
  firestorm: { uid: 'FMRR', brewable: false },
  flamestrike: { uid: 'FKM', brewable: false },
  'flame wall': { uid: 'EFMW', brewable: false },
  'flaming soul': { uid: 'FGLL', brewable: false },
  'floating disc': { uid: 'ACFII', brewable: true },
  fly: { uid: 'YLF', brewable: true },
  'focused aggression': { uid: 'ADGG', brewable: false },
  fog: { uid: 'GOF', brewable: false },
  'force field': { uid: 'CDFFR', brewable: false },
  forget: { uid: 'TEGROF', brewable: true },
  fortitude: { uid: 'DFTT', brewable: false },
  frenzy: { uid: 'FRZ', brewable: false },
  'frost shroud': { uid: 'DFHU', brewable: true },
  furnace: { uid: 'ECANRUF', brewable: false },
  gate: { uid: 'ETAG', brewable: true },
  'giant strength': { uid: 'AGGTT', brewable: true },
  'graft flesh': { uid: 'FFH', brewable: false },
  gust: { uid: 'TSUG', brewable: false },
  harm: { uid: 'MRAH', brewable: false },
  haste: { uid: 'ETSAH', brewable: true },
  'haste crater': { uid: 'AACHTT', brewable: false },
  haunt: { uid: 'TNUAH', brewable: false },
  haze: { uid: 'EZAH', brewable: false },
  heal: { uid: 'LAEH', brewable: false },
  'healing dream': { uid: 'DGLR', brewable: false },
  'heart blight': { uid: 'BHH', brewable: true },
  'heat metal': { uid: 'HLMTT', alt: 'HAMATL', brewable: true },
  hex: { uid: 'XEH', brewable: true },
  'holy flame': { uid: 'AFMY', brewable: false },
  'holy presence': { uid: 'CHLOP', brewable: false },
  'holy smite': { uid: 'HIMY', brewable: false },
  'holy steed': { uid: 'DHTY', brewable: false },
  'holy word': { uid: 'DHWY', brewable: false },
  'host of gargoyles': { uid: 'GGY', brewable: false },
  identify: { uid: 'DEFY', brewable: false },
  ignite: { uid: 'ETINGI', brewable: false },
  illumination: { uid: 'AIIIU', brewable: false },
  imbue: { uid: 'EUBMI', alt: 'MBU', brewable: true },
  'imbue mount': { uid: 'BIMM', brewable: false },
  imposter: { uid: 'RETSOPMI', brewable: true },
  'improved invisibility': { uid: 'BDV', brewable: true },
  inferno: { uid: 'EFNNR', brewable: false },
  'influence confidence': { uid: 'CCCD', brewable: false },
  infravision: { uid: 'AFNN', brewable: false },
  infuriate: { uid: 'AFIIRT', brewable: false },
  'insightful gaze': { uid: 'SZ', brewable: false },
  inspire: { uid: 'ERIPSNI', brewable: false },
  'instant regeneration': { uid: 'AAGIO', brewable: false },
  'interlace spirit': { uid: 'APSTT', brewable: true },
  intimidate: { uid: 'IIMTT', brewable: false },
  invisibility: { uid: 'YTILIBISIVNI', brewable: true },
  'involuntary wizardry': { uid: 'VZ', brewable: true },
  'iron grip': { uid: 'GIIPR', brewable: false },
  jest: { uid: 'TSEJ', brewable: false },
  'kayens shield': { uid: 'HKY', brewable: false },
  'know alignment': { uid: 'EKTW', brewable: true },
  'know languages': { uid: 'GGW', brewable: true },
  'know religion': { uid: 'GKLR', brewable: true },
  'lay on hands': { uid: 'AADHY', brewable: false },
  leprosy: { uid: 'YSORPEL', brewable: true },
  'light foot': { uid: 'FGHTT', brewable: false },
  'lightning bolt': { uid: 'BGG', brewable: false },
  'locate empower': { uid: 'CMW', brewable: true },
  'locate object': { uid: 'AJL', brewable: true },
  'locate remains': { uid: 'CILMO', brewable: true },
  magewind: { uid: 'DGMW', brewable: false },
  'magic missile': { uid: 'CGMM', brewable: false },
  'mass healing': { uid: 'AAGSS', alt: 'MASSH', brewable: true },
  'mass invis': { uid: 'MSSV', alt: 'MASSV', brewable: true },
  mendwounds: { uid: 'DDMO', brewable: false },
  'mental drain': { uid: 'AADLMT', brewable: false },
  'metal storm': { uid: 'LMMTT', brewable: false },
  meteo: { uid: 'OETEM', brewable: false },
  'mind crater': { uid: 'CDMRR', brewable: false },
  'mirror image': { uid: 'AGMRR', alt: 'RRR', brewable: true },
  monsoon: { uid: 'NOOSNOM', brewable: false },
  'moon gaze': { uid: 'EMZ', brewable: false },
  'moon pull': { uid: 'LLUPNOOM', brewable: false },
  'moon shadow': { uid: 'ADOOO', brewable: false },
  'nature growth': { uid: 'AGHOW', alt: 'NATURGWO', brewable: true },
  'natures grip': { uid: 'GPRU', brewable: false },
  nexus: { uid: 'SUXEN', brewable: false },
  'night shield': { uid: 'DHHL', brewable: false },
  'night terror': { uid: 'GHRRR', brewable: false },
  nondetection: { uid: 'NOITCETEDNON', brewable: false },
  'pass door': { uid: 'ADOOPR', brewable: true },
  plague: { uid: 'AGLPU', brewable: true },
  portal: { uid: 'LATROP', brewable: true },
  'possess familiar': { uid: 'FMP', brewable: true },
  poultice: { uid: 'ECITLUOP', alt: 'POULTIC', brewable: true },
  'praise the prophecy': { uid: 'HHY', brewable: false },
  'prevent recovery': { uid: 'CVV', alt: 'PRVNTRCV', brewable: true },
  'protection cold': { uid: 'CCDIP', brewable: false },
  'protection evil': { uid: 'CLNV', brewable: true },
  'protection fire': { uid: 'EEFIIP', brewable: true },
  'protection good': { uid: 'DGNP', alt: 'OOOO', brewable: true },
  'protection neutral': { uid: 'LTTT', brewable: true },
  'proximity dispel': { uid: 'LX', brewable: false },
  'psionic blast': { uid: 'ABII', brewable: false },
  'rainbow pattern': { uid: 'BPW', alt: 'RAINBWT', brewable: true },
  'ray of truth': { uid: 'FHUY', brewable: true },
  'recant blasphemy': { uid: 'AABY', brewable: false },
  recharge: { uid: 'CGHRR', brewable: true },
  recover: { uid: 'REVOCER', brewable: false },
  redirect: { uid: 'TCERIDER', brewable: false },
  reduce: { uid: 'ECUDER', brewable: false },
  refresh: { uid: 'EEFHRR', brewable: false },
  regenerate: { uid: 'EEEEG', brewable: false },
  'remove curse': { uid: 'CMOV', brewable: false },
  'remove empower': { uid: 'MVW', brewable: false },
  'restore armor': { uid: 'RRRR', brewable: true },
  'restore mind': { uid: 'DEIORR', brewable: false },
  'restore weapon': { uid: 'EESTW', alt: 'RSTWAPO', brewable: true },
  'righteous judgement': { uid: 'GJ', brewable: false },
  root: { uid: 'TOOR', brewable: false },
  'sacred bond': { uid: 'BDD', brewable: false },
  sanctuary: { uid: 'CNUY', brewable: false },
  scorch: { uid: 'HCROCS', brewable: false },
  'scorching winds': { uid: 'CCW', brewable: false },
  scourge: { uid: 'EGRUOCS', brewable: true },
  'self projection': { uid: 'FJ', brewable: false },
  sequestor: { uid: 'QS', brewable: true },
  shadowbolt: { uid: 'BLW', brewable: false },
  shadowcloak: { uid: 'CKW', brewable: false },
  shadowform: { uid: 'DFHM', alt: 'DWFS', brewable: true },
  shadowlord: { uid: 'ADDL', brewable: false },
  'shadow vision': { uid: 'HIV', brewable: false },
  'shadow vortex': { uid: 'WX', brewable: false },
  'shadow whisper': { uid: 'DWW', brewable: false },
  'shake resolve': { uid: 'AKV', brewable: false },
  shield: { uid: 'DLEIHS', brewable: true },
  'shield crater': { uid: 'CDHIL', brewable: false },
  'shocking grasp': { uid: 'CGK', brewable: true },
  'shrink head': { uid: 'HHKR', brewable: true },
  'shrink skull': { uid: 'HKK', brewable: false },
  silence: { uid: 'ECNELIS', brewable: true },
  sleep: { uid: 'PEELS', brewable: false },
  slow: { uid: 'WOLS', brewable: true },
  snakebite: { uid: 'BEEK', brewable: true },
  'solar flare': { uid: 'FLRRS', brewable: false },
  solidify: { uid: 'DFLY', brewable: false },
  'soul harvest': { uid: 'AHUV', brewable: true },
  soulsight: { uid: 'GHSSU', alt: 'SOULI', brewable: true },
  'spell eating': { uid: 'GLPT', brewable: false },
  'spirit of protection': { uid: 'FPP', brewable: false },
  'spirit of retribution': { uid: 'BPU', brewable: false },
  spiritwalk: { uid: 'KLP', brewable: true },
  spook: { uid: 'KOOP', brewable: true },
  splinter: { uid: 'RETNILPS', brewable: true },
  stalagmite: { uid: 'GLMTT', brewable: false },
  'stone skin': { uid: 'KNNSS', brewable: false },
  'summon elemental': { uid: 'ELLMM', brewable: true },
  'summon monster': { uid: 'MMMSST', brewable: true },
  swarm: { uid: 'MRAWS', alt: 'SWARM', brewable: true },
  teleport: { uid: 'TROPELET', brewable: false },
  thunderclap: { uid: 'CDHP', brewable: true },
  'time stop': { uid: 'MOPTT', brewable: false },
  tornado: { uid: 'ODANROT', brewable: true },
  'turn undead': { uid: 'ADUU', brewable: true },
  umbra: { uid: 'ABMRU', brewable: false },
  vacancy: { uid: 'AACCV', brewable: false },
  ventriloquate: { uid: 'IQ', brewable: true },
  view: { uid: 'WEIV', brewable: false },
  'voodoo doll': { uid: 'DDV', brewable: false },
  'vortex of the sun': { uid: 'FX', brewable: false },
  'water breathing': { uid: 'BGW', brewable: false },
  wave: { uid: 'EVAW', brewable: false },
  'waves of weariness': { uid: 'FVW', alt: 'WW', brewable: true },
  waypoint: { uid: 'IPWY', brewable: false },
  weaken: { uid: 'EEKNW', brewable: true },
  web: { uid: 'BEW', brewable: false },
  'wind breath': { uid: 'BDEW', brewable: false },
  wither: { uid: 'REHTIW', brewable: true },
  'withering enchant': { uid: 'ACGW', brewable: false },
  'withstand death': { uid: 'DDIW', alt: 'WITHDAT', brewable: true },
  'wizard mark': { uid: 'KZ', brewable: true },
  'word of recall': { uid: 'CFW', alt: 'WRDCALL', brewable: true },
  'wrath of nature': { uid: 'FTW', brewable: true },
};

// ── UID helpers ─────────────────────────────────────────────────────────────────

function letterCounts(uid: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const ch of uid) m.set(ch, (m.get(ch) ?? 0) + 1);
  return m;
}

function canonicalUid(uid: string): string {
  return uid.split('').sort().join('');
}

function matchSpells(sortedLetters: string[], spells: Record<string, SpellEntry>): string[] {
  const key = sortedLetters.join('');
  const results: string[] = [];
  for (const [name, entry] of Object.entries(spells)) {
    if (canonicalUid(entry.uid) === key) results.push(name);
    if (entry.alt && canonicalUid(entry.alt) === key) results.push(`${name} (alt)`);
  }
  return results;
}

// ── Brewer cipher ─────────────────────────────────────────────────────────────
//
// The game uses a fixed substitution cipher (the "brewer's alphabet") that maps
// each item's first letter to the brew letter it contributes to the cauldron.
// Example: A → K, so an item starting with A (e.g. "apple") contributes K.
//
// The cipher is a 26-character string where position 0 = what A maps to,
// position 1 = what B maps to, ..., position 25 = what Z maps to.
// Default (identity): "ABCDEFGHIJKLMNOPQRSTUVWXYZ" — no transformation.
//
// Note: if the item's lore name includes an article ("an apple", "some basil"),
// the article's first letter is used. Configure items with their raw lore keyword.

const DEFAULT_CIPHER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function parseCipher(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_CIPHER;
  const clean = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return clean.length === 26 ? clean : DEFAULT_CIPHER;
}

function applyBrewerCipher(cipher: string, firstLetter: string): string {
  const idx = firstLetter.charCodeAt(0) - 65;
  if (idx < 0 || idx > 25) return firstLetter;
  return cipher[idx];
}

function itemLetter(loreName: string, cipher: string): string {
  const first = loreName.trim()[0];
  if (!first) return '?';
  return applyBrewerCipher(cipher, first.toUpperCase());
}

function firstLetterOf(loreName: string): string {
  const first = loreName.trim()[0];
  return first ? first.toUpperCase() : '?';
}

// Merge config cipher (26-char string) with experimentally discovered mappings.
// Discovered entries override the config cipher for their specific source letters.
function buildEffectiveCipher(configCipher: string, discovered: Record<string, string>): string {
  let result = '';
  for (let i = 0; i < 26; i++) {
    const src = String.fromCharCode(65 + i);
    result += discovered[src] ?? configCipher[i];
  }
  return result;
}

// ── Cipher deduction engine ───────────────────────────────────────────────────
//
// Given items used in a successful brew and the spell's UID, deduce new source→brew
// letter mappings. Algorithm: count-based constraint propagation.
//
//  1. Tally source-letter counts from item first-letters: { A:2, B:1 }
//  2. Tally brew-letter counts from UID:                  { K:2, L:1 }
//  3. Remove entries already covered by known mappings.
//  4. Iteratively: if exactly ONE remaining source-count matches exactly ONE remaining
//     target-count, that mapping is determined (sound but not complete — covers the
//     common cases without requiring exhaustive search).

interface DeduceResult {
  determined: Record<string, string>; // source → brew (newly found)
  ambiguous: string[]; // source letters that remain ambiguous
  inconsistent: string[]; // conflicts with known mappings
}

function deduceCipherMappings(
  items: Array<{ lore: string }>,
  uid: string,
  known: Record<string, string>, // already-known source → brew
): DeduceResult {
  // Tally source letters from item first-letters
  const sourceCounts: Record<string, number> = {};
  for (const item of items) {
    const fl = firstLetterOf(item.lore);
    sourceCounts[fl] = (sourceCounts[fl] ?? 0) + 1;
  }

  // Tally brew letters from UID
  const targetCounts: Record<string, number> = {};
  for (const ch of uid) {
    targetCounts[ch] = (targetCounts[ch] ?? 0) + 1;
  }

  const determined: Record<string, string> = {};
  const inconsistent: string[] = [];

  // Apply known mappings first — removes them from remaining pools
  const remSource = { ...sourceCounts };
  const remTarget = { ...targetCounts };

  for (const [src, tgt] of Object.entries(known)) {
    const srcCount = remSource[src];
    if (!srcCount) continue; // this source letter wasn't in this brew
    const tgtAvail = remTarget[tgt] ?? 0;
    if (tgtAvail < srcCount) {
      inconsistent.push(
        `${src}→${tgt} (known) conflicts: UID only has ${tgtAvail}× ${tgt} but ${srcCount} items start with ${src}`,
      );
    } else {
      remTarget[tgt] -= srcCount;
      if (remTarget[tgt] <= 0) delete remTarget[tgt];
    }
    delete remSource[src];
  }

  // Iteratively resolve unique count matches
  let changed = true;
  while (changed) {
    changed = false;
    for (const [src, count] of Object.entries(remSource)) {
      const matches = Object.entries(remTarget).filter(([, c]) => c === count);
      if (matches.length === 1) {
        const [tgt] = matches[0];
        determined[src] = tgt;
        delete remSource[src];
        remTarget[tgt] -= count;
        if (remTarget[tgt] <= 0) delete remTarget[tgt];
        changed = true;
        break; // restart — remTarget changed
      }
    }
  }

  const ambiguous = Object.keys(remSource);
  return { determined, ambiguous, inconsistent };
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ItemDef {
  label: string; // user-chosen short key for commands (e.g. "apple", "k1")
  lore: string; // in-game lore name / get keyword (e.g. "apple", "kale chips")
  letter: string; // derived: first letter of lore name, uppercased
}

interface Experiment {
  items: string[]; // item labels used
  spell: string; // spell that came out (normalized)
  uid: string; // UID of that spell
  expected: string; // UID the user was targeting (may differ if something went wrong)
  note: string; // optional notes (e.g. "wrong result", "level too low")
  timestamp: number;
}

// Per-letter assignment: which item label the warlock uses for this letter
interface LetterAssignment {
  label: string;
  lore: string;
  note?: string; // optional: "tested OK", "level too low on 2nd try", etc.
}

interface AlphabetState {
  // letter → assignment
  assignments: Record<string, LetterAssignment>;
  // experiment log
  experiments: Experiment[];
}

interface GourdRecipe {
  spell1: string; // primary spell (Effect 1, deterministic via UID)
  spell2: string; // secondary spell (Effect 2, experimentally discovered)
  ingredients?: string; // raw token string of items used, e.g. "2xS C P V"
  timestamp: number;
}

interface PluginState {
  alphabets: Record<string, AlphabetState>;
  activeAlphabet: string;
  // Source-letter → brew-letter mappings confirmed via wa deduce or wa cipher set.
  discoveredCipher: Record<string, string>;
  // Source-letter → list of candidate brew-letters recorded via wa cipher maybe.
  // Cleared for a letter when a confirmed mapping is saved for it.
  probableCipher: Record<string, string[]>;
  // Spells added by the user at runtime (not in the built-in SPELL_DB).
  userSpells: Record<string, SpellEntry>;
  // Known gourd recipes: pairs of spells confirmed to appear together on one gourd.
  gourdRecipes: GourdRecipe[];
}

// ── Storage ──────────────────────────────────────────────────────────────────

const STATE_KEY = 'warlock-alphabet.plugin.state';

function emptyAlphabet(): AlphabetState {
  return { assignments: {}, experiments: [] };
}

function loadState(): PluginState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as PluginState;
      s.discoveredCipher ??= {};
      s.probableCipher ??= {};
      s.userSpells ??= {};
      s.gourdRecipes ??= [];
      return s;
    }
  } catch {
    /* ignore */
  }
  return {
    alphabets: { default: emptyAlphabet() },
    activeAlphabet: 'default',
    discoveredCipher: {},
    probableCipher: {},
    userSpells: {},
    gourdRecipes: [],
  };
}

function saveState(state: PluginState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function getAlphabet(state: PluginState): AlphabetState {
  const key = state.activeAlphabet;
  if (!state.alphabets[key]) state.alphabets[key] = emptyAlphabet();
  return state.alphabets[key];
}

// ── Item config parsing ──────────────────────────────────────────────────────

function parseItems(raw: unknown, cipher: string): ItemDef[] {
  if (typeof raw !== 'string') return [];
  const items: ItemDef[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const label = t.slice(0, eq).trim();
    const lore = t.slice(eq + 1).trim();
    if (label && lore) items.push({ label, lore, letter: itemLetter(lore, cipher) });
  }
  return items;
}

// ── Brew command builder ─────────────────────────────────────────────────────
//
// The UID string defines the exact INSERTION ORDER for the cauldron.
// The cauldron reverses the order of inserted items, so putting items in UID order
// causes the cauldron to display them in reverse — which spells out the spell name.
// Example: uid "SSELB" → put S,S,E,L,B → cauldron shows B,L,E,S,S = BLESS.
//
// Grouping all same-letter items together (e.g. A,A,L,A instead of A,L,A,A for "ALAA")
// would produce the wrong cauldron display, so we iterate the uid string character by
// character to preserve the intended sequence.

function buildBrewCommands(
  spell: string,
  alpha: AlphabetState,
  items: ItemDef[],
  storage: string,
  spells: Record<string, SpellEntry>,
): string[] | { missing: string[] } {
  const entry = spells[spell];
  if (!entry) return { missing: ['(spell not in database)'] };

  const labelMap = Object.fromEntries(items.map((i) => [i.label, i]));

  // Pre-validate: find all unique letters that lack an assignment
  const missingSet = new Set<string>();
  for (const letter of entry.uid) {
    if (!alpha.assignments[letter]) missingSet.add(letter);
  }
  if (missingSet.size > 0) return { missing: [...missingSet] };

  // Build commands in UID character order to preserve cauldron insertion sequence
  const commands: string[] = [];
  for (const letter of entry.uid) {
    const assignment = alpha.assignments[letter]!;
    const item = labelMap[assignment.label];
    const loreName = item?.lore ?? assignment.lore;
    commands.push(`get '${loreName}' ${storage}`);
    commands.push(`put '${loreName}' cauldron`);
  }
  return commands;
}

// ── Suggestion engine ─────────────────────────────────────────────────────────
//
// Returns brewable spells that the warlock can currently brew (all letters assigned),
// plus spells that are nearly brewable (1–2 letters missing).
// Sorted by: fully brewable first, then by number of missing letters, then alphabetically.

interface SpellStatus {
  spell: string;
  uid: string;
  missingLetters: string[];
  canBrew: boolean;
}

function spellStatuses(alpha: AlphabetState, spells: Record<string, SpellEntry>): SpellStatus[] {
  const results: SpellStatus[] = [];
  for (const [spell, entry] of Object.entries(spells)) {
    if (!entry.brewable) continue;
    const counts = letterCounts(entry.uid);
    const missing = [...counts.keys()].filter((l) => !alpha.assignments[l]);
    results.push({ spell, uid: entry.uid, missingLetters: missing, canBrew: missing.length === 0 });
  }
  results.sort((a, b) => {
    if (a.canBrew !== b.canBrew) return a.canBrew ? -1 : 1;
    if (a.missingLetters.length !== b.missingLetters.length) return a.missingLetters.length - b.missingLetters.length;
    return a.spell.localeCompare(b.spell);
  });
  return results;
}

// ── Arg parser ───────────────────────────────────────────────────────────────

function parseArgs(s: string): string[] {
  const args: string[] = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && s[i] === ' ') i++;
    if (i >= s.length) break;
    if (s[i] === "'" || s[i] === '"') {
      const q = s[i];
      const close = s.indexOf(q, i + 1);
      if (close !== -1) {
        args.push(s.slice(i + 1, close));
        i = close + 1;
        continue;
      }
    }
    const end = s.indexOf(' ', i);
    args.push(end === -1 ? s.slice(i) : s.slice(i, end));
    i = end === -1 ? s.length : end;
  }
  return args.filter((a) => a.length > 0);
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_WA_ITEMS = [
  '# Warlock alphabet items — from community ingredient spreadsheet',
  "# Format:  label = keyword   (keyword used in: get 'keyword' shelf)",
  '# Brew letter = brewer cipher applied to first letter of keyword.',
  '# Run "wa auto" after configuring your cipher to auto-assign letters.',
  '#',
  '# ── A ──────────────────────────────────────────────────────',
  'apple        = apple',
  'avocado      = avocado toast',
  '#',
  '# ── B ──────────────────────────────────────────────────────',
  'bagel        = bagel lox',
  'basil        = basil',
  'birthday     = birthday cake',
  'bottle       = bottle',
  '#',
  '# ── C ──────────────────────────────────────────────────────',
  'carrots      = carrots',
  'celery       = celery',
  'cheesecake   = cheesecake',
  'cherry       = cherry pie',
  'corsage      = corsage',
  'cupcake      = cupcake',
  '#',
  '# ── D ──────────────────────────────────────────────────────',
  'doughball    = doughball',
  '#',
  '# ── E ──────────────────────────────────────────────────────',
  'elk          = elk jerky',
  'elven        = elven bread',
  '#',
  '# ── F ──────────────────────────────────────────────────────',
  'fruit        = fruit salad',
  'funeral      = funeral arrangement',
  '#',
  '# ── G ──────────────────────────────────────────────────────',
  'gardenia     = gardenia',
  'granite      = granite flask',
  '#',
  '# ── H ──────────────────────────────────────────────────────',
  'hardtack     = hardtack',
  'homebrew     = homebrew',
  'honeysuckle  = honeysuckle',
  '#',
  '# ── I ──────────────────────────────────────────────────────',
  'illuminating = illuminating shard',
  'Iolanthian   = Iolanthian brie',
  '#',
  '# ── J ──────────────────────────────────────────────────────',
  'jelly        = jelly danish',
  '#',
  '# ── K ──────────────────────────────────────────────────────',
  'kale         = kale chips',
  'keg          = keg',
  '#',
  '# ── L ──────────────────────────────────────────────────────',
  'lavender     = lavender rose',
  '#',
  '# ── M ──────────────────────────────────────────────────────',
  'mead         = mead',
  'mooseburger  = mooseburger',
  '#',
  '# ── N ──────────────────────────────────────────────────────',
  'non-alcoholic = non-alcoholic',
  '#',
  '# ── O ──────────────────────────────────────────────────────',
  'orange       = orange',
  'orchid       = orchid',
  'oregano      = oregano',
  '#',
  '# ── P ──────────────────────────────────────────────────────',
  'peach        = peach rose',
  'pickled      = pickled gizzard',
  'potato       = potato',
  '#',
  '# ── Q ──────────────────────────────────────────────────────',
  'quartz       = quartz figurine',
  '#',
  '# ── R ──────────────────────────────────────────────────────',
  'raspberry    = raspberry tart',
  'reindeer     = reindeer jerky',
  'red          = red rose',
  '#',
  '# ── S ──────────────────────────────────────────────────────',
  'salted       = salted minnows',
  'snifter      = snifter',
  'soft         = soft pretzel',
  'stein        = stein beer',
  '#',
  '# ── T ──────────────────────────────────────────────────────',
  'tigerlily    = tigerlily',
  'tiramisu     = tiramisu',
  'tomato       = tomato',
  'tulip        = tulip',
  'turnip       = turnip',
  '#',
  '# ── U ──────────────────────────────────────────────────────',
  'uppittu      = uppittu porridge',
  '#',
  '# ── V ──────────────────────────────────────────────────────',
  'veal         = veal sandwich',
  '#',
  '# ── W ──────────────────────────────────────────────────────',
  'waffle       = waffle',
  'wedding      = wedding bouquet',
  'whale        = whale lantern',
  'white        = white rose',
  '#',
  '# ── X ── (no X items found in ingredient spreadsheet)',
  '#',
  '# ── Y ──────────────────────────────────────────────────────',
  'yak          = yak ham',
  'yellow       = yellow rose',
  '#',
  '# ── Z ──────────────────────────────────────────────────────',
  'zaven        = zaven',
].join('\n');

// ── Plugin ───────────────────────────────────────────────────────────────────

export function createWarlockAlphabetPlugin(): IPluginModule {
  return {
    manifest: {
      id: 'warlock-alphabet',
      name: 'Warlock Alphabet',
      version: '0.2.0',
      description:
        "Tracks your warlock brew alphabet. The first letter of each item's lore name determines its brew letter. Assign items per letter, look up spell recipes, and generate brew commands.",
      tags: ['wip'],
    },

    configSchema: {
      defaults: {
        items: DEFAULT_WA_ITEMS,
        storage: 'shelf',
        cipher: DEFAULT_CIPHER,
      },
      fields: [
        {
          key: 'items',
          type: 'textarea',
          label: 'Items',
          description:
            'Your alphabet items. One per line: label = lore name. The brew letter is derived from the first letter of the lore name, mapped through the brewer cipher below.',
          placeholder: 'apple = apple\nbasil = basil\nkale = kale chips',
        },
        {
          key: 'cipher',
          type: 'string',
          label: 'Brewer cipher',
          description:
            'A 26-character string defining your brewer\'s alphabet. Position 1 = what items starting with A contribute, position 2 = B, ..., position 26 = Z. Example: if A→K, B→L, ..., Z→J, enter "KLMNOPQRSTUVWXYZABCDEFGHIJ". Leave as ABCDEFGHIJKLMNOPQRSTUVWXYZ for no transformation. Use "wa cipher" in-game to see the current mapping.',
          placeholder: DEFAULT_CIPHER,
        },
        {
          key: 'storage',
          type: 'string',
          label: 'Storage container',
          description: 'Where items are stored (used in get commands).',
          placeholder: 'shelf',
        },
      ],
    },

    onAlias(api: PluginRuntimeApi, input: string): boolean | undefined {
      const trimmed = input.trim();
      if (!/^wa\s+/i.test(trimmed)) return false;

      const rest = trimmed.slice(3).trim();
      const args = parseArgs(rest);
      const sub = (args[0] ?? '').toLowerCase();

      const cfg = api.getConfig();
      const configCipher = parseCipher(cfg.cipher);
      const state = loadState();
      const spells: Record<string, SpellEntry> = { ...SPELL_DB, ...state.userSpells };
      const cipher = buildEffectiveCipher(configCipher, state.discoveredCipher);
      const items = parseItems(cfg.items, cipher);
      const storage = typeof cfg.storage === 'string' && cfg.storage.trim() ? cfg.storage.trim() : 'shelf';

      const alpha = getAlphabet(state);

      const labelMap = Object.fromEntries(items.map((i) => [i.label, i]));
      const letterToItem = Object.fromEntries(items.map((i) => [i.letter, i]));

      // ── wa solve ────────────────────────────────────────────────────────────
      if (sub === 'solve') {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        const assigned = letters.filter((l) => alpha.assignments[l]);
        const missing = letters.filter((l) => !alpha.assignments[l]);

        api.log(`[WA] Alphabet "${state.activeAlphabet}" — ${assigned.length}/26 letters assigned`);
        if (assigned.length) {
          api.log('[WA] Assigned:');
          for (const l of assigned) {
            const a = alpha.assignments[l];
            api.log(`  ${l} → ${a.label} (${a.lore})${a.note ? ` [${a.note}]` : ''}`);
          }
        }
        if (missing.length) {
          api.log(`[WA] No item for: ${missing.join(' ')}`);
          api.log('[WA] Use "wa set <letter> <item label>" to assign, or configure more items.');
        }
        return true;
      }

      // ── wa missing ─────────────────────────────────────────────────────────
      if (sub === 'missing') {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        const missing = letters.filter((l) => !alpha.assignments[l]);
        if (!missing.length) {
          api.log('[WA] All 26 letters have items assigned!');
        } else {
          api.log(`[WA] Missing items for letters (${missing.length}): ${missing.join(' ')}`);
          api.log('[WA] Browse items at: https://shatteredarchive.com/items/all-items');
          api.log('[WA] Or search: GET https://shatteredarchive.com/internal/brew-items?name=&type=&level=');
        }
        return true;
      }

      // ── wa items ────────────────────────────────────────────────────────────
      if (sub === 'items') {
        if (!items.length) {
          api.log('[WA] No items configured. Add some in the configure panel.');
          return true;
        }
        const cipherIsIdentity = cipher === DEFAULT_CIPHER;
        api.log('[WA] Configured items (label → lore name → brew letter):');
        for (const item of items) {
          const firstLetter = firstLetterOf(item.lore);
          const brewLetter = item.letter;
          const letterDisplay = cipherIsIdentity ? `[${brewLetter}]` : `[${firstLetter}→${brewLetter}]`;
          const assigned = Object.values(alpha.assignments).find((a) => a.label === item.label);
          const status = assigned
            ? `brew letter ${brewLetter} assigned`
            : `brew letter ${brewLetter} — not yet set as primary`;
          api.log(`  ${item.label} = ${item.lore}  ${letterDisplay}  ${status}`);
        }
        if (!cipherIsIdentity) {
          api.log('[WA] Note: brew letter = brewer cipher applied to item first letter. Use "wa cipher" to review.');
        } else {
          api.log(
            '[WA] Note: no cipher set — brew letter = first letter of lore name. Configure "Brewer cipher" if needed.',
          );
        }
        return true;
      }

      // ── wa cipher [set|maybe|clear|export] ──────────────────────────────────
      if (sub === 'cipher') {
        const action = (args[1] ?? '').toLowerCase();

        // wa cipher set a=o
        if (action === 'set') {
          const raw = args[2] ?? '';
          const eqIdx = raw.indexOf('=');
          const from = raw.slice(0, eqIdx).trim().toUpperCase();
          const to = raw
            .slice(eqIdx + 1)
            .trim()
            .toUpperCase();
          if (eqIdx === -1 || !/^[A-Z]$/.test(from) || !/^[A-Z]$/.test(to)) {
            api.log('[WA] Usage: wa cipher set <letter>=<letter>');
            api.log('[WA] Example: wa cipher set a=o  (items starting with A contribute brew letter O)');
            return true;
          }
          state.discoveredCipher[from] = to;
          delete state.probableCipher[from];
          saveState(state);
          api.log(`[WA] Cipher confirmed: ${from} → ${to}. Use "wa cipher" to review.`);
          return true;
        }

        // wa cipher maybe a=o,n
        if (action === 'maybe') {
          const raw = args[2] ?? '';
          const eqIdx = raw.indexOf('=');
          const from = raw.slice(0, eqIdx).trim().toUpperCase();
          const candidates = raw
            .slice(eqIdx + 1)
            .toUpperCase()
            .split(',')
            .map((s) => s.trim())
            .filter((s) => /^[A-Z]$/.test(s));
          if (eqIdx === -1 || !/^[A-Z]$/.test(from) || candidates.length === 0) {
            api.log('[WA] Usage: wa cipher maybe <letter>=<candidate>[,<candidate>...]');
            api.log('[WA] Example: wa cipher maybe a=o,n  (A is probably O or N)');
            return true;
          }
          if (state.discoveredCipher[from]) {
            api.log(`[WA] ${from} is already confirmed as ${from} → ${state.discoveredCipher[from]}.`);
            api.log(`[WA] Use "wa cipher clear ${from.toLowerCase()}" first to re-evaluate.`);
            return true;
          }
          state.probableCipher[from] = candidates;
          saveState(state);
          api.log(
            `[WA] Probable: ${from} → ${candidates.join(' or ')}. Use "wa cipher set ${from.toLowerCase()}=<letter>" to confirm.`,
          );
          return true;
        }

        // wa cipher clear a
        if (action === 'clear') {
          const from = (args[2] ?? '').toUpperCase();
          if (!/^[A-Z]$/.test(from)) {
            api.log('[WA] Usage: wa cipher clear <letter>');
            return true;
          }
          const hadConfirmed = !!state.discoveredCipher[from];
          const hadProbable = !!state.probableCipher[from];
          if (!hadConfirmed && !hadProbable) {
            api.log(`[WA] No confirmed or probable mapping for ${from}.`);
            return true;
          }
          delete state.discoveredCipher[from];
          delete state.probableCipher[from];
          saveState(state);
          const cleared = [hadConfirmed && 'confirmed', hadProbable && 'probable'].filter(Boolean).join(' and ');
          api.log(`[WA] Cleared ${cleared} mapping for ${from}.`);
          return true;
        }

        // wa cipher export
        if (action === 'export') {
          const unknownLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
            .split('')
            .filter((l) => !state.discoveredCipher[l] && configCipher['ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(l)] === l);
          if (unknownLetters.length > 0) {
            api.log(`[WA] Cipher not fully known. Unknown: ${unknownLetters.join(' ')}`);
            api.log('[WA] Partial string (? = unknown):');
            let partial = '';
            for (let i = 0; i < 26; i++) {
              const from = String.fromCharCode(65 + i);
              partial += state.discoveredCipher[from] ?? (configCipher[i] !== from ? configCipher[i] : '?');
            }
            api.log(`  ${partial}`);
          } else {
            api.log('[WA] Full cipher string (paste into "Brewer cipher" config field):');
            api.log(`  ${cipher}`);
          }
          return true;
        }

        // wa cipher — display all 26 letters
        const hasAny =
          Object.keys(state.discoveredCipher).length > 0 ||
          Object.keys(state.probableCipher).length > 0 ||
          configCipher !== DEFAULT_CIPHER;

        if (!hasAny) {
          api.log('[WA] Brewer cipher: not configured. Brew letter = item first letter (identity).');
          api.log('[WA] Commands:');
          api.log('[WA]   wa cipher set a=o      — confirm A maps to O');
          api.log('[WA]   wa cipher maybe a=o,n  — record A is probably O or N');
          api.log('[WA]   wa deduce <spell> using <items>  — deduce from a brew result');
          api.log('[WA]   wa cipher export        — get full 26-char string for config');
        } else {
          api.log('[WA] Brewer cipher — source → brew  (D=confirmed  C=config  ~=probable  ?=unknown):');
          let unknownCount = 0;
          let probableCount = 0;
          for (let i = 0; i < 26; i++) {
            const from = String.fromCharCode(65 + i);
            const confirmed = state.discoveredCipher[from];
            const probable = state.probableCipher[from];
            const configVal = configCipher[i];
            const isConfigMapped = configVal !== from;
            if (confirmed) {
              api.log(`  ${from} → ${confirmed}  [D]`);
            } else if (isConfigMapped) {
              api.log(`  ${from} → ${configVal}  [C]`);
            } else if (probable?.length) {
              api.log(`  ${from} → (${probable.map((p) => `${p}?`).join(' ')})  [~]`);
              probableCount++;
            } else {
              api.log(`  ${from} → ?  [?]`);
              unknownCount++;
            }
          }
          if (unknownCount > 0)
            api.log(`[WA] ${unknownCount} unknown. Use "wa cipher set a=o" or "wa cipher maybe a=o,n".`);
          if (probableCount > 0) api.log(`[WA] ${probableCount} probable. Use "wa cipher set a=o" to confirm.`);
          if (unknownCount === 0 && probableCount === 0)
            api.log('[WA] All letters mapped. Use "wa cipher export" to get the config string.');
        }
        return true;
      }

      // ── wa cipher-set <from> <to> (legacy alias) ─────────────────────────────
      if (sub === 'cipher-set') {
        const from = (args[1] ?? '').toUpperCase();
        const to = (args[2] ?? '').toUpperCase();
        if (!/^[A-Z]$/.test(from) || !/^[A-Z]$/.test(to)) {
          api.log('[WA] Usage: wa cipher set <letter>=<letter>  e.g. wa cipher set a=o');
          return true;
        }
        state.discoveredCipher[from] = to;
        delete state.probableCipher[from];
        saveState(state);
        api.log(`[WA] Cipher confirmed: ${from} → ${to}. Use "wa cipher" to review.`);
        return true;
      }

      // ── wa cipher-clear <from> (legacy alias) ───────────────────────────────
      if (sub === 'cipher-clear') {
        const from = (args[1] ?? '').toUpperCase();
        if (!/^[A-Z]$/.test(from)) {
          api.log('[WA] Usage: wa cipher clear <letter>');
          return true;
        }
        if (!state.discoveredCipher[from] && !state.probableCipher[from]) {
          api.log(`[WA] No mapping for ${from}.`);
          return true;
        }
        delete state.discoveredCipher[from];
        delete state.probableCipher[from];
        saveState(state);
        api.log(`[WA] Cleared mapping for ${from}.`);
        return true;
      }

      // ── wa cipher-export (legacy alias) ──────────────────────────────────────
      if (sub === 'cipher-export') {
        const unknownLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
          .split('')
          .filter((l) => !state.discoveredCipher[l] && configCipher['ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(l)] === l);
        if (unknownLetters.length > 0) {
          api.log(`[WA] Cipher not fully known. Unknown: ${unknownLetters.join(' ')}`);
          api.log('[WA] Partial string (? = unknown):');
          let partial = '';
          for (let i = 0; i < 26; i++) {
            const from = String.fromCharCode(65 + i);
            partial += state.discoveredCipher[from] ?? (configCipher[i] !== from ? configCipher[i] : '?');
          }
          api.log(`  ${partial}`);
        } else {
          api.log('[WA] Full cipher string (paste into "Brewer cipher" config field):');
          api.log(`  ${cipher}`);
        }
        return true;
      }

      // ── wa deduce <spell> using <item...> ────────────────────────────────────
      // Analyzes a known brew result to extract cipher mappings.
      if (sub === 'deduce') {
        const usingIdx = args.findIndex((a) => a.toLowerCase() === 'using');
        if (usingIdx === -1 || usingIdx < 2) {
          api.log('[WA] Usage: wa deduce <spell name> using <item label> [item label ...]');
          api.log('[WA] Example: wa deduce "bark skin" using apple avocado');
          api.log('[WA]   Requires: items used, the spell that came out, and the spell to be in the database.');
          return true;
        }

        // The arg immediately before "using" is treated as an explicit UID if it is
        // all uppercase letters and the spell name precedes it.
        const rawSpellArgs = args.slice(1, usingIdx);
        const lastSpellArg = rawSpellArgs[rawSpellArgs.length - 1] ?? '';
        const hasInlineUid = rawSpellArgs.length >= 2 && /^[A-Z]+$/.test(lastSpellArg);
        const inlineUid = hasInlineUid ? lastSpellArg : undefined;
        const spellArgs = hasInlineUid ? rawSpellArgs.slice(0, -1) : rawSpellArgs;
        const spellName = spellArgs.join(' ').toLowerCase();
        const itemLabels = args.slice(usingIdx + 1);

        let entry = spells[spellName];
        if (!entry && inlineUid) {
          entry = { uid: inlineUid, brewable: true };
          state.userSpells[spellName] = entry;
          spells[spellName] = entry;
          saveState(state);
          api.log(`[WA] Added spell "${spellName}" (UID: ${inlineUid}) to your spell list.`);
        }
        if (!entry) {
          api.log(`[WA] Spell "${spellName}" not found.`);
          api.log(`[WA] If you know the UID, provide it inline:`);
          api.log(`[WA]   wa deduce "${spellName}" <UID> using <items>`);
          api.log(`[WA]   e.g. wa deduce "${spellName}" KOOP using apple apple`);
          return true;
        }

        const usedItems = itemLabels.map((l) => {
          if (labelMap[l]) return labelMap[l];
          // Auto-create: treat label as lore, log a warning
          const auto = { label: l, lore: l, letter: itemLetter(l, cipher) };
          api.log(
            `[WA] Item "${l}" not in Items config — treating lore as "${l}". Add "${l} = lore name" to Items config if the get keyword differs.`,
          );
          return auto;
        });

        const totalItems = itemLabels.length;
        const uidLetterCount = entry.uid.length;
        if (totalItems !== uidLetterCount) {
          api.log(
            `[WA] ⚠ Item count (${totalItems}) ≠ UID letter count (${uidLetterCount}) for "${spellName}" (${entry.uid}).`,
          );
          api.log('[WA]   Ensure you listed every item put in the cauldron. Proceeding anyway...');
        }

        const result = deduceCipherMappings(
          usedItems.map((i) => ({ lore: i!.lore })),
          entry.uid,
          state.discoveredCipher,
        );

        api.log(`[WA] Brew analysis: "${spellName}" (UID: ${entry.uid})`);

        if (result.inconsistent.length) {
          api.log('[WA] ⚠ Inconsistencies with known mappings:');
          for (const msg of result.inconsistent) api.log(`  ${msg}`);
        }

        if (Object.keys(result.determined).length) {
          api.log('[WA] Newly determined cipher mappings:');
          for (const [from, to] of Object.entries(result.determined)) {
            api.log(`  ${from} → ${to}  (items starting with ${from} contribute brew letter ${to})`);
            state.discoveredCipher[from] = to;
          }
          saveState(state);
          api.log('[WA] Saved. Use "wa cipher" to review all known mappings.');
          api.log('[WA] Use "wa cipher-export" once all letters are known to get the config string.');
        }

        if (result.ambiguous.length) {
          api.log(`[WA] Ambiguous (${result.ambiguous.length} source letters — need more experiments):`);
          for (const src of result.ambiguous) {
            // Show which brew letters it could be
            const srcCount = itemLabels.filter((l) => firstLetterOf(labelMap[l]!.lore) === src).length;
            api.log(
              `  ${src} (${srcCount}× used) — could be any of: ${Object.keys(letterCounts(entry.uid)).join(', ')}`,
            );
          }
          api.log(
            '[WA] Tip: brew spells where all items share the same first letter (e.g. bark skin with two A-items).',
          );
        }

        if (!Object.keys(result.determined).length && !result.ambiguous.length && !result.inconsistent.length) {
          api.log('[WA] No new information — all item letters were already known.');
        }
        return true;
      }

      // ── wa set <letter> <label> ─────────────────────────────────────────────
      if (sub === 'set') {
        const letter = (args[1] ?? '').toUpperCase();
        const label = args.slice(2).join(' ');

        if (!letter || !/^[A-Z]$/.test(letter) || !label) {
          api.log('[WA] Usage: wa set <letter A–Z> <item label>');
          api.log('[WA] Example: wa set K kale');
          return true;
        }

        let item = labelMap[label];
        if (!item) {
          item = { label, lore: label, letter: itemLetter(label, cipher) };
          api.log(`[WA] Item "${label}" not in Items config — treating lore as "${label}".`);
          api.log(`[WA] Add "${label} = lore name" to the Items config if the get keyword differs.`);
        }

        if (item.letter !== letter) {
          const firstLetter = firstLetterOf(item.lore);
          api.log(
            `[WA] Warning: item "${item.lore}" (first letter: ${firstLetter}) maps to brew letter "${item.letter}", not "${letter}".`,
          );
          api.log('[WA] Assigning anyway — verify the lore name and brewer cipher are correct.');
        }

        alpha.assignments[letter] = { label, lore: item.lore };
        saveState(state);
        api.log(`[WA] Assigned: ${letter} → ${label} (${item.lore})`);
        return true;
      }

      // ── wa auto ─────────────────────────────────────────────────────────────
      // Auto-assign items to their brew letters (cipher-mapped from first letter).
      // Only fills slots that are currently empty.
      if (sub === 'auto') {
        let count = 0;
        for (const item of items) {
          const l = item.letter;
          if (!alpha.assignments[l]) {
            alpha.assignments[l] = { label: item.label, lore: item.lore };
            api.log(`[WA] Auto-assigned: ${l} → ${item.label} (${item.lore})`);
            count++;
          }
        }
        if (count === 0) {
          api.log('[WA] No new auto-assignments made (all matching letters already filled).');
        } else {
          api.log(`[WA] Auto-assigned ${count} letter(s). Use "wa solve" to review.`);
          saveState(state);
        }
        return true;
      }

      // ── wa clear <letter> ───────────────────────────────────────────────────
      if (sub === 'clear') {
        const letter = (args[1] ?? '').toUpperCase();
        if (!letter || !/^[A-Z]$/.test(letter)) {
          api.log('[WA] Usage: wa clear <letter A–Z>');
          return true;
        }
        if (!alpha.assignments[letter]) {
          api.log(`[WA] Letter ${letter} has no assignment.`);
          return true;
        }
        delete alpha.assignments[letter];
        saveState(state);
        api.log(`[WA] Cleared assignment for letter ${letter}.`);
        return true;
      }

      // ── wa lookup <spell> ───────────────────────────────────────────────────
      if (sub === 'lookup') {
        const spellName = args.slice(1).join(' ').toLowerCase();
        if (!spellName) {
          api.log('[WA] Usage: wa lookup <spell name>');
          return true;
        }

        const entry = spells[spellName];
        if (!entry) {
          api.log(`[WA] Spell "${spellName}" not found. Use "wa spell-add ${spellName} <UID>" to add it.`);
          return true;
        }

        // Reverse uid to show what the cauldron will display
        const uidReversed = entry.uid.split('').reverse().join('');
        api.log(`[WA] Recipe for "${spellName}":`);
        api.log(`[WA]   UID (insertion order): ${entry.uid}`);
        api.log(`[WA]   Cauldron displays:     ${uidReversed}`);

        // Show items in UID insertion order (position by position)
        api.log('[WA] Items to put in the cauldron (in this order):');
        const seenLetters = new Set<string>();
        for (let i = 0; i < entry.uid.length; i++) {
          const letter = entry.uid[i];
          const a = alpha.assignments[letter];
          const itemDesc = a ? `${a.label} (${a.lore})` : '⚠ no item assigned — use wa set';
          api.log(`  ${i + 1}. letter ${letter} → ${itemDesc}`);
          seenLetters.add(letter);
        }

        if (entry.alt) {
          const altReversed = entry.alt.split('').reverse().join('');
          api.log(`[WA] Alternate UID: ${entry.alt}  (cauldron: ${altReversed})`);
        }

        const missing = [...seenLetters].filter((l) => !alpha.assignments[l]);
        if (!missing.length) {
          api.log('[WA] All letters assigned. Use "wa brew ' + spellName + '" to execute.');
        } else {
          api.log(`[WA] Missing assignments for: ${missing.join(', ')}`);
        }
        return true;
      }

      // ── wa brew <spell> ─────────────────────────────────────────────────────
      if (sub === 'brew') {
        const spellName = args.slice(1).join(' ').toLowerCase();
        if (!spellName) {
          api.log('[WA] Usage: wa brew <spell name>');
          return true;
        }

        api.log('[WA] ⚠ This controls only the FIRST spell effect on the gourd (deterministic).');
        api.log('[WA]   The gourd may also receive a 2nd effect (rules unknown) and a 3rd (always random).');

        const result = buildBrewCommands(spellName, alpha, items, storage, spells);
        if (!Array.isArray(result)) {
          api.log(`[WA] Cannot brew — missing letter assignments: ${result.missing.join(', ')}`);
          api.log('[WA] Use "wa lookup ' + spellName + '" for details, or "wa set" to assign missing letters.');
          return true;
        }

        api.log(`[WA] Brewing "${spellName}"...`);
        for (const cmd of result) api.sendCommand(cmd);
        return true;
      }

      // ── wa recipe save|show ──────────────────────────────────────────────────
      if (sub === 'recipe') {
        const action = (args[1] ?? '').toLowerCase();

        if (action === 'save') {
          if (args.length < 4) {
            api.log('[WA] Usage: wa recipe save "spell1" "spell2" [ingredient tokens...]');
            api.log('[WA]   e.g. wa recipe save "bark skin" "bless" 2xS C P V');
            return true;
          }
          const spell1 = args[2].toLowerCase();
          const spell2 = args[3].toLowerCase();
          const ingredients = args.slice(4).join(' ') || undefined;

          if (!spells[spell1]) api.log(`[WA] ⚠ Spell "${spell1}" not in database — saving anyway.`);
          if (!spells[spell2]) api.log(`[WA] ⚠ Spell "${spell2}" not in database — saving anyway.`);

          const existingIdx = state.gourdRecipes.findIndex(
            (r) => (r.spell1 === spell1 && r.spell2 === spell2) || (r.spell1 === spell2 && r.spell2 === spell1),
          );
          if (existingIdx !== -1) {
            state.gourdRecipes[existingIdx] = { spell1, spell2, ingredients, timestamp: Date.now() };
            api.log(`[WA] Updated gourd recipe: "${spell1}" + "${spell2}".`);
          } else {
            state.gourdRecipes.push({ spell1, spell2, ingredients, timestamp: Date.now() });
            api.log(`[WA] Saved gourd recipe: "${spell1}" + "${spell2}".`);
          }
          if (ingredients) api.log(`[WA]   Ingredients: ${ingredients}`);
          saveState(state);
          api.log(
            `[WA] Use "wa recipe show" to list all, or "wa recipe show \\"${spell1}\\" \\"${spell2}\\"" for details.`,
          );
          return true;
        }

        if (!action || action === 'show') {
          // No spell args → list all saved recipes
          if (args.length <= 2) {
            if (!state.gourdRecipes.length) {
              api.log('[WA] No gourd recipes saved. Use: wa recipe save "spell1" "spell2"');
              return true;
            }
            api.log(`[WA] Saved gourd recipes (${state.gourdRecipes.length}):`);
            for (const r of state.gourdRecipes) {
              const uid1 = spells[r.spell1]?.uid ?? '(unknown)';
              const uid2 = spells[r.spell2]?.uid ?? '(unknown)';
              const ing = r.ingredients ? `  [${r.ingredients}]` : '';
              api.log(`  "${r.spell1}" + "${r.spell2}"  (Effect 1 UID: ${uid1} | Effect 2 UID: ${uid2})${ing}`);
            }
            api.log('[WA] Use: wa recipe show "spell1" "spell2" for brew commands.');
            return true;
          }

          // With spell args → show brew details for that recipe
          const spell1 = args[2].toLowerCase();
          const spell2 = (args[3] ?? '').toLowerCase();

          const saved = state.gourdRecipes.find(
            (r) => (r.spell1 === spell1 && r.spell2 === spell2) || (r.spell1 === spell2 && r.spell2 === spell1),
          );
          if (!saved) {
            api.log(`[WA] No saved recipe for "${spell1}" + "${spell2}".`);
            api.log(`[WA] Use "wa recipe save \\"${spell1}\\" \\"${spell2}\\"" to record it.`);
            return true;
          }

          const primarySpell = saved.spell1;
          const secondarySpell = saved.spell2;
          api.log(`[WA] Gourd recipe: "${primarySpell}" + "${secondarySpell}"`);
          if (saved.ingredients) {
            api.log(`[WA]   Ingredients: ${saved.ingredients}`);
          }
          api.log(`[WA]   Effect 1 (deterministic): brew "${primarySpell}" in UID order`);
          const primaryEntry = spells[primarySpell];
          if (primaryEntry) {
            api.log(`[WA]   UID: ${primaryEntry.uid}`);
            const result = buildBrewCommands(primarySpell, alpha, items, storage, spells);
            if (!Array.isArray(result)) {
              api.log(`[WA]   Missing letter assignments: ${result.missing.join(', ')}`);
              api.log('[WA]   Use "wa set" to assign missing letters, then try again.');
            } else {
              api.log('[WA]   Brew commands for Effect 1:');
              for (const cmd of result) api.log(`    ${cmd}`);
            }
          } else {
            api.log(`[WA]   Spell "${primarySpell}" not in database — cannot show brew commands.`);
          }
          api.log(`[WA]   Effect 2 (not controlled): "${secondarySpell}" appears on this gourd`);
          api.log(`[WA] Run "wa brew ${primarySpell}" to execute.`);
          return true;
        }

        api.log('[WA] Usage: wa recipe save "spell1" "spell2"  |  wa recipe show  |  wa recipe show "spell1" "spell2"');
        return true;
      }

      // ── wa log <spell> using <item> [item ...] ─────────────────────────────
      // Records a brew result for reference. Useful to note unexpected outcomes.
      if (sub === 'log') {
        const usingIdx = args.findIndex((a) => a.toLowerCase() === 'using');
        if (usingIdx === -1) {
          api.log('[WA] Usage: wa log <spell name> using <item label> [item label ...]');
          return true;
        }

        const spellArgs = args.slice(1, usingIdx);
        const itemArgs = args.slice(usingIdx + 1);
        if (!spellArgs.length || !itemArgs.length) {
          api.log('[WA] Usage: wa log <spell name> using <item label> [item label ...]');
          return true;
        }

        const spellName = spellArgs.join(' ').toLowerCase();
        const entry = spells[spellName];
        const uid = entry?.uid ?? '(unknown)';

        // Derive letters from actual items used
        const usedLetters = itemArgs
          .map((l) => labelMap[l]?.letter ?? '?')
          .sort()
          .join('');

        const exp: Experiment = {
          items: itemArgs,
          spell: spellName,
          uid,
          expected: usedLetters,
          note: '',
          timestamp: Date.now(),
        };
        alpha.experiments.push(exp);
        saveState(state);

        api.log(`[WA] Logged: [${itemArgs.join(', ')}] → "${spellName}" (UID: ${uid})`);
        api.log(`[WA] Letters contributed: ${usedLetters}`);

        if (entry && canonicalUid(uid) !== [...usedLetters].sort().join('')) {
          api.log('[WA] ⚠ The letters contributed do not match the expected UID for this spell.');
          api.log('[WA]   This may indicate a wrong item (wrong first letter) or a level/category mismatch.');
        }
        return true;
      }

      // ── wa experiments ──────────────────────────────────────────────────────
      if (sub === 'experiments') {
        if (!alpha.experiments.length) {
          api.log('[WA] No experiments recorded. Use: wa log <spell> using <items>');
          return true;
        }
        api.log(`[WA] Brew log (${alpha.experiments.length} entries):`);
        for (let i = 0; i < alpha.experiments.length; i++) {
          const exp = alpha.experiments[i];
          const d = new Date(exp.timestamp).toLocaleString();
          api.log(`  ${i + 1}. [${d}] [${exp.items.join(', ')}] → ${exp.spell} (${exp.uid})`);
        }
        return true;
      }

      // ── wa suggest [n] ──────────────────────────────────────────────────────
      if (sub === 'suggest') {
        const n = parseInt(args[1] ?? '10', 10) || 10;
        const statuses = spellStatuses(alpha, spells);
        const brewable = statuses.filter((s) => s.canBrew).slice(0, n);
        const almostBrewable = statuses.filter((s) => !s.canBrew && s.missingLetters.length <= 2).slice(0, n);

        if (brewable.length) {
          api.log(`[WA] Spells you can brew now (${brewable.length}):`);
          for (const s of brewable) {
            api.log(`  ${s.spell}  (${s.uid}) — use: wa brew "${s.spell}"`);
          }
        } else {
          api.log('[WA] No spells are fully brewable with your current alphabet.');
        }

        if (almostBrewable.length) {
          api.log(`[WA] Spells missing 1–2 letters (${almostBrewable.length}):`);
          for (const s of almostBrewable) {
            api.log(`  ${s.spell}  (${s.uid}) — missing: ${s.missingLetters.join(', ')}`);
          }
          api.log('[WA] Find items for missing letters: https://shatteredarchive.com/items/all-items');
        }
        return true;
      }

      // ── wa spells ───────────────────────────────────────────────────────────
      if (sub === 'spells') {
        const filterBrewable = args[1]?.toLowerCase() === 'brewable';
        const filterLetter = !filterBrewable && args[1]?.toUpperCase().length === 1 ? args[1].toUpperCase() : null;

        const userSpellCount = Object.keys(state.userSpells).length;
        const totalLabel =
          userSpellCount > 0
            ? `${Object.keys(spells).length} total, ${userSpellCount} user-added`
            : `${Object.keys(spells).length} total`;
        api.log(`[WA] Spell database (${totalLabel}):`);
        for (const [name, entry] of Object.entries(spells)) {
          if (filterBrewable && !entry.brewable) continue;
          if (filterLetter && !entry.uid.includes(filterLetter)) continue;
          const b = entry.brewable ? '✓' : '✗';
          api.log(`  [${b}] ${name}: ${entry.uid}${entry.alt ? ` / ${entry.alt}` : ''}`);
        }
        api.log('[WA] ✓=brewable ✗=not brewable  |  Filter: wa spells brewable  or  wa spells K');
        return true;
      }

      // ── wa match <letters> ──────────────────────────────────────────────────
      if (sub === 'match') {
        const lettersInput = args
          .slice(1)
          .join('')
          .toUpperCase()
          .replace(/[^A-Z]/g, '');
        if (!lettersInput) {
          api.log('[WA] Usage: wa match <letters>  e.g. wa match KK  or  wa match BDZ');
          return true;
        }
        const sorted = lettersInput.split('').sort();
        const matches = matchSpells(sorted, spells);
        if (!matches.length) {
          api.log(`[WA] No spells match "${sorted.join('')}".`);
        } else {
          api.log(`[WA] Spells matching "${sorted.join('')}":`);
          for (const m of matches) api.log(`  ${m}`);
        }
        return true;
      }

      // ── wa use <alphabet> ───────────────────────────────────────────────────
      if (sub === 'use') {
        const name = args.slice(1).join(' ').trim().toLowerCase();
        if (!name) {
          api.log(`[WA] Active alphabet: "${state.activeAlphabet}"`);
          api.log(`[WA] Known alphabets: ${Object.keys(state.alphabets).join(', ')}`);
          api.log('[WA] Usage: wa use <alphabet name>');
          return true;
        }
        state.activeAlphabet = name;
        if (!state.alphabets[name]) {
          state.alphabets[name] = emptyAlphabet();
          api.log(`[WA] Created new alphabet: "${name}"`);
        } else {
          api.log(`[WA] Switched to alphabet: "${name}"`);
        }
        saveState(state);
        return true;
      }

      // ── wa spell-add <name> <uid> ───────────────────────────────────────────
      if (sub === 'spell-add') {
        const uidArg = (args[args.length - 1] ?? '').toUpperCase();
        const nameArgs = args.slice(1, args.length - 1);
        const spellName = nameArgs.join(' ').toLowerCase();

        if (!spellName || !/^[A-Z]+$/.test(uidArg) || nameArgs.length === 0) {
          api.log('[WA] Usage: wa spell-add <spell name> <UID>');
          api.log('[WA] Example: wa spell-add spook KOOP');
          api.log('[WA]   The UID is the uppercase letter sequence that defines the brew recipe.');
          return true;
        }

        if (SPELL_DB[spellName]) {
          api.log(`[WA] "${spellName}" is already in the built-in spell database (UID: ${SPELL_DB[spellName].uid}).`);
          api.log('[WA] If the UID is wrong, update it with: wa spell-add to override in your user list.');
        }

        state.userSpells[spellName] = { uid: uidArg, brewable: true };
        saveState(state);
        api.log(`[WA] Added spell "${spellName}" (UID: ${uidArg}) to your spell list.`);
        api.log('[WA] Use "wa lookup ' + spellName + '" to verify, or "wa brew ' + spellName + '" to brew it.');
        return true;
      }

      // ── wa reset ────────────────────────────────────────────────────────────
      if (sub === 'reset') {
        if ((args[1] ?? '').toLowerCase() !== 'confirm') {
          api.log('[WA] This will wipe ALL assignments and experiments for the active alphabet.');
          api.log('[WA] Type "wa reset confirm" to proceed.');
          return true;
        }
        state.alphabets[state.activeAlphabet] = emptyAlphabet();
        saveState(state);
        api.log(`[WA] Alphabet "${state.activeAlphabet}" reset.`);
        return true;
      }

      // ── wa help ──────────────────────────────────────────────────────────────
      if (!sub || sub === 'help') {
        api.log('[WA] Warlock Alphabet — commands:');
        api.log('  wa solve                          — show assigned letters and gaps');
        api.log('  wa missing                        — show unassigned letters');
        api.log('  wa items                          — list items with brew letters');
        api.log('  wa auto                           — auto-assign items by first letter');
        api.log('  wa set <letter> <item label>      — manually assign a letter (creates item if unknown)');
        api.log('  wa clear <letter>                 — remove an assignment');
        api.log('  wa lookup <spell>                 — show recipe items for a spell');
        api.log('  wa brew <spell>                   — send brew commands (fresh cauldron!)');
        api.log('  wa recipe save "s1" "s2" [items]  — record a dual-spell gourd recipe (items optional)');
        api.log('  wa recipe show                    — list all saved gourd recipes');
        api.log('  wa recipe show "spell1" "spell2"  — show brew commands for a saved gourd recipe');
        api.log('  wa suggest [n]                    — show brewable and near-brewable spells');
        api.log('  wa log <spell> using <items…>     — record a brew result for reference');
        api.log('  wa experiments                    — list recorded experiments');
        api.log('  wa spells [brewable|<letter>]     — list spells in the database');
        api.log('  wa match <letters>                — find spells matching a UID');
        api.log('  wa spell-add <spell> <UID>        — add a spell to your list (e.g. wa spell-add spook KOOP)');
        api.log('');
        api.log('[WA] CIPHER DISCOVERY:');
        api.log(
          '  wa cipher                         — show all 26 letters (D=confirmed C=config ~=probable ?=unknown)',
        );
        api.log('  wa cipher set a=o                 — confirm A maps to brew letter O');
        api.log('  wa cipher maybe a=o,n             — record A is probably O or N (uncertain)');
        api.log('  wa cipher clear a                 — remove confirmed and/or probable mapping for A');
        api.log('  wa cipher export                  — get full 26-char cipher string to paste into config');
        api.log('  wa deduce <spell> using <items…>  — deduce mappings from a known brew result');
        api.log('    Inline UID: wa deduce <spell> <UID> using <items…>  — auto-registers unknown spells');
        api.log('    Unknown item labels are auto-created (lore = label). Fix in Items config if needed.');
        api.log('');
        api.log('[WA] ALPHABETS:');
        api.log('  wa use <alphabet>                 — switch named alphabet');
        api.log('  wa reset confirm                  — wipe active alphabet');
        api.log('');
        api.log('[WA] GOURD SPELL EFFECTS:');
        api.log('  Effect 1: deterministic — UID (insertion order) determines the spell.');
        api.log('  Effect 2: rule-governed — rules not yet fully defined.');
        api.log('  Effect 3: always fully random — cannot be controlled.');
        api.log('');
        api.log('[WA] Brew letter = brewer cipher applied to item first letter.');
        api.log('[WA] Tip: brew spells with all-same-first-letter items for unambiguous cipher deduction.');
        return true;
      }

      api.log(`[WA] Unknown command: wa ${sub}. Type "wa help" for commands.`);
      return true;
    },
  };
}
