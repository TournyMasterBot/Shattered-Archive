// The learned tier: what the owner or Claude taught for a room, validated, kept in a ledger, and looked up exactly.
import { JsonlStore } from '@shatteredarchive/copilot-core';
import { MemoryFs } from '../testing/memoryFs';
import { learnedTier, makeRule, MAX_COMMANDS, roomKeyOf, ruleProblem, validateRule, type HintRule } from './rules';

const AT = Date.parse('2026-11-12T10:00:00Z');

function rule(extra: Partial<HintRule> = {}): HintRule {
  return { id: 'chamber of rest|owner|2026-11-12', roomKey: 'chamber of rest', title: 'Chamber of Rest', commands: ['enter orb', 'look in gate'], source: 'owner', at: AT, ...extra };
}

describe('roomKeyOf', () => {
  it('ignores case and spacing', () => {
    expect(roomKeyOf('  The   Chamber of REST ')).toBe('the chamber of rest');
    expect(roomKeyOf(undefined as unknown as string)).toBe('');
  });
});

describe('ruleProblem and validateRule', () => {
  it('accepts a rule as it is made', () => {
    expect(ruleProblem(rule())).toBeNull();
    expect(validateRule(rule())).toEqual({ ok: true, value: rule() });
  });

  it.each([
    ['not an object', null, 'not an object'],
    ['no id', rule({ id: '' }), 'id'],
    ['a long id', rule({ id: 'x'.repeat(161) }), 'id'],
    ['no title', rule({ title: ' ' }), 'title'],
    ['a key that is not the title\'s', rule({ roomKey: 'other' }), 'roomKey'],
    ['no commands', rule({ commands: [] }), 'commands'],
    ['too many commands', rule({ commands: Array.from({ length: MAX_COMMANDS + 1 }, (_, i) => `look ${i}`) }), 'commands'],
    ['an empty command', rule({ commands: ['look', ' '] }), 'command'],
    ['a long command', rule({ commands: ['x'.repeat(121)] }), 'command'],
    ['a control character', rule({ commands: ['look\nquit'] }), 'command'],
    ['a source that is neither', rule({ source: 'copilot' as never }), 'source'],
    ['no time', rule({ at: Number.NaN }), 'at'],
    ['a note that is not text', rule({ note: 5 as never }), 'note'],
    ['a long note', rule({ note: 'x'.repeat(281) }), 'note'],
  ])('refuses %s', (_name, value, part) => {
    const problem = ruleProblem(value);
    expect(problem).toContain(part);
    expect(validateRule(value)).toEqual({ ok: false, errors: [problem] });
  });
});

describe('makeRule', () => {
  it('trims the commands, drops a repeat, keys the room, and names the day', () => {
    const made = makeRule({ title: ' Chamber of  Rest ', commands: [' enter orb ', 'enter orb', 'look in gate', ''], source: 'claude', note: 'from a session' }, AT);
    expect(made).toEqual({
      ok: true,
      rule: { id: 'chamber of rest|claude|2026-11-12', roomKey: 'chamber of rest', title: 'Chamber of  Rest', commands: ['enter orb', 'look in gate'], source: 'claude', at: AT, note: 'from a session' },
    });
  });

  it('says why a rule cannot be made, even when the title or the commands are missing altogether', () => {
    expect(makeRule({ commands: ['look'], source: 'owner' } as never, AT)).toMatchObject({ ok: false });
    expect(makeRule({ title: 'Hall', source: 'owner' } as never, AT)).toMatchObject({ ok: false });
    expect(makeRule({ title: '', commands: ['look'], source: 'owner' }, AT)).toMatchObject({ ok: false });
    expect(makeRule({ title: 'Hall', commands: [], source: 'owner' }, AT)).toMatchObject({ ok: false, problem: expect.stringContaining('commands') });
    expect(makeRule({ title: 'Hall', commands: ['look'], source: 'owner', note: 'x'.repeat(300) }, AT)).toMatchObject({ ok: false });
  });
});

describe('learnedTier', () => {
  async function store(...rules: HintRule[]) {
    const { store: s } = await JsonlStore.open<HintRule>({ fs: new MemoryFs(), path: '/rules.jsonl', validate: validateRule });
    for (const r of rules) await s.append(r);
    return s;
  }

  it('answers an exact room, whatever its case or spacing, and says who taught it', async () => {
    const tier = learnedTier(await store(rule({ note: 'the orb is the way' })));
    expect(await tier({ title: ' CHAMBER  of rest' })).toEqual({ commands: ['enter orb', 'look in gate'], notes: ['taught by you: the orb is the way'] });
  });

  it('knows nothing of a room nobody taught', async () => {
    expect(await learnedTier(await store(rule()))({ title: 'Other Room' })).toBeNull();
    expect(await learnedTier(await store())({ title: 'Chamber of Rest' })).toBeNull();
  });

  it('prefers what the owner taught over what Claude taught, and the newest among one source', async () => {
    const claude = rule({ id: 'a', source: 'claude', commands: ['pull lever'], at: AT + 5000 });
    const owner = rule({ id: 'b', source: 'owner', commands: ['enter orb'], at: AT });
    const newerOwner = rule({ id: 'c', source: 'owner', commands: ['look in gate'], at: AT + 1000 });
    expect((await learnedTier(await store(claude, owner))({ title: 'Chamber of Rest' }))?.commands).toEqual(['enter orb']);
    expect((await learnedTier(await store(claude, owner, newerOwner))({ title: 'Chamber of Rest' }))?.commands).toEqual(['look in gate']);
    expect((await learnedTier(await store(claude))({ title: 'Chamber of Rest' }))?.notes).toEqual(['taught by Claude']);
  });
});
