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

/** The in-game command sequence a Herald can hand a player to write a role-reveal parchment —
 * one command per line, ready to paste into the client. `@` closes the multi-line write editor
 * before the follow-up commands; `read soulsteel` verifies the finished parchment at the end. */
export function roleParchmentCommands(role: RoleDef): string {
  return [
    'dip quill ink',
    'write parch',
    roleRevealText(role),
    'Share your role with the Herald.',
    '@',
    PARCHMENT_TITLE_COMMAND,
    'read soulsteel',
  ].join('\n');
}
