// apps\game-client\src\features\equipment\equipment-text.ts
function stripAnsi(input: string): string {
  return String(input ?? '').replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * Strips leading parenthesized status tokens from an item name.
 * Examples:
 *   "(Glowing) sword" -> "sword"
 *   "(Glowing) (Humming) (Invis) a belt" -> "a belt"
 */
export function stripItemStatusPrefixes(input: string): string {
  let s = stripAnsi(input).replace(/\r/g, '').trim();
  if (!s) return '';

  if (!s.startsWith('(')) return s;

  // Fast path: if it looks like "(X) (Y) item", strip everything up to the last ") "
  const last = s.lastIndexOf(') ');
  if (last >= 0) {
    const after = s.slice(last + 2).trimStart();
    if (after) return after;
  }

  // Fallback: repeatedly strip "(...)" tokens at the start
  while (s.startsWith('(')) {
    const end = s.indexOf(')');
    if (end < 0) break;
    s = s.slice(end + 1).trimStart();
  }

  return s.trim();
}
