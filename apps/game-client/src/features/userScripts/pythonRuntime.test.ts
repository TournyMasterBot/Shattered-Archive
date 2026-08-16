import { runPythonSourceInBrowser, loadPythonModuleBody, callPythonModuleFunction } from './pythonRuntime';
import type { ScriptSandboxApi } from './types';

// Exercises the REAL Skulpt engine. These cover the two defects fixed on
// 2026-08-01, both of which passed code review for months because the bridge
// API (sendCommand/log) kept working while everything else silently did not:
//
//  1. read() threw unconditionally, so `import <anything>` failed — and print()
//     with it, since Skulpt reaches for `sys` to get at stdout.
//  2. global modules were loaded under a name but registered as `__main__`, so
//     calling into them via `import <name> as g` could never resolve.

function recorder() {
  const sent: string[] = [];
  const logged: unknown[][] = [];
  const errors: unknown[][] = [];
  const api: ScriptSandboxApi = {
    sendCommand: (cmd: string) => void sent.push(cmd),
    log: (...args: unknown[]) => void logged.push(args),
    error: (...args: unknown[]) => void errors.push(args),
  };
  return { api, sent, logged, errors };
}

describe('per-script Python', () => {
  it('still runs bridge calls and loops (the part that always worked)', async () => {
    const r = recorder();
    await runPythonSourceInBrowser('for i in range(3):\n    sendCommand("kick %d" % i)\n', r.api);

    expect(r.sent).toEqual(['kick 0', 'kick 1', 'kick 2']);
    expect(r.errors).toEqual([]);
  });

  it('runs print() — previously failed with "No module named sys"', async () => {
    const r = recorder();
    await runPythonSourceInBrowser('print("hello")', r.api);

    expect(r.errors).toEqual([]);
    expect(r.logged.flat().join('')).toContain('hello');
  });

  it('imports from the standard library — previously failed outright', async () => {
    const r = recorder();
    await runPythonSourceInBrowser('import math\nsendCommand("n %d" % int(math.floor(3.7)))\n', r.api);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['n 3']);
  });

  it('reports a syntax error through api.error rather than throwing', async () => {
    const r = recorder();
    await runPythonSourceInBrowser('def (:', r.api);

    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.sent).toEqual([]);
  });

  it('exposes the trigger event payload as a dict via `event`', async () => {
    const r = recorder();
    r.api.event = { name: 'shatteredarchive:raw-data', payload: { text: 'Someone tells the group hi' } };

    await runPythonSourceInBrowser(
      'payload = (event or {}).get("payload") or {}\nsendCommand(payload.get("text", ""))\n',
      r.api,
    );

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['Someone tells the group hi']);
  });

  it('leaves `event` as None when no event context is active', async () => {
    const r = recorder();
    await runPythonSourceInBrowser('sendCommand("is none: %s" % (event is None))\n', r.api);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['is none: True']);
  });
});

describe('global Python modules', () => {
  it('calls a function in a loaded global module', async () => {
    const r = recorder();
    await loadPythonModuleBody('sa_globals_test', 'def heal(args):\n    sendCommand("quaff " + args["potion"])\n', r.api);
    await callPythonModuleFunction('sa_globals_test', 'heal', { potion: 'heal' }, r.api);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['quaff heal']);
  });

  it('passes None when the caller supplies no args', async () => {
    const r = recorder();
    await loadPythonModuleBody('sa_globals_noargs', 'def ping(args):\n    sendCommand("pong")\n', r.api);
    await callPythonModuleFunction('sa_globals_noargs', 'ping', undefined, r.api);

    expect(r.sent).toEqual(['pong']);
  });

  it('keeps module-level state across calls', async () => {
    const r = recorder();
    await loadPythonModuleBody('sa_globals_state', 'n = 0\ndef tick(args):\n    global n\n    n += 1\n    sendCommand("n%d" % n)\n', r.api);
    await callPythonModuleFunction('sa_globals_state', 'tick', undefined, r.api);
    await callPythonModuleFunction('sa_globals_state', 'tick', undefined, r.api);

    expect(r.sent).toEqual(['n1', 'n2']);
  });

  it('reports a missing function instead of throwing', async () => {
    const r = recorder();
    await loadPythonModuleBody('sa_globals_missing', 'def other(args):\n    pass\n', r.api);
    await callPythonModuleFunction('sa_globals_missing', 'nope', undefined, r.api);

    expect(r.errors.length).toBeGreaterThan(0);
    expect(String(r.errors[0][0])).toContain('not found');
  });

  it('reports a module that was never loaded instead of throwing', async () => {
    const r = recorder();
    await callPythonModuleFunction('sa_globals_never_loaded', 'anything', undefined, r.api);

    expect(r.errors.length).toBeGreaterThan(0);
    expect(String(r.errors[0][0])).toContain('not loaded');
  });
});
