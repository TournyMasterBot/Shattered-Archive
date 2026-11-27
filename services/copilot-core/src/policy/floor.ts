import { FLOOR_KINDS, type ActionKind, type FloorKind } from '../contracts.js';

/** Why each floor kind is never run without the owner. Shown read-only in the settings (they cannot be changed). */
export const FLOOR_REASONS: Readonly<Record<FloorKind, string>> = {
  'spend-or-lose': 'Spends or loses gold or items (selling, buying, giving, dropping, consuming).',
  speak: 'Speaks to other players.',
  irreversible: 'Cannot be undone, or ends the character (quitting, deleting, stealing).',
  pk: 'Attacks another player. Copilot never starts player-kill on its own.',
};

/**
 * Kinds no setting can ever enable: the floor, plus the two the classifier cannot vouch for. An unrecognised command
 * (`unknown`) and a fight against a target whose level, kill-ability or reason is not all known (`fight-start-unknown`)
 * always prompt the owner.
 */
export const NEVER_AUTO_KINDS: readonly ActionKind[] = [...FLOOR_KINDS, 'unknown', 'fight-start-unknown'];

export function isNeverAuto(kind: ActionKind): boolean {
  return NEVER_AUTO_KINDS.includes(kind);
}
