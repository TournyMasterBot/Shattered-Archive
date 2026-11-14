import { readFile } from 'node:fs/promises';
import { runCli } from './cli.js';

// Thin entry for `pnpm export:bundle`, `import:finding`, `accept:ticket` and `training:metrics`; the logic and its tests are in cli.ts.
runCli(process.argv.slice(2), {
  fetch,
  readFile: (path) => readFile(path, 'utf8'),
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  env: process.env,
}).then((code) => process.exit(code));
