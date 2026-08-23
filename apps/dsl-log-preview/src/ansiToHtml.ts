// apps/dsl-log-preview/src/ansiToHtml.ts

/**
 * ANSI SGR (`\x1b[...m`) → HTML span renderer for raw game-server log text.
 *
 * Palette values are copied from apps/dsl-color-preview's DSL color table
 * (BASE_COLORS), cross-checked against game-client's dsl-to-ansi.ts — that
 * file maps the MUD's own {r {R {g {G ... markup onto these exact SGR codes
 * (31/91/32/92/...), so a real "raw" log record and a DSL-marked-up string
 * are two encodings of the same 16-color palette. Kept as literal hex
 * constants rather than an import: a VSIX bundles its own dist/extension.js,
 * so this package can't reach across the workspace at runtime.
 *
 * Same true-black handling as dsl-color-preview, for the same reason: pure
 * black text is invisible against this preview's near-black background, so
 * black (SGR 30/90, or an xterm-256 code that resolves to (0,0,0)) renders as
 * a visible gray instead. Reverse video (SGR 7) also matches that plugin's
 * treatment — a solid gray block rather than trying to swap in the actual
 * current color, which is a simplification inherited from game-client's
 * original DSL renderer, not something specific to ANSI.
 *
 * Handles what the real log corpus actually emits: reset(0), bold(1)/not(22),
 * underline(4)/not(24), reverse(7)/not(27), fg 30-37, bright fg 90-97, default
 * fg (39), and 256-color fg (38;5;N) via the standard xterm cube/grayscale
 * formula. Background colors and other SGR attributes don't appear in this
 * MUD's output and aren't handled — unrecognized codes are ignored.
 */

const TRUE_BLACK_GRAY = '#4a4a4a';

// ANSI order: black, red, green, yellow, blue, magenta, cyan, white.
const NORMAL_FG = [TRUE_BLACK_GRAY, '#c0392b', '#27ae60', '#f1c40f', '#2980b9', '#8e44ad', '#16a085', '#bdbdbd'];
const BRIGHT_FG = [TRUE_BLACK_GRAY, '#ff6b6b', '#6bff95', '#fff176', '#6bbcff', '#d07cff', '#5fffe3', '#ffffff'];

function xterm256ToHex(n: number): string {
  if (n >= 0 && n < 8) return NORMAL_FG[n];
  if (n >= 8 && n < 16) return BRIGHT_FG[n - 8];

  if (n >= 16 && n <= 231) {
    const i = n - 16;
    const r = Math.floor(i / 36);
    const g = Math.floor((i % 36) / 6);
    const b = i % 6;
    const level = (c: number) => (c === 0 ? 0 : 55 + c * 40);
    const rr = level(r);
    const gg = level(g);
    const bb = level(b);
    if (rr === 0 && gg === 0 && bb === 0) return TRUE_BLACK_GRAY;
    const hex = (v: number) => v.toString(16).padStart(2, '0');
    return `#${hex(rr)}${hex(gg)}${hex(bb)}`;
  }

  // 232-255: grayscale ramp (8..238, never reaches literal black)
  const gray = 8 + (n - 232) * 10;
  return `#${gray.toString(16).padStart(2, '0').repeat(3)}`;
}

export function ansiToHtml(input: string): string {
  if (!input) return '';

  let out = '';
  let i = 0;

  // SGR state. `bold` doubles as "use the bright variant" per this game's own
  // convention (DSL's {R vs {r is a color choice, not a font-weight change) —
  // it does not set font-weight, so it's fine for it to also cover the rare
  // direct-bright codes (90-97) even though that's not strictly ANSI-pure.
  let base: number | null = null; // 0-7, index into NORMAL_FG/BRIGHT_FG
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
      // Same simplified treatment as dsl-color-preview's {& handling: a solid
      // gray block rather than a literal fg/bg swap.
      styles.push('background: currentColor');
      styles.push(`color: ${TRUE_BLACK_GRAY}`);
    } else if (fg) {
      styles.push(`color: ${fg}`);
    }

    if (underline) {
      styles.push('text-decoration: underline');
    }

    if (styles.length > 0) {
      out += `<span style="${styles.join('; ')}">`;
      spanOpen = true;
    }
  }

  function reopenSpan() {
    closeSpan();
    openSpan();
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
      // Anything else (background colors, italic, strikethrough, ...) is
      // outside what this MUD's output uses — ignored.
    }
  }

  while (i < input.length) {
    const ch = input[i];

    if (ch === '\u001b' && input[i + 1] === '[') {
      let j = i + 2;
      while (j < input.length && /[0-9;]/.test(input[j])) j++;
      const terminator = input[j];
      if (terminator === 'm') {
        applySgr(input.slice(i + 2, j));
        reopenSpan();
      }
      // Any other CSI terminator (cursor movement, etc.) — skip silently.
      i = j + 1;
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
