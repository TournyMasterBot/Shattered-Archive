import type { MatchStartPayload } from '../../state/nav';

/** The side the local human controls in Part A's Quick Match / local loop. */
export const HUMAN_SIDE = 0;
/** The side the Greedy AI auto-plays. */
export const AI_SIDE = 1;

/**
 * Default "Quick Match" setup: a small mirrored Skirmish (two Human Warriors a side, well
 * under the 30-point budget) so the arena has something to play immediately. Custom rosters
 * arrive with the Army Builder (Part B); the Part-A match loop just consumes this payload.
 */
export const QUICK_MATCH_SETUP: MatchStartPayload = {
  modeId: 'skirmish',
  seed: 1,
  rosters: [
    {
      side: HUMAN_SIDE,
      name: 'You',
      picks: [
        { raceKey: 'Human', classKey: 'Warrior' },
        { raceKey: 'Human', classKey: 'Warrior' },
      ],
    },
    {
      side: AI_SIDE,
      name: 'Greedy AI',
      picks: [
        { raceKey: 'Human', classKey: 'Warrior' },
        { raceKey: 'Human', classKey: 'Warrior' },
      ],
    },
  ],
};
