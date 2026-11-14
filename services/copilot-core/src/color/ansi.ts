/**
 * ANSI helpers for text the MUD sends. Pure string functions (no DOM, no Node).
 *
 * The server writes colour as SGR sequences in two styles: `ESC[31m` / `ESC[91m` (the game-client's DSL table) and
 * `ESC[0;37m` / `ESC[1;30m` (what the DSL game actually sends, with an explicit reset or bold flag in front). A log
 * line can also be cut in the middle of a sequence (`ESC[1;31` CRLF `m`), so sequences are rejoined first.
 */

export const ESC = '\u001b';

/**
 * Rejoin escape sequences that a line break cut in two: `ESC[1;31<CR><LF>m` -> `ESC[1;31m`.
 * Only line-break characters between the parameters and the final byte are removed, never text.
 */
export function rejoinSequences(text: string): string {
  // A sequence is ESC[ then parameter characters up to a final letter; line breaks inside that span (any number of
  // them) are the wrap and are removed. A finished sequence ends at its letter, so text after it is never touched.
  return text.replace(/\u001b\[[0-9;\r\n]*[A-Za-z]/g, (sequence) => sequence.replace(/[\r\n]+/g, ''));
}

/** Remove every CSI escape sequence (colour, cursor movement, erase), leaving only the visible text. */
export function stripAnsi(text: string): string {
  return rejoinSequences(text).replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');
}

export type AnsiToken =
  | { type: 'text'; text: string }
  | { type: 'csi'; params: string; final: string; raw: string };

/** Split text into plain text and CSI escape sequences (after rejoining wrapped ones). */
export function tokenizeAnsi(text: string): AnsiToken[] {
  const tokens: AnsiToken[] = [];
  const pattern = /\u001b\[([0-9;?]*)([A-Za-z])/g;
  const joined = rejoinSequences(text);
  let last = 0;
  for (let match = pattern.exec(joined); match !== null; match = pattern.exec(joined)) {
    if (match.index > last) tokens.push({ type: 'text', text: joined.slice(last, match.index) });
    tokens.push({ type: 'csi', params: match[1], final: match[2], raw: match[0] });
    last = match.index + match[0].length;
  }
  if (last < joined.length) tokens.push({ type: 'text', text: joined.slice(last) });
  return tokens;
}

/**
 * Canonical numeric form of an SGR parameter list. An empty list means reset (`ESC[m` is `ESC[0m`), leading zeros are
 * dropped (`01;31` is `1;31`), and a non-numeric parameter makes the whole list `null` so the caller flags it.
 * The extended-colour groups `38;5;n` and `38;2;r;g;b` (and `48;...`) stay in the list in order.
 */
export function normalizeSgr(params: string): number[] | null {
  if (params === '') return [0];
  const out: number[] = [];
  for (const part of params.split(';')) {
    if (part === '') {
      out.push(0); // `1;;31`: an empty parameter is 0
      continue;
    }
    if (!/^[0-9]+$/.test(part)) return null;
    out.push(Number(part));
  }
  return out;
}
