import { escapeStringLiteral } from './escape-string-literal.js';

describe('escapeStringLiteral (codegen string-literal escaping)', () => {
  it('escapes single quotes', () => {
    expect(escapeStringLiteral("O'Malley")).toBe("'O\\'Malley'");
  });

  it('escapes a lone trailing backslash so the literal actually closes', () => {
    // Regression for the incomplete-escaping bug: without backslash escaping,
    // `abc\` became `'abc\'` — the trailing `\'` reads as an ESCAPED quote,
    // not a closing one, so eval-ing the emitted literal would swallow
    // whatever source follows it instead of producing the string `abc\`.
    const emitted = escapeStringLiteral('abc\\');
    // eslint-disable-next-line no-eval
    expect(eval(emitted)).toBe('abc\\');
  });

  it('round-trips a value containing both backslashes and quotes', () => {
    const value = String.raw`a\b'c\'d`;
    const emitted = escapeStringLiteral(value);
    // eslint-disable-next-line no-eval
    expect(eval(emitted)).toBe(value);
  });

  it('leaves a plain string unchanged aside from quoting', () => {
    expect(escapeStringLiteral('plain')).toBe("'plain'");
  });
});
