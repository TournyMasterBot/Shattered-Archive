import { AUTHORED_MECHANICS } from './mechanics.js';
import { resolveAbilityMechanics, isAuthored, stubMechanics } from './resolve.js';
import { createAbilityResolver, toAbilitySpec } from '../../../rules/index.js';
import { ABILITIES } from '../../dsl/abilities.js';
import { kitCoverage } from './coverage.js';

describe('AUTHORED_MECHANICS registry', () => {
  const catalog = new Set<string>(ABILITIES.map((a) => a.key));

  it('only references real catalog ability keys, self-consistent', () => {
    for (const [key, m] of Object.entries(AUTHORED_MECHANICS)) {
      expect(key).toBe(m.key);
      expect(catalog.has(key)).toBe(true);
      expect(m.status).toBe('authored');
    }
  });

  it('every authored combat/support entry carries a matching payload', () => {
    for (const m of Object.values(AUTHORED_MECHANICS)) {
      if (m.usage === 'passive') continue; // passives legitimately carry no active payload
      const hasPayload = !!(m.damage || m.maladiction || m.buff || m.heal || m.utility);
      expect(hasPayload).toBe(true);
    }
  });
});

describe('resolveAbilityMechanics', () => {
  it('returns a no-op stub for an unauthored key', () => {
    const m = resolveAbilityMechanics('NoSuchAbility');
    expect(m.status).toBe('stub');
    expect(m.damage).toBeUndefined();
    expect(m.maladiction).toBeUndefined();
    expect(m.buff).toBeUndefined();
    expect(isAuthored('NoSuchAbility')).toBe(false);
  });

  it('returns the authored entry for an authored key', () => {
    expect(resolveAbilityMechanics('Bash').status).toBe('authored');
    expect(isAuthored('Bash')).toBe(true);
  });

  it('stubMechanics is a pure no-op shape', () => {
    expect(stubMechanics('X')).toEqual({
      key: 'X',
      category: 'utility',
      targeting: 'self',
      usage: 'active',
      scaling: {},
      status: 'stub',
    });
  });
});

describe('toAbilitySpec adapter', () => {
  it('maps a damage skill (Kick) to a scaled auto-hit spec', () => {
    const spec = toAbilitySpec(AUTHORED_MECHANICS.Kick);
    expect(spec.damage).toBe(true);
    expect(spec.damageScale).toBe(0.5);
    expect(spec.maladiction).toBeUndefined();
  });

  it('maps a damage+stun skill (Bash) to damage plus a save-gated maladiction', () => {
    const spec = toAbilitySpec(AUTHORED_MECHANICS.Bash);
    expect(spec.damage).toBe(true);
    expect(spec.maladiction?.status.key).toBe('stunned');
    expect(spec.maladiction?.status.remaining).toBe(1);
  });

  it('maps a self-buff (Berserk) to a buff spec targeting self', () => {
    const spec = toAbilitySpec(AUTHORED_MECHANICS.Berserk);
    expect(spec.buff?.statusKey).toBe('berserk');
    expect(spec.buff?.target).toBe('self');
    expect(spec.damage).toBeUndefined();
  });

  it('maps an ally-support (Rescue) to a buff spec targeting an ally', () => {
    const spec = toAbilitySpec(AUTHORED_MECHANICS.Rescue);
    expect(spec.buff?.target).toBe('ally');
  });

  it('maps a cleric cure (CureLight) to a heal spec targeting an ally', () => {
    const spec = toAbilitySpec(AUTHORED_MECHANICS.CureLight);
    expect(spec.heal?.target).toBe('ally');
    expect(spec.heal?.amount).toBeGreaterThan(0);
    expect(spec.damage).toBeUndefined();
  });

  it('maps a passive (Parry) to a bare no-op spec (marks acted only)', () => {
    const spec = toAbilitySpec(AUTHORED_MECHANICS.Parry);
    expect(spec.damage).toBeUndefined();
    expect(spec.maladiction).toBeUndefined();
    expect(spec.buff).toBeUndefined();
    expect(spec.key).toBe('Parry');
  });
});

describe('createAbilityResolver', () => {
  const resolve = createAbilityResolver();
  it('resolves an authored key to its spec and an unauthored key to a no-op', () => {
    expect(resolve('Bash').maladiction?.status.key).toBe('stunned');
    const noop = resolve('NoSuchAbility');
    expect(noop.damage).toBeUndefined();
    expect(noop.maladiction).toBeUndefined();
    expect(noop.buff).toBeUndefined();
  });
});

describe('Warrior kit coverage', () => {
  it('has authored a representative batch of core Warrior skills', () => {
    const cov = kitCoverage('Warrior');
    expect(cov.authored).toBeGreaterThanOrEqual(20);
    // core warrior skills are authored (not stubs)
    for (const k of ['Bash', 'Berserk', 'Disarm', 'Parry', 'Sword']) {
      expect(isAuthored(k)).toBe(true);
      expect(cov.missing).not.toContain(k);
    }
  });
});
