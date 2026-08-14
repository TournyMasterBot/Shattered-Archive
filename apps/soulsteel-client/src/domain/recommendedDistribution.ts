/**
 * The rules' "Recommendations" section, as pure functions. These are hints the Herald sees
 * while assigning roles — never enforced. Table: 4-5 players -> 1 Assassin; 6-8 players -> 2
 * Assassins; beyond that, "continue adding one assassin for every 3-4 additional Dark Knights."
 */

export function recommendedAssassinCount(playerCount: number): number {
  if (playerCount < 4) return 0;
  if (playerCount <= 5) return 1;
  if (playerCount <= 8) return 2;

  let assassins = 2;
  let darkKnightsSinceLastBump = 0;
  for (let p = 9; p <= playerCount; p++) {
    darkKnightsSinceLastBump++;
    if (darkKnightsSinceLastBump >= 4) {
      assassins++;
      darkKnightsSinceLastBump = 0;
    }
  }
  return assassins;
}

export interface RecommendedDistribution {
  assassins: number;
  umbraseer: boolean;
  darkshield: boolean;
  /** Plain Dark Knights — everyone else once Umbraseer/Darkshield/Assassins are accounted for. */
  darkKnights: number;
}

export function recommendedDistribution(playerCount: number): RecommendedDistribution {
  const assassins = recommendedAssassinCount(playerCount);
  const umbraseer = playerCount >= 4;
  const darkshield = playerCount >= 4;
  const specialDarkKnights = (umbraseer ? 1 : 0) + (darkshield ? 1 : 0);
  const darkKnights = Math.max(0, playerCount - assassins - specialDarkKnights);
  return { assassins, umbraseer, darkshield, darkKnights };
}
