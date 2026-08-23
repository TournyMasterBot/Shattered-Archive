import fs from 'fs';

import { EngineRebuildStore, type CommandRunner } from './engine-rebuild.js';

interface RecordedCall {
  cmd: string;
  args: string[];
  cwd?: string;
}

function makeRecordingRunner(opts: { failOnCallIndex?: number } = {}): { run: CommandRunner; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const run: CommandRunner = async (cmd, args, options) => {
    calls.push({ cmd, args, cwd: options?.cwd });
    if (opts.failOnCallIndex !== undefined && calls.length - 1 === opts.failOnCallIndex) {
      throw new Error(`simulated failure on call ${calls.length - 1}`);
    }
    return { stdout: '', stderr: '' };
  };
  return { run, calls };
}

function makeConfig() {
  return { mercMudRepoPath: 'C:/Projects/merc-mud', mercMudHostPath: 'C:/Projects/merc-mud' };
}

describe('EngineRebuildStore', () => {
  it('read() returns null and isRunning() is false before any run', () => {
    const { run } = makeRecordingRunner();
    const store = new EngineRebuildStore(makeConfig(), run);
    expect(store.read()).toBeNull();
    expect(store.isRunning()).toBe(false);
  });

  it('runPipeline() issues EXACTLY two docker invocations — build then recreate, mercmud24 only', async () => {
    const { run, calls } = makeRecordingRunner();
    const store = new EngineRebuildStore(makeConfig(), run);

    await store.runPipeline('melchaleve');

    expect(calls).toHaveLength(2);
    expect(calls[0].cmd).toBe('docker');
    expect(calls[0].args).toEqual(['compose', '-p', 'merc-mud', '-f', 'C:/Projects/merc-mud/docker-compose.yml', 'build', 'mercmud24']);
    expect(calls[1].cmd).toBe('docker');
    expect(calls[1].args[0]).toBe('compose');
    expect(calls[1].args).toContain('up');
    expect(calls[1].args).toContain('--force-recreate');
    expect(calls[1].args).toContain('--no-build');
    expect(calls[1].args).toContain('mercmud24');
    // Never any other service or project name anywhere in either call.
    for (const call of calls) {
      expect(call.args).not.toContain('mud-builder-server');
      expect(call.args).not.toContain('shatteredarchive');
      expect(call.args).not.toContain('shatteredarchive-prod');
    }
  });

  it('ends in phase "complete", with the actor recorded', async () => {
    const { run } = makeRecordingRunner();
    const store = new EngineRebuildStore(makeConfig(), run);
    await store.runPipeline('melchaleve');
    const status = store.read();
    expect(status!.phase).toBe('complete');
    expect(status!.actor).toBe('melchaleve');
    expect(status!.error).toBeUndefined();
    expect(store.isRunning()).toBe(false);
  });

  it('the recreate step uses an ABSOLUTE-path override file, never the relative base paths, and covers all three volumes', async () => {
    const { run, calls } = makeRecordingRunner();
    const store = new EngineRebuildStore(makeConfig(), run);
    await store.runPipeline('melchaleve');

    const recreateCall = calls[1];
    const overrideFlagIndex = recreateCall.args.indexOf('-f', recreateCall.args.indexOf('-f') + 1);
    const overridePath = recreateCall.args[overrideFlagIndex + 1];
    expect(fs.existsSync(overridePath)).toBe(true);
    const content = fs.readFileSync(overridePath, 'utf8');
    expect(content).toContain('C:/Projects/merc-mud/2.4/player:/opt/merc-mud/player');
    expect(content).toContain('C:/Projects/merc-mud/2.4/area:/opt/merc-mud/area');
    expect(content).toContain('C:/Projects/merc-mud/2.4/character-sync:/opt/merc-mud/character-sync');
    expect(content).not.toMatch(/["\s]\.\/2\.4/);
  });

  it('a build failure marks the status "failed" and re-throws, without ever attempting the recreate call', async () => {
    const { run, calls } = makeRecordingRunner({ failOnCallIndex: 0 });
    const store = new EngineRebuildStore(makeConfig(), run);

    await expect(store.runPipeline('melchaleve')).rejects.toThrow('simulated failure on call 0');

    const status = store.read();
    expect(status!.phase).toBe('failed');
    expect(status!.error).toBe('simulated failure on call 0');
    expect(calls).toHaveLength(1);
  });

  it('refuses to start a second rebuild while one is already in progress', async () => {
    let resolveFirst: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const run: CommandRunner = async () => {
      await gate;
      return { stdout: '', stderr: '' };
    };
    const store = new EngineRebuildStore(makeConfig(), run);

    const first = store.runPipeline('melchaleve');
    expect(store.isRunning()).toBe(true);
    await expect(store.runPipeline('someone-else')).rejects.toThrow('a rebuild is already in progress');

    resolveFirst?.();
    await first;
  });
});
