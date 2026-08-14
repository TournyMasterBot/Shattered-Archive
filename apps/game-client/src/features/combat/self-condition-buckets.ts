// apps\game-client\src\features\combat\self-condition-buckets.ts
//
// Same tiers as opponent-buckets.ts (kept in sync deliberately), reworded to
// second person since the player's own hp/hpMax are exact GMCP numbers, not
// a parsed condition line — there's no server text to key phrasing off of.
export const SELF_CONDITION_BUCKETS: Array<{
  phrase: string;
  min: number;
  max: number;
  est: number;
}> = [
  { phrase: 'You are in excellent condition.', min: 100, max: 100, est: 100 },
  { phrase: 'You have a few scratches.', min: 90, max: 99, est: 95 },
  { phrase: 'You have some small wounds and bruises.', min: 75, max: 89, est: 82 },
  { phrase: 'You have quite a few wounds.', min: 50, max: 74, est: 62 },
  { phrase: 'You have some big nasty wounds and scratches.', min: 30, max: 49, est: 40 },
  { phrase: 'You are pretty hurt.', min: 15, max: 29, est: 22 },
  { phrase: 'You are in awful condition.', min: 0, max: 14, est: 8 },
];
