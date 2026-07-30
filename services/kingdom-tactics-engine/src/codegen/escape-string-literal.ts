/**
 * Escapes a string for embedding as a single-quoted TypeScript string literal in
 * generated (checked-in) source. Backslashes MUST escape before quotes —
 * escaping the quote first would double-escape the backslash just inserted,
 * and skipping backslash escaping entirely lets a value ending in `\` produce
 * a literal that never closes: `abc\` would emit `'abc\'`, where the trailing
 * `\'` reads as an escaped quote rather than a closing one, so whatever
 * generated source follows gets absorbed into the string (CodeQL:
 * "incomplete string escaping" — a real code-injection-into-generated-output
 * risk, not just cosmetic, since these scripts write real .ts source files).
 * Shared by every codegen script that emits string literals so the fix lives
 * in exactly one, unit-tested place.
 */
export function escapeStringLiteral(v: string): string {
  return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
