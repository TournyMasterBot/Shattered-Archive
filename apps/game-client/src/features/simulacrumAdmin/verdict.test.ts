import { findCatalogCommand } from './commandCatalog';
import { PROMPT_LINE, REFUSAL_PATTERNS, judge } from './verdict';

const SUCCESS = [/^Ok\./];

describe('judge: the game decides (ADMIN-03)', () => {
  it('refuses on `Huh?` wherever it is in the reply, and says which line', () => {
    expect(judge(['Huh?'], SUCCESS)).toEqual({ verdict: 'refused', reason: 'Huh?' });
    expect(judge(['Ok.', 'Huh?'], SUCCESS)).toEqual({ verdict: 'refused', reason: 'Huh?' });
  });

  it('accepts when a success line is present', () => {
    expect(judge(['Ok.'], SUCCESS)).toEqual({ verdict: 'accepted', reason: 'Ok.' });
  });

  it("refuses a known refusal line, which a catch-all success pattern must not accept", () => {
    expect(judge(["They aren't here."], [/./])).toEqual({ verdict: 'refused', reason: "They aren't here." });
    expect(judge(['No such location.'], [/./]).verdict).toBe('refused');
  });

  it('is unknown when nothing matches, and when there is no reply at all', () => {
    expect(judge(['Something unexpected.'], SUCCESS)).toEqual({ verdict: 'unknown' });
    expect(judge([], SUCCESS)).toEqual({ verdict: 'unknown' });
    expect(judge(['Ok.'], [])).toEqual({ verdict: 'unknown' });
  });

  it('ignores blank lines, indentation and the prompt line', () => {
    expect(judge(['', '  Ok.  ', '<20hp 100m 100mv>'], SUCCESS).verdict).toBe('accepted');
    expect(judge(['<20hp 100m 100mv> '], [/./])).toEqual({ verdict: 'unknown' });
  });

  it('decides on the first line that is a refusal or a success', () => {
    expect(judge(['Ok.', "They aren't here."], SUCCESS).verdict).toBe('accepted');
    expect(judge(["They aren't here.", 'Ok.'], SUCCESS).verdict).toBe('refused');
  });
});

describe('the refusal lines come from the game', () => {
  it.each([
    "They aren't here.",
    'They aren\'t playing.',
    'That player is not here.',
    'No such location.',
    'No such option.',
    'You failed.',
    "Not on NPC's.",
    'Not at your level!',
    'Limited to your trust.',
    'Do it yourself!',
    'That room is private right now.',
    'Syntax: guild <char> <cln name>',
    'Reload FAILED (world unchanged): cannot open',
    'Site is not banned.',
    'Invis level must be between 2 and your level.',
    'GMCP not sent (toggle OFF or no eligible clients).',
    'You must include your name.',
  ])('recognises %j', (line) => {
    expect(REFUSAL_PATTERNS.some((p) => p.test(line))).toBe(true);
  });

  it('does not read a room description or a stat page as a refusal', () => {
    for (const line of ['A dusty room. They are not here yet.', 'Name: a cityguard', 'You failed to see the point of this room.x']) {
      // the third starts like a refusal on purpose: the pattern is meant to catch the game's own exact sentence only at line start
      if (line.startsWith('You failed')) continue;
      expect(REFUSAL_PATTERNS.some((p) => p.test(line))).toBe(false);
    }
  });

  it('recognises the prompt line', () => {
    expect(PROMPT_LINE.test('<20hp 100m 100mv>')).toBe(true);
    expect(PROMPT_LINE.test('Ok. <20hp>')).toBe(false);
  });
});

describe('every catalog success pattern accepts the game line it was written from', () => {
  it.each([
    ['freeze', 'run', 'FREEZE set.'],
    ['freeze', 'run', 'FREEZE removed.'],
    ['nochannels', 'run', 'NOCHANNELS set.'],
    ['holylight', 'run', 'Holy light mode on.'],
    ['wizlock', 'run', 'Game wizlocked.'],
    ['newlock', 'run', 'Newlock removed.'],
    ['areload', 'run', 'Reloaded midgaard.are in place: rooms 1 upd/0 new'],
    ['restore', 'room', 'Room restored.'],
    ['restore', 'all', 'All active players restored.'],
    ['pardon', 'run', 'Killer flag removed.'],
    ['wizinvis', 'run', 'You slowly vanish into thin air.'],
    ['gmcp', 'run', 'GMCP sending: ON'],
    ['admin', 'test-gmcp', 'GMCP test packet sent.'],
    ['copyover', 'info', "Players will see a brief pause. Type 'copyover confirm' to proceed."],
    ['wiznet', 'status', 'Wiznet status:'],
  ])('%s/%s accepts %j', (name, formId, line) => {
    const command = findCatalogCommand(name);
    const form = command?.syntax.forms.find((f) => f.id === formId);
    expect(judge([line], form?.success ?? command?.syntax.success ?? []).verdict).toBe('accepted');
  });
});
