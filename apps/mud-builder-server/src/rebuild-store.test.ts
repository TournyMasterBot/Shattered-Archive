import fs from 'fs';
import os from 'os';
import path from 'path';

import { RebuildStore, type CommandRunner, type RebuildStatus } from './rebuild-store.js';

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

function makeConfig(dir: string, overrides: Partial<ReturnType<typeof baseConfig>> = {}) {
  return { ...baseConfig(dir), ...overrides };
}

function baseConfig(dir: string) {
  return {
    areaPath: dir,
    mercMudRepoPath: 'C:/Projects/merc-mud',
    mercMudHostPath: 'C:/Projects/merc-mud',
    shatteredArchiveRepoPath: 'C:/Projects/ShatteredArchive',
    shatteredArchiveHostPath: 'C:/Projects/ShatteredArchive',
    rebuildMercMud: true,
    builderComposeFile: 'deploy/docker-compose.shattered-archive-experimental.yml',
    builderComposeProject: 'shatteredarchive',
    dockerNetworkName: undefined as string | undefined,
  };
}

describe('RebuildStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-rebuild-store-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('read() returns null when no status file exists', () => {
    const { run } = makeRecordingRunner();
    const store = new RebuildStore(makeConfig(dir), run);
    expect(store.read()).toBeNull();
  });

  it('read() tolerates a corrupt status file rather than throwing', () => {
    const { run } = makeRecordingRunner();
    const store = new RebuildStore(makeConfig(dir), run);
    fs.mkdirSync(path.join(dir, 'rebuild'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'rebuild', 'status.json'), 'not valid json{{{', 'utf8');
    expect(store.read()).toBeNull();
  });

  it('isRunning() is false with no status, true mid-pipeline, false again once complete/failed', () => {
    const { run } = makeRecordingRunner();
    const store = new RebuildStore(makeConfig(dir), run);
    expect(store.isRunning()).toBe(false);
  });

  it('runPipeline() runs all steps in order and ends with phase handing-off-to-helper', async () => {
    const { run, calls } = makeRecordingRunner();
    const store = new RebuildStore(makeConfig(dir), run);

    await store.runPipeline('melchaleve');

    const status = store.read();
    expect(status).not.toBeNull();
    expect(status!.phase).toBe('handing-off-to-helper');
    expect(status!.actor).toBe('melchaleve');
    expect(status!.error).toBeUndefined();

    // 4 docker invocations: build mercmud24, recreate mercmud24, build builder images, spawn helper.
    expect(calls).toHaveLength(4);
    expect(calls[0].args).toEqual(['compose', '-p', 'merc-mud', '-f', 'C:/Projects/merc-mud/docker-compose.yml', 'build', 'mercmud24']);
    expect(calls[1].args[0]).toBe('compose');
    expect(calls[1].args).toContain('up');
    expect(calls[1].args).toContain('--force-recreate');
    expect(calls[2].args).toEqual([
      'compose',
      '-p',
      'shatteredarchive',
      '-f',
      'C:/Projects/ShatteredArchive/deploy/docker-compose.shattered-archive-experimental.yml',
      'build',
      'mud-builder-server',
      'mud-builder-client',
    ]);
    expect(calls[3].args).toContain('run');
    expect(calls[3].args).toContain('-d');
  });

  it('every compose invocation passes an explicit -p project name (live E2E regression, 2026-07-25)', async () => {
    // merc-mud/docker-compose.yml has no `name:` field, so compose falls back to
    // inferring the project name from the compose FILE's OWN directory basename — which
    // is "host-merc-mud" when read via the container-side mount, not "merc-mud" like a
    // host-side invocation. Without an explicit -p, this made compose think it was a
    // brand-new project and try to create a SECOND container sharing the fixed
    // container_name, failing with a real "Conflict: name already in use" against the
    // live game engine on the first live end-to-end run. Caught live, fixed here, and
    // guarded permanently: every invocation gets an explicit -p regardless of whether
    // that specific compose file happens to pin its own name.
    const { run, calls } = makeRecordingRunner();
    const store = new RebuildStore(makeConfig(dir), run);
    await store.runPipeline('melchaleve');

    expect(calls).toHaveLength(4);
    expect(calls[0].args).toEqual(expect.arrayContaining(['-p', 'merc-mud'])); // build mercmud24
    expect(calls[1].args).toEqual(expect.arrayContaining(['-p', 'merc-mud'])); // recreate mercmud24
    expect(calls[2].args).toEqual(expect.arrayContaining(['-p', 'shatteredarchive'])); // build builder images
    const helperScript = calls[3].args[calls[3].args.length - 1];
    expect(helperScript).toContain('-p shatteredarchive'); // the helper's own inline compose invocation
  });

  it('the mercmud24 recreate step uses an ABSOLUTE-path override file, never the relative base paths directly (Step 6 finding)', async () => {
    const { run, calls } = makeRecordingRunner();
    const store = new RebuildStore(makeConfig(dir), run);
    await store.runPipeline('melchaleve');

    const recreateCall = calls[1];
    const overrideFlagIndex = recreateCall.args.indexOf('-f', recreateCall.args.indexOf('-f') + 1);
    const overridePath = recreateCall.args[overrideFlagIndex + 1];
    expect(fs.existsSync(overridePath)).toBe(true);
    const overrideContent = fs.readFileSync(overridePath, 'utf8');
    expect(overrideContent).toContain('C:/Projects/merc-mud/2.4/player:/opt/merc-mud/player');
    expect(overrideContent).toContain('C:/Projects/merc-mud/2.4/area:/opt/merc-mud/area');
    // The override must never contain a bare relative "./2.4" style path.
    expect(overrideContent).not.toMatch(/["\s]\.\/2\.4/);
  });

  it('the helper-spawn command targets an absolute secrets path via an inline heredoc, and mounts the repo read-only', async () => {
    const { run, calls } = makeRecordingRunner();
    const store = new RebuildStore(makeConfig(dir), run);
    await store.runPipeline('melchaleve');

    const helperCall = calls[3];
    expect(helperCall.cmd).toBe('docker');
    expect(helperCall.args).toEqual(
      expect.arrayContaining(['--rm', '-d', '-v', '/var/run/docker.sock:/var/run/docker.sock', '-v', 'C:/Projects/ShatteredArchive:/host-shattered-archive:ro']),
    );
    const script = helperCall.args[helperCall.args.length - 1];
    expect(script).toContain('C:/Projects/ShatteredArchive/apps/mud-builder-server/secrets:/repo/apps/mud-builder-server/secrets:ro');
    expect(script).toContain('/host-shattered-archive/deploy/docker-compose.shattered-archive-experimental.yml');
    expect(script).not.toMatch(/["\s]\.\.\/apps/); // never the relative form
  });

  it('every status transition is flushed to disk BEFORE the corresponding step runs (status.json reflects the step about to execute)', async () => {
    const phasesSeenAtEachCall: string[] = [];
    const run: CommandRunner = async (cmd, args, options) => {
      const status = JSON.parse(fs.readFileSync(path.join(dir, 'rebuild', 'status.json'), 'utf8')) as RebuildStatus;
      phasesSeenAtEachCall.push(status.phase);
      return { stdout: '', stderr: '' };
    };
    const store = new RebuildStore(makeConfig(dir), run);
    await store.runPipeline('melchaleve');
    // Call N always observes the phase the PRECEDING advance() set — i.e. status.json is
    // updated before, never after, the step it describes runs.
    expect(phasesSeenAtEachCall).toEqual([
      'building-mercmud24',
      'recreating-mercmud24',
      'building-builder-images',
      'handing-off-to-helper',
    ]);
  });

  it('a failure at any step marks the status "failed" with the error message, and re-throws', async () => {
    const { run } = makeRecordingRunner({ failOnCallIndex: 2 }); // fail on "build builder images"
    const store = new RebuildStore(makeConfig(dir), run);

    await expect(store.runPipeline('melchaleve')).rejects.toThrow('simulated failure on call 2');

    const status = store.read();
    expect(status!.phase).toBe('failed');
    expect(status!.error).toBe('simulated failure on call 2');
    expect(status!.log[status!.log.length - 1]).toMatch(/FAILED: simulated failure on call 2/);
  });

  it('refuses to start a second rebuild while one is already in progress', async () => {
    const { run } = makeRecordingRunner();
    const store = new RebuildStore(makeConfig(dir), run);
    fs.mkdirSync(path.join(dir, 'rebuild'), { recursive: true });
    const inProgress: RebuildStatus = {
      phase: 'building-builder-images',
      actor: 'melchaleve',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      log: ['rebuild started by melchaleve'],
    };
    fs.writeFileSync(path.join(dir, 'rebuild', 'status.json'), JSON.stringify(inProgress), 'utf8');

    expect(store.isRunning()).toBe(true);
    await expect(store.runPipeline('someone-else')).rejects.toThrow('a rebuild is already in progress');
  });

  it('isRunning() is false once a rebuild has reached a terminal phase', async () => {
    const { run } = makeRecordingRunner();
    const store = new RebuildStore(makeConfig(dir), run);
    await store.runPipeline('melchaleve');
    // The pipeline's own last phase is 'handing-off-to-helper' (never observably 'complete'
    // in the same process, per Step 6) -- so it's still "running" from THIS process's own
    // point of view, which is correct: a genuinely new POST /api/rebuild before the next
    // boot's resolveDanglingOnBoot() should still be refused, not silently allowed to race.
    expect(store.isRunning()).toBe(true);
  });

  it('resolveDanglingOnBoot() marks a "handing-off-to-helper" record as complete, with an explanatory log line', () => {
    const { run } = makeRecordingRunner();
    const store = new RebuildStore(makeConfig(dir), run);
    fs.mkdirSync(path.join(dir, 'rebuild'), { recursive: true });
    const dangling: RebuildStatus = {
      phase: 'handing-off-to-helper',
      actor: 'melchaleve',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      log: ['rebuild started by melchaleve'],
    };
    fs.writeFileSync(path.join(dir, 'rebuild', 'status.json'), JSON.stringify(dangling), 'utf8');

    store.resolveDanglingOnBoot();

    const resolved = store.read();
    expect(resolved!.phase).toBe('complete');
    expect(resolved!.log[resolved!.log.length - 1]).toMatch(/presumed complete/);
  });

  it('resolveDanglingOnBoot() is a no-op for any phase other than handing-off-to-helper', () => {
    const { run } = makeRecordingRunner();
    const store = new RebuildStore(makeConfig(dir), run);
    fs.mkdirSync(path.join(dir, 'rebuild'), { recursive: true });
    const inProgress: RebuildStatus = {
      phase: 'building-mercmud24',
      actor: 'melchaleve',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      log: ['rebuild started by melchaleve'],
    };
    fs.writeFileSync(path.join(dir, 'rebuild', 'status.json'), JSON.stringify(inProgress), 'utf8');

    store.resolveDanglingOnBoot();

    expect(store.read()!.phase).toBe('building-mercmud24'); // unchanged
  });

  it('resolveDanglingOnBoot() is a no-op when there is no status file at all', () => {
    const { run } = makeRecordingRunner();
    const store = new RebuildStore(makeConfig(dir), run);
    expect(() => store.resolveDanglingOnBoot()).not.toThrow();
    expect(store.read()).toBeNull();
  });

  it('rebuildMercMud:false skips steps 1-2 entirely — exactly 2 docker calls, both builder-image related', async () => {
    const { run, calls } = makeRecordingRunner();
    const store = new RebuildStore(makeConfig(dir, { rebuildMercMud: false }), run);

    await store.runPipeline('melchaleve');

    expect(calls).toHaveLength(2);
    expect(calls[0].args).toContain('build');
    expect(calls[0].args).toEqual(expect.arrayContaining(['mud-builder-server', 'mud-builder-client']));
    expect(calls[1].args).toContain('run'); // the ephemeral helper spawn
    // mercmud24 never named anywhere.
    for (const call of calls) {
      expect(call.args).not.toContain('mercmud24');
    }
    const status = store.read();
    expect(status!.log).toEqual(
      expect.arrayContaining([expect.stringContaining('mercmud24 rebuild skipped in this environment')]),
    );
  });

  it('DOCKER_HOST set: the helper is handed -e DOCKER_HOST/--network, never the raw socket mount', async () => {
    const { run, calls } = makeRecordingRunner();
    const store = new RebuildStore(
      makeConfig(dir, { rebuildMercMud: false, dockerNetworkName: 'shatteredarchive-prod_default' }),
      run,
    );
    const originalDockerHost = process.env.DOCKER_HOST;
    process.env.DOCKER_HOST = 'tcp://mud-builder-docker-proxy:2375';
    try {
      await store.runPipeline('melchaleve');
    } finally {
      if (originalDockerHost === undefined) delete process.env.DOCKER_HOST;
      else process.env.DOCKER_HOST = originalDockerHost;
    }

    const helperCall = calls[calls.length - 1];
    expect(helperCall.args).toEqual(
      expect.arrayContaining(['-e', 'DOCKER_HOST=tcp://mud-builder-docker-proxy:2375', '--network', 'shatteredarchive-prod_default']),
    );
    expect(helperCall.args).not.toEqual(expect.arrayContaining(['-v', '/var/run/docker.sock:/var/run/docker.sock']));
  });

  it('DOCKER_HOST unset reproduces the exact prior raw-socket-mount args (no regression for the experimental compose)', async () => {
    const { run, calls } = makeRecordingRunner();
    const store = new RebuildStore(makeConfig(dir), run);
    const originalDockerHost = process.env.DOCKER_HOST;
    delete process.env.DOCKER_HOST;
    try {
      await store.runPipeline('melchaleve');
    } finally {
      if (originalDockerHost !== undefined) process.env.DOCKER_HOST = originalDockerHost;
    }

    const helperCall = calls[calls.length - 1];
    expect(helperCall.args).toEqual(expect.arrayContaining(['-v', '/var/run/docker.sock:/var/run/docker.sock']));
    expect(helperCall.args).not.toEqual(expect.arrayContaining(['-e']));
  });

  it('builderComposeFile/builderComposeProject overrides propagate into both the direct build call and the helper heredoc', async () => {
    const { run, calls } = makeRecordingRunner();
    const store = new RebuildStore(
      makeConfig(dir, {
        rebuildMercMud: false,
        builderComposeFile: 'deploy/docker-compose.yml',
        builderComposeProject: 'shatteredarchive-prod',
      }),
      run,
    );
    await store.runPipeline('melchaleve');

    const buildCall = calls[0];
    expect(buildCall.args).toEqual(expect.arrayContaining(['-p', 'shatteredarchive-prod']));
    expect(buildCall.args).toContain('C:/Projects/ShatteredArchive/deploy/docker-compose.yml');

    const helperScript = calls[calls.length - 1].args[calls[calls.length - 1].args.length - 1];
    expect(helperScript).toContain('-p shatteredarchive-prod');
    expect(helperScript).toContain('/host-shattered-archive/deploy/docker-compose.yml');
    expect(helperScript).not.toContain('docker-compose.shattered-archive-experimental.yml');
  });
});
