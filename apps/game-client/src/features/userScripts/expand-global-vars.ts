import { safeTrim } from './safeTrim';

export function expandMatchTextWithGlobals(matchText: string, getVar: (key: string) => unknown): string | null {
  const raw = safeTrim(matchText);
  if (!raw) return null;

  let usedToken = false;
  let failed = false;

  const out = raw.replace(/\{([a-zA-Z0-9_]+)\}/g, (_full, nameRaw) => {
    usedToken = true;

    const name = safeTrim(nameRaw);
    if (!name) {
      failed = true;
      return '';
    }

    const v = getVar(name);

    // SAFETY: if a token can’t resolve, do NOT match (prevents “match everything”)
    if (v == null) {
      failed = true;
      return '';
    }

    const s = String(v).trim();
    if (!s) {
      failed = true;
      return '';
    }

    return s;
  });

  if (failed) return null;

  // If they used tokens, require the expanded value be non-empty
  const finalText = safeTrim(out);
  if (!finalText) return null;

  // If they didn’t use tokens, just return original
  return usedToken ? finalText : raw;
}
