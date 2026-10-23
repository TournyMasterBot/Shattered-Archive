// apps/dsl-color-preview/src/ansi.ts

/**
 * ANSI helpers for .txt files that hold raw game output (real `ESC[...m`
 * sequences, e.g. the GameLog-*.txt captures) instead of DSL `{X` markup.
 *
 * - ansiToHtml: SGR -> HTML spans. Hand-synced copy of
 *   apps/dsl-log-preview/src/ansiToHtml.ts (a VSIX bundles its own code, so it
 *   cannot import across the workspace); same palette as renderDslToHtml.ts and
 *   same true-black-renders-as-gray / simplified reverse-video treatment.
 * - dslToAnsi: hand-synced copy of
 *   apps/game-client/src/features/chat/dsl-to-ansi.ts, used by "Copy as ANSI".
 * - stripAnsi: drops every CSI sequence, used by "Copy as Plain Text".
 *
 * Handled SGR codes: reset(0), bold(1)/not(22), underline(4)/not(24),
 * reverse(7)/not(27), fg 30-37, bright fg 90-97, default fg(39), 256-colour fg
 * (38;5;N). Anything else (backgrounds, blink, ...) is ignored.
 */

const TRUE_BLACK_GRAY = '#4a4a4a';

// ANSI order: black, red, green, yellow, blue, magenta, cyan, white.
const NORMAL_FG = [TRUE_BLACK_GRAY, '#c0392b', '#27ae60', '#f1c40f', '#2980b9', '#8e44ad', '#16a085', '#bdbdbd'];
const BRIGHT_FG = [TRUE_BLACK_GRAY, '#ff6b6b', '#6bff95', '#fff176', '#6bbcff', '#d07cff', '#5fffe3', '#ffffff'];

// Any CSI sequence: ESC [ <params> <intermediates> <final byte>. CR/LF are
// tolerated inside it because the captured GameLog-*.txt files wrap lines in the
// middle of a sequence ("ESC[1;31<CRLF>m", "ESC<CRLF>[0m"); the line break
// itself is kept (see lineBreaks) so the log's layout survives.
const CSI_SRC = '\\u001b[\\r\\n]*\\[([0-?\\r\\n]*)[ -/]*([@-~])';
const CSI_RE = new RegExp(CSI_SRC, 'g');
const CSI_AT = new RegExp(CSI_SRC, 'y');

const lineBreaks = (s: string): string => s.replace(/[^\r\n]/g, '');

