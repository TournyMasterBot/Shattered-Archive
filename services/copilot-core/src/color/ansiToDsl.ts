import { normalizeSgr, tokenizeAnsi } from './ansi.js';
import { BASE_COLOR_LETTERS, DSL_RESET, DSL_REVERSE, EXTENDED_COLOR_CODES } from './dslColors.js';

export interface AnsiToDslResult {
  /** The text with ANSI colour replaced by DSL `{X` codes; literal `{` is doubled and `~` becomes `{-`. */
  dsl: string;
  /**
   * Sequences that have no DSL equivalent (for example an unknown 256-colour number, a background colour, underline),
   * once each in first-seen order. They are dropped from `dsl` (an unmappable colour clears to default with `{x`);
   * the caller keeps the original ANSI text beside the DSL text, so nothing is lost.
   */
  unmapped: string[];
}

type Foreground =
  | { kind: 'base'; index: number }
  | { kind: 'bright'; index: number }
  | { kind: 'extended'; code: string }
  | { kind: 'unmapped' };

/**
 * Convert ANSI text (as the DSL game sends it) into DSL colour codes.
 *
 * Both SGR styles are understood: `ESC[31m` / `ESC[91m` and `ESC[0;37m` / `ESC[1;31m`. Bold persists across sequences until
 * a reset, as in a terminal, so `ESC[1m` followed by `ESC[31m` is bright red. Bold black (`1;30`) and bright black (`90`) are
 * both `{D`, the only black the DSL has. A colour is emitted only when the effective colour changes.
 */
export function ansiToDsl(text: string): AnsiToDslResult {
  const unmapped: string[] = [];
  const note = (what: string): void => {
    if (!unmapped.includes(what)) unmapped.push(what);
  };

  let bold = false;
  let fg: Foreground | null = null;
  let activeColor = DSL_RESET; // the DSL colour the reader currently sees
  let out = '';

  for (const token of tokenizeAnsi(text)) {
    if (token.type === 'text') {
      out += token.text.replace(/\{/g, '{{').replace(/~/g, '{-');
      continue;
    }

    if (token.final !== 'm') {
      note(`CSI ${token.params}${token.final}`);
      continue;
    }

    const ops = normalizeSgr(token.params);
    if (ops === null) {
      note(`SGR ${token.params}`);
      continue;
    }

    let touched = false;
    let reset = false;
    let reverse = false;

    for (let i = 0; i < ops.length; i++) {
      const code = ops[i];
      if (code === 0 || code === 39) {
        bold = false;
        fg = null;
        reset = true;
        touched = true;
      } else if (code === 1) {
        bold = true;
        touched = true;
      } else if (code === 22) {
        bold = false;
        touched = true;
      } else if (code === 7) {
        reverse = true;
      } else if (code >= 30 && code <= 37) {
        fg = { kind: 'base', index: code - 30 };
        touched = true;
      } else if (code >= 90 && code <= 97) {
        fg = { kind: 'bright', index: code - 90 };
        touched = true;
      } else if (code === 38 || code === 48) {
        const mode = ops[i + 1];
        const span = mode === 5 ? 3 : mode === 2 ? 5 : 1;
        const group = ops.slice(i, i + span).join(';');
        if (code === 48) {
          note(group); // background colour: the DSL has none
        } else {
          touched = true;
          const n = mode === 5 ? ops[i + 2] : undefined;
          if (n !== undefined && n in EXTENDED_COLOR_CODES) fg = { kind: 'extended', code: EXTENDED_COLOR_CODES[n] };
          else if (n !== undefined && n < 8) fg = { kind: 'base', index: n };
          else if (n !== undefined && n >= 8 && n < 16) fg = { kind: 'bright', index: n - 8 };
          else {
            fg = { kind: 'unmapped' };
            note(group);
          }
        }
        i += span - 1;
      } else {
        note(String(code)); // underline, blink, background 40-47/100-107, 27, ...
      }
    }

    if (touched) {
      let wanted: string;
      if (fg === null || fg.kind === 'unmapped') {
        wanted = reset || fg !== null ? DSL_RESET : activeColor;
      } else if (fg.kind === 'extended') {
        wanted = fg.code;
      } else {
        const letter = BASE_COLOR_LETTERS[fg.index];
        wanted = `{${fg.kind === 'bright' || bold ? letter.toUpperCase() : letter}`;
      }
      if (wanted !== activeColor) {
        out += wanted;
        activeColor = wanted;
      }
    }
    if (reverse) out += DSL_REVERSE;
  }

  return { dsl: out, unmapped };
}
