import type { IGameDataProvider } from '../data/index.js';
import type { SquadronMember, UnitTemplate } from '../model/index.js';

/** Aggregate stats for a squadron token, derived from its member unit templates. */
export interface SquadronStats {
  readonly size: number;
  readonly maxHpPool: number;
  readonly strength: number;
}

/** Resolve a squadron member's `templateId` ("Race:Class") to a UnitTemplate. */
export function templateForMember(templateId: string, provider: IGameDataProvider): UnitTemplate {
  const [raceKey, classKey] = templateId.split(':');
  return provider.unitTemplate(raceKey, classKey);
}

/**
 * Derive a squadron's aggregate strength/HP/size from its members. Because every
 * value comes from unitTemplate(), rebalancing a unit's stats automatically changes
 * the strength of any squadron containing it — the single-source-of-truth guarantee
 * extended to Battle-scale tokens.
 */
export function aggregateSquadron(
  members: readonly SquadronMember[],
  provider: IGameDataProvider,
): SquadronStats {
  let size = 0;
  let maxHpPool = 0;
  let strength = 0;
  for (const m of members) {
    const t = templateForMember(m.templateId, provider);
    size += m.count;
    maxHpPool += t.maxHp * m.count;
    strength += t.attackPower * m.count;
  }
  return { size, maxHpPool, strength };
}
