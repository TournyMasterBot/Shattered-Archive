import type { IGameDataProvider } from '../data/index.js';
import type { AttackPattern, BoardToken, Coord, MatchState } from '../model/index.js';
import { hasLineOfSight } from './line-of-sight.js';
import { templateForMember } from './squadron.js';

/** A token is alive if it has hit points remaining (unit hp / squadron hpPool). */
function isAlive(token: BoardToken): boolean {
  return token.kind === 'unit' ? token.hp > 0 : token.hpPool > 0;
}

/**
 * Resolve the attack pattern a token attacks with. Units use their template; a squadron
 * attacks with its longest-range member's pattern (so an archer squadron can still shoot).
 */
export function attackProfile(token: BoardToken, provider: IGameDataProvider): AttackPattern {
  if (token.kind === 'unit') {
    return templateForMember(token.templateId, provider).attack;
  }
  let best: AttackPattern | undefined;
  for (const m of token.members) {
    const a = templateForMember(m.templateId, provider).attack;
    if (!best || a.range > best.range) best = a;
  }
  return best ?? { kind: 'melee', range: 1, minRange: 1, areaRadius: 0 };
}

/** True if a ranged attack pattern (needs line-of-sight to reach its target). */
function isRanged(a: AttackPattern): boolean {
  return a.range > 1 || a.kind !== 'melee';
}

/**
 * Is `to` reachable from `from` under attack pattern `a`? Chess-variant geometry:
 * orthogonal = same row/col, diagonal = a diagonal line, omni/melee = any of the 8
 * directions. Distance along the line must fall within [minRange, range].
 */
export function inAttackPattern(from: Coord, to: Coord, a: AttackPattern): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx === 0 && ady === 0) return false; // never target own tile

  let onLine: boolean;
  let dist: number;
  switch (a.kind) {
    case 'orthogonal':
      onLine = dx === 0 || dy === 0;
      dist = adx + ady; // one axis is 0, so this is the line length
      break;
    case 'diagonal':
      onLine = adx === ady;
      dist = adx;
      break;
    case 'omni':
    case 'melee':
      onLine = dx === 0 || dy === 0 || adx === ady;
      dist = Math.max(adx, ady); // chebyshev
      break;
  }
  return onLine && dist >= a.minRange && dist <= a.range;
}

/**
 * All enemy tokens the given token may legally attack this action: living, on a
 * different side, within the attacker's AttackPattern, and (for ranged) with clear
 * line-of-sight. Returns instanceIds. Pure.
 */
export function legalTargets(
  state: MatchState,
  tokenId: string,
  provider: IGameDataProvider,
): string[] {
  const attacker = state.tokens.find((t) => t.instanceId === tokenId);
  if (!attacker || !isAlive(attacker)) return [];
  const pattern = attackProfile(attacker, provider);
  const ranged = isRanged(pattern);

  const out: string[] = [];
  for (const target of state.tokens) {
    if (target.instanceId === attacker.instanceId) continue;
    if (target.side === attacker.side) continue; // allies excluded
    if (!isAlive(target)) continue;
    if (!inAttackPattern(attacker.pos, target.pos, pattern)) continue;
    if (ranged && !hasLineOfSight(state, attacker.pos, target.pos, provider)) continue;
    out.push(target.instanceId);
  }
  return out;
}

/**
 * All living tokens within Chebyshev `areaRadius` of a center tile (for AoE splash).
 * Sides are NOT filtered — AoE can catch friend and foe; the caller decides intent.
 * Returns instanceIds.
 */
export function splashTargets(
  state: MatchState,
  center: Coord,
  areaRadius: number,
  _provider: IGameDataProvider,
): string[] {
  const out: string[] = [];
  for (const token of state.tokens) {
    if (!isAlive(token)) continue;
    const d = Math.max(Math.abs(token.pos.x - center.x), Math.abs(token.pos.y - center.y));
    if (d <= areaRadius) out.push(token.instanceId);
  }
  return out;
}
