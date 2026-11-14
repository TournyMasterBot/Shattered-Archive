import { describeOutcome } from './outcomeText';
import type { RunOutcome } from './sender';
import type { ActivityEntry } from './activityLog';

const entry = (over: Partial<ActivityEntry>): ActivityEntry => ({
  id: 1,
  at: '2026-11-13T10:00:00.000Z',
  line: 'stat Testchar',
  verdict: 'accepted',
  replyLines: [],
  rawReply: '',
  ...over,
});
const sent = (over: Partial<ActivityEntry>): RunOutcome => ({ status: 'sent', entry: entry(over) });

describe('describeOutcome: words for a run, from the game’s verdict (ADMIN-03)', () => {
  it('says nothing was sent when not connected', () => {
    expect(describeOutcome({ status: 'inactive' })).toEqual({
      tone: 'info',
      text: 'Not connected to the simulacrum: nothing was sent.',
      lines: [],
    });
  });

  it('says why an invalid value was not sent, with the builder’s own message', () => {
    expect(describeOutcome({ status: 'invalid', error: { field: 'target', message: 'One word only, no spaces.' } })).toEqual({
      tone: 'info',
      text: 'Not sent: One word only, no spaces.',
      lines: [],
    });
  });

  it('says a declined confirmation sent nothing', () => {
    expect(describeOutcome({ status: 'declined' })).toEqual({ tone: 'info', text: 'Cancelled: nothing was sent.', lines: [] });
  });

  it('names the game’s refusal and its deciding line, and keeps the reply lines', () => {
    expect(describeOutcome(sent({ verdict: 'refused', reason: 'No such location.', replyLines: ['No such location.'] }))).toEqual({
      tone: 'refused',
      text: 'Refused by the game (No such location.)',
      lines: ['No such location.'],
    });
  });

  it('still reads as refused when no line decided it', () => {
    expect(describeOutcome(sent({ verdict: 'refused' }))).toEqual({ tone: 'refused', text: 'Refused by the game', lines: [] });
  });

  it('reads an accepted verdict as done, with the reply lines', () => {
    expect(describeOutcome(sent({ verdict: 'accepted', reason: 'Ok.', replyLines: ['Ok.'] }))).toEqual({
      tone: 'accepted',
      text: 'Done: the game answered as expected',
      lines: ['Ok.'],
    });
  });

  it('never calls an unrecognised or missing reply done', () => {
    const unknown = describeOutcome(sent({ verdict: 'unknown', replyLines: ['Something odd.'] }));
    expect(unknown).toEqual({ tone: 'unknown', text: 'No recognised answer from the game (unknown)', lines: ['Something odd.'] });
    expect(unknown.text).not.toMatch(/Done/);
  });
});
