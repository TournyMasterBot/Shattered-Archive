/**
 * apps/game-client/src/features/chat/chat-probe.test.ts
 */
import { maybeChatFastRange, probeChatRange } from './chat-probe';

function probe(line: string) {
  return probeChatRange(line, 0, line.length);
}

describe('probeChatRange — baseline', () => {
  it('detects an ordinary quoted chat line', () => {
    const line = "Xenophon says 'hello there'";
    const match = probe(line);
    expect(match.isChat).toBe(true);
    if (match.isChat) {
      expect(line.slice(match.messageStart, match.messageEnd)).toBe('hello there');
    }
  });
});

describe('probeChatRange — punctuation-only messages (regression)', () => {
  it('does not drop a message that is just "?"', () => {
    // Reported bug: single-character punctuation messages like '?' were
    // silently dropped before ever reaching the classifier, because the old
    // "cheap sanity" check required at least one alpha character.
    const line = "You OOC clan: '?'";
    expect(maybeChatFastRange(line, 0, line.length)).toBe(true);

    const match = probe(line);
    expect(match.isChat).toBe(true);
    if (match.isChat) {
      expect(line.slice(match.messageStart, match.messageEnd)).toBe('?');
    }
  });

  it('does not drop other punctuation-only messages', () => {
    for (const msg of ['!', '...', ':)', '??']) {
      const line = `Xenophon says '${msg}'`;
      const match = probe(line);
      expect(match.isChat).toBe(true);
      if (match.isChat) {
        expect(line.slice(match.messageStart, match.messageEnd)).toBe(msg);
      }
    }
  });

  it('still rejects an empty quoted message', () => {
    const line = "Xenophon says ''";
    expect(probe(line).isChat).toBe(false);
  });
});
