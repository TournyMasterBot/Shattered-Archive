import { compiledBagSetupCommands } from './bagPlan.js';
import { BUILTIN_ROLES } from './roleCatalog.js';
import { roleParchmentCommands } from './roleParchment.js';
import type { BagEntry } from './types.js';

const bags: BagEntry[] = [
  { number: 1, roleId: 'umbraseer' },
  { number: 2, roleId: null },
];

describe('compiledBagSetupCommands', () => {
  const umbraseer = BUILTIN_ROLES.find((r) => r.id === 'umbraseer')!;
  const darkshield = BUILTIN_ROLES.find((r) => r.id === 'darkshield')!;

  it('concatenates each stuffed bag\'s write-and-bag block (in number order), then a consolidation put per bag in REVERSE number order', () => {
    const unordered: BagEntry[] = [
      { number: 2, roleId: 'darkshield' },
      { number: 1, roleId: 'umbraseer' },
    ];
    const commands = compiledBagSetupCommands(BUILTIN_ROLES, unordered, 'sack', 'chest');
    const lines = commands.split('\n');

    const bag1Block = roleParchmentCommands(umbraseer, { number: 1, keyword: 'sack' }).split('\n');
    const bag2Block = roleParchmentCommands(darkshield, { number: 2, keyword: 'sack' }).split('\n');

    // Consolidation walks highest-to-lowest: removing bag 1 first would shift every remaining
    // bag's ordinal down by one (merc's `N.keyword` addresses live ordinal position, not a
    // stable id), so descending is the only order where every literal "N.sack" stays valid.
    expect(lines).toEqual([...bag1Block, ...bag2Block, 'put 2.sack chest', 'put 1.sack chest']);
  });

  it('skips bags with no role mapped', () => {
    const commands = compiledBagSetupCommands(BUILTIN_ROLES, bags, 'sack', 'chest');
    expect(commands.split('\n').filter((l) => l === 'put 2.sack chest')).toHaveLength(0);
  });

  it('is empty when no bags are stuffed', () => {
    expect(compiledBagSetupCommands(BUILTIN_ROLES, [{ number: 1, roleId: null }], 'sack', 'chest')).toBe('');
  });

  it('skips a bag whose mapped role no longer exists in the catalog', () => {
    const dangling: BagEntry[] = [{ number: 1, roleId: 'deleted-custom-role' }];
    expect(compiledBagSetupCommands(BUILTIN_ROLES, dangling, 'sack', 'chest')).toBe('');
  });
});
