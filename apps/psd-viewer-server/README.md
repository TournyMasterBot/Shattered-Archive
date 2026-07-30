# psd-viewer-server

Minimal PSD → PNG decode service for the [psd-viewer-client](../psd-viewer-client).
Port **62000** (client dev server is 62080 and proxies `/api` here).

The `.psd` files this tool targets are large (200–500 MB), so nothing raw is ever
sent to the browser. The server reads the file on disk and decodes **only the
flattened composite** (`ag-psd` with `skipLayerImageData`, which skips the bulk of
the file), then streams back a compact PNG. `useImageData` yields a raw RGBA
buffer that goes straight into `pngjs`, so no native canvas dependency is needed.

> **Local-first developer tool.** Reads are confined to `~/Downloads` and to files
> ending in `.psd`; anything else is refused with a 403 before the filesystem is
> touched. Cross-origin reads are limited to the vite dev client
> (`http://localhost:62080`). Still do not expose this service to an untrusted
> network — "local" is not the same as safe, since any page in your browser can
> reach a predictable localhost port. Note what each limit actually buys: the path
> confinement is what bounds *what can be read at all*, while the CORS allowlist
> only stops a hostile page from *reading the response* — a plain cross-origin GET
> is not preflighted, so the request is still sent and still does the work.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Liveness probe. |
| GET | `/api/presets` | The bundled example files (`Princess`/`Warlock`/`Knight` in `~/Downloads`) that exist on disk. |
| GET | `/api/psd/png?path=<path>` | Decode the PSD composite and return `image/png`. Response headers `X-Psd-Width`, `X-Psd-Height`, `X-Decode-Ms`. `path` may be absolute (must resolve inside `~/Downloads`) or relative to it, so a bare `Princess.psd` works. Outside the root, or not `.psd` → 403; inside but absent → 404. |

## Run

```bash
pnpm --filter @shatteredarchive/psd-viewer-server build
pnpm --filter @shatteredarchive/psd-viewer-server start   # or: dev (tsx watch)
```

Large composites need headroom; `dev`/`start` set `--max-old-space-size=8192`.
