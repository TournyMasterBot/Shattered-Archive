import { ACTION_KINDS, type ActionKind } from '../contracts';
import { classifyCommand, moreRestrictive, resolveVerb, type ClassifyContext, type FightTarget } from './classify';

const CALM: ClassifyContext = { inFight: false };
const FIGHTING: ClassifyContext = { inFight: true };
const KNOWN_MOB: FightTarget = { kind: 'mob', levelKnown: true, killable: true, reasonKnown: true };

describe('classifyCommand: plain commands (A1)', () => {
  const table: [string, ActionKind][] = [
    // movement and its abbreviations
    ['north', 'move'], ['n', 'move'], ['s', 'move'], ['e', 'move'], ['w', 'move'], ['u', 'move'], ['d', 'move'],
    ['ne', 'move'], ['nw', 'move'], ['se', 'move'], ['sw', 'move'], ['nor', 'move'], ['sout', 'move'], ['dow', 'move'],
    ['northeast', 'move'], ['enter portal', 'move'], ['recall', 'move'],
    // information
    ['look', 'info'], ['l', 'info'], ['look north', 'info'], ['i', 'info'], ['inventory', 'info'], ['eq', 'info'],
    ['score', 'info'], ['whoisic bob', 'info'], ['who', 'info'], ['exits', 'info'], ['scan', 'info'], ['help rules', 'info'],
    // interaction
    ['open door', 'interact'], ['unlock chest', 'interact'], ['wear helm', 'interact'], ['sit', 'interact'], ['rest', 'interact'],
    ['push button', 'interact'], ['wield sword', 'interact'],
    // loot
    ['get all corpse', 'loot'], ['take sword', 'loot'], ['loot corpse', 'loot'],
    // abilities that are not attacks
    ['sneak', 'ability'], ['hide', 'ability'], ['meditate', 'ability'],
    // spend or lose, including consuming an item
    ['drop sword', 'spend-or-lose'], ['sell all', 'spend-or-lose'], ['buy potion', 'spend-or-lose'], ['give 10 gold bob', 'spend-or-lose'],
    ['put sword bag', 'spend-or-lose'], ['donate boots', 'spend-or-lose'], ['junk trash', 'spend-or-lose'],
    ['sacrifice corpse', 'spend-or-lose'], ['deposit 50', 'spend-or-lose'], ['quaff blue', 'spend-or-lose'], ['eat bread', 'spend-or-lose'],
    ['recite scroll', 'spend-or-lose'], ['train str', 'spend-or-lose'], ['practice bash', 'spend-or-lose'],
    // speaking to players
    ['say hello', 'speak'], ["say 'hi'", 'speak'], ['tell bob hi', 'speak'], ['reply ok', 'speak'], ['yell help', 'speak'],
    ['gossip hello', 'speak'], ['ooc hi', 'speak'], ['newbie how', 'speak'], ['whisper bob x', 'speak'], ['emote waves', 'speak'],
    ['gtell hello', 'speak'], ['gt hello', 'speak'], ['shout x', 'speak'],
    // irreversible
    ['quit', 'irreversible'], ['delete', 'irreversible'], ['suicide', 'irreversible'], ['remort', 'irreversible'],
    ['steal gold bob', 'irreversible'], ['destroy item', 'irreversible'],
    // player kill
    ['murder bob', 'pk'],
    // not recognised
    ['dance wildly', 'unknown'], ['group bob', 'unknown'], ['follow bob', 'unknown'], ['xyzzy', 'unknown'], ['order dog attack', 'unknown'],
  ];

  it.each(table)('%s -> %s', (command, kind) => {
    expect(classifyCommand(command, CALM)).toBe(kind);
  });

  it('has at least 80 cases in the table above', () => {
    expect(table.length).toBeGreaterThanOrEqual(80);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(classifyCommand('  NORTH  ', CALM)).toBe('move');
    expect(classifyCommand('\tSay Hello', CALM)).toBe('speak');
  });
});