export function containsAnsi(text: string): boolean {
  return /\u001b[\r\n]*\[/.test(text);
}

/** Removes every CSI sequence (and any stray ESC), keeping wrapped line breaks. */
export function stripAnsi(text: string): string {
  return text.replace(CSI_RE, lineBreaks).replace(/\u001b/g, '');
}

function xterm256ToHex(n: number): string {
  if (n >= 0 && n < 8) return NORMAL_FG[n];
  if (n >= 8 && n < 16) return BRIGHT_FG[n - 8];

  if (n >= 16 && n <= 231) {
    const i = n - 16;
    const level = (c: number) => (c === 0 ? 0 : 55 + c * 40);
    const rr = level(Math.floor(i / 36));
    const gg = level(Math.floor((i % 36) / 6));
    const bb = level(i % 6);
    if (rr === 0 && gg === 0 && bb === 0) return TRUE_BLACK_GRAY;
    const hex = (v: number) => v.toString(16).padStart(2, '0');
    return `#${hex(rr)}${hex(gg)}${hex(bb)}`;
  }

  // 232-255: grayscale ramp (8..238, never literal black)
  const gray = 8 + (Math.min(n, 255) - 232) * 10;
  return `#${gray.toString(16).padStart(2, '0').repeat(3)}`;
}

export function ansiToHtml(input: string): string {
  if (!input) return '';

  let out = '';
  let i = 0;

  // `bold` doubles as "use the bright variant": in this game 1;3X is the
  // light colour ({R vs {r), not a font-weight change.
  let base: number | null = null; // 0-7 into NORMAL_FG/BRIGHT_FG
  let extFg: string | null = null; // resolved hex from a 38;5;N code
  let bold = false;
  let underline = false;
  let reverse = false;
  let spanOpen = false;

  function currentFg(): string | null {
    if (extFg) return extFg;
    if (base === null) return null;
    return bold ? BRIGHT_FG[base] : NORMAL_FG[base];
  }

  function closeSpan() {
    if (spanOpen) {
      out += '</span>';
      spanOpen = false;
    }
  }

  function openSpan() {
    const styles: string[] = [];
    const fg = currentFg();

    if (reverse) {
      styles.push('background: currentColor');
      styles.push(`color: ${TRUE_BLACK_GRAY}`);
    } else if (fg) {
      styles.push(`color: ${fg}`);
    }

    if (underline) styles.push('text-decoration: underline');

    if (styles.length > 0) {
      out += `<span style="${styles.join('; ')}">`;
      spanOpen = true;
    }
  }

  function applySgr(codesStr: string) {
    const codes = codesStr.length === 0 ? [0] : codesStr.split(';').map((c) => (c === '' ? 0 : Number(c)));

    for (let k = 0; k < codes.length; k++) {
      const code = codes[k];

      if (code === 0) {
        base = null;
        extFg = null;
        bold = false;
        underline = false;
        reverse = false;
      } else if (code === 1) {
        bold = true;
      } else if (code === 22) {
        bold = false;
      } else if (code === 4) {
        underline = true;
      } else if (code === 24) {
        underline = false;
      } else if (code === 7) {
        reverse = true;
      } else if (code === 27) {
        reverse = false;
      } else if (code === 39) {
        base = null;
        extFg = null;
      } else if (code >= 30 && code <= 37) {
        base = code - 30;
        extFg = null;
      } else if (code >= 90 && code <= 97) {
        base = code - 90;
        bold = true;
        extFg = null;
      } else if (code === 38 && codes[k + 1] === 5 && codes[k + 2] !== undefined) {
        extFg = xterm256ToHex(codes[k + 2]);
        base = null;
        k += 2;
      }
    }
  }

  while (i < input.length) {
    const ch = input[i];

    if (ch === '\u001b') {
      CSI_AT.lastIndex = i;
      const m = CSI_AT.exec(input);
      if (m) {
        const params = m[1].replace(/[\r\n]/g, '');
        if (m[2] === 'm' && /^[0-9;]*$/.test(params)) {
          applySgr(params);
          closeSpan();
          openSpan();
        }
        // Any other CSI sequence (cursor movement, ...) is skipped silently.
        out += lineBreaks(m[0]);
        i += m[0].length;
      } else {
        i++; // stray ESC that does not start a sequence
      }
      continue;
    }

    out += escapeHtml(ch);
    i++;
  }

  closeSpan();
  return out;
}

function escapeHtml(ch: string): string {
  switch (ch) {
    case '&':
      return '&amp;';
    case '<':
      return '&lt;';
    case '>':
      return '&gt;';
    default:
      return ch;
  }
}

/* ----------------------------------------------------------
   DSL -> ANSI (no auto-reset; {x clears) — mirrors game-client
---------------------------------------------------------- */

const DSL_ANSI_COLORS: Record<string, string> = {
  '{r': '\u001b[31m',
  '{R': '\u001b[91m',
  '{g': '\u001b[32m',
  '{G': '\u001b[92m',
  '{y': '\u001b[33m',
  '{Y': '\u001b[93m',
  '{b': '\u001b[34m',
  '{B': '\u001b[94m',
  '{m': '\u001b[35m',
  '{M': '\u001b[95m',
  '{c': '\u001b[36m',
  '{C': '\u001b[96m',
  '{D': '\u001b[30m',
  '{w': '\u001b[37m',
  '{W': '\u001b[97m',
  '{o': '\u001b[38;5;208m',
  '{n': '\u001b[38;5;130m',
  '{p': '\u001b[38;5;213m',
  '{u': '\u001b[38;5;141m',
};

export function dslToAnsi(input: string): string {
  if (!input) return '';

  let out = '';
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === '{' && i + 1 < input.length) {
      if (input[i + 1] === '{') {
        out += '{';
        i += 2;
        continue;
      }

      const code = input.slice(i, i + 2);
      const fixed =
        code === '{x' ? '\u001b[0m' : code === '{!' ? '🔔' : code === '{-' ? '~' : code === '{&' ? '\u001b[7m' : code === '{_' ? '\u001b[4m' : DSL_ANSI_COLORS[code];

      if (fixed !== undefined) {
        out += fixed;
        i += 2;
        continue;
      }
    }

    out += ch;
    i++;
  }

  return out;
}
