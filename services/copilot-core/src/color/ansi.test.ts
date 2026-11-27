import { ESC, normalizeSgr, rejoinSequences, stripAnsi, tokenizeAnsi } from './ansi';

describe('rejoinSequences', () => {
  it('rejoins an escape sequence cut by a CRLF before its final byte (C1)', () => {
    expect(rejoinSequences(`a${ESC}[1;31\r\nmb`)).toBe(`a${ESC}[1;31mb`);
  });

  it('rejoins a sequence cut more than once', () => {
    expect(rejoinSequences(`${ESC}[1;\r\n31\nm`)).toBe(`${ESC}[1;31m`);
  });

  it('leaves complete sequences and ordinary line breaks alone', () => {
    const text = `line one\r\n${ESC}[0;37mgrey${ESC}[0m\r\nline [two]`;
    expect(rejoinSequences(text)).toBe(text);
  });

  it('does not eat text that follows a line break after a finished sequence', () => {
    expect(rejoinSequences(`${ESC}[0m\r\nmore`)).toBe(`${ESC}[0m\r\nmore`);
  });
});

describe('stripAnsi', () => {
  it('removes colour and cursor sequences and keeps the text', () => {
    expect(stripAnsi(`${ESC}[1;30mdark${ESC}[0m ${ESC}[2K${ESC}[38;5;61mx${ESC}[0m`)).toBe('dark x');
  });

  it('removes a wrapped sequence completely', () => {
    expect(stripAnsi(`a${ESC}[0;3\r\n7mb`)).toBe('ab');
  });

  it('returns plain text unchanged', () => {
    expect(stripAnsi('plain [text]')).toBe('plain [text]');
  });
});

describe('tokenizeAnsi', () => {
  it('splits text and sequences in order', () => {
    expect(tokenizeAnsi(`a${ESC}[1;30mb${ESC}[0m`)).toEqual([
      { type: 'text', text: 'a' },
      { type: 'csi', params: '1;30', final: 'm', raw: `${ESC}[1;30m` },
      { type: 'text', text: 'b' },
      { type: 'csi', params: '0', final: 'm', raw: `${ESC}[0m` },
    ]);
  });

  it('returns a single text token for plain text and nothing for empty input', () => {
    expect(tokenizeAnsi('hello')).toEqual([{ type: 'text', text: 'hello' }]);
    expect(tokenizeAnsi('')).toEqual([]);
  });

  it('reports non-colour sequences with their final byte', () => {
    expect(tokenizeAnsi(`${ESC}[2K`)).toEqual([{ type: 'csi', params: '2', final: 'K', raw: `${ESC}[2K` }]);
  });
});

describe('normalizeSgr', () => {
  it('treats an empty list as reset', () => {
    expect(normalizeSgr('')).toEqual([0]);
  });

  it('drops leading zeros and keeps extended-colour groups in order', () => {
    expect(normalizeSgr('01;31')).toEqual([1, 31]);
    expect(normalizeSgr('38;5;208')).toEqual([38, 5, 208]);
  });

  it('reads an empty parameter as 0', () => {
    expect(normalizeSgr('1;;31')).toEqual([1, 0, 31]);
  });

  it('returns null for a non-numeric parameter so the caller flags it', () => {
    expect(normalizeSgr('1;x')).toBeNull();
    expect(normalizeSgr('?25')).toBeNull();
  });
});
