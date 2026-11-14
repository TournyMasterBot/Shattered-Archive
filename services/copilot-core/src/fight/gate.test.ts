import { OFFENSIVE_SPELLS } from './offensiveSpells.js';
import { ATTACK_VERBS, fightTargetOf, gateFight, type GateInput } from './gate.js';
import { MonsterKnowledge } from './knowledge.js';
import { parseConsiderLine } from './consider.js';

const NOW = 5_000;
const ROOM = 'A dark cave';

function input(command: string, knowledge = new MonsterKnowledge(), over: Partial<GateInput> = {}): GateInput {
  return { command, room: ROOM, inFight: false, now: NOW, knowledge, lookupAvailable: true, ...over };
}
function knowing(lookup?: { found: boolean }, considerLine?: string): MonsterKnowledge {
  const k = new MonsterKnowledge();
  if (lookup) k.recordLookup(ROOM, 'goblin', { found: lookup.found, facts: [] }, NOW);
  if (considerLine) k.recordConsider(ROOM, 'goblin', parseConsiderLine(considerLine)!, NOW);
  return k;
}

describe('fightTargetOf', () => {
  it('finds the target of every attack verb, the plain name or an abbreviation', () => {
    for (const verb of ATTACK_VERBS) expect(fightTargetOf(`${verb} goblin`)).toEqual({ target: 'goblin' });
    expect(fightTargetOf('k goblin')).toEqual({ target: 'goblin' });
    expect(fightTargetOf('kil goblin')).toEqual({ target: 'goblin' });
    expect(fightTargetOf('kill')).toEqual({ target: '' });
  });

  it('reads a short form that could be an attack as one (the game decides by its own table), but never the exact name of another command', () => {
    expect(fightTargetOf('ki goblin')).toEqual({ target: 'goblin' });
    expect(fightTargetOf('h goblin')).toEqual({ target: 'goblin' });
    expect(fightTargetOf('bas goblin')).toEqual({ target: 'goblin' });
    expect(fightTargetOf('c fireball goblin')).toEqual({ target: 'goblin' });
    expect(fightTargetOf('ca fireball goblin')).toEqual({ target: 'goblin' });
    expect(fightTargetOf('KILL Goblin')).toEqual({ target: 'Goblin' });
    expect(fightTargetOf('tell goblin hi')).toBeUndefined();
    expect(fightTargetOf('c "cure light" bob')).toBeUndefined();
    expect(fightTargetOf('hello goblin')).toBeUndefined();
    expect(fightTargetOf('s')).toEqual({ target: '' }); // south in the game, a strike here: with no target nothing is gated
  });

  it('finds the target of an offensive spell, quoted or not, and no fight in a healing one, a spell at oneself or none', () => {
    expect(fightTargetOf("cast 'burning hands' goblin")).toEqual({ target: 'goblin' });
    expect(fightTargetOf('cast fireball goblin')).toEqual({ target: 'goblin' });
    expect(fightTargetOf('cast zzzzz goblin')).toBeUndefined(); // not a spell of the stock table
    expect(fightTargetOf('cast burning goblin')).toEqual({ target: 'goblin' });
    expect(fightTargetOf('c "acid blast" orc')).toBeDefined();
    expect(fightTargetOf("cast 'cure light' bob")).toBeUndefined();
    expect(fightTargetOf("cast 'burning hands' self")).toBeUndefined();
    expect(fightTargetOf("cast 'burning hands'")).toBeUndefined();
    // an unclosed quote is read the cautious way (as the classifier does): something follows the spell, so it is gated
    expect(fightTargetOf("cast 'burning hands")).toEqual({ target: 'burning hands' });
    expect(fightTargetOf('cast')).toBeUndefined();
  });

  it('is not a fight when the verb is something else, or unknown, or empty', () => {
    for (const other of ['look goblin', 'consider goblin', 'north', 'rescue bob', 'assist bob', 'get sword', 'xyzzy', '', '   ']) {
      expect(fightTargetOf(other)).toBeUndefined();
    }
  });

  it('has the offensive spells of the game as a generated list', () => {
    expect(OFFENSIVE_SPELLS).toContain('burning hands');
    expect(OFFENSIVE_SPELLS).toContain('acid blast');
    expect(OFFENSIVE_SPELLS).not.toContain('cure light');
    expect(OFFENSIVE_SPELLS.length).toBeGreaterThan(20);
  });
});

