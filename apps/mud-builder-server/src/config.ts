import path from 'path';

/**
 * Runtime configuration for the MUD builder server.
 *
 * `writeEnabled` gates every route that touches the MUD folders on disk
 * (PUT /api/areas/:file, POST /api/reload). It is ONLY meant to be true when
 * deployed via the experimental docker compose file (or set deliberately for a
 * local staging verification against merc-mud) — never by default.
 */
export interface MudBuilderConfig {
  /** Root of the target MUD checkout (host path). */
  mercMudPath: string;
  /** Area directory relative to mercMudPath. */
  mercAreaDir: string;
  /** Fully resolved area directory. */
  areaPath: string;
  /** Whether disk writes to the MUD folders are permitted. */
  writeEnabled: boolean;
  /**
   * Whether the bearer-token guard is active (Phase 9). On whenever writes are
   * enabled — the deployed write-capable stack must never run open. The
   * MUD_BUILDER_AUTH=off escape hatch exists for local write-mode testing only
   * and must never be set in a deployed compose file.
   */
  authEnabled: boolean;
  /**
   * Where builder-auth.json lives (Phase 12b: the auth/ dir on the area bind
   * mount — credentials no longer share the backups/ dir; AuthStore migrates a
   * legacy backups/builder-auth.json on boot).
   */
  authDataPath: string;
  /** Where the append-only audit.log lives (still the backups/ dir). */
  auditDataPath: string;
  /** Base URL of the centralized auth-server, for GET /api/auth/introspect-check (Phase 2). */
  authServerUrl: string;
  /** Path to this service's registered introspect private key (`register-service` output). Unset = introspect-check is unconfigured. */
  servicePrivateKeyPath?: string;
  /**
   * Phase 15: a second, independent, default-off gate for the engine-rebuild feature —
   * alongside whatever container capabilities (docker socket, CLI) are or aren't present.
   * Both must be true for POST /api/rebuild to do anything.
   */
  rebuildEnabled: boolean;
  /**
   * Phase 15: where THIS PROCESS can read the full merc-mud repo tree (docker-compose.yml,
   * 2.4/src/const.c, the Dockerfile build context) — in the deployed container this is the
   * Step 5 read-only /host-merc-mud mount, distinct from mercMudPath (which only exposes the
   * area/ subfolder, writable). In local dev (no container boundary) it's the same value as
   * mercMudPath's own default.
   */
  mercMudRepoPath: string;
  /**
   * Phase 15: the REAL host-filesystem path to the merc-mud repo, as the DOCKER DAEMON (which
   * always runs on the true host, never inside a container) needs to see it for bind-mount
   * sources — used only to generate the rebuild pipeline's absolute-path compose override
   * (Step 6 finding: relative bind mounts resolve incorrectly when compose is invoked from
   * inside a container). In this single-operator deployment this never actually differs from
   * mercMudRepoPath's default; kept as its own field for clarity about whose filesystem view
   * it describes.
   */
  mercMudHostPath: string;
  /** Phase 15: same idea as mercMudRepoPath, for the ShatteredArchive repo itself (the compose file + Dockerfiles for the builder pair). */
  shatteredArchiveRepoPath: string;
  /** Phase 15: same idea as mercMudHostPath, for the ShatteredArchive repo. */
  shatteredArchiveHostPath: string;
  /** Phase H: mud-builder-client's own origin, for the dashboard summary's link-out. Unset = omitted from the response, never guessed. */
  clientUrl?: string;
}

export function getMudBuilderConfig(env: NodeJS.ProcessEnv = process.env): MudBuilderConfig {
  const mercMudPath = env.MERC_MUD_PATH ?? 'C:/Projects/merc-mud';
  const mercAreaDir = env.MERC_AREA_DIR ?? '2.4/area';
  const areaPath = path.resolve(mercMudPath, mercAreaDir);
  const writeEnabled = env.MUD_WRITE_ENABLED === 'true';
  return {
    mercMudPath,
    mercAreaDir,
    areaPath,
    writeEnabled,
    authEnabled: writeEnabled && env.MUD_BUILDER_AUTH !== 'off',
    authDataPath: path.join(areaPath, 'auth'),
    auditDataPath: path.join(areaPath, 'backups'),
    authServerUrl: env.AUTH_SERVER_URL ?? 'http://localhost:62000',
    servicePrivateKeyPath: env.SERVICE_PRIVATE_KEY_PATH || undefined,
    rebuildEnabled: env.MUD_REBUILD_ENABLED === 'true',
    mercMudRepoPath: env.MERC_MUD_REPO_PATH ?? mercMudPath,
    mercMudHostPath: env.MERC_MUD_HOST_PATH ?? 'C:/Projects/merc-mud',
    shatteredArchiveRepoPath: env.SHATTERED_ARCHIVE_REPO_PATH ?? 'C:/Projects/ShatteredArchive',
    shatteredArchiveHostPath: env.SHATTERED_ARCHIVE_HOST_PATH ?? 'C:/Projects/ShatteredArchive',
    clientUrl: env.MUD_BUILDER_CLIENT_URL || undefined,
  };
}
