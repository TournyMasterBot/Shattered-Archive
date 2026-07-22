// apps/game-client/src/features/plugins/shared/voiceDictationVocabulary.ts
//
// Word-level fuzzy correction toward a user-maintained vocabulary list
// (MUD-specific mob/spell/item/room names) that neither the browser Web
// Speech API nor the advanced wav2vec2 engine has any native way to be
// biased toward — see voice-dictation.plugin.ts's customVocabulary field.
// Single-word matching only; multi-word phrase correction isn't attempted.

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/** Edit-distance budget scales with word length so short common words are only ever exact-matched. */
function maxAllowedDistance(word: string): number {
  if (word.length <= 3) return 0;
  if (word.length <= 6) return 1;
  return 2;
}

/**
 * Replaces each word in `text` with its closest vocabulary entry when within
 * a length-scaled edit-distance threshold. Leading/trailing punctuation on
 * each token is preserved as-is; only the word itself is matched/replaced.
 */
export function applyVocabularyCorrection(text: string, vocabulary: string[]): string {
  if (!text || vocabulary.length === 0) return text;

  return text
    .split(/(\s+)/) // keep whitespace tokens so join reconstructs spacing exactly
    .map((token) => {
      if (token.length === 0 || /^\s+$/.test(token)) return token;

      const match = token.match(/^(\W*)(.*?)(\W*)$/);
      const lead = match?.[1] ?? '';
      const core = match?.[2] ?? token;
      const trail = match?.[3] ?? '';
      if (!core) return token;

      let best: string | null = null;
      let bestDist = Infinity;

      for (const entry of vocabulary) {
        if (entry.toLowerCase() === core.toLowerCase()) {
          best = entry;
          bestDist = 0;
          break;
        }
        const dist = levenshtein(core.toLowerCase(), entry.toLowerCase());
        if (dist < bestDist) {
          best = entry;
          bestDist = dist;
        }
      }

      if (best !== null && bestDist <= maxAllowedDistance(core)) {
        return `${lead}${best}${trail}`;
      }
      return token;
    })
    .join('');
}
