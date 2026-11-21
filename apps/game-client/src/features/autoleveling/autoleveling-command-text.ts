// apps/game-client/src/features/autoleveling/autoleveling-command-text.ts

/**
 * Command text the autopilot sends to the game: the one place a stored command template is filled in (CMDTPL-01).
 *
 * Before 2026-11-18 only the initiation command was expanded; fight, buff and in-combat commands went out as stored, so the
 * game received `cast 'fog' {name}` (and `{n` is a colour code) and the seeded `quaff <potion>` literally.
 */

/** Placeholders that stand for the kill keyword of the creature being fought. */
const KEYWORD_PLACEHOLDER = /\s*\{(?:name|target|keyword)\}/g;

/** A placeholder that is still unfilled: `{word}` or `<some words>`. A colour code such as `{R` has no closing brace and never matches. */
const UNRESOLVED_PLACEHOLDER = /\{[A-Za-z_]\w*\}|<[A-Za-z][A-Za-z _-]{0,30}>/;

/** Verbs that act on an item instead of casting a spell: usable in or out of combat. */
const ITEM_VERBS = new Set(['quaff', 'brandish', 'zap', 'recite', 'eat', 'drink']);

/**
 * Fills `{name}` / `{target}` / `{keyword}` with the kill keyword. With no keyword (a buff or heal out of combat) the placeholder and
 * the space before it are removed, so `cast 'heal' {name}` becomes `cast 'heal'`. The keyword is inserted verbatim: no `$` pattern
 * in it is interpreted.
 */
export function expandCommand(cmd: string, keyword: string | null | undefined): string {
  const text = String(cmd ?? '');
  const k = String(keyword ?? '').trim();
  return text.replace(KEYWORD_PLACEHOLDER, (m) => (k ? `${m.match(/^\s*/)![0]}${k}` : '')).trim();
}

/** The first placeholder still in the (already expanded) command, or null when the command is ready to send. */
export function findUnresolvedPlaceholder(cmd: string): string | null {
  const m = UNRESOLVED_PLACEHOLDER.exec(String(cmd ?? ''));
  return m ? m[0] : null;
}

/** True for `quaff <potion>`, `brandish staff`, `zap wand` and the like: an item action, not a spell. */
export function isItemAction(cmd: string): boolean {
  const first = String(cmd ?? '')
    .trim()
    .split(/\s+/, 1)[0]
    ?.toLowerCase();
  return !!first && ITEM_VERBS.has(first);
}