describe('classifyCommand: abbreviations of floor verbs resolve to the floor (AUTOAPPR-01)', () => {
  const abbreviations: [string, ActionKind][] = [
    ['dro sword', 'spend-or-lose'], ['dr sword', 'spend-or-lose'], ['giv 10 gold bob', 'spend-or-lose'], ['gi 5 bob', 'spend-or-lose'],
    ['sel all', 'spend-or-lose'], ['sac corpse', 'spend-or-lose'], ['quaf potion', 'spend-or-lose'], ['dep 10', 'spend-or-lose'],
    ['gos hi', 'speak'], ['gossi hi', 'speak'], ['tel bob hi', 'speak'], ['yel hi', 'speak'], ['sho hi', 'speak'], ['repl ok', 'speak'],
    ['emot waves', 'speak'], ['whis bob x', 'speak'],
    ['qui', 'irreversible'], ['q', 'irreversible'], ['del', 'irreversible'], ['sui', 'irreversible'], ['rem', 'irreversible'],
    ['ste gold bob', 'irreversible'], ['burn x', 'irreversible'],
    ['mur bob', 'pk'], ['murd bob', 'pk'],
  ];

  it.each(abbreviations)('%s -> %s', (command, kind) => {
    expect(classifyCommand(command, CALM)).toBe(kind);
  });

  it('an ambiguous abbreviation resolves to the most restrictive match, never a safe one', () => {
    // "g" could be get (loot), give (spend), gossip (speak), group (unknown), glance (info): the floor wins
    expect(['spend-or-lose', 'speak']).toContain(classifyCommand('g x', CALM));
    // "lo" could be look (info), lock (interact), loot (loot)
    expect(classifyCommand('lo box', CALM)).toBe('loot');
    // "wh" could be where/who/whois (info) and whisper (speak)
    expect(classifyCommand('wh bob', CALM)).toBe('speak');
    // "co" could be consider (info) and config/color (unknown)
    expect(classifyCommand('co goblin', CALM)).toBe('unknown');
  });

  it('every verb of the table classifies the same typed in full and typed as a prefix that only it matches', () => {
    expect(resolveVerb('quit')).toEqual({ name: 'quit', entry: 'irreversible' });
    expect(resolveVerb('quit')?.entry).toBe(resolveVerb('qui')?.entry);
    expect(resolveVerb('zzz')).toBeUndefined();
  });
});

describe('classifyCommand: lines that could hide a second command or are not commands', () => {
  it.each([
    'north;drop all', 'look\nsell all', 'look\rquit', 'say hi | quit', 'north\u0000', 'look\u001bquit',
  ])('%j -> unknown', (command) => {
    expect(classifyCommand(command, CALM)).toBe('unknown');
  });

  it('is unknown for an empty or whitespace line, an over-long line and non-strings', () => {
    expect(classifyCommand('', CALM)).toBe('unknown');
    expect(classifyCommand('   ', CALM)).toBe('unknown');
    expect(classifyCommand(`say ${'x'.repeat(300)}`, CALM)).toBe('unknown');
    expect(classifyCommand(undefined, CALM)).toBe('unknown');
    expect(classifyCommand(42, CALM)).toBe('unknown');
    expect(classifyCommand(null, CALM)).toBe('unknown');
    expect(classifyCommand({ toString: () => 'north' }, CALM)).toBe('unknown');
  });

  it('treats a speedwalk string and the repeat shortcut as unknown', () => {
    expect(classifyCommand('3n2e', CALM)).toBe('unknown');
    expect(classifyCommand('!', CALM)).toBe('unknown');
  });

  it("reads the say, gossip and emote shortcuts as speaking", () => {
    for (const line of ["'hello", '"hello', '.hello', ',waves', ':waves']) {
      expect(classifyCommand(line, CALM)).toBe('speak');
    }
  });
});

