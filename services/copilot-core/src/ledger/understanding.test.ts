import { checkUnderstanding } from './understanding';

const suggestion = { command: 'north' };
const good = { rule: 'Open the door before going north.', restatement: 'You want me to open the door first, not walk into it.', confident: true };

describe('checkUnderstanding: a correct restatement passes', () => {
  it('accepts valid JSON that names the verb of the corrected command', () => {
    expect(checkUnderstanding(suggestion, { command: 'open door' }, good)).toEqual({
      ok: true,
      rule: 'Open the door before going north.',
      restatement: 'You want me to open the door first, not walk into it.',
    });
  });

  it('accepts the answer as a JSON string', () => {
    expect(checkUnderstanding(suggestion, { command: 'open door' }, JSON.stringify(good)).ok).toBe(true);
  });

  it('trims the rule and the restatement', () => {
    const result = checkUnderstanding(suggestion, { command: 'open door' }, { ...good, rule: '  trimmed rule  ', restatement: ' open it ' });
    expect(result).toEqual({ ok: true, rule: 'trimmed rule', restatement: 'open it' });
  });

  it('accepts an abbreviation when the restatement spells the verb out, or repeats the abbreviation', () => {
    expect(checkUnderstanding({ command: 'look' }, { command: 'dro sword' }, { ...good, restatement: 'You want me to drop the sword.' }).ok).toBe(true);
    expect(checkUnderstanding({ command: 'look' }, { command: 'dro sword' }, { ...good, restatement: 'dro the sword' }).ok).toBe(true);
  });

  it('for a verb the command table does not know, the restatement must repeat the word as typed', () => {
    expect(checkUnderstanding(suggestion, { command: 'xyzzy room' }, { ...good, restatement: 'Say xyzzy in the room.' }).ok).toBe(true);
    expect(checkUnderstanding(suggestion, { command: 'xyzzy room' }, { ...good, restatement: 'Do the magic word.' }).ok).toBe(false);
  });

  it('matches the verb as a whole word, case-insensitively', () => {
    expect(checkUnderstanding(suggestion, { command: 'OPEN door' }, { ...good, restatement: 'First, Open the door.' }).ok).toBe(true);
    const near = checkUnderstanding(suggestion, { command: 'open door' }, { ...good, restatement: 'Reopen the door and then reopening it.' });
    expect(near.ok).toBe(false);
  });

  it('does not require a verb word when the correction is only punctuation (the say shortcut)', () => {
    expect(checkUnderstanding(suggestion, { command: "'hello" }, { ...good, restatement: 'You want me to greet them.' })).toMatchObject({ ok: true });
    expect(checkUnderstanding(suggestion, { command: ".." }, good).ok).toBe(true);
  });

  it('does not require a verb word for a command with no letters at all, but still needs the rest to be valid', () => {
    expect(checkUnderstanding(suggestion, { command: '!!' }, good).ok).toBe(true);
    expect(checkUnderstanding(suggestion, { command: '!!' }, { ...good, confident: false }).ok).toBe(false);
  });
});

describe('checkUnderstanding: anything else is correction-not-understood', () => {
  const failure = (result: ReturnType<typeof checkUnderstanding>): string[] => {
    expect(result.ok).toBe(false);
    if (result.ok) return [];
    expect(result.ticketReason).toBe('correction-not-understood');
    return result.problems;
  };

  it('fails on JSON that does not parse', () => {
    expect(failure(checkUnderstanding(suggestion, { command: 'open door' }, '{not json'))).toEqual(['the answer is not valid JSON']);
  });

  it('fails on an answer that is not an object', () => {
    for (const bad of [null, undefined, 5, [], '"text"', '[1]', true]) {
      expect(failure(checkUnderstanding(suggestion, { command: 'open door' }, bad))).toEqual(['the answer is not a JSON object']);
    }
  });

  it('fails when the restatement does not mention the verb', () => {
    const problems = failure(checkUnderstanding(suggestion, { command: 'open door' }, { ...good, restatement: 'You want something else entirely.' }));
    expect(problems).toEqual(['the restatement does not mention the verb of the corrected command']);
  });

  it('fails when the rule is missing, empty, blank or too long', () => {
    for (const rule of [undefined, '', '   ', 5, 'x'.repeat(501)]) {
      expect(failure(checkUnderstanding(suggestion, { command: 'open door' }, { ...good, rule }))).toHaveLength(1);
    }
  });

  it('fails when the restatement is missing, empty or too long', () => {
    for (const restatement of [undefined, '', '  ', 7, 'open '.repeat(200)]) {
      expect(failure(checkUnderstanding(suggestion, { command: 'open door' }, { ...good, restatement }))).toHaveLength(1);
    }
  });

  it('fails when the agent is not confident: false, missing or the string "true"', () => {
    for (const confident of [false, undefined, 'true', 1, null]) {
      expect(failure(checkUnderstanding(suggestion, { command: 'open door' }, { ...good, confident }))).toEqual(['the agent is not confident']);
    }
  });

  it('reports every problem at once', () => {
    expect(failure(checkUnderstanding(suggestion, { command: 'open door' }, {}))).toEqual([
      'rule is missing or empty',
      'restatement is missing or empty',
      'the agent is not confident',
    ]);
  });

  it('fails when the owner gave no command, or the same command as the suggestion', () => {
    expect(failure(checkUnderstanding(suggestion, { command: '   ' }, good))).toEqual(['the correction has no command']);
    expect(failure(checkUnderstanding(suggestion, { command: undefined as unknown as string }, good))).toEqual(['the correction has no command']);
    expect(failure(checkUnderstanding(suggestion, { command: '  NORTH ' }, good))).toEqual(['the correction is the same command as the suggestion']);
  });
});
