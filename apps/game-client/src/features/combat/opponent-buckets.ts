// apps\game-client\src\features\combat\opponent-buckets.ts
export const OPPONENT_BUCKETS: Array<{
  phrase: string;
  min: number;
  max: number;
  est: number;
}> = [
  { phrase: 'is in excellent condition.', min: 100, max: 100, est: 100 },
  { phrase: 'a few scratches.', min: 90, max: 99, est: 95 },
  { phrase: 'has some small wounds and bruises.', min: 75, max: 89, est: 82 },
  { phrase: 'has quite a few wounds.', min: 50, max: 74, est: 62 },
  { phrase: 'has some big nasty wounds and scratches.', min: 30, max: 49, est: 40 },
  { phrase: 'looks pretty hurt.', min: 15, max: 29, est: 22 },
  { phrase: 'is in awful condition.', min: 0, max: 14, est: 8 },
];
