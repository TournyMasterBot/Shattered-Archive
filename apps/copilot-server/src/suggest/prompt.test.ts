import type { Suggestion } from '@shatteredarchive/copilot-core';
import { makeLesson, makeSituation } from '../testing/situations';
import { buildRepairPrompt, buildRestatePrompt, buildWatcherPrompt, parseWatcherAnswer } from './prompt';
import type { Route } from './router';

const route = (over: Partial<Route> = {}): Route => ({ sphere: 'world', facts: [], lessons: [], tried: ['world'], ...over });
const answer = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({ command: 'north', kind: 'move', sphere: 'world', rationale: 'The exit leads north.', confidence: 0.8, ...over });

describe('buildWatcherPrompt', () => {
  it('describes the situation, the sphere and the answer format', () => {
    const prompt = buildWatcherPrompt(makeSituation(), route());
    expect(prompt).toContain('SPHERE: world');
    expect(prompt).toContain('MODE: exploration');
    expect(prompt).toContain('ROOM: Market Square (city), exits: N E');
    expect(prompt).toContain('IN FIGHT: no');
    expect(prompt).toContain('VITALS: hp 90/100, mana 50/60, move 80/90');
    expect(prompt).toContain('> You are standing in a busy square.');
    expect(prompt).toContain('"wrongSphere"');
    expect(prompt).not.toContain('FACTS FROM THE ARCHIVE');
    expect(prompt).not.toContain('RULES THE OWNER TAUGHT');
  });

  it('adds archive facts and accepted lessons when there are any', () => {
    const prompt = buildWatcherPrompt(makeSituation(), route({ facts: ['{"area":"Market"}'], lessons: [makeLesson({ rule: 'Read the board first.' })] }));
    expect(prompt).toContain('FACTS FROM THE ARCHIVE:\n- {"area":"Market"}');
    expect(prompt).toContain('RULES THE OWNER TAUGHT FOR THIS SITUATION:\n- Read the board first.');
  });

  it('copes with an unknown room, unknown vitals, no exits and no text', () => {
    const prompt = buildWatcherPrompt(makeSituation({ lines: [], game: { room: undefined, vitals: undefined, inFight: true } }), route());
    expect(prompt).toContain('ROOM: unknown (unknown), exits: none known');
    expect(prompt).toContain('VITALS: unknown');
    expect(prompt).toContain('IN FIGHT: yes');
    expect(prompt).toContain('> (none)');
    expect(buildWatcherPrompt(makeSituation({ game: { room: { name: 'Hall', sector: 'inside', exits: [] } } }), route())).toContain('exits: none known');
  });
});

describe('buildRepairPrompt', () => {
  it('is the same prompt plus what was wrong', () => {
    const repair = buildRepairPrompt(makeSituation(), route(), 'the answer is not valid JSON');
    expect(repair.startsWith(buildWatcherPrompt(makeSituation(), route()))).toBe(true);
    expect(repair).toContain('Your previous answer was rejected: the answer is not valid JSON');
  });
});

describe('buildRestatePrompt', () => {
  const suggestion = { sphere: 'world', situationKey: 'exploration:hall', command: 'tell Zorvak hi', rationale: 'Greet Zorvak' } as Suggestion;

  it('shows the owner command and why, through the redactor', () => {
    const redact = (t: string): string => t.replace(/Zorvak/g, 'Agate-M');
    const prompt = buildRestatePrompt(suggestion, 'say hi Zorvak', 'Zorvak is far away', redact);
    expect(prompt).toContain('SUGGESTED COMMAND: tell Agate-M hi');
    expect(prompt).toContain('SUGGESTION RATIONALE: Greet Agate-M');
    expect(prompt).toContain('OWNER COMMAND: say hi Agate-M');
    expect(prompt).toContain('OWNER WHY: Agate-M is far away');
    expect(prompt).not.toContain('Zorvak');
    expect(prompt).toContain('SPHERE: world');
    expect(prompt).toContain('"confident"');
  });

  it('says so when the owner gave no reason', () => {
    expect(buildRestatePrompt(suggestion, 'look', undefined, (t) => t)).toContain('OWNER WHY: (none given)');
  });
});

describe('parseWatcherAnswer', () => {
  it('reads a command answer', () => {
    expect(parseWatcherAnswer(answer())).toEqual({ ok: true, kind: 'command', command: 'north', actionKind: 'move', rationale: 'The exit leads north.', confidence: 0.8 });
  });

  it('trims the command, cuts a long rationale, and passes a missing or odd confidence on for the policy to refuse', () => {
    const parsed = parseWatcherAnswer(answer({ command: '  look  ', rationale: 'r'.repeat(900), confidence: undefined }));
    expect(parsed).toMatchObject({ ok: true, kind: 'command', command: 'look', confidence: undefined });
    expect(parsed.ok && parsed.kind === 'command' && parsed.rationale).toHaveLength(500);
  });

  it('reads a wrong-sphere answer', () => {
    expect(parseWatcherAnswer('{"wrongSphere":"things"}')).toEqual({ ok: true, kind: 'wrong-sphere', sphere: 'things' });
  });

  it.each([
    ['not JSON', 'north', 'not valid JSON'],
    ['a JSON array', '[1]', 'not a JSON object'],
    ['JSON null', 'null', 'not a JSON object'],
    ['a JSON string', '"north"', 'not a JSON object'],
    ['an unknown wrongSphere', '{"wrongSphere":"sky"}', 'wrongSphere is not a sphere'],
    ['no command', answer({ command: undefined }), 'command is missing'],
    ['a blank command', answer({ command: '   ' }), 'command is missing'],
    ['a non-string command', answer({ command: 5 }), 'command is missing'],
    ['a long command', answer({ command: 'x'.repeat(201) }), 'command is too long'],
    ['a command with a line break', answer({ command: 'north\nsouth' }), 'control character'],
    ['a command with a control character', answer({ command: 'north\u0007' }), 'control character'],
    ['an unknown kind', answer({ kind: 'dance' }), 'kind is not one of'],
    ['no kind', answer({ kind: undefined }), 'kind is not one of'],
    ['no rationale', answer({ rationale: undefined }), 'rationale is missing'],
    ['a blank rationale', answer({ rationale: '  ' }), 'rationale is missing'],
  ])('rejects %s', (_label, text, problem) => {
    const parsed = parseWatcherAnswer(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.problem).toContain(problem);
  });
});

describe('buildWatcherPrompt and the room hints', () => {
  it('adds the hints for the room, named by the tier that knew them, when there are any', () => {
    const prompt = buildWatcherPrompt(makeSituation(), route({ hints: ['Hint (instant): look fountain | enter orb', 'Hint note: one'] }));
    expect(prompt).toContain('HINTS FOR THIS ROOM (what is worth trying here; the fastest source that knew is named; check before acting):\n- Hint (instant): look fountain | enter orb\n- Hint note: one');
    expect(prompt.indexOf('HINTS FOR THIS ROOM')).toBeLessThan(prompt.indexOf('Answer with ONE JSON object'));
  });

  it('adds nothing when there are no hints (absent or empty)', () => {
    expect(buildWatcherPrompt(makeSituation(), route())).not.toContain('HINTS FOR THIS ROOM');
    expect(buildWatcherPrompt(makeSituation(), route({ hints: [] }))).not.toContain('HINTS FOR THIS ROOM');
  });
});
