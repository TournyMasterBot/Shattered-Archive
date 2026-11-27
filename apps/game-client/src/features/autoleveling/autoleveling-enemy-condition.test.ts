import { ENEMY_BAND_FLOORS } from './autoleveling-types';
import { CONDITION_BANDS, bandLabel, parseEnemyCondition } from './autoleveling-enemy-condition';

describe('the band table (L12)', () => {
  it('equals the stock base: 100, 90, 75, 50, 30, 15, 0, with "bleeding to death" sharing the lowest', () => {
    expect(CONDITION_BANDS.map((b) => [b.phrase, b.floor])).toEqual([
      ['is in excellent condition', 100],
      ['has a few scratches', 90],
      ['has some small wounds and bruises', 75],
      ['has quite a few wounds', 50],
      ['has some big nasty wounds and scratches', 30],
      ['looks pretty hurt', 15],
      ['is in awful condition', 0],
      ['is bleeding to death', 0],
    ]);
  });

  it('every floor is a floor the gate accepts, and every accepted floor has a phrase', () => {
    expect([...new Set(CONDITION_BANDS.map((b) => b.floor))].sort((a, b) => a - b)).toEqual([...ENEMY_BAND_FLOORS]);
  });

  it('labels a band with its phrase and "about N%"', () => {
    expect(bandLabel(50)).toBe('has quite a few wounds (about 50%)');
    expect(bandLabel(0)).toBe('is in awful condition (about 0%)');
    expect(bandLabel(75)).toBe('has some wounds and bruises (about 75%)');
  });
});

describe('parseEnemyCondition', () => {
  it('reads the subject and the band floor from a condition line', () => {
    expect(parseEnemyCondition('An insane half elf has some big nasty wounds and scratches.')).toEqual([
      { subject: 'An insane half elf', floor: 30 },
    ]);
    expect(parseEnemyCondition('A thread vendor looks pretty hurt.')).toEqual([{ subject: 'A thread vendor', floor: 15 }]);
    expect(parseEnemyCondition('A bear is in excellent condition.')).toEqual([{ subject: 'A bear', floor: 100 }]);
    expect(parseEnemyCondition('A bear is bleeding to death.')).toEqual([{ subject: 'A bear', floor: 0 }]);
  });

  it('is case-insensitive and tolerant of extra spaces inside the phrase', () => {
    expect(parseEnemyCondition('a bear HAS  QUITE A FEW WOUNDS.')).toEqual([{ subject: 'a bear', floor: 50 }]);
  });

  it('removes ANSI colour codes around and inside the line (L11)', () => {
    const line = '\x1b[1;31mAn insane half elf\x1b[0m has \x1b[33mquite a few wounds\x1b[0m.';
    // the game colours text mid-phrase: removing the escapes puts the words back together
    expect(parseEnemyCondition(line)).toEqual([{ subject: 'An insane half elf', floor: 50 }]);
    expect(parseEnemyCondition('\x1b[1;31mAn insane half elf has quite a few wounds.\x1b[0m')).toEqual([
      { subject: 'An insane half elf', floor: 50 },
    ]);
  });

  it('reads every condition line in a chunk, in order, and ignores other lines', () => {
    const chunk = 'You hit a bear.\r\nA bear has a few scratches.\r\n\r\nYour kick misses a bear.\r\nA wolf looks pretty hurt.\r\n';
    expect(parseEnemyCondition(chunk)).toEqual([
      { subject: 'A bear', floor: 90 },
      { subject: 'A wolf', floor: 15 },
    ]);
  });

  it('does not read half a phrase (a chunk cut in the middle)', () => {
    expect(parseEnemyCondition('A bear has some big nasty wou')).toEqual([]);
    expect(parseEnemyCondition('nds and scratches.')).toEqual([]);
  });

  it('gives nothing for text without a condition, for empty and for non-string input', () => {
    expect(parseEnemyCondition('You see nothing special.')).toEqual([]);
    expect(parseEnemyCondition('')).toEqual([]);
    expect(parseEnemyCondition(undefined as unknown as string)).toEqual([]);
  });

  it('an empty subject is allowed (the phrase starts the line)', () => {
    expect(parseEnemyCondition('looks pretty hurt.')).toEqual([{ subject: '', floor: 15 }]);
  });
});
