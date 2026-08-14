/**
 * groups.dat format module tests (Phase 8): stock-table round trip,
 * member/cycle validation, and the -1 rating sentinel.
 */
import {
  parseGroupsFile,
  emitGroupsFile,
  validateGroups,
  stockGroupsFile,
  stockGroup,
  groupMemberCandidates,
  resolveMember,
  MAX_IN_GROUP,
} from './groups';
import { STOCK_GROUPS } from './groups-stock';
import { ParseError } from './reader';

describe('groups.dat round trip', () => {
  it('emits the full stock table, re-parses it deep-equal, and is byte-stable', () => {
    const stock = stockGroupsFile();
    expect(stock.groups.length).toBe(STOCK_GROUPS.length);
    const text = emitGroupsFile(stock);
    const reparsed = parseGroupsFile(text);
    expect(reparsed).toEqual(stock);
    expect(emitGroupsFile(reparsed)).toBe(text);
  });

  it('the stock table validates clean', () => {
    const { errors, warnings } = validateGroups(stockGroupsFile());
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('round-trips the -1 sentinel and a sparse one-group overlay', () => {
    const attack = stockGroupsFile().groups.find((g) => g.name === 'attack')!;
    expect(attack.ratings).toEqual([-1, 5, -1, 8]);
    attack.ratings[1] = 3;
    const text = emitGroupsFile({ groups: [attack] });
    expect(text).toContain('-1 3 -1 8 7');
    const round = parseGroupsFile(text);
    expect(round.groups).toHaveLength(1);
    expect(round.groups[0]).toEqual(attack);
  });

  it('exposes stock metadata and member candidates', () => {
    const bene = stockGroup('benedictions')!;
    expect(bene.ratings).toEqual([-1, 4, -1, 8]);
    expect(bene.members).toContain('bless');
    const cands = groupMemberCandidates();
    expect(cands.skills).toContain('sword');
    expect(cands.groups).toContain('weaponsmaster');
  });

  it('resolves members like group_add: skill-first, case-insensitive prefix', () => {
    // stock relies on this: illusion lists 'invis', the skill is "invisibility"
    expect(resolveMember('invis')).toEqual({ kind: 'skill', name: 'invisibility' });
    expect(resolveMember('weaponsmaster')).toEqual({ kind: 'group', name: 'weaponsmaster' });
    expect(resolveMember('Mage Def')).toEqual({ kind: 'group', name: 'mage default' });
    expect(resolveMember('no such member')).toBeNull();
  });
});

describe('groups.dat parse errors', () => {
  it('rejects a bad header, a wrong field count, and a missing terminator', () => {
    expect(() => parseGroupsFile('V9\n$~\n')).toThrow(ParseError);
    expect(() => parseGroupsFile('V1\nattack~\n1 2 3 4\n$~\n')).toThrow(/5 number/);
    expect(() => parseGroupsFile('V1\nattack~\n-1 5 -1 8 0\n')).toThrow(/unexpected end/);
  });

  it('rejects a member count out of range and a missing member tilde', () => {
    expect(() => parseGroupsFile(`V1\nattack~\n-1 5 -1 8 ${MAX_IN_GROUP + 1}\n$~\n`)).toThrow(/member count/);
    expect(() => parseGroupsFile('V1\nattack~\n-1 5 -1 8 1\nbless\n$~\n')).toThrow(/ending in '~'/);
  });
});

describe('groups.dat validation', () => {
  it('flags unknown groups, unknown members, and bad ratings', () => {
    const { errors } = validateGroups({
      groups: [
        { name: 'no such group', ratings: [1, 1, 1, 1], members: [] },
        { name: 'attack', ratings: [-2, 5, -1, 40000], members: ['no such member'] },
      ],
    });
    expect(errors.some((e) => e.includes("'no such group'") && e.includes('C code'))).toBe(true);
    expect(errors.some((e) => e.includes('-2'))).toBe(true);
    expect(errors.some((e) => e.includes('40000'))).toBe(true);
    expect(errors.some((e) => e.includes("member 'no such member'"))).toBe(true);
  });

  it('rejects membership cycles (group_add recursion crash) incl. self-membership', () => {
    // mage default already lists 'beguiling'; making beguiling list 'mage default' closes a cycle
    const beguiling = stockGroupsFile().groups.find((g) => g.name === 'beguiling')!;
    beguiling.members = [...beguiling.members, 'mage default'];
    const { errors } = validateGroups({ groups: [beguiling] });
    expect(errors.some((e) => e.includes('cycle') && e.includes("'beguiling'"))).toBe(true);
    expect(errors.some((e) => e.includes('cycle') && e.includes("'mage default'"))).toBe(true);

    const self = validateGroups({ groups: [{ name: 'attack', ratings: [-1, 5, -1, 8], members: ['attack'] }] });
    expect(self.errors.some((e) => e.includes('itself'))).toBe(true);
  });

  it('legal edits pass: cost change, member add of a proven skill, group-as-member', () => {
    const stock = stockGroupsFile();
    const bene = stock.groups.find((g) => g.name === 'benedictions')!;
    bene.ratings[1] = 3; // cheaper for clerics
    bene.members = [...bene.members, 'sanctuary']; // stock skill
    const draconian = stock.groups.find((g) => g.name === 'draconian')!;
    draconian.members = [...draconian.members, 'weather']; // stock group, acyclic
    const { errors, warnings } = validateGroups(stock);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('warns on an empty member list and a duplicate member', () => {
    const attack = stockGroupsFile().groups.find((g) => g.name === 'attack')!;
    const empty = validateGroups({ groups: [{ ...attack, members: [] }] });
    expect(empty.errors).toEqual([]);
    expect(empty.warnings.some((w) => w.includes('no members'))).toBe(true);
    const dup = validateGroups({ groups: [{ ...attack, members: ['demonfire', 'demonfire'] }] });
    expect(dup.errors).toEqual([]);
    expect(dup.warnings.some((w) => w.includes('more than once'))).toBe(true);
  });
});
