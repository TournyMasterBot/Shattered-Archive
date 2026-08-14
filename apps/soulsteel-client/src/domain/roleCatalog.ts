import type { RoleDef } from './types.js';

/**
 * The four built-in roles from the rules text. The Herald itself is the moderator, not a roster
 * entry, so it is deliberately not a role here.
 */
export const BUILTIN_ROLES: readonly RoleDef[] = [
  {
    id: 'umbraseer',
    name: 'Umbraseer',
    alignment: 'darkKnight',
    builtin: true,
    oncePerNight: true,
    description: 'Once per night, sees beyond the veil to reveal whether a chosen player is an Assassin.',
  },
  {
    id: 'darkshield',
    name: 'Darkshield',
    alignment: 'darkKnight',
    builtin: true,
    oncePerNight: true,
    description: 'Once per night, chooses a player to protect from assassination.',
  },
  {
    id: 'dark-knight',
    name: 'Dark Knight',
    alignment: 'darkKnight',
    builtin: true,
    description: 'No special night power. Participates in day discussion and voting.',
  },
  {
    id: 'cultist-assassin',
    name: 'Cultist Assassin',
    alignment: 'assassin',
    builtin: true,
    oncePerNight: true,
    description: 'Once per night, the Assassins reach a consensus on their target.',
  },
];

export function findRole(roles: readonly RoleDef[], roleId: string | null | undefined): RoleDef | undefined {
  return roleId ? roles.find((r) => r.id === roleId) : undefined;
}

/**
 * Whether `roleId` counts as `alignment` for the automatic win-condition tally. Built-in roles
 * always count for their own alignment; a custom/modifier role counts unless explicitly opted
 * out via `countsTowardWinTally: false` (see the rules' "Game Modifiers" section — e.g. a
 * Cultist Minion who serves the Assassins without being counted as one).
 */
export function countsTowardAlignment(roles: readonly RoleDef[], roleId: string | null | undefined, alignment: 'darkKnight' | 'assassin'): boolean {
  const role = findRole(roles, roleId);
  if (!role || role.alignment !== alignment) return false;
  if (!role.builtin && role.countsTowardWinTally === false) return false;
  return true;
}
