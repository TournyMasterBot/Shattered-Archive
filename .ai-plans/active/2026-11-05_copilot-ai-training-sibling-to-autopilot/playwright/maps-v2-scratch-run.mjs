// Runs a script against a scratch C# site: builds the PRODUCTION shape into a temp folder, starts it on a scratch port with WORLD_MAP_DIR set,
// runs the given script with the base url, then stops only the process it started. Owner's go for scratch ports 5097+ (Phases 27-29).
//   node maps-v2-scratch-run.mjs <slices folder> <script> [script args before the base url...]
// The script receives: <args...> <base url>.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 5097;
const [slices, script, ...args] = process.argv.slice(2);
const web = 'C:/Projects/DSL/Server/Server.Web.Public/Server.Web.Public.csproj';
const scratch = mkdtempSync(join(tmpdir(), 'maps-v2-run-'));
const out = join(scratch, 'prod');
const b = spawnSync('dotnet', ['build', web, '-c', 'Release', `-p:OutDir=${out}\\`, '--nologo', '-v', 'q', '-clp:ErrorsOnly', '-maxcpucount:4', '--disable-build-servers'], { encoding: 'utf8' });
console.log('production build exit', b.status);
let child;
let code = 1;
try {
  if (b.status !== 0) throw new Error('build failed');
  child = spawn('dotnet', ['Server.Web.Public.dll'], {
    cwd: out,
    env: { ...process.env, ASPNETCORE_URLS: `http://127.0.0.1:${PORT}`, ASPNETCORE_ENVIRONMENT: 'Production', WS_HOST: '127.0.0.1', WS_PORT: '8897', ROOMS_JSON: 'C:/Projects/DSL/Server/Data/rooms.json', WORLD_MAP_DIR: slices },
    stdio: 'ignore',
  });
  console.log('scratch pid', child.pid, 'port', PORT);
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try {
      up = (await fetch(`http://127.0.0.1:${PORT}/robots.txt`, { signal: AbortSignal.timeout(4000) })).status === 200;
    } catch { /* not yet */ }
    if (!up) await new Promise((r) => setTimeout(r, 2000));
  }
  console.log('up', up);
  if (up) {
    const r = spawnSync('node', [script, ...args, `http://127.0.0.1:${PORT}`], { stdio: 'inherit' });
    code = r.status ?? 1;
  }
} finally {
  if (child && child.exitCode === null) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    console.log('scratch process stopped:', child.pid);
  }
  await new Promise((r) => setTimeout(r, 1500));
  rmSync(scratch, { recursive: true, force: true });
}
process.exitCode = code;
