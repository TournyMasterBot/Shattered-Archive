import { recommendedAssassinCount, recommendedDistribution } from './recommendedDistribution.js';

describe('recommendedAssassinCount', () => {
  it('suggests 0 below 4 players', () => {
    expect(recommendedAssassinCount(3)).toBe(0);
  });

  it('suggests 1 for 4-5 players', () => {
    expect(recommendedAssassinCount(4)).toBe(1);
    expect(recommendedAssassinCount(5)).toBe(1);
  });

  it('suggests 2 for 6-8 players', () => {
    expect(recommendedAssassinCount(6)).toBe(2);
    expect(recommendedAssassinCount(8)).toBe(2);
  });

  it('adds roughly one assassin per 3-4 additional players beyond 8', () => {
    expect(recommendedAssassinCount(12)).toBe(3);
    expect(recommendedAssassinCount(16)).toBe(4);
  });
});

describe('recommendedDistribution', () => {
  it('matches the 4-5 player example (Herald, Umbraseer, Darkshield, Assassin, Dark Knights)', () => {
    const dist = recommendedDistribution(5);
    expect(dist).toEqual({ assassins: 1, umbraseer: true, darkshield: true, darkKnights: 2 });
  });

  it('matches the 6-8 player example (2 Assassins)', () => {
    const dist = recommendedDistribution(8);
    expect(dist).toEqual({ assassins: 2, umbraseer: true, darkshield: true, darkKnights: 4 });
  });
});