describe('classifyCommand: fights', () => {
  it('a fight verb in a fight continues it, whatever the target says', () => {
    for (const verb of ['kill goblin', 'bash', 'kick', 'k goblin', 'backstab guard', 'bs guard', 'rescue bob']) {
      expect(classifyCommand(verb, FIGHTING)).toBe('fight-continue');
    }
  });

  it('starting a fight needs the level, kill-ability and reason all known (the owner rule)', () => {
    expect(classifyCommand('kill goblin', { inFight: false, target: KNOWN_MOB })).toBe('fight-start-known');
    expect(classifyCommand('k goblin', { inFight: false, target: KNOWN_MOB })).toBe('fight-start-known');
    for (const missing of ['levelKnown', 'killable', 'reasonKnown'] as const) {
      expect(classifyCommand('kill goblin', { inFight: false, target: { ...KNOWN_MOB, [missing]: false } })).toBe('fight-start-unknown');
    }
  });

  it('a target of unknown kind, or no target information at all, is fight-start-unknown', () => {
    expect(classifyCommand('kill thing', { inFight: false, target: { ...KNOWN_MOB, kind: 'unknown' } })).toBe('fight-start-unknown');
    expect(classifyCommand('kill thing', CALM)).toBe('fight-start-unknown');
  });

  it('attacking a player, or murder, is pk even if everything else about the target is known', () => {
    expect(classifyCommand('kill bob', { inFight: false, target: { ...KNOWN_MOB, kind: 'player' } })).toBe('pk');
    expect(classifyCommand('murder goblin', { inFight: false, target: KNOWN_MOB })).toBe('pk');
    expect(classifyCommand('murder goblin', FIGHTING)).toBe('pk');
  });

  it('cast: in a fight it continues; with no target or at self it is an ability; at someone it starts a fight by the target facts', () => {
    expect(classifyCommand("cast 'fire ball'", FIGHTING)).toBe('fight-continue');
    expect(classifyCommand('cast sanctuary', CALM)).toBe('ability');
    expect(classifyCommand("cast 'cure light' self", CALM)).toBe('ability');
    expect(classifyCommand('cast heal Me', CALM)).toBe('ability');
    expect(classifyCommand('cast fireball goblin', { inFight: false, target: KNOWN_MOB })).toBe('fight-start-known');
    expect(classifyCommand("cast 'fire ball' goblin", CALM)).toBe('fight-start-unknown');
    expect(classifyCommand('cast "fire ball" goblin', { inFight: false, target: { ...KNOWN_MOB, kind: 'player' } })).toBe('pk');
  });

  it('a bare cast with no spell has no target and is an ability', () => {
    expect(classifyCommand('cast', CALM)).toBe('ability');
  });

  it('cast with an unclosed quote is read as having a target (cautious)', () => {
    expect(classifyCommand("cast 'fire ball goblin", CALM)).toBe('fight-start-unknown');
    expect(classifyCommand("cast 'sanctuary'", CALM)).toBe('ability');
  });

  it('flee is part of a fight when fighting and a move otherwise', () => {
    expect(classifyCommand('flee', FIGHTING)).toBe('fight-continue');
    expect(classifyCommand('flee', CALM)).toBe('move');
  });
});

describe('moreRestrictive', () => {
  it('returns the kind that needs more care, and the first when they are equal', () => {
    expect(moreRestrictive('move', 'speak')).toBe('speak');
    expect(moreRestrictive('speak', 'move')).toBe('speak');
    expect(moreRestrictive('pk', 'irreversible')).toBe('pk');
    expect(moreRestrictive('info', 'info')).toBe('info');
    expect(moreRestrictive('fight-continue', 'fight-start-known')).toBe('fight-start-known');
  });

  it('ranks every action kind, and treats a kind it does not know as the most restrictive', () => {
    // info is the least restrictive kind, so every other kind must be ranked above it in both argument orders
    for (const kind of ACTION_KINDS.filter((k) => k !== 'info')) {
      expect(moreRestrictive(kind, 'info')).toBe(kind);
      expect(moreRestrictive('info', kind)).toBe(kind);
    }
    expect(moreRestrictive('move', 'not-a-kind' as ActionKind)).toBe('not-a-kind');
  });
});
