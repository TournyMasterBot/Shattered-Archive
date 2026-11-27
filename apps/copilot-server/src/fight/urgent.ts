import type { FightSnapshot } from '@shatteredarchive/copilot-core';

export interface Urgent {
  command: string;
  rationale: string;
}

const rounds = (value: number | null): string => (value === null ? 'some' : String(Math.max(1, Math.round(value))));

/**
 * What must be done now, decided by the code from the fight's own numbers and not by a model (which is seconds behind a game that moves every
 * three): leave a fight that is being lost. Only `flee` is urgent; finishing a nearly dead opponent or healing is left to the usual
 * suggestion, because waiting for the model costs nothing there. The wording says it is the monitor's estimate.
 */
export function urgentFor(fight: FightSnapshot): Urgent | undefined {
  if (!fight.active || fight.advice !== 'flee') return undefined;
  const why =
    fight.hpPct !== undefined && fight.hpPct < 25
      ? `hit points are at ${Math.round(fight.hpPct)}%`
      : `about ${rounds(fight.roundsToDie)} rounds from death while the opponent needs about ${rounds(fight.roundsToKill)}`;
  return { command: 'flee', rationale: `Leave the fight: ${why} (the fight monitor's estimate, not the model's).` };
}
