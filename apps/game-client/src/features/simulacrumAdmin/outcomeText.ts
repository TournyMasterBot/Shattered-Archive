import type { RunOutcome } from './sender';

export type Tone = 'accepted' | 'refused' | 'unknown' | 'info';

export interface OutcomeText {
  tone: Tone;
  text: string;
  lines: string[];
}

/** The one place a run's outcome becomes words for the owner: the game's own refusal is named as such, never shown as done (ADMIN-03). */
export function describeOutcome(outcome: RunOutcome): OutcomeText {
  switch (outcome.status) {
    case 'inactive':
      return { tone: 'info', text: 'Not connected to the simulacrum: nothing was sent.', lines: [] };
    case 'invalid':
      return { tone: 'info', text: `Not sent: ${outcome.error.message}`, lines: [] };
    case 'declined':
      return { tone: 'info', text: 'Cancelled: nothing was sent.', lines: [] };
    case 'sent': {
      const { verdict, reason, replyLines } = outcome.entry;
      if (verdict === 'refused') return { tone: 'refused', text: `Refused by the game${reason ? ` (${reason})` : ''}`, lines: replyLines };
      if (verdict === 'accepted') return { tone: 'accepted', text: 'Done: the game answered as expected', lines: replyLines };
      return { tone: 'unknown', text: 'No recognised answer from the game (unknown)', lines: replyLines };
    }
  }
}
