/**
 * DSL color / attribute preview renderer
 *
 * Converts DSL color codes ({r, {G, {o, etc) into HTML spans
 * suitable for preview inside the Library modal.
 *
 * This is a preview renderer, NOT a terminal emulator.
 *
 * Supported (per DSL help):
 *  - Base colors: {r {R {g {G {y {Y {b {B {m {M {c {C {D {w {W
 *  - Extended colors: {o {n {p {u
 *  - Reset: {x
 *  - Attributes: {! {- {& {_
 */

export function renderDslToHtml(input: string): string {
  if (!input) return '';

  let out = '';
  let i = 0;

  // Current style state
  let fg: string | null = null;
  let underline = false;
  let reverse = false;
  let spanOpen = false;

  function reset() {
    fg = null;
    underline = false;
    reverse = false;
  }

  function closeSpan() {
    if (spanOpen) {
      out += '</span>';
      spanOpen = false;
    }
  }

  function openSpan() {
    const styles: string[] = [];

    if (reverse) {
      // Reverse video: background becomes the text color
      styles.push('background: currentColor');
      styles.push('color: black');
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

  while (i < input.length) {
    const ch = input[i];

    if (ch === '{' && i + 1 < input.length) {
      const code = input.slice(i, i + 2);

      // Reset colors / attributes
      if (code === '{x') {
        reset();
        closeSpan();
        i += 2;
        continue;
      }

      // Bell (preview icon only)
      if (code === '{!') {
        out += '🔔';
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
        reopenSpan();
        i += 2;
        continue;
      }

      // Underline
      if (code === '{_') {
        underline = true;
        reopenSpan();
        i += 2;
        continue;
      }

      // Base colors
      const baseColor = BASE_COLORS[code];
      if (baseColor) {
        fg = baseColor;
        reopenSpan();
        i += 2;
        continue;
      }

      // Extended DSL colors (actual tokens: {o {n {p {u)
      const extColor = EXTENDED_COLORS[code];
      if (extColor) {
        fg = extColor;
        reopenSpan();
        i += 2;
        continue;
      }
    }

    // Normal character
    out += escapeHtml(ch);
    i++;
  }

  // Close any open span
  closeSpan();

  return out;
}

/* ----------------------------------------------------------
   Color tables (DSL authoritative)
---------------------------------------------------------- */

const BASE_COLORS: Record<string, string> = {
  '{r': '#c0392b', // red
  '{R': '#ff6b6b', // light red

  '{g': '#27ae60', // green
  '{G': '#6bff95', // light green

  '{y': '#f1c40f', // yellow
  '{Y': '#fff176', // light yellow

  '{b': '#2980b9', // blue
  '{B': '#6bbcff', // light blue

  '{m': '#8e44ad', // magenta
  '{M': '#d07cff', // light magenta

  '{c': '#16a085', // cyan
  '{C': '#5fffe3', // light cyan

  '{D': '#555555', // black (bright black / dark gray)
  '{w': '#cccccc', // grey
  '{W': '#ffffff', // light white
};

const EXTENDED_COLORS: Record<string, string> = {
  '{o': '#ff9800', // orange
  '{n': '#8d6e63', // brown
  '{p': '#ff77aa', // pink
  '{u': '#9c6bff', // purple
};

/* ----------------------------------------------------------
   Utils
---------------------------------------------------------- */

function escapeHtml(ch: string): string {
  switch (ch) {
    case '&':
      return '&amp;';
    case '<':
      return '&lt;';
    case '>':
      return '&gt;';
    case '"':
      return '&quot;';
    case "'":
      return '&#39;';
    default:
      return ch;
  }
}
