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
  };
}
