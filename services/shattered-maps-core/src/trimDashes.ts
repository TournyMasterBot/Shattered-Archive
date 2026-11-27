/** `text` without its leading and trailing hyphens, in one pass: `/^-+|-+$/g` backtracks quadratically on long runs of hyphens. */
export function trimDashes(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && text[start] === '-') start += 1;
  while (end > start && text[end - 1] === '-') end -= 1;
  return text.slice(start, end);
}
