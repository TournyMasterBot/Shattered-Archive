// Phase 29a: the PRODUCTION shape of the C# site has no second world, even when someone sets the Simulacrum's folder variable for it.
//   SANDBOX_WORLD_MAP_DIR=<the sandbox slices> node maps-v2-scratch-run.mjs <DSL slices> prod-no-sandbox.mjs
// (run by the scratch harness, which builds the production shape and passes this script the base url as its last argument)
const BASE = process.argv[process.argv.length - 1];
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const status = async (p) => (await fetch(`${BASE}${p}`)).status;

console.log(`  info: SANDBOX_WORLD_MAP_DIR is ${process.env.SANDBOX_WORLD_MAP_DIR ? 'SET' : 'not set'} for this run`);
const dsl = await fetch(`${BASE}/api/world-map/index`);
const index = await dsl.json();
check('the DSL map is served', dsl.status === 200 && index.status === 'audited', `${index.counts?.rooms} rooms, ${index.versionId}`);
for (const p of ['/api/world-map/sandbox/index', '/api/world-map/sandbox/area/walked', '/api/world-map/sandbox/search?q=Chamber', '/api/world-map/sandbox/room/x', '/api/world-map/sandbox/neighbours/walked']) {
  const s = await status(p);
  check(`${p} is 404 in the production shape`, s === 404, `status ${s}`);
}
check('the candidate layer is not there either', (await status('/api/world-map/candidates/index')) === 404);
check('no Simulacrum room or area leaks into the DSL routes', (await status('/api/world-map/area/walked')) === 404 && (await (await fetch(`${BASE}/api/world-map/search?q=Chamber%20of%20Repose`)).json()).total === 0); // a room only the Simulacrum has

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exitCode = failed ? 1 : 0;
