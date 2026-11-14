import type { ActionKind } from '../contracts.js';

/**
 * What the policy knows about the target of a fight-starting command. The classifier never guesses it: a start is
 * `fight-start-known` only when ALL of level, kill-ability and reason are known (the owner's rule), and a player target is `pk`.
 */
export interface FightTarget {
  kind: 'mob' | 'player' | 'unknown';
  levelKnown: boolean;
  /** The agent has evidence the character can win (level comparison, abilities). */
  killable: boolean;
  /** The agent knows why it is attacking (quest, route, leveling plan). */
  reasonKnown: boolean;
}

export interface ClassifyContext {
  inFight: boolean;
  target?: FightTarget;
}

type Marker = 'fight' | 'cast' | 'flee';
type Entry = ActionKind | Marker;

/**
 * Commands by what they do. Everything the MUD's own table would match must be listed (even as `unknown`), because an
 * abbreviation resolves against this whole list and the most restrictive match wins: a missing verb could make `gr` look safe.
 */
const TABLE: Record<string, Entry> = {};
function add(kind: Entry, ...names: string[]): void {
  for (const name of names) TABLE[name] = kind;
}

add('move', 'north', 'south', 'east', 'west', 'up', 'down', 'northeast', 'northwest', 'southeast', 'southwest', 'enter', 'recall');
add('flee', 'flee');
add(
  'info',
  'look', 'examine', 'glance', 'scan', 'consider', 'compare', 'score', 'inventory', 'equipment', 'affects', 'where', 'who', 'whois',
  'whoisic', 'time', 'weather', 'areas', 'exits', 'worth', 'skills', 'spells', 'abilities', 'help', 'commands', 'attributes', 'stats',
  'list', 'value', 'save', 'finger', 'levels', 'wizlist', 'socials', 'version', 'credits', 'news', 'motd', 'rules', 'story',
);
add(
  'interact',
  'open', 'close', 'lock', 'unlock', 'pick', 'push', 'pull', 'press', 'touch', 'search', 'read', 'knock', 'climb', 'sit', 'rest',
  'sleep', 'stand', 'wake', 'mount', 'dismount', 'wear', 'wield', 'remove', 'hold', 'light', 'extinguish',
);
add('loot', 'get', 'take', 'loot');
add('ability', 'sneak', 'hide', 'meditate', 'track', 'forage', 'visible', 'unhide');
add(
  'spend-or-lose',
  'drop', 'junk', 'sell', 'buy', 'give', 'donate', 'sacrifice', 'put', 'deposit', 'withdraw', 'bid', 'repair', 'enchant', 'forge',
  'train', 'practice', 'gain', 'pay', 'tip', 'bet', 'gamble', 'trade', 'barter', 'pour', 'fill',
  // consuming an item is losing it
  'quaff', 'eat', 'drink', 'recite', 'zap', 'brandish', 'apply',
);
add('irreversible', 'quit', 'delete', 'suicide', 'remort', 'reroll', 'rebirth', 'retire', 'ascend', 'destroy', 'burn', 'forget', 'unlearn', 'steal', 'rent');
add(
  'speak',
  'say', 'tell', 'reply', 'yell', 'shout', 'gossip', 'chat', 'ooc', 'newbie', 'auction', 'whisper', 'ask', 'answer', 'emote', 'pose',
  'gtell', 'clantalk', 'ctell', 'ktell', 'kingdomtalk', 'report', 'note', 'mail', 'bug', 'typo', 'idea', 'question', 'music',
  'cgossip', 'immtalk', 'qtalk',
);
add('pk', 'murder');
add('fight', 'kill', 'hit', 'bash', 'trip', 'kick', 'backstab', 'circle', 'berserk', 'dirt', 'disarm', 'gouge', 'rescue', 'assist', 'headbutt', 'strike');
add('cast', 'cast');
add(
  'unknown',
  'group', 'follow', 'order', 'nofollow', 'nosummon', 'noloot', 'autoloot', 'autogold', 'autosac', 'autoexit', 'autoassist', 'config',
  'toggle', 'alias', 'unalias', 'colour', 'color', 'ansi', 'prompt', 'wimpy', 'title', 'description', 'surrender', 'release', 'trust',
  'invite', 'join', 'leave', 'clan', 'kingdom', 'channels', 'ignore', 'unignore', 'afk', 'quiet', 'replay', 'scroll', 'pagelength',
  'smile', 'bow', 'hug', 'kiss', 'wave', 'nod', 'laugh', 'cry', 'dance', 'poke', 'slap', 'curse', 'bark', 'sob',
);

