// apps\psd-viewer-server\src\index.ts
//
// Minimal PSD -> PNG decode service for the psd-viewer client.
//
// PSDs here are large (hundreds of MB), so we never ship raw bytes to the
// browser. Instead we read the file on disk, decode ONLY the flattened
// composite image (ag-psd `skipLayerImageData` avoids decoding the bulk of the
// file — the per-layer pixel data), and stream back a compact PNG.
//
// This is a local-first developer tool, but "local" is not the same as safe: it
// listens on a predictable localhost port, so any page in the developer's browser
// can reach it. Two independent limits apply, and it is worth being precise about
// what each one actually buys:
//
//   * PSD_ROOT containment + a .psd extension gate. This is the one that matters —
//     it bounds what can be read AT ALL, so a hostile ?path= cannot reach outside
//     the presets directory no matter who sends it.
//   * A dev-origin CORS allowlist. This stops a hostile page from READING the
//     response, but it does NOT stop the request: a plain cross-origin GET is not
//     preflighted, so the browser still sends it and this process still does the
//     work. CORS narrows exfiltration; the path check is what prevents the read.
//
// Still do not expose it to an untrusted network.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import cors from 'cors';
import express from 'express';
import { readPsd, initializeCanvas } from 'ag-psd';
import { PNG } from 'pngjs';

// ag-psd needs a canvas/imageData factory even for `useImageData`. We never
// touch real layer canvases (we skip layer data), so a plain ImageData-shaped
// object is enough — this avoids pulling in a native canvas dependency.
const noCanvas = (): never => {
  throw new Error('Canvas rendering is not supported by psd-viewer-server (composite decode only)');
};
initializeCanvas(noCanvas, (width: number, height: number) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
}));

const PORT = Number(process.env.PORT) || 62000;

// The ONE directory this tool reads from. Anything under it is fair game (so a
// PSD sitting next to the presets still opens by name); anything outside is
// unreachable regardless of what ?path= claims.
const PSD_ROOT = path.resolve(path.join(os.homedir(), 'Downloads'));

// Convenience presets — the files this tool was built to open. Only the ones
// that actually exist on disk are advertised to the client.
const PRESET_CANDIDATES = ['Princess.psd', 'Warlock.psd', 'Knight.psd'].map((f) => path.join(PSD_ROOT, f));

// Windows paths are case-insensitive, so a hand-typed `c:\users\...` must still
// match a root derived from `C:\Users\...`. Everywhere else, compare exactly.
const sameCase = (p: string): string => (process.platform === 'win32' ? p.toLowerCase() : p);

function isInsideRoot(candidate: string): boolean {
  const base = sameCase(PSD_ROOT) + path.sep;
  return (sameCase(candidate) + path.sep).startsWith(base);
}

/**
 * Resolve a caller-supplied ?path= into a real path inside PSD_ROOT, or null if it
 * escapes. Mirrors the chokepoint idiom in mud-builder-server's area-store.ts: one
 * function turns untrusted input into a path, and it is the only thing that does.
 *
 * A relative value resolves against PSD_ROOT (so `Princess.psd` works); an absolute
 * one is accepted only if it already lands inside the root. Symlinks are resolved
 * before the verdict is trusted, so a link inside Downloads pointing elsewhere
 * cannot be used as an escape hatch.
 */
function resolveInsideRoot(raw: string): string | null {
  const candidate = path.resolve(PSD_ROOT, raw);
  if (path.extname(candidate).toLowerCase() !== '.psd') return null;
  if (!isInsideRoot(candidate)) return null;
  if (fs.existsSync(candidate) && !isInsideRoot(fs.realpathSync(candidate))) return null;
  return candidate;
}

const app = express();

// Only the vite dev client is allowed to read responses. A request with NO Origin
// (the vite proxy's server-side hop — the normal path — plus curl) is allowed
// through: originless requests aren't browser cross-origin reads.
const ALLOWED_ORIGINS = new Set(['http://localhost:62080', 'http://127.0.0.1:62080']);
app.use(
  cors({
    origin: (origin, callback) => callback(null, !origin || ALLOWED_ORIGINS.has(origin)),
  }),
);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'psd-viewer-server' });
});

app.get('/api/presets', (_req, res) => {
  const presets = PRESET_CANDIDATES.filter((p) => fs.existsSync(p)).map((p) => ({
    name: path.basename(p),
    path: p,
  }));
  res.json({ presets });
});

/**
 * Decode a PSD's flattened composite into a PNG and stream it back.
 * GET /api/psd/png?path=C:\...\Princess.psd
 */
app.get('/api/psd/png', (req, res) => {
  const filePath = typeof req.query.path === 'string' ? req.query.path.trim() : '';

  if (!filePath) {
    res.status(400).json({ error: 'Missing ?path= query parameter' });
    return;
  }

  // Refused BEFORE any filesystem call, so an out-of-root path is not even an
  // existence oracle — the answer is identical whether or not the file is there.
  const resolved = resolveInsideRoot(filePath);
  if (!resolved) {
    res.status(403).json({ error: `Only .psd files inside ${PSD_ROOT} can be opened` });
    return;
  }
  if (!fs.existsSync(resolved)) {
    res.status(404).json({ error: `File not found: ${resolved}` });
    return;
  }

  try {
    const startedAt = Date.now();
    const buffer = fs.readFileSync(resolved);

    // Decode the composite only: skip per-layer pixels (the heavy part) and the
    // embedded thumbnail. `useImageData` returns a raw RGBA buffer we can feed
    // straight into pngjs, so no native canvas dependency is needed.
    const psd = readPsd(buffer, {
      skipLayerImageData: true,
      skipThumbnail: true,
      useImageData: true,
    });

    const composite = psd.imageData;
    if (!composite) {
      res.status(422).json({
        error:
          'This PSD has no flattened composite image. Re-save it from Photoshop with "Maximize Compatibility" enabled.',
      });
      return;
    }

    const png = new PNG({ width: composite.width, height: composite.height });
    png.data = Buffer.from(
      composite.data.buffer,
      composite.data.byteOffset,
      composite.data.byteLength,
    );
    const pngBuffer = PNG.sync.write(png);

    const outName = path.basename(resolved).replace(/\.psd$/i, '') + '.png';
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="${outName}"`);
    res.setHeader('X-Psd-Width', String(composite.width));
    res.setHeader('X-Psd-Height', String(composite.height));
    res.setHeader('X-Decode-Ms', String(Date.now() - startedAt));
    res.send(pngBuffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Failed to decode PSD: ${message}` });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[psd-viewer-server] listening on http://localhost:${PORT}`);
});
