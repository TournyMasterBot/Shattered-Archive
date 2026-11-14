import type { Decision } from '../contracts';
import { bucketStats, countBuckets, readBucketTable } from './buckets';
import { effectiveConfidence } from './confidence';

let n = 0;
function d(outcome: Decision['outcome'], extra: Partial<Decision> = {}): Decision {
  n += 1;
  return { id: `d${n}`, suggestionId: `s${n}`, character: 'Agate-F', at: n, outcome, sphere: 'world', kind: 'move', ...extra };
}

describe('countBuckets', () => {
  it('counts approved, corrected and rejected per bucket, approved separately', () => {
    const table = countBuckets([
      d('approved'),
      d('approved'),
      d('corrected', { command: 'south' }),
      d('rejected'),
      d('approved', { sphere: 'fighting', kind: 'fight-continue' }),
    ]);
    expect(table).toEqual({ 'world:move': { approved: 2, total: 4 }, 'fighting:fight-continue': { approved: 1, total: 1 } });
  });

  it('never counts the agent’s own runs or the gate’s refusals as the owner’s judgement', () => {
    const table = countBuckets([d('auto', { command: 'north', rule: 'world:move' }), d('refused', { rule: 'user-typing' }), d('approved')]);
    expect(table).toEqual({ 'world:move': { approved: 1, total: 1 } });
  });

  it('skips a line without a bucket (an older line) or with a bucket that is not real', () => {
    const { sphere: _s, kind: _k, ...older } = d('approved');
    const table = countBuckets([
      older,
      d('approved', { sphere: 'sky' as never }),
      d('approved', { kind: 'teleport' as never }),
      d('approved', { sphere: undefined }),
    ]);
    expect(table).toEqual({});
  });

  it('counts a repeated decision id once', () => {
    const one = d('approved');
    expect(countBuckets([one, { ...one }, { ...one, outcome: 'rejected' }])).toEqual({ 'world:move': { approved: 1, total: 1 } });
  });

  it('is empty for no decisions', () => {
    expect(countBuckets([])).toEqual({});
  });

  it('feeds the earned confidence: 20 approvals count, 19 do not', () => {
    const twenty = countBuckets(Array.from({ length: 20 }, () => d('approved')));
    const nineteen = countBuckets(Array.from({ length: 19 }, () => d('approved')));
    expect(effectiveConfidence(1, bucketStats(twenty, 'world', 'move')).value).toBeCloseTo(0.839, 2);
    expect(effectiveConfidence(1, bucketStats(nineteen, 'world', 'move')).value).toBeNull();
  });
});

describe('bucketStats', () => {
  it('gives the counts of a bucket, or undefined when the owner never answered in it', () => {
    const table = { 'world:move': { approved: 3, total: 4 } };
    expect(bucketStats(table, 'world', 'move')).toEqual({ approved: 3, total: 4 });
    expect(bucketStats(table, 'world', 'info')).toBeUndefined();
  });

  it('does not read an inherited property as a bucket', () => {
    expect(bucketStats({}, 'world', 'move')).toBeUndefined();
  });
});

describe('readBucketTable', () => {
  it('keeps real buckets with possible counts and drops everything else', () => {
    const table = readBucketTable({
      'world:move': { approved: 2, total: 5 },
      'world:bogus': { approved: 1, total: 1 },
      'sky:move': { approved: 1, total: 1 },
      'world:info': { approved: 6, total: 5 },
      'world:loot': { approved: -1, total: 5 },
      'world:interact': { approved: 1.5, total: 5 },
      'world:ability': { approved: '1', total: 5 },
      'fighting:fight-continue': null,
      'fighting:info': 'x',
      'world:move:extra': { approved: 1, total: 1 },
    });
    expect(table).toEqual({ 'world:move': { approved: 2, total: 5 } });
  });

  it.each([null, undefined, 5, 'x', [], [{ approved: 1, total: 1 }]])('reads %p as an empty table', (input) => {
    expect(readBucketTable(input)).toEqual({});
  });
});
