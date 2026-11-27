import type { ChatMessage } from './chat-store';
import type { ChatSubtype } from './chat-settings-store';
import { summarizeMessages, unreadSubtypes } from './chat-unread';

let nextTs = 1;
function msg(id: number | string, subtype: ChatSubtype | undefined, rawText = "Alice tells you 'hi'"): ChatMessage {
  return { id: String(id), html: rawText, rawText, ts: nextTs++, subtype };
}

describe('summarizeMessages', () => {
  it('returns zeros for an empty list', () => {
    const s = summarizeMessages([]);

    expect(s.counts).toEqual({});
    expect(s.lastIds).toEqual({});
    expect(s.latestId).toBe(0);
  });

  it('gives the same per-subtype counts as counting by hand, in one pass over a mixed list', () => {
    const list = [
      msg(1, 'tell'),
      msg(2, 'gossip', "Bob gossips 'x'"),
      msg(3, 'tell'),
      msg(4, undefined, 'Carol says something with no channel'),
      msg(5, 'tell', "You tell Alice 'hi'"),
    ];
    const byHand: Record<string, number> = {};
    for (const m of list) if (m.subtype) byHand[m.subtype] = (byHand[m.subtype] ?? 0) + 1;

    expect(summarizeMessages(list).counts).toEqual(byHand);
    expect(summarizeMessages(list).counts).toEqual({ tell: 3, gossip: 1 });
  });

  it('records the newest id per subtype and skips your own lines for it', () => {
    const s = summarizeMessages([
      msg(1, 'tell'),
      msg(2, 'tell', "You tell Alice 'my reply'"),
      msg(3, 'gossip', "Bob gossips 'x'"),
      msg(4, 'gossip', "You gossip 'my own'"),
    ]);

    expect(s.lastIds).toEqual({ tell: 1, gossip: 3 });
  });

  it('counts your own line for pane visibility even though it is not a new message', () => {
    const s = summarizeMessages([msg(1, 'clan', "You clan 'hello'")]);

    expect(s.counts).toEqual({ clan: 1 });
    expect(s.lastIds).toEqual({});
  });

  it('takes latestId from any message, own lines and messages without a subtype included', () => {
    const s = summarizeMessages([msg(2, 'tell'), msg(9, undefined), msg(7, 'tell', "You tell Alice 'x'")]);

    expect(s.latestId).toBe(9);
  });

  it('compares ids as numbers, not as text (10 is newer than 9)', () => {
    const s = summarizeMessages([msg(9, 'tell'), msg(10, 'tell')]);

    expect(s.lastIds.tell).toBe(10);
  });

  it('takes the highest id for a pane whatever order the list is in', () => {
    const s = summarizeMessages([msg(5, 'tell'), msg(3, 'tell'), msg(4, 'tell')]);

    expect(s.lastIds.tell).toBe(5);
  });

  it('counts a message whose id is not a number but never lets it count as newer', () => {
    const s = summarizeMessages([msg(3, 'tell'), msg('abc', 'tell')]);

    expect(s.counts).toEqual({ tell: 2 });
    expect(s.lastIds).toEqual({ tell: 3 });
    expect(s.latestId).toBe(3);
  });
});

describe('unreadSubtypes', () => {
  it('has nothing unread when the newest message is at the baseline (history)', () => {
    expect(unreadSubtypes({ lastIds: { tell: 5 }, seen: {}, baseline: 5 })).toEqual(new Set());
  });

  it('marks a pane unread when its newest message is above the baseline and not seen', () => {
    expect(unreadSubtypes({ lastIds: { tell: 6 }, seen: {}, baseline: 5 })).toEqual(new Set(['tell']));
  });

  it('is not unread once the pane has been seen up to its newest message', () => {
    expect(unreadSubtypes({ lastIds: { tell: 8 }, seen: { tell: 8 }, baseline: 5 })).toEqual(new Set());
  });

  it('is unread again when a message arrives after the pane was last seen', () => {
    expect(unreadSubtypes({ lastIds: { tell: 9 }, seen: { tell: 8 }, baseline: 5 })).toEqual(new Set(['tell']));
  });

  it('uses the baseline when it is higher than what was seen', () => {
    expect(unreadSubtypes({ lastIds: { tell: 6 }, seen: { tell: 2 }, baseline: 7 })).toEqual(new Set());
  });

  it('judges each pane on its own', () => {
    const unread = unreadSubtypes({
      lastIds: { tell: 9, gossip: 7, clan: 6 },
      seen: { tell: 9, gossip: 3 },
      baseline: 6,
    });

    expect(unread).toEqual(new Set(['gossip']));
  });

  it('has nothing unread when there are no messages', () => {
    expect(unreadSubtypes({ lastIds: {}, seen: {}, baseline: 0 })).toEqual(new Set());
  });
});
