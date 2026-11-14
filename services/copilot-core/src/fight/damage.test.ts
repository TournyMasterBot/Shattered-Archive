import { DAMAGE_VERBS, midDamage, parseBlowLine } from './damage.js';

describe('DAMAGE_VERBS', () => {
  it('are the verbs of dam_message with ranges that follow each other without a gap', () => {
    expect(DAMAGE_VERBS[0]).toMatchObject({ first: 'miss', min: 0, max: 0 });
    expect(DAMAGE_VERBS[1]).toMatchObject({ first: 'scratch', min: 1, max: 4 });
    expect(DAMAGE_VERBS.at(-2)).toMatchObject({ first: '<<< ERADICATE >>>', min: 126, max: 150 });
    expect(DAMAGE_VERBS.at(-1)).toMatchObject({ first: 'do UNSPEAKABLE things to', min: 151 });
    for (let i = 1; i < DAMAGE_VERBS.length; i += 1) expect(DAMAGE_VERBS[i].min).toBe(DAMAGE_VERBS[i - 1].max + 1);
  });
});

describe('parseBlowLine', () => {
  it('reads a plain blow of the character, with its damage range', () => {
    expect(parseBlowLine('You scratch the goblin.')).toEqual({ direction: 'dealt', other: 'the goblin', min: 1, max: 4 });
    expect(parseBlowLine('You MUTILATE the goblin!')).toMatchObject({ direction: 'dealt', min: 37, max: 40 });
    expect(parseBlowLine('You miss the goblin.')).toMatchObject({ direction: 'dealt', min: 0, max: 0 });
    expect(parseBlowLine('You do UNSPEAKABLE things to the goblin!')).toMatchObject({ direction: 'dealt', min: 151 });
    expect(parseBlowLine('You *** DEMOLISH *** the goblin!')).toMatchObject({ direction: 'dealt', min: 57, max: 60 });
  });

  it('reads a skill or a spell of the character, with its noun', () => {
    expect(parseBlowLine('Your bash hits the goblin.')).toEqual({ direction: 'dealt', other: 'the goblin', attack: 'bash', min: 9, max: 12 });
    expect(parseBlowLine('Your burning hands DISEMBOWELS the orc chief!')).toMatchObject({ attack: 'burning hands', other: 'the orc chief', min: 41, max: 44 });
    expect(parseBlowLine('Your slash >>> ANNIHILATES <<< a troll!')).toMatchObject({ direction: 'dealt', attack: 'slash', min: 101, max: 125 });
  });

  it('reads a blow at the character, plain and skilled', () => {
    expect(parseBlowLine('The goblin hits you.')).toEqual({ direction: 'taken', other: 'The goblin', min: 9, max: 12 });
    expect(parseBlowLine('The goblin does UNSPEAKABLE things to you!')).toMatchObject({ direction: 'taken', min: 151 });
    expect(parseBlowLine("The goblin's bite mauls you!")).toEqual({ direction: 'taken', other: 'The goblin', attack: 'bite', min: 21, max: 24 });
    expect(parseBlowLine("The troll's acid blast === OBLITERATES === you!")).toMatchObject({ direction: 'taken', attack: 'acid blast', min: 76, max: 100 });
  });

  it('reads immunity as a blow that did nothing, for either side', () => {
    expect(parseBlowLine('The goblin is unaffected by your fireball!')).toEqual({ direction: 'dealt', other: 'The goblin', attack: 'fireball', min: 0, max: 0 });
    expect(parseBlowLine("The goblin's fireball is powerless against you.")).toEqual({ direction: 'taken', other: 'The goblin', attack: 'fireball', min: 0, max: 0 });
  });

  it('ignores blows the character is not part of, a blow at itself and plain talk', () => {
    expect(parseBlowLine('The goblin hits the orc.')).toBeUndefined();
    expect(parseBlowLine('You hit yourself.')).toBeUndefined();
    expect(parseBlowLine('Your bash hits you!')).toBeUndefined();
    expect(parseBlowLine('You say hello.')).toBeUndefined();
    expect(parseBlowLine('The goblin says hello to you.')).toBeUndefined();
    expect(parseBlowLine('')).toBeUndefined();
  });

  it('takes a doubled verb for the right range (hit and hits, miss and misses)', () => {
    expect(parseBlowLine('The goblin misses you.')).toMatchObject({ min: 0, max: 0 });
    expect(parseBlowLine('You graze the goblin.')).toMatchObject({ min: 5, max: 8 });
  });
});

describe('midDamage', () => {
  it('is the middle of the range', () => {
    expect(midDamage({ min: 9, max: 12 })).toBe(10.5);
    expect(midDamage({ min: 0, max: 0 })).toBe(0);
  });
});
