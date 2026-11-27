import { runReplayCli } from './replayCli.js';

// Thin entry for `pnpm replay:world`; the logic and its tests are in replayCli.ts and replay.ts.
runReplayCli(process.argv.slice(2), {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
}).then((code) => process.exit(code));
