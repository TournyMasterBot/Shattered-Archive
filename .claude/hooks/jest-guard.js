#!/usr/bin/env node
// PreToolUse guard (Bash|PowerShell): deny a direct jest invocation whose worker count is not bounded.
// Why: on 2026-11-19 `pnpm exec jest --config ../../jest.config.cjs` (no --runInBand) started ~31 workers
// of ~4 GB each on a 32-core machine (112 GB committed, 0 GB free, disk pegged), and kept running after the
// user interrupted the tool call. The package scripts (`pnpm --filter <pkg> test`) already pass --runInBand,
// so they never match here: this only stops a hand-written jest call.
// Allowed: --runInBand / -i, --maxWorkers=1..4 (or -w 1..4), and the read-only flags below.
'use strict';

// A jest being RUN (not merely named in a path, a grep or a config file name): at the start of a command
// or after ; & | ( or a quote, after exec/npx/dlx/run, or as node_modules/.bin/jest or jest/bin/jest(.js).
const RUNS_JEST =
  /(?:^|[;&|('"]\s*|\b(?:exec|npx|dlx|run)\s+(?:-\S+\s+)*|\b(?:cross-env|env)\s+(?:\S+=\S+\s+)*)jest(?:\.js|\.cmd)?(?=\s|$|['"])|[\\/]\.bin[\\/]+jest(?:\.js|\.cmd)?(?=\s|$|['"])|[\\/]jest[\\/]bin[\\/]jest(?:\.js)?(?=\s|$|['"])/i;
const READ_ONLY = /--(?:listTests|version|showConfig|help)\b/;
const BOUNDED = /--runInBand\b|(?:^|\s)-i(?=\s|$)|--maxWorkers[= ]\s*[1-4](?=\s|$|['"])|(?:^|\s)-w[= ]?\s*[1-4](?=\s|$|['"])/;

function verdict(cmd) {
  if (!RUNS_JEST.test(cmd)) return null;
  if (READ_ONLY.test(cmd) || BOUNDED.test(cmd)) return null;
  return (
    'Unbounded jest is blocked: without --runInBand jest starts one worker per core (~31 here), and a worker ' +
    'on this suite holds ~4 GB, so one run used 112 GB and froze the machine. Run the package script ' +
    "(`pnpm --filter game-client test`, which is --runInBand and scoped to the package), or add " +
    '--runInBand --testPathPatterns <path> (or --maxWorkers=4 at most) to the command.'
  );
}

module.exports = { verdict };

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (d) => (raw += d));
  process.stdin.on('end', () => {
    let cmd = '';
    try {
      const input = JSON.parse(raw || '{}');
      cmd = String((input.tool_input && input.tool_input.command) || '');
    } catch {
      process.exit(0); // unparseable: stay out of the way
    }
    const reason = verdict(cmd);
    if (reason) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: reason,
          },
        })
      );
    }
    process.exit(0);
  });
}
