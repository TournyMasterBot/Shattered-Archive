import { GLOBAL_TIERS, SERVICE_TIERS, tierRank, canManage } from './auth-tiers.js';

describe('auth tiers', () => {
  it('the two ladders are distinct and ordered highest-authority first', () => {
    expect(GLOBAL_TIERS).toEqual(['owner', 'admin', 'moderator', 'user']);
    expect(SERVICE_TIERS).toEqual(['owner', 'admin', 'manager', 'builder', 'trusted', 'user']);
    expect(tierRank(GLOBAL_TIERS, 'owner')).toBe(0);
    expect(tierRank(SERVICE_TIERS, 'trusted')).toBe(4);
    expect(tierRank(GLOBAL_TIERS, 'manager')).toBe(-1); // service-only tier is unknown globally
  });

  it('canManage enforces strictly-below on the global ladder (full matrix)', () => {
    const expectations: Array<[string, string, boolean]> = [
      ['owner', 'admin', true],
      ['owner', 'moderator', true],
      ['owner', 'user', true],
      ['owner', 'owner', false], // peers refuse
      ['admin', 'owner', false],
      ['admin', 'admin', false],
      ['admin', 'moderator', true],
      ['admin', 'user', true],
      ['moderator', 'admin', false],
      ['moderator', 'moderator', false],
      ['moderator', 'user', true],
      ['user', 'user', false],
      ['user', 'owner', false],
    ];
    for (const [actor, target, expected] of expectations) {
      expect(canManage(GLOBAL_TIERS, actor, target)).toBe(expected);
    }
  });

  it('canManage works on the service ladder incl. the middle tiers', () => {
    expect(canManage(SERVICE_TIERS, 'manager', 'trusted')).toBe(true);
    expect(canManage(SERVICE_TIERS, 'manager', 'user')).toBe(true);
    expect(canManage(SERVICE_TIERS, 'trusted', 'manager')).toBe(false);
    expect(canManage(SERVICE_TIERS, 'trusted', 'trusted')).toBe(false);
    expect(canManage(SERVICE_TIERS, 'admin', 'manager')).toBe(true);
    // `builder` (added between manager and trusted — simulacrum-wiring correction 5) slots in
    // at the same relative rules as any other middle tier.
    expect(canManage(SERVICE_TIERS, 'manager', 'builder')).toBe(true);
    expect(canManage(SERVICE_TIERS, 'builder', 'trusted')).toBe(true);
    expect(canManage(SERVICE_TIERS, 'trusted', 'builder')).toBe(false);
    expect(canManage(SERVICE_TIERS, 'builder', 'builder')).toBe(false); // peers refuse
  });

  it('an unknown tier on EITHER side fails closed', () => {
    expect(canManage(GLOBAL_TIERS, 'archmage', 'user')).toBe(false);
    expect(canManage(GLOBAL_TIERS, 'owner', 'archmage')).toBe(false);
    // A service-only tier presented against the global ladder is unknown there too.
    expect(canManage(GLOBAL_TIERS, 'owner', 'trusted')).toBe(false);
  });
});
