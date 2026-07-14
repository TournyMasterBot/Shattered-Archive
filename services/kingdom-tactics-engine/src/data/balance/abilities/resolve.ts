/**
 * Ability-mechanics resolution (model-only; no rules/engine dependency so it stays in the data
 * layer). `resolveAbilityMechanics` returns the authored mechanics for a key, or a no-op STUB for
 * any unauthored ability — the stub marks the caster acted with no effect (owner decision:
 * unauthored = no-op, deterministic). The AbilitySpec adapter + engine resolver live in
 * rules/ability-resolver.ts (which may depend on rules types).
 */
import type { AbilityMechanics } from '../../../model/index.js';
import { AUTHORED_MECHANICS } from './mechanics.js';

/** The no-op fallback: a stub ability with no payload (caster acts, nothing happens). */
export function stubMechanics(key: string): AbilityMechanics {
  return {
    key,
    category: 'utility',
    targeting: 'self',
    usage: 'active',
    scaling: {},
    status: 'stub',
  };
}

/** Authored mechanics for `key`, or a no-op stub if none is authored yet. */
export function resolveAbilityMechanics(key: string): AbilityMechanics {
  return AUTHORED_MECHANICS[key] ?? stubMechanics(key);
}

/** True when `key` has real authored mechanics (not the stub fallback). */
export function isAuthored(key: string): boolean {
  return AUTHORED_MECHANICS[key]?.status === 'authored';
}
