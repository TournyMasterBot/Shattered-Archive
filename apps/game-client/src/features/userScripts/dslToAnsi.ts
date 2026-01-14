// apps/game-client/src/features/userScripts/dslToAnsi.ts

/**
 * DSL → ANSI converter for xterm.js.
 *
 * Supported (per DSL help):
 *  - Base colors: {r {R {g {G {y {Y {b {B {m {M {c {C {D {w {W
 *  - Extended colors: {o {n {p {u
 *  - Reset: {x
 *  - Attributes: {! {- {& {_
 *  - Literal '{' escape: '{{'
 *
 * NOTE: To clear changed colors you should end the line with {x.
 * Example:
 *   {rHi{G There {umoose{x
 * gives red "Hi", green "There", purple "moose", then resets.
 */

export function renderDslToAnsi(input: string): string {
  if (!input) return '';

  let out = '';
  let i = 0;

  // Current style state
  let fg: string | null = null; // hex color, e.g. "#c0392b"
  let underline = false;
  let reverse = false;

  function ansiReset(): string {
    return '\x1b[0m';
  }

  function ansiSetStyle(): string {
    const codes: string[] = [];

    if (underline) codes.push('4');
    if (reverse) codes.push('7');

    if (fg) {
      const m = /^#([0-9a-fA-F]{6})$/.exec(fg);
      if (m) {
        const hex = m[1];
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        codes.push(`38;2;${r};${g};${b}`); // truecolor foreground
      }
    }

    if (codes.length === 0) return '';

    return `\x1b[${codes.join(';')}m`;
  }

  function applyStyleChange() {
    const seq = ansiSetStyle();
    if (seq) {
      out += seq;
    } else {
      // If nothing is set, fall back to a full reset
      out += ansiReset();
    }
  }

  while (i < input.length) {
    const ch = input[i];

    // Escape literal '{' using '{{'
    if (ch === '{' && i + 1 < input.length && input[i + 1] === '{') {
      out += '{';
      i += 2;
      continue;
    }

    if (ch === '{' && i + 1 < input.length) {
      const code = input.slice(i, i + 2);

      // Reset colors / attributes
      if (code === '{x') {
        fg = null;
        underline = false;
        reverse = false;
        out += ansiReset();
        i += 2;
        continue;
      }

      // Bell
      if (code === '{!') {
        out += '\x07';
        i += 2;
        continue;
      }

      // Literal tilde
      if (code === '{-') {
        out += '~';
        i += 2;
        continue;
      }

      // Reverse video
      if (code === '{&') {
        reverse = true;
        applyStyleChange();
        i += 2;
        continue;
      }

      // Underline
      if (code === '{_') {
        underline = true;
        applyStyleChange();
        i += 2;
        continue;
      }

      // Base colors
      const baseColor = BASE_COLORS[code];
      if (baseColor) {
        fg = baseColor;
        applyStyleChange();
        i += 2;
        continue;
      }

      // Extended DSL colors
      const extColor = EXTENDED_COLORS[code];
      if (extColor) {
        fg = extColor;
        applyStyleChange();
        i += 2;
        continue;
      }
    }

    // Normal character (unknown codes fall through here, preserving '{')
    out += ch;
    i++;
  }

  // No automatic reset at the end: caller should use {x
  return out;
}

/* ----------------------------------------------------------
   Color tables (from in-game help list)
---------------------------------------------------------- */

const BASE_COLORS: Record<string, string> = {
  '{r': '#c0392b', // red
  '{R': '#ff6b6b', // Lt Red

  '{y': '#f1c40f', // yellow
  '{Y': '#fff176', // Lt Yellow

  '{b': '#2980b9', // blue
  '{B': '#6bbcff', // Lt Blue

  '{c': '#16a085', // cyan
  '{C': '#5fffe3', // Lt Cyan

  '{m': '#8e44ad', // magenta
  '{M': '#d07cff', // Lt Magenta

  '{g': '#27ae60', // green
  '{G': '#6bff95', // Lt Green

  '{D': '#000000', // black
  '{w': '#bdbdbd', // Grey
  '{W': '#ffffff', // Lt White
};

const EXTENDED_COLORS: Record<string, string> = {
  '{o': '#ff9800', // orange
  '{n': '#8d6e63', // brown
  '{p': '#ff77aa', // pink
  '{u': '#9c6bff', // purple
};
