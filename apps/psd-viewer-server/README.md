# psd-viewer-server

Minimal PSD → PNG decode service for the [psd-viewer-client](../psd-viewer-client).
Port **62000** (client dev server is 62080 and proxies `/api` here).

The `.psd` files this tool targets are large (200–500 MB), so nothing raw is ever
sent to the browser. The server reads the file on disk and decodes **only the
flattened composite** (`ag-psd` with `skipLayerImageData`, which skips the bulk of
the file), then streams back a compact PNG. `useImageData` yields a raw RGBA
buffer that goes straight into `pngjs`, so no native canvas dependency is needed.

> **Local-first developer tool.** `GET /api/psd/png` will read any path the caller
> gives it. Do not expose this service to an untrusted network.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Liveness probe. |
| GET | `/api/presets` | The bundled example files (`Princess`/`Warlock`/`Knight` in `~/Downloads`) that exist on disk. |
| GET | `/api/psd/png?path=<abs>` | Decode the PSD composite and return `image/png`. Response headers `X-Psd-Width`, `X-Psd-Height`, `X-Decode-Ms`. |

## Run

```bash
pnpm --filter @shatteredarchive/psd-viewer-server build
pnpm --filter @shatteredarchive/psd-viewer-server start   # or: dev (tsx watch)
```

Large composites need headroom; `dev`/`start` set `--max-old-space-size=8192`.
