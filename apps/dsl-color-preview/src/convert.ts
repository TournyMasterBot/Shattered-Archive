// apps/dsl-color-preview/src/convert.ts

import { ansiToHtml, containsAnsi, dslToAnsi, stripAnsi } from './ansi';
import { renderDslToHtml } from './renderDslToHtml';

/**
 * A document is "ansi" when it holds real escape sequences (raw game logs),
 * otherwise "dsl" ({R / {x markup). Escape-bearing text is never also run
 * through the DSL parser: a captured log has already had its `{X` codes
 * expanded, so a leftover `{` there is literal text.
 */
export type ColorFormat = 'ansi' | 'dsl';

export function detectFormat(text: string): ColorFormat {
  return containsAnsi(text) ? 'ansi' : 'dsl';
}

export function renderToHtml(text: string): string {
  return detectFormat(text) === 'ansi' ? ansiToHtml(text) : renderDslToHtml(text);
}

/** Text with every colour code / escape sequence removed. */
export function toPlainText(text: string): string {
  return stripAnsi(detectFormat(text) === 'ansi' ? text : dslToAnsi(text));
}

/** Text carrying ANSI escapes: DSL markup is converted, ANSI text passes through. */
export function toAnsiText(text: string): string {
  return detectFormat(text) === 'ansi' ? text : dslToAnsi(text);
}
