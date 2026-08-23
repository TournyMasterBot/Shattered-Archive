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
  /**
   * BROWSER-facing auth-server origin, handed to the client via /api/capabilities so it can
   * enroll a device key. Distinct from authServerUrl, which is an internal docker alias the
   * browser cannot resolve — same split kingdom-tactics-server already makes
   * (AUTH_SERVER_URL vs AUTH_SERVER_PUBLIC_URL). Absent = device credentials unadvertised, so
   * the client stays on manual token entry.
   *
   * OPTIONAL on purpose, unlike authServerUrl: that one has a sane localhost default, whereas
   * this has no safe default at all (guessing would hand the browser an unreachable internal
   * alias), so "not configured" must be representable.
   */
  authServerPublicUrl?: string;
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
  /**
   * Production hardening (2026-08-23): gates rebuild-store.ts's steps 1-2 (build+recreate
   * mercmud24) independently of rebuildEnabled itself. Default true reproduces every existing
   * caller's behavior unchanged (the experimental compose, every test). Production sets this
   * false — mercmud24 rebuilds are exclusively simulacrum-server's job there (see
   * apps/simulacrum-server/src/engine-rebuild.ts), since the two pipelines had already drifted
   * (this one's volume override omits character-sync; simulacrum's covers it) and duplicating
   * privileged access to the same container buys nothing.
   */
  rebuildMercMud: boolean;
  /**
   * Production hardening (2026-08-23): the compose file (relative to shatteredArchiveRepoPath)
   * rebuild-store.ts's OWN build/self-recreate steps (3-4) target. Was a hardcoded literal
   * pointing at the experimental compose file; default here preserves that exact behavior.
   * Production overrides to "deploy/docker-compose.yml".
   */
  builderComposeFile: string;
  /** Same idea as builderComposeFile, for the -p project name — was the hardcoded literal
   * "shatteredarchive"; production overrides to "shatteredarchive-prod". */
  builderComposeProject: string;
  /**
   * Production hardening (2026-08-23): the real docker network name the ephemeral self-recreate
   * helper's bare `docker run` must join to resolve a docker-socket-proxy sidecar by name — a
   * bare `docker run` doesn't inherit compose's automatic network attachment. Only meaningful
   * when DOCKER_HOST is set; unset in the experimental compose, which still mounts the raw
   * socket directly.
   */
  dockerNetworkName?: string;
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
    // No fallback to authServerUrl: that value is an internal alias in every deployed
    // environment, and handing it to a browser would produce a silent, confusing failure.
    // Unset means "don't offer device enrollment", which is honest and safe.
    authServerPublicUrl: env.AUTH_SERVER_PUBLIC_URL?.replace(/\/+$/, '') || undefined,
    servicePrivateKeyPath: env.SERVICE_PRIVATE_KEY_PATH || undefined,
    rebuildEnabled: env.MUD_REBUILD_ENABLED === 'true',
    mercMudRepoPath: env.MERC_MUD_REPO_PATH ?? mercMudPath,
    mercMudHostPath: env.MERC_MUD_HOST_PATH ?? 'C:/Projects/merc-mud',
    shatteredArchiveRepoPath: env.SHATTERED_ARCHIVE_REPO_PATH ?? 'C:/Projects/ShatteredArchive',
    shatteredArchiveHostPath: env.SHATTERED_ARCHIVE_HOST_PATH ?? 'C:/Projects/ShatteredArchive',
    clientUrl: env.MUD_BUILDER_CLIENT_URL || undefined,
    rebuildMercMud: env.MUD_REBUILD_MERCMUD_ENABLED !== 'false',
    builderComposeFile: env.SHATTERED_ARCHIVE_COMPOSE_FILE ?? 'deploy/docker-compose.shattered-archive-experimental.yml',
    builderComposeProject: env.SHATTERED_ARCHIVE_COMPOSE_PROJECT ?? 'shatteredarchive',
    dockerNetworkName: env.MUD_BUILDER_DOCKER_NETWORK || undefined,
  };
}
