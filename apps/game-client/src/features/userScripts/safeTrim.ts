export function safeTrim(v: unknown): string {
  return String(v ?? '').trim();
}