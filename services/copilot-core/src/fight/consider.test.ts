import { BAND_WORDS, CONSIDER_BANDS, considerAllowsFight, MAX_FIGHT_LEVEL_DIFF, parseConsiderLine } from './consider.js';

/** Every sentence of `do_consider` (act_info.c), with the level difference it stands for. */
const SENTENCES: [string, string, number | null, number | null][] = [
  ['naked', 'You can kill the rat naked and weaponless.', null, -10],
  ['no-match', 'The cityguard is no match for you.', -9, -5],
  ['easy', 'A beastly fido looks like an easy kill.', -4, -2],
  ['even', 'The perfect match!', -1, 1],
  ['lucky', "The wolf says 'Do you feel lucky, punk?'.", 2, 4],
  ['laughs', 'The ogre laughs at you mercilessly.', 5, 9],
  ['death', 'Death will thank you for your gift.', 10, null],
];

describe('parseConsiderLine', () => {
  it.each(SENTENCES)('reads the %s answer with its level difference and the creature it names', (band, line, min, max) => {
    const result = parseConsiderLine(line);
    expect(result).toMatchObject({ kind: 'band', band, minDiff: min, maxDiff: max });
  });

  it('names the creature of an answer that has one, and none for the two that do not', () => {
    expect(parseConsiderLine('The wolf says \'Do you feel lucky, punk?\'.')).toMatchObject({ name: 'The wolf' });
    expect(parseConsiderLine('The perfect match!')).toMatchObject({ name: '' });
    expect(parseConsiderLine('Death will thank you for your gift.')).toMatchObject({ name: '' });
  });

  it('reads the two refusals', () => {
    expect(parseConsiderLine("Don't even think about it.")).toEqual({ kind: 'refused' });
    expect(parseConsiderLine("They're not here.")).toEqual({ kind: 'absent' });
  });

  it('ignores surrounding space and refuses anything that is not exactly the game\'s sentence', () => {
    expect(parseConsiderLine('  The perfect match!  ')).toMatchObject({ band: 'even' });
    for (const other of ['The perfect match', 'You think the wolf is tough.', '', 'The wolf looks like an easy kill', 'You can kill naked and weaponless.x']) {
      expect(parseConsiderLine(other)).toBeUndefined();
    }
  });

  it('has a row and a plain-words entry for every band', () => {
    expect(SENTENCES.map((s) => s[0])).toEqual([...CONSIDER_BANDS]);
    for (const band of CONSIDER_BANDS) expect(BAND_WORDS[band].length).toBeGreaterThan(5);
  });
});

describe('considerAllowsFight', () => {
  it(`allows every band up to ${MAX_FIGHT_LEVEL_DIFF} levels above and nothing from 5 above, and no refusal or absence`, () => {
    const allowed = SENTENCES.filter(([, line]) => considerAllowsFight(parseConsiderLine(line)!)).map((s) => s[0]);
    expect(allowed).toEqual(['naked', 'no-match', 'easy', 'even', 'lucky']);
    expect(considerAllowsFight({ kind: 'refused' })).toBe(false);
    expect(considerAllowsFight({ kind: 'absent' })).toBe(false);
  });
});
