import { appendChatLine, appendChatRaw, getChatMessages, subscribeChat } from './chat-store';

const BEL = '\u0007';
const ESC = '\u001b';

// The store keeps its list at module level, so each test reads the message it just appended.
function appendAndGetLast(rawText: string, ts?: number, subtype?: Parameters<typeof appendChatLine>[2]) {
  appendChatLine(rawText, ts, subtype);
  const all = getChatMessages();
  return all[all.length - 1];
}

describe('appendChatLine display text', () => {
  it('shows a tell without the BEL character but keeps the raw line as received', () => {
    const raw = `${BEL}Alice tells you 'hi'`;
    const msg = appendAndGetLast(raw, 1000, 'tell');

    expect(msg.html).not.toContain(BEL);
    expect(msg.html).toContain('Alice tells you');
    // audio "beep on bell" and the classifiers read the raw line, so it must keep its BEL
    expect(msg.rawText).toBe(raw);
    expect(msg.rawText).toContain(BEL);
  });

  it('keeps the colour span when a BEL sits inside coloured text (ANSI-01)', () => {
    const msg = appendAndGetLast(`${ESC}[1;33m${BEL}Alice${ESC}[0m tells you 'hi'`, 1000, 'tell');

    expect(msg.html).not.toContain(BEL);
    expect(msg.html).toMatch(/<span style="[^"]*color:/);
    expect(msg.html).toContain('Alice');
  });

  it('drops an OSC title sequence ended by BEL instead of printing its text (ANSI-02)', () => {
    const msg = appendAndGetLast(`${ESC}]0;Window Title${BEL}Alice tells you 'hi'`, 1000, 'tell');

    expect(msg.html).not.toContain('Window Title');
    expect(msg.html).not.toContain(BEL);
    expect(msg.html).toContain('Alice tells you');
    expect(msg.rawText).toContain('Window Title');
  });

  it('leaves a line with no BEL exactly as the converter renders it', () => {
    const msg = appendAndGetLast("Alice says 'hello'", 1000, 'say');

    expect(msg.html).toContain('Alice says');
    expect(msg.rawText).toBe("Alice says 'hello'");
  });

  it('keeps the subtype and timestamp it was given and numbers messages in increasing order', () => {
    const first = appendAndGetLast("Alice tells you 'one'", 111, 'tell');
    const second = appendAndGetLast("Alice tells you 'two'", 222, 'tell');

    expect(first.subtype).toBe('tell');
    expect(first.ts).toBe(111);
    expect(Number(second.id)).toBeGreaterThan(Number(first.id));
  });

  it('notifies subscribers with the cleaned message and stops after unsubscribe', () => {
    const seen: string[] = [];
    const off = subscribeChat((messages) => {
      const last = messages[messages.length - 1];
      if (last) seen.push(last.html);
    });
    seen.length = 0; // subscribeChat calls back once with the current list

    appendChatLine(`${BEL}Bob tells you 'hey'`, 1, 'tell');
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toContain(BEL);

    off();
    appendChatLine(`${BEL}Bob tells you 'again'`, 2, 'tell');
    expect(seen).toHaveLength(1);
  });
});

describe('appendChatLine timestamp and the back-compat wrapper', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stamps a line with the current time when no timestamp is given', () => {
    jest.spyOn(Date, 'now').mockReturnValue(424242);

    const msg = appendAndGetLast("Alice says 'hello'");

    expect(msg.ts).toBe(424242);
  });

  it('appendChatRaw adds a line with no subtype, cleaned for display and kept raw', () => {
    const before = getChatMessages().length;

    appendChatRaw(`${BEL}Alice tells you 'raw'`, 777);

    const all = getChatMessages();
    const msg = all[all.length - 1];
    expect(all).toHaveLength(before + 1);
    expect(msg.subtype).toBeUndefined();
    expect(msg.ts).toBe(777);
    expect(msg.rawText).toContain(BEL);
    expect(msg.html).not.toContain(BEL);
  });
});
