import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { SimulacrumConfig } from './config.js';

/**
 * AI-ANNOTATION
 * @ai-summary Rebuilds ONLY the merc-mud engine container (compose service `mercmud24`,
 *   project `merc-mud`, defined in merc-mud/docker-compose.yml) — a deliberately trimmed
 *   copy of mud-builder-server's rebuild-store.ts covering only its steps 1-2 (build,
 *   recreate). That file's steps 3-4 are mud-builder's OWN self-recreate via an ephemeral
 *   helper container; irrelevant here since this process never touches its own container,
 *   so no helper/hand-off is needed — the two docker calls below run synchronously,
 *   in-process, to completion.
 * @ai-public EngineRebuildStore, EngineRebuildStatus, CommandRunner, defaultRunner
 * @ai-notes Every docker invocation here is a hardcoded literal (MERC_MUD_PROJECT /
 *   MERC_MUD_SERVICE below) — no request input ever reaches an argv array. That, plus the
 *   docker-socket-proxy sidecar fronting the real socket (see the compose files), is the
 *   entire enforcement boundary for "this can only ever touch the merc-mud engine."
 *   Status is in-memory only, not persisted — unlike rebuild-store.ts's status.json, which
 *   exists specifically because ITS pipeline tears down its own container mid-run and the
 *   calling process can't survive to report afterward. This pipeline never does that.
 */

export type EngineRebuildPhase = 'building-mercmud24' | 'recreating-mercmud24' | 'complete' | 'failed';

export interface EngineRebuildStatus {
  phase: EngineRebuildPhase;
  actor: string;
  startedAt: string;
  updatedAt: string;
  log: string[];
  error?: string;
}

/** Injectable for testing — always an argv array, never a shell string. */
export type CommandRunner = (
  cmd: string,
  args: string[],
  options?: { cwd?: string; timeoutMs?: number },
) => Promise<{ stdout: string; stderr: string }>;

const execFileAsync = promisify(execFile);

// A C `make` can run a couple of minutes on a small VPS; generous but bounded.
const DEFAULT_STEP_TIMEOUT_MS = 15 * 60 * 1000;

export const defaultRunner: CommandRunner = async (cmd, args, options = {}) => {
  const { stdout, stderr } = await execFileAsync(cmd, args, {
    cwd: options.cwd,
    timeout: options.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
  return { stdout, stderr };
};

// Hardcoded — see the header note. This pair of constants is the whole target surface.
const MERC_MUD_PROJECT = 'merc-mud';
const MERC_MUD_SERVICE = 'mercmud24';

type RebuildConfig = Pick<SimulacrumConfig, 'mercMudRepoPath' | 'mercMudHostPath'>;

export class EngineRebuildStore {
  private status: EngineRebuildStatus | null = null;

  constructor(
    private readonly config: RebuildConfig,
    private readonly run: CommandRunner = defaultRunner,
  ) {}

  read(): EngineRebuildStatus | null {
    return this.status;
  }

  isRunning(): boolean {
    return this.status !== null && this.status.phase !== 'complete' && this.status.phase !== 'failed';
  }

  // Deliberately NOT path.join/path.resolve: those use the OS-native separator (backslash on
  // win32), inconsistent with how the Docker daemon resolves paths regardless of the calling
  // process's OS — same reasoning rebuild-store.ts documents for its own equivalent method.
  private composePath(): string {
    return `${this.config.mercMudRepoPath}/docker-compose.yml`;
  }

  /**
   * Volumes-only override for mercmud24, absolute-path-only. Required because
   * merc-mud/docker-compose.yml's own volume entries are RELATIVE (./2.4/player,
   * ./2.4/area, ./2.4/character-sync) — a compose CLI invoked from INSIDE a container over
   * the socket resolves a relative bind-mount source against wherever the DAEMON thinks
   * "here" is, not the real host directory, silently creating an empty phantom directory
   * instead of erroring (the documented incident behind rebuild-store.ts's identical
   * mechanism). Written to this container's own ephemeral tmpdir, never into the shared
   * area mount — this process's own bookkeeping has no business living where the engine
   * itself reads game data.
   */
  private writeOverride(): string {
    const lines = [
      'services:',
      `  ${MERC_MUD_SERVICE}:`,
      '    volumes:',
      `      - "${this.config.mercMudHostPath}/2.4/player:/opt/merc-mud/player"`,
      `      - "${this.config.mercMudHostPath}/2.4/area:/opt/merc-mud/area"`,
      `      - "${this.config.mercMudHostPath}/2.4/character-sync:/opt/merc-mud/character-sync"`,
    ];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-rebuild-'));
    const overridePath = path.join(dir, 'mercmud24-override.yml');
    fs.writeFileSync(overridePath, `${lines.join('\n')}\n`, 'utf8');
    return overridePath;
  }

  private advance(phase: EngineRebuildPhase, line: string): void {
    if (!this.status) return;
    this.status = { ...this.status, phase, updatedAt: new Date().toISOString(), log: [...this.status.log, line] };
  }

  async runPipeline(actor: string): Promise<void> {
    if (this.isRunning()) throw new Error('a rebuild is already in progress');

    this.status = {
      phase: 'building-mercmud24',
      actor,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      log: [`rebuild started by ${actor}`],
    };

    try {
      await this.run(
        'docker',
        ['compose', '-p', MERC_MUD_PROJECT, '-f', this.composePath(), 'build', MERC_MUD_SERVICE],
        { cwd: this.config.mercMudRepoPath },
      );
      this.advance('recreating-mercmud24', `${MERC_MUD_SERVICE} image built`);

      const override = this.writeOverride();
      await this.run(
        'docker',
        [
          'compose',
          '-p',
          MERC_MUD_PROJECT,
          '-f',
          this.composePath(),
          '-f',
          override,
          'up',
          '-d',
          '--force-recreate',
          '--no-build',
          MERC_MUD_SERVICE,
        ],
        { cwd: this.config.mercMudRepoPath },
      );
      this.advance('complete', `${MERC_MUD_SERVICE} recreated`);
    } catch (e) {
      const message = (e as Error).message;
      if (this.status) {
        this.status = {
          ...this.status,
          phase: 'failed',
          updatedAt: new Date().toISOString(),
          error: message,
          log: [...this.status.log, `FAILED: ${message}`],
        };
      }
      throw e;
    }
  }
}
