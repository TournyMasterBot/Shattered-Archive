// utils/utils-client/src/ansi-to-html.ts
import AnsiToHtmlLib from 'ansi-to-html';

/**
 * Small interface so tests (or other environments) can provide their own
 * converter without pulling in the real ansi-to-html dependency.
 */
export interface IAnsiToHtmlConverter {
  toHtml(input: string): string;
}

/**
 * Default implementation using the ansi-to-html library.
 * You can tweak colors/options here to match your theme.
 */
class AnsiToHtmlConverter implements IAnsiToHtmlConverter {
  private readonly converter: AnsiToHtmlLib;

  constructor() {
    this.converter = new AnsiToHtmlLib({
      fg: '#e0e0e0', // default foreground
      bg: '#000000', // default background
      newline: true, // treat \n as <br/>
      escapeXML: true, // escape HTML entities in the input
      stream: false,
    });
  }

  toHtml(input: string): string {
    if (!input) return '';
    return this.converter.toHtml(input);
  }
}

/** Default shared converter instance. */
const defaultConverter = new AnsiToHtmlConverter();

/** Currently active converter (can be swapped for mocks in tests). */
let activeConverter: IAnsiToHtmlConverter = defaultConverter;

/**
 * Replace the active converter implementation.
 * Useful in unit tests or for alternate renderers.
 *
 * Example (jest):
 *   setAnsiToHtmlConverter({ toHtml: s => `MOCK:${s}` });
 */
export function setAnsiToHtmlConverter(converter: IAnsiToHtmlConverter) {
  activeConverter = converter ?? defaultConverter;
}

/**
 * Get the currently active converter (mainly for advanced usage / tests).
 */
export function getAnsiToHtmlConverter(): IAnsiToHtmlConverter {
  return activeConverter;
}

/**
 * Convenience function used by the rest of the app.
 *
 * Example:
 *   import { ansiToHtml } from '../utils/ansiToHtml';
 *   const html = ansiToHtml(rawAnsi);
 */
export function ansiToHtml(input: string): string {
  return activeConverter.toHtml(input);
}
