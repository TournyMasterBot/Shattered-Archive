// apps/game-client/src/features/autoleveling/autoleveling-text.ts

const ANSI_CSI_RE = /\u001b\[[0-9;]*m/g;

export function stripAnsi(input: string): string {
  return String(input ?? '').replace(ANSI_CSI_RE, '');
}

export function normalizeForMatch(input: string): string {
  // IMPORTANT: do NOT strip articles (a/an/the). Only normalize ANSI/case/whitespace.
  return stripAnsi(input)
    .replace(/\r/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