// The MUD's own short forms: single letters, and names that are not a prefix of what they mean ("bs", "gt"). Nothing that is
// already a prefix is listed, so an abbreviation never gets a weaker answer than the most restrictive match.
const ALIASES: Record<string, string> = {
  n: 'north', s: 'south', e: 'east', w: 'west', u: 'up', d: 'down',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
  l: 'look', i: 'inventory', k: 'kill', bs: 'backstab', gt: 'gtell',
};

/** Most restrictive first: an ambiguous abbreviation resolves to the earliest kind among its matches. */
const RISK_ORDER: readonly (ActionKind | Marker)[] = [
  'pk', 'irreversible', 'spend-or-lose', 'speak', 'unknown',
  'fight-start-unknown', 'fight', 'cast', 'fight-start-known', 'fight-continue', 'flee',
  'ability', 'loot', 'interact', 'move', 'info',
];
const RISK = new Map(RISK_ORDER.map((kind, index) => [kind, index]));

function riskOf(entry: Entry): number {
  return RISK.get(entry) ?? 0; // anything unranked is treated as the most restrictive
}

/** Of two kinds, the one that needs more care (the earlier in the risk order). */
export function moreRestrictive(a: ActionKind, b: ActionKind): ActionKind {
  return riskOf(b) < riskOf(a) ? b : a;
}

/** Resolve a typed verb to its entry: exact name, then alias, then the most restrictive prefix match. */
export function resolveVerb(word: string): { name: string; entry: Entry } | undefined {
  const lower = word.toLowerCase();
  if (Object.hasOwn(TABLE, lower)) return { name: lower, entry: TABLE[lower] };
  if (Object.hasOwn(ALIASES, lower)) {
    const name = ALIASES[lower];
    return { name, entry: TABLE[name] };
  }
  let best: { name: string; entry: Entry } | undefined;
  for (const [name, entry] of Object.entries(TABLE)) {
    if (!name.startsWith(lower)) continue;
    if (best === undefined || riskOf(entry) < riskOf(best.entry)) best = { name, entry };
  }
  return best;
}

const MAX_COMMAND_LENGTH = 200;
// A line that could carry a second command, or a control character, is never classified as safe.
const MULTI_COMMAND = /[;\r\n\u0000-\u001f|]/;

function fightStart(target: FightTarget | undefined): ActionKind {
  if (!target) return 'fight-start-unknown';
  if (target.kind === 'player') return 'pk';
  if (target.kind === 'mob' && target.levelKnown && target.killable && target.reasonKnown) return 'fight-start-known';
  return 'fight-start-unknown';
}

/**
 * The target text of `cast <spell> [target]`, where the spell may be quoted: cast 'fire ball' goblin. An unclosed quote is read as
 * "something follows the spell", which is the cautious reading.
 */
export function castTarget(args: string[]): string | undefined {
  const text = args.join(' ').trim();
  if (text === '') return undefined;
  let rest: string;
  if (text[0] === "'" || text[0] === '"') {
    const close = text.indexOf(text[0], 1);
    rest = close < 0 ? text.slice(1) : text.slice(close + 1);
  } else {
    const space = text.indexOf(' ');
    rest = space < 0 ? '' : text.slice(space + 1);
  }
  rest = rest.trim();
  return rest === '' ? undefined : rest;
}

/**
 * Classify one command line. Never throws and never trusts the caller: anything it cannot place is `unknown`, which always means ask.
 *
 * - A line with `;`, a line break, another control character or `|` is `unknown` (it could hide a second command).
 * - `'`, `"`, `.`, `,` and `:` start a say, gossip or emote: `speak`.
 * - A verb may be abbreviated; an ambiguous abbreviation resolves to the most restrictive match, so `dro`, `giv`, `gos`, `qui` are floor kinds.
 * - A fight verb is `fight-continue` in a fight; outside one it is `fight-start-known` only when the target is a mob whose level,
 *   kill-ability and reason are all known, `pk` for a player or `murder`, and `fight-start-unknown` otherwise.
 */
export function classifyCommand(command: unknown, ctx: ClassifyContext): ActionKind {
  if (typeof command !== 'string') return 'unknown';
  const line = command.trim();
  if (line === '' || line.length > MAX_COMMAND_LENGTH || MULTI_COMMAND.test(line)) return 'unknown';

  if (/^['".,:]/.test(line)) return 'speak';

  const [verb, ...args] = line.split(/\s+/);
  const resolved = resolveVerb(verb);
  if (!resolved) return 'unknown';

  switch (resolved.entry) {
    case 'fight':
      return ctx.inFight ? 'fight-continue' : fightStart(ctx.target);
    case 'cast': {
      if (ctx.inFight) return 'fight-continue';
      const target = castTarget(args);
      if (target === undefined || /^(self|me|myself)$/i.test(target)) return 'ability';
      return fightStart(ctx.target);
    }
    case 'flee':
      return ctx.inFight ? 'fight-continue' : 'move';
    default:
      return resolved.entry;
  }
}
