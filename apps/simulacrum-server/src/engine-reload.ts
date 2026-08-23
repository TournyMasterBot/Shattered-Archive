import fs from 'fs';
import path from 'path';

/**
 * AI-ANNOTATION
 * @ai-summary Writes reload/copyover signal files for the merc-mud engine — a standalone
 *   mirror of mud-builder-server's AreaStore.requestReload(), not an import of it (same
 *   don't-cross-the-app-boundary precedent already used by role-store.ts). Pure file I/O,
 *   zero Docker involvement: the C engine's own pulse loop (2.4/src/area_reload.c,
 *   copyover.c) polls for these once a second and consumes them.
 * @ai-public EngineReloadError, EngineReloadWriter
 * @ai-notes Signal files MUST land at the area directory's TOP LEVEL, not a subfolder —
 *   the C side opens them via a bare relative fopen(), which resolves against the engine
 *   process's cwd (the mounted area dir, per the Dockerfile's `cd area && exec ../src/rom`).
 */

const AREA_FILE_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.are$/;

export class EngineReloadError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'EngineReloadError';
  }
}

export class EngineReloadWriter {
  constructor(
    private readonly areaPath: string,
    private readonly enabled: boolean,
  ) {}

  requestReload(mode: 'hot' | 'copyover', file?: string): { signalPath: string } {
    if (!this.enabled) {
      throw new EngineReloadError('reload requests are disabled (SIMULACRUM_ENGINE_RELOAD_ENABLED is not "true")', 403);
    }
    if (mode === 'hot') {
      if (file === undefined) {
        throw new EngineReloadError('hot reload requires "file" (the area file to reload)', 400);
      }
      if (!AREA_FILE_RE.test(file)) {
        throw new EngineReloadError(`invalid area file name: ${JSON.stringify(file)}`, 400);
      }
      const signalPath = path.join(this.areaPath, 'reload.signal');
      fs.writeFileSync(signalPath, `${file}\n`, 'utf8');
      return { signalPath };
    }
    const signalPath = path.join(this.areaPath, 'copyover.signal');
    fs.writeFileSync(signalPath, '\n', 'utf8');
    return { signalPath };
  }
}
