// apps/dsl-color-preview/src/renderDslToHtml.ts

/**
 * DSL color / attribute preview renderer.
 *
 * Ported from apps/game-client/src/features/library/renderDslColorPreviewHtml.ts
 * (the renderer behind the game-client Library modal's "Color Preview" tab).
 * A VS Code extension bundles its own dist/extension.js, so it can't import
 * that file across the workspace at runtime — this is a deliberate copy, not
 * a re-export. Keep the two in sync by hand if the DSL color table changes.
 *
 * Deliberate divergences from that behavior (see openSpan below), both because
 * game-client's near-black preview pane rendering is arguably correct for
 * simulating true in-game terminal effects but unreadable as an authoring aid,
 * which is this extension's whole purpose:
 *  - {D (black) renders as gray instead of literal black-on-black.
 *  - {& (reverse video) uses that same gray "implies black" instead of literal
 *    black, which would go invisible against a black-ish currentColor.
 *
 * Converts DSL color codes ({r, {G, {o, etc) into HTML spans.
 * This is a preview renderer, NOT a terminal emulator.
 *
 * Supported (per DSL help):
 *  - Base colors: {r {R {g {G {y {Y {b {B {m {M {c {C {D {w {W
 *  - Extended colors: {o {n {p {u
 *  - Reset: {x
 *  - Attributes: {! {- {& {_
 *  - Literal '{' escape: '{{'
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
      // Reverse video: background becomes the text color. Text uses the same
      // gray as the {D case below rather than literal black — true black would
      // be unreadable (invisible on a near-black currentColor) or a jarring
      // hard invert on brighter colors; the gray still reads as "black" while
      // staying visible against any fg color.
      styles.push('background: currentColor');
      styles.push('color: #4a4a4a');
    } else if (fg) {
      // {D (black) is otherwise invisible against the dark preview background.
      // Render as gray instead — reads as "black" without a highlight box.
      styles.push(`color: ${fg === '#000000' ? '#4a4a4a' : fg}`);
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

    // Escape literal '{' using '{{'
    if (ch === '{' && i + 1 < input.length && input[i + 1] === '{') {
      out += escapeHtml('{');
      i += 2;
      continue;
    }

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

      // Extended DSL colors
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
