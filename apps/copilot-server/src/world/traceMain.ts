import { runTraceCli } from './traceCli.js';

// Thin entry for `pnpm replay:trace`; the logic and its tests are in traceCli.ts.
runTraceCli(process.argv.slice(2), {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
}).then((code) => process.exit(code));
