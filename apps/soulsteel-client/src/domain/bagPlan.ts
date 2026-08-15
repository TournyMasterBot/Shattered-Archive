import { findRole } from './roleCatalog.js';
import { roleParchmentCommands } from './roleParchment.js';
import type { BagEntry, RoleDef } from './types.js';

/**
 * The full pre-game setup script: every stuffed bag's write-and-bag command block, in bag-number
 * order, followed by a final pass consolidating each of those bags into one master container —
 * one paste to write every parchment, bag it, and gather all the bags into a single carry before
 * the game starts. Bags with no role mapped (nothing to write) are skipped; a bag whose mapped
 * role no longer exists (e.g. a custom role removed after mapping) is skipped defensively too,
 * though `removeCustomRole` already clears that mapping itself.
 */
export function compiledBagSetupCommands(
  roles: readonly RoleDef[],
  bags: readonly BagEntry[],
  bagContainerKeyword: string,
  masterBagKeyword: string,
): string {
  const stuffed = [...bags]
    .sort((a, b) => a.number - b.number)
    .flatMap((bag) => {
      const role = findRole(roles, bag.roleId);
      return role ? [{ bag, role }] : [];
    });

  const parchmentLines = stuffed.flatMap(({ bag, role }) =>
    roleParchmentCommands(role, { number: bag.number, keyword: bagContainerKeyword }).split('\n'),
  );

  // Consolidation must walk HIGHEST bag number to LOWEST, not ascending: `N.keyword` addresses
  // the Nth bag by current ordinal position, and every `put` removes one bag from that same
  // pool. Removing bag 1 first shifts every remaining bag's ordinal down by one, so the next
  // literal "2.sack" would actually resolve to what was bag 3 — or run out early with a "you
  // don't have that" error once the numbers outrun what's left. Removing from the top down never
  // perturbs the ordinals of the bags still waiting below it, so every literal number stays valid
  // right up to the last `put`. It also means bag 1 — inserted last — ends up as the most
  // recently added item in the master bag, matching this engine's `obj_to_obj` prepend order.
  const consolidationLines = [...stuffed]
    .reverse()
    .map(({ bag }) => `put ${bag.number}.${bagContainerKeyword} ${masterBagKeyword}`);

  return [...parchmentLines, ...consolidationLines].join('\n');
}
