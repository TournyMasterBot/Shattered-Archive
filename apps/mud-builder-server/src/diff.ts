/**
 * Minimal line diff for preview responses: trims the common prefix/suffix and
 * reports the differing middle block. Not a full LCS (corpus files reach 8k+
 * lines; O(n²) is not worth it for a preview pane) — the client renders this as
 * "lines A..B changed" plus the removed/added text.
 */

export interface LineDiff {
  identical: boolean;
  /** 1-based first differing line (in the OLD text). */
  start: number;
  removed: string[];
  added: string[];
}

export function diffLines(oldText: string, newText: string): LineDiff {
  if (oldText === newText) {
    return { identical: true, start: 0, removed: [], added: [] };
  }
  const a = oldText.split('\n');
  const b = newText.split('\n');

  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  return {
    identical: false,
    start: prefix + 1,
    removed: a.slice(prefix, a.length - suffix),
    added: b.slice(prefix, b.length - suffix),
  };
}
