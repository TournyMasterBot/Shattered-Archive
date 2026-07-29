import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import type { MudBuilderConfig } from './config.js';

/**
 * AI-ANNOTATION
 * @ai-summary Phase 15 engine-rebuild orchestration: builds+recreates `mercmud24`
 *   directly (a separate container, no self-termination risk), builds the
 *   builder-pair images directly, then hands off the pair's own recreate to an
 *   ephemeral `docker run --rm -d` helper (Step 6's proven pattern — a
 *   container cannot safely recreate itself in-process; the daemon tears down
 *   the old container mid-operation and kills whatever process issued the
 *   command if it's still attached to that container). Status is persisted to
 *   `<areaPath>/rebuild/status.json` (atomic tmp+rename, mirrors
 *   codegen-store.ts) BEFORE each riskier step — the calling process cannot
 *   reliably observe or report anything after the handoff, confirmed by Step
 *   6's spike (a blocking self-recreate call was SIGKILLed mid-operation).
 * @ai-public RebuildStore, RebuildPhase, RebuildStatus, CommandRunner
 * @ai-notes Every bind-mount source in every command here MUST be an absolute
 *   host path — Step 6 proved that a RELATIVE compose bind-mount source
 *   (matching merc-mud/docker-compose.yml's own `./2.4/area` shape) resolves
 *   to a silently-created EMPTY phantom directory when the compose command is
 *   issued from inside a container over the socket, with no error. Overrides
 *   here replace only the specific volume ENTRIES that are relative in the
 *   base file — confirmed via `docker compose config` (merge-by-target, no
 *   duplicates) against both real compose files before this was written.
 */

export type RebuildPhase =
  | 'building-mercmud24'
  | 'recreating-mercmud24'
  | 'building-builder-images'
  | 'handing-off-to-helper'
  | 'complete'
  | 'failed';

export interface RebuildStatus {
  phase: RebuildPhase;
  actor: string;
  startedAt: string;
  updatedAt: string;
  log: string[];
  error?: string;
}

/** Injectable for testing. Always an argv array, never a shell string — no user input reaches this pipeline at all (the route takes no body), but argv arrays sidestep shell-quoting bugs entirely regardless. */
export type CommandRunner = (cmd: string, args: string[], options?: { cwd?: string; timeoutMs?: number }) => Promise<{ stdout: string; stderr: string }>;

const execFileAsync = promisify(execFile);

// An engine `make` or a full pnpm workspace build can run several minutes.
const DEFAULT_STEP_TIMEOUT_MS = 15 * 60 * 1000;

