import type { Alignment, RoleDef } from './types.js';

const ALIGNMENT_LABEL: Record<Alignment, string> = {
  darkKnight: 'You are aligned with the Dark Knights.',
  assassin: 'You are aligned with the Assassins.',
  neutral: 'You serve no particular side.',
};

/** Player-facing role-reveal text, built from the same `RoleDef.description` the Herald-facing
 * role list already shows — one source of truth, no separate copy to keep in sync. */
export function roleRevealText(role: RoleDef): string {
  return `You are the ${role.name}. ${ALIGNMENT_LABEL[role.alignment]} ${role.description}`;
}

const PARCHMENT_TITLE_COMMAND = 'write parch title Umbral Cloak & Soulsteel Dagger Role';

/** A physical bag this parchment is destined for, identified by its ordinal `number` and the
 * shared container `keyword` every bag uses (e.g. `{ number: 2, keyword: 'sack' }` → `2.sack`). */
export interface ParchmentBagTarget {
  number: number;
  keyword: string;
}

/** The in-game command sequence a Herald can hand a player to write a role-reveal parchment —
 * one command per line, ready to paste into the client. The title must be set BEFORE the body
 * editor opens (`write parch title ...` before `write parch`) — setting it after was the
 * original order and it does not stick reliably once the body editor has already been entered
 * and exited. `@` closes the multi-line write editor; `read soulsteel` verifies the finished
 * parchment afterward. When `bag` is given, a final `put parch N.keyword` line seals it into that
 * numbered bag, using the same `N.container` ordinal addressing the MUD's `get`/`put` parser
 * understands. */
export function roleParchmentCommands(role: RoleDef, bag?: ParchmentBagTarget): string {
  const commands = [
    'dip quill ink',
    PARCHMENT_TITLE_COMMAND,
    'write parch',
    roleRevealText(role),
    'Share your role with the Herald.',
    '@',
    'read soulsteel',
  ];
  if (bag) commands.push(`put parch ${bag.number}.${bag.keyword}`);
  return commands.join('\n');
}
