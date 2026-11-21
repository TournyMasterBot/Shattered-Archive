import { isOwnChatLine, stripChatDisplayText } from './chat-display-text';

const BEL = '\u0007';
const ESC = '\u001b';

describe('stripChatDisplayText', () => {
  it('removes the BEL that arrives before a speaker name', () => {
    expect(stripChatDisplayText(`${BEL}Alice tells you 'hi'`)).toBe("Alice tells you 'hi'");
  });

  it('removes every BEL when there are several, wherever they sit', () => {
    expect(stripChatDisplayText(`${BEL}Alice${BEL} tells you${BEL} 'hi'${BEL}`)).toBe("Alice tells you 'hi'");
  });

  it('turns a line that is only BEL into an empty string', () => {
    expect(stripChatDisplayText(`${BEL}${BEL}`)).toBe('');
  });

  it('removes an OSC title sequence ended by BEL together with its terminator (ANSI-02)', () => {
    expect(stripChatDisplayText(`${ESC}]0;Some Title${BEL}Hello`)).toBe('Hello');
  });

  it('removes an OSC sequence ended by ST (ESC backslash) (ANSI-02)', () => {
    expect(stripChatDisplayText(`${ESC}]0;Some Title${ESC}\\Hello`)).toBe('Hello');
  });

  it('handles an OSC sequence and a stray BEL in the same line', () => {
    expect(stripChatDisplayText(`${BEL}${ESC}]0;Title${BEL}Alice tells you 'hi'`)).toBe("Alice tells you 'hi'");
  });

  it('leaves colour codes untouched so the converter can still colour the text (ANSI-01)', () => {
    const colored = `${ESC}[1;33m${BEL}Alice${ESC}[0m tells you 'hi'`;
    expect(stripChatDisplayText(colored)).toBe(`${ESC}[1;33mAlice${ESC}[0m tells you 'hi'`);
  });

  it('returns a line with no BEL and no OSC unchanged', () => {
    const line = `${ESC}[32mAlice${ESC}[0m tells you 'hi'`;
    expect(stripChatDisplayText(line)).toBe(line);
  });

  it('returns an empty string for an empty string', () => {
    expect(stripChatDisplayText('')).toBe('');
  });

  it('leaves an OSC sequence that has no terminator alone, and still removes a BEL elsewhere', () => {
    expect(stripChatDisplayText(`${ESC}]0;Title`)).toBe(`${ESC}]0;Title`);
    expect(stripChatDisplayText(`${BEL}${ESC}]0;Title`)).toBe(`${ESC}]0;Title`);
  });
});

describe('isOwnChatLine', () => {
  it.each([
    ["You tell Bob 'hi'"],
    ["You say 'hi'"],
    ["You gossip 'hi'"],
    ["  You clan 'hi'"],
    [`${BEL}You gossip 'hi'`],
    [`${ESC}[1;33mYou clan 'hi'${ESC}[0m`],
  ])('is true for your own line %j', (line) => {
    expect(isOwnChatLine(line)).toBe(true);
  });

  it.each([
    ["Alice tells you 'hi'"],
    ["Youtube tells you 'hi'"],
    ["Your pet tells you 'hi'"],
    [`${BEL}Alice tells you 'hi'`],
    [''],
  ])('is false for an incoming or unrelated line %j', (line) => {
    expect(isOwnChatLine(line)).toBe(false);
  });
});