export const defaultRunner: CommandRunner = async (cmd, args, options = {}) => {
  const { stdout, stderr } = await execFileAsync(cmd, args, {
    cwd: options.cwd,
    timeout: options.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
  return { stdout, stderr };
};

// docker:27-cli, pinned by digest (2026-07-25) — this is a PRIVILEGED helper (full
// docker.sock access), pulled at runtime rather than baked into an image, so it gets
// the same digest-pinning treatment this repo requires for Dockerfile FROM lines.
const HELPER_IMAGE = 'docker:27-cli@sha256:851f91d241214e7c6db86513b270d58776379aacc5eb9c4a87e5b47115e3065c';

// Explicit compose project names (`-p`) — REQUIRED, not cosmetic. Found live 2026-07-25:
// merc-mud/docker-compose.yml has no `name:` field, so compose falls back to inferring
// the project name from the compose FILE's OWN directory basename — which is
// "host-merc-mud" when invoked via the container-side mount, not "merc-mud" like every
// host-side invocation. That mismatch made compose think it was a BRAND NEW project and
// try to create a second container/network sharing the same fixed container_name,
// failing with "Conflict: container name already in use" rather than recognizing the
// existing container as the one to recreate. The shattered-archive-experimental compose
// file DOES pin `name: shatteredarchive` explicitly, so it wouldn't have hit this same
// bug — but every invocation gets an explicit -p here anyway, for the same robustness
// against future compose-file edits.
const MERC_MUD_PROJECT = 'merc-mud';
const SHATTERED_ARCHIVE_PROJECT = 'shatteredarchive';

type RebuildConfig = Pick<
  MudBuilderConfig,
  'areaPath' | 'mercMudRepoPath' | 'mercMudHostPath' | 'shatteredArchiveRepoPath' | 'shatteredArchiveHostPath'
>;

export class RebuildStore {
  constructor(
    private readonly config: RebuildConfig,
    private readonly run: CommandRunner = defaultRunner,
  ) {}

  private get rebuildDir(): string {
    return path.join(this.config.areaPath, 'rebuild');
  }

  private get statusPath(): string {
    return path.join(this.rebuildDir, 'status.json');
  }

  /** Tolerant of a missing or corrupt status file — a builder must always be able to start fresh. */
  read(): RebuildStatus | null {
    try {
      if (!fs.existsSync(this.statusPath)) return null;
      return JSON.parse(fs.readFileSync(this.statusPath, 'utf8')) as RebuildStatus;
    } catch {
      return null;
    }
  }

  private persist(status: RebuildStatus): void {
    fs.mkdirSync(this.rebuildDir, { recursive: true });
    const tmp = `${this.statusPath}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, this.statusPath);
  }

  isRunning(): boolean {
    const s = this.read();
    return s !== null && s.phase !== 'complete' && s.phase !== 'failed';
  }

  /**
   * Boot-time check (called once at server startup). A dangling "handed off" record means
   * the PREVIOUS process died before it could observe the helper's outcome — expected and
   * unavoidable (Step 6 proved the calling process cannot survive past this point). There is
   * no way to know for certain whether the helper's recreate actually succeeded; refusing
   * every future rebuild forever would permanently wedge the feature, so this is presumed
   * complete. (The fact this NEW process is running at all, on the NEW image, is itself
   * reasonably strong circumstantial evidence the recreate worked.)
   */
  resolveDanglingOnBoot(): void {
    const s = this.read();
    if (s && s.phase === 'handing-off-to-helper') {
      this.persist({
        ...s,
        phase: 'complete',
        updatedAt: new Date().toISOString(),
        log: [
          ...s.log,
          'server restarted after handoff — presumed complete (the pre-recreate process cannot observe the outcome; see Phase 15 plan Constraints and Step 6 findings)',
        ],
      });
    }
  }

  private advance(status: RebuildStatus, phase: RebuildPhase, line: string): RebuildStatus {
    const next: RebuildStatus = { ...status, phase, updatedAt: new Date().toISOString(), log: [...status.log, line] };
    this.persist(next);
    return next;
  }

  // Deliberately NOT path.join/path.resolve: those use the OS-native separator, which on
  // win32 means backslashes — inconsistent with every other forward-slash path this
  // pipeline constructs (and with how Docker Desktop's own daemon resolves paths, as
  // confirmed live in the Step 6 spike). These stay POSIX-style strings throughout.
  private mercMudComposePath(): string {
    return `${this.config.mercMudRepoPath}/docker-compose.yml`;
  }

  private builderComposePath(): string {
    return `${this.config.shatteredArchiveRepoPath}/deploy/docker-compose.shattered-archive-experimental.yml`;
  }

  /** Writes a small volumes-only override for ONE service, absolute-path-only (Step 6). Written under the writable rebuildDir, read back by this SAME process — no cross-container path issue. */
  private writeMercMudOverride(): string {
    const lines = [
      'services:',
      '  mercmud24:',
      '    volumes:',
      `      - "${this.config.mercMudHostPath}/2.4/player:/opt/merc-mud/player"`,
      `      - "${this.config.mercMudHostPath}/2.4/area:/opt/merc-mud/area"`,
    ];
    const overridePath = path.join(this.rebuildDir, 'mercmud24-override.yml');
    fs.mkdirSync(this.rebuildDir, { recursive: true });
    fs.writeFileSync(overridePath, `${lines.join('\n')}\n`, 'utf8');
    return overridePath;
  }

  /**
   * The final recreate targets THIS process's own container — per Step 6, that MUST go
   * through a detached ephemeral helper, never run directly. The helper is a fresh,
   * unrelated container with only the docker socket and a read-only view of the repo (for
   * the base compose file); its OWN absolute-path override is generated as an inline
   * heredoc in its shell script rather than a file this process writes, since this
   * process has no writable location the helper could read from.
   */
  private async spawnRecreateHelper(): Promise<void> {
    const repoMount = '/host-shattered-archive';
    const overrideYaml = [
      'services:',
      '  mud-builder-server:',
      '    volumes:',
      `      - "${this.config.shatteredArchiveHostPath}/apps/mud-builder-server/secrets:/repo/apps/mud-builder-server/secrets:ro"`,
    ].join('\n');
    const helperScript = [
      `cat > /tmp/builder-override.yml <<'REBUILD_OVERRIDE_EOF'`,
      overrideYaml,
      `REBUILD_OVERRIDE_EOF`,
      [
        'docker compose',
        `-p ${SHATTERED_ARCHIVE_PROJECT}`,
        `-f ${repoMount}/deploy/docker-compose.shattered-archive-experimental.yml`,
        '-f /tmp/builder-override.yml',
        'up -d --force-recreate --no-build',
        'mud-builder-server mud-builder-client',
      ].join(' '),
    ].join('\n');

    await this.run('docker', [
      'run',
      '--rm',
      '-d',
      '-v',
      '/var/run/docker.sock:/var/run/docker.sock',
      '-v',
      `${this.config.shatteredArchiveHostPath}:${repoMount}:ro`,
      HELPER_IMAGE,
      'sh',
      '-c',
      helperScript,
    ]);
  }

  /**
   * Runs the full pipeline. Callers invoke this as `void rebuildStore.runPipeline(actor)` —
   * the HTTP route responds 202 immediately; this continues in the background. Never
   * assume this resolves normally in production: the final step tears down this very
   * process's own container.
   */
  async runPipeline(actor: string): Promise<void> {
    if (this.isRunning()) throw new Error('a rebuild is already in progress');

    let status: RebuildStatus = {
      phase: 'building-mercmud24',
      actor,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      log: [`rebuild started by ${actor}`],
    };
    this.persist(status);

    try {
      // Step 1: build mercmud24 (compile). Safe — doesn't touch the running container.
      await this.run('docker', ['compose', '-p', MERC_MUD_PROJECT, '-f', this.mercMudComposePath(), 'build', 'mercmud24'], {
        cwd: this.config.mercMudRepoPath,
      });
      status = this.advance(status, 'recreating-mercmud24', 'mercmud24 image built');

      // Step 2: recreate mercmud24 — a DIFFERENT container from this process's own, so this
      // runs directly (no self-termination race, no ephemeral helper needed). MUST use the
      // absolute-path override (Step 6) or the area/player mounts silently go empty, AND the
      // explicit -p (see MERC_MUD_PROJECT's comment) or compose creates a conflicting second
      // container instead of recreating the existing one.
      const mercMudOverride = this.writeMercMudOverride();
      await this.run(
        'docker',
        [
          'compose',
          '-p',
          MERC_MUD_PROJECT,
          '-f',
          this.mercMudComposePath(),
          '-f',
          mercMudOverride,
          'up',
          '-d',
          '--force-recreate',
          '--no-build',
          'mercmud24',
        ],
        { cwd: this.config.mercMudRepoPath },
      );
      status = this.advance(status, 'building-builder-images', 'mercmud24 recreated');

      // Step 3: build (not recreate) the builder images. Safe — no running container touched.
      await this.run(
        'docker',
        ['compose', '-p', SHATTERED_ARCHIVE_PROJECT, '-f', this.builderComposePath(), 'build', 'mud-builder-server', 'mud-builder-client'],
        { cwd: this.config.shatteredArchiveRepoPath },
      );
      status = this.advance(
        status,
        'handing-off-to-helper',
        'builder images built; handing off to an ephemeral helper for the final recreate',
      );

      // Step 4: from here on this process may be torn down at any moment — status is
      // already flushed (the line above). Spawn the detached helper and return; do NOT
      // await anything that assumes this process survives.
      await this.spawnRecreateHelper();
    } catch (e) {
      const message = (e as Error).message;
      this.persist({ ...status, phase: 'failed', updatedAt: new Date().toISOString(), error: message, log: [...status.log, `FAILED: ${message}`] });
      throw e;
    }
  }
}
