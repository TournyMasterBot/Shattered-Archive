/**
 * DEV-TIME CLI (excluded from the shipped build — uses node:fs). Prints ability-mechanics
 * coverage per playable class kit + the next kit to author, and writes the checked-in manifest
 * `apps/kingdom-tactics-client/docs/ability-coverage.md` — the resumption checklist.
 *
 * Run:  pnpm --filter @shatteredarchive/kingdom-tactics-engine ability:coverage
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ABILITIES } from '../data/dsl/abilities.js';
import { isAuthored } from '../data/balance/abilities/resolve.js';
import {
  allKitCoverage,
  kitAbilityKeys,
  nextIncompleteKit,
  overallCoverage,
} from '../data/balance/abilities/coverage.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../../..');
const manifestPath = resolve(repoRoot, 'apps/kingdom-tactics-client/docs/ability-coverage.md');

function main(): void {
  const kits = allKitCoverage();
  const overall = overallCoverage();
  const next = nextIncompleteKit();

  // Console summary.
  console.log('Ability mechanics coverage (playable class kits):');
  for (const k of kits) {
    const pct = k.total === 0 ? 0 : Math.round((k.authored / k.total) * 100);
    console.log(`  ${k.classKey.padEnd(10)} ${k.authored}/${k.total} (${pct}%)`);
  }
  console.log(`  overall catalog: ${overall.authored}/${overall.total} authored`);
  if (next) {
    console.log(`\nNext kit to author: ${next.classKey} — ${next.missing.length} remaining:`);
    console.log('  ' + next.missing.join(', '));
  } else {
    console.log('\nAll playable kits fully authored. 🎉');
  }

  // Manifest doc.
  const lines: string[] = [];
  lines.push('# Ability mechanics coverage');
  lines.push('');
  lines.push(
    '> Generated — do not edit by hand. Regenerate: `pnpm --filter @shatteredarchive/kingdom-tactics-engine ability:coverage`',
  );
  lines.push('');
  lines.push(`Overall catalog: **${overall.authored} / ${overall.total}** abilities authored.`);
  lines.push('');
  lines.push('| Playable kit | Authored | Total | % |');
  lines.push('|---|---|---|---|');
  for (const k of kits) {
    const pct = k.total === 0 ? 0 : Math.round((k.authored / k.total) * 100);
    lines.push(`| ${k.classKey} | ${k.authored} | ${k.total} | ${pct}% |`);
  }
  lines.push('');
  if (next) lines.push(`**Next to author:** ${next.classKey} (${next.missing.length} remaining).`);
  else lines.push('**All playable kits fully authored.**');
  lines.push('');

  for (const k of kits) {
    lines.push(`## ${k.classKey} — ${k.authored}/${k.total}`);
    lines.push('');
    for (const key of kitAbilityKeys(k.classKey)) {
      lines.push(`- ${isAuthored(key) ? '✅' : '⬜'} ${key}`);
    }
    lines.push('');
  }

  // A short note on catalog-wide progress.
  const catalogAuthored = ABILITIES.filter((a) => isAuthored(a.key)).length;
  lines.push('---');
  lines.push('');
  lines.push(
    `_${catalogAuthored} of ${ABILITIES.length} total DSL abilities have authored mechanics; the rest resolve to a no-op stub._`,
  );
  lines.push('');

  writeFileSync(manifestPath, lines.join('\n'), 'utf8');
  console.log(`\nwrote ${manifestPath}`);
}

main();
