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
}

export function getMudBuilderConfig(env: NodeJS.ProcessEnv = process.env): MudBuilderConfig {
  const mercMudPath = env.MERC_MUD_PATH ?? 'C:/Projects/merc-mud';
  const mercAreaDir = env.MERC_AREA_DIR ?? '2.4/area';
  return {
    mercMudPath,
    mercAreaDir,
    areaPath: path.resolve(mercMudPath, mercAreaDir),
    writeEnabled: env.MUD_WRITE_ENABLED === 'true',
  };
}