describe('gateFight: the order the rule asks for', () => {
  it('lets a command that is no fight through, and everything while a fight is on', () => {
    expect(gateFight(input('north'))).toMatchObject({ action: 'allow', reason: 'not the start of a fight' });
    expect(gateFight(input('kill goblin', undefined, { inFight: true }))).toMatchObject({ action: 'allow', reason: 'already in a fight' });
    expect(gateFight(input('kill'))).toMatchObject({ action: 'allow' });
  });

  it('first asks for the lookup in the archive', () => {
    expect(gateFight(input('kill goblin'))).toEqual({ action: 'lookup', target: 'goblin', reason: 'look up "goblin" in the archive before fighting it' });
    expect(gateFight(input('Kill 2.Goblin'))).toMatchObject({ action: 'lookup', target: 'goblin' });
    expect(gateFight(input("cast 'burning hands' goblin"))).toMatchObject({ action: 'lookup', target: 'goblin' });
  });

  it('allows the fight when the archive knows the monster', () => {
    expect(gateFight(input('kill goblin', knowing({ found: true })))).toMatchObject({ action: 'allow', target: 'goblin' });
  });

  it('sends a consider instead when the archive does not know the monster', () => {
    expect(gateFight(input('kill goblin', knowing({ found: false })))).toMatchObject({ action: 'consider', command: 'consider goblin', target: 'goblin' });
  });

  it('allows the fight after a consider that says it is fair, and not after one that says it is too strong', () => {
    expect(gateFight(input('kill goblin', knowing({ found: false }, 'The perfect match!')))).toMatchObject({ action: 'allow' });
    expect(gateFight(input('kill goblin', knowing({ found: false }, "The goblin says 'Do you feel lucky, punk?'.")))).toMatchObject({ action: 'allow' });
    expect(gateFight(input('kill goblin', knowing({ found: false }, 'The goblin laughs at you mercilessly.')))).toMatchObject({ action: 'deny', reason: 'considered "goblin": too strong to fight' });
    expect(gateFight(input('kill goblin', knowing({ found: false }, 'Death will thank you for your gift.')))).toMatchObject({ action: 'deny' });
  });

  it('does not fight what the game will not let it fight, and considers again one that was not there', () => {
    expect(gateFight(input('kill goblin', knowing({ found: false }, "Don't even think about it.")))).toMatchObject({ action: 'deny', reason: 'the game does not allow a fight with "goblin"' });
    expect(gateFight(input('kill goblin', knowing({ found: false }, "They're not here.")))).toMatchObject({ action: 'consider', command: 'consider goblin' });
  });

  it('never allows a fight on the archive\'s silence: a lookup that found nothing is not an identification', () => {
    const result = gateFight(input('kill goblin', knowing({ found: false })));
    expect(result.action).not.toBe('allow');
  });
});

describe('gateFight: a world with no archive to ask (the Simulacrum)', () => {
  it('skips the lookup and goes to consider first, then follows the answer', () => {
    const none = { lookupAvailable: false };
    expect(gateFight(input('kill goblin', undefined, none))).toMatchObject({ action: 'consider', command: 'consider goblin' });
    expect(gateFight(input('kill goblin', knowing(undefined, 'The perfect match!'), none))).toMatchObject({ action: 'allow' });
    expect(gateFight(input('kill goblin', knowing(undefined, 'The goblin is no match for you.'), none))).toMatchObject({ action: 'allow' });
    expect(gateFight(input('kill goblin', knowing(undefined, 'Death will thank you for your gift.'), none))).toMatchObject({ action: 'deny' });
  });
});

describe('gateFight: knowledge is per room and expires', () => {
  it('asks again in another room and after the time to live', () => {
    const k = knowing({ found: true });
    expect(gateFight(input('kill goblin', k, { room: 'Elsewhere' }))).toMatchObject({ action: 'lookup' });
    expect(gateFight(input('kill goblin', k, { now: NOW + 16 * 60 * 1000 }))).toMatchObject({ action: 'lookup' });
  });
});
