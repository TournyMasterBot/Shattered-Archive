// apps\psd-viewer-server\src\index.ts
//
// Minimal PSD -> PNG decode service for the psd-viewer client.
//
// PSDs here are large (hundreds of MB), so we never ship raw bytes to the
// browser. Instead we read the file on disk, decode ONLY the flattened
// composite image (ag-psd `skipLayerImageData` avoids decoding the bulk of the
// file — the per-layer pixel data), and stream back a compact PNG.
//
// This is a local-first developer tool: it will read any path the caller
// gives it. Do not expose it to an untrusted network.

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

// Convenience presets — the files this tool was built to open. Only the ones
// that actually exist on disk are advertised to the client.
const PRESET_CANDIDATES = ['Princess.psd', 'Warlock.psd', 'Knight.psd'].map((f) =>
  path.join(os.homedir(), 'Downloads', f),
);

const app = express();
app.use(cors());

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
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: `File not found: ${filePath}` });
    return;
  }

  try {
    const startedAt = Date.now();
    const buffer = fs.readFileSync(filePath);

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

    const outName = path.basename(filePath).replace(/\.psd$/i, '') + '.png';
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
