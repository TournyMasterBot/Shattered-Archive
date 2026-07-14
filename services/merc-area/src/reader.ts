/**
 * Character-level reader that mirrors the fread_* primitives of merc-mud's db.c
 * (fread_letter / fread_number / fread_flag / fread_string / fread_string_eol /
 * fread_word / fread_to_eol) exactly, so any file db.c can boot, this can parse —
 * and vice versa. Reference: merc-mud/2.4/src/db.c lines ~2096-2492.
 *
 * Unlike db.c, errors NEVER exit the process: every failure throws a ParseError
 * carrying the 1-based line number, and callers report it to the invoker.
 */

const WS = new Set([' ', '\t', '\n', '\r', '\f', '\v']);

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
  ) {
    super(`line ${line}: ${message}`);
    this.name = 'ParseError';
  }
}

/** db.c flag_convert: 'A'=1 … 'Z'=2^25, 'a'=2^26 … 'z'=2^51. */
export function flagConvert(letter: string): number {
  const c = letter.charCodeAt(0);
  if (c >= 65 && c <= 90) return 2 ** (c - 65); // 'A'..'Z'
  if (c >= 97 && c <= 122) return 67108864 * 2 ** (c - 97); // 'a'..'z'
  return 0;
}

export class Reader {
  private i = 0;

  constructor(private readonly text: string) {}

  /** 1-based line number of the current position (computed lazily for errors). */
  currentLine(): number {
    let line = 1;
    const end = Math.min(this.i, this.text.length);
    for (let k = 0; k < end; k++) if (this.text[k] === '\n') line++;
    return line;
  }

  fail(message: string): never {
    throw new ParseError(message, this.currentLine());
  }

  /** True when nothing but whitespace remains. */
  atEof(): boolean {
    for (let k = this.i; k < this.text.length; k++) {
      if (!WS.has(this.text[k])) return false;
    }
    return true;
  }

  private skipWs(): void {
    while (this.i < this.text.length && WS.has(this.text[this.i])) this.i++;
  }

  /** fread_letter: skip whitespace, return next char. */
  letter(): string {
    this.skipWs();
    if (this.i >= this.text.length) this.fail('unexpected end of file (expected a letter)');
    return this.text[this.i++];
  }

  /** Like letter() but does not consume (parser uses save/restore where db.c uses ungetc). */
  peekLetter(): string {
    const save = this.i;
    const c = this.letter();
    this.i = save;
    return c;
  }

  /** fread_number: optional +/-, digits, `|` chains additional numbers. */
  number(): number {
    this.skipWs();
    let c = this.text[this.i];
    if (c === undefined) this.fail('unexpected end of file (expected a number)');
    let sign = false;
    if (c === '+') {
      this.i++;
    } else if (c === '-') {
      sign = true;
      this.i++;
    }
    c = this.text[this.i];
    if (c === undefined || c < '0' || c > '9') {
      this.fail(`bad number format (got ${c === undefined ? 'EOF' : JSON.stringify(c)})`);
    }
    let n = 0;
    while (c !== undefined && c >= '0' && c <= '9') {
      n = n * 10 + (c.charCodeAt(0) - 48);
      this.i++;
      c = this.text[this.i];
    }
    if (sign) n = -n;
    if (c === '|') {
      this.i++;
      n += this.number();
    }
    return n;
  }

  /** fread_flag: optional '-', letter-bits and/or digits, `|` chains. */
  flag(): number {
    this.skipWs();
    let c = this.text[this.i];
    if (c === undefined) this.fail('unexpected end of file (expected a flag)');
    let negative = false;
    if (c === '-') {
      negative = true;
      this.i++;
      c = this.text[this.i];
    }
    let n = 0;
    if (c === undefined || c < '0' || c > '9') {
      while (c !== undefined && ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z'))) {
        n += flagConvert(c);
        this.i++;
        c = this.text[this.i];
      }
    }
    while (c !== undefined && c >= '0' && c <= '9') {
      n = n * 10 + (c.charCodeAt(0) - 48);
      this.i++;
      c = this.text[this.i];
    }
    if (c === '|') {
      this.i++;
      n += this.flag();
    }
    return negative ? -n : n;
  }

  /**
   * fread_string: skip leading whitespace, read until '~'. '\r' is dropped,
   * '\n' preserved. A leading '~' yields the empty string.
   */
  string(): string {
    this.skipWs();
    if (this.i >= this.text.length) this.fail('unexpected end of file (expected a ~string)');
    if (this.text[this.i] === '~') {
      this.i++;
      return '';
    }
    let out = '';
    for (;;) {
      const c = this.text[this.i];
      if (c === undefined) this.fail('unexpected end of file inside ~string');
      this.i++;
      if (c === '~') return out;
      if (c === '\r') continue;
      out += c;
    }
  }

  /** fread_string_eol: skip leading whitespace, read to end of line. */
  stringEol(): string {
    this.skipWs();
    if (this.i >= this.text.length) this.fail('unexpected end of file (expected a line)');
    let out = '';
    for (;;) {
      const c = this.text[this.i];
      if (c === undefined || c === '\n' || c === '\r') return out;
      this.i++;
      out += c;
    }
  }

  /** fread_word: quoted ('/") reads to the closing quote; bare reads to whitespace. */
  word(): string {
    this.skipWs();
    if (this.i >= this.text.length) this.fail('unexpected end of file (expected a word)');
    const first = this.text[this.i];
    if (first === "'" || first === '"') {
      this.i++;
      let out = '';
      for (;;) {
        const c = this.text[this.i];
        if (c === undefined) this.fail('unexpected end of file inside quoted word');
        this.i++;
        if (c === first) return out;
        out += c;
      }
    }
    let out = '';
    for (;;) {
      const c = this.text[this.i];
      if (c === undefined || WS.has(c)) return out;
      this.i++;
      out += c;
    }
  }

  /**
   * fread_to_eol, preserving the skipped text: returns the rest of the current
   * line (trimmed) and consumes the trailing newline run, so line-tail comments
   * in RESETS/SHOPS/SPECIALS survive a round trip.
   */
  restOfLine(): string {
    let out = '';
    while (this.i < this.text.length && this.text[this.i] !== '\n' && this.text[this.i] !== '\r') {
      out += this.text[this.i];
      this.i++;
    }
    while (this.i < this.text.length && (this.text[this.i] === '\n' || this.text[this.i] === '\r')) {
      this.i++;
    }
    return out.trim();
  }
}
