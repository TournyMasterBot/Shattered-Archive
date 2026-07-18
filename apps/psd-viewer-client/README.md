# psd-viewer-client

A small Vite + React front-end for viewing Photoshop `.psd` files and saving them
as PNG. Port **62080**; it proxies `/api` and `/health` to
[psd-viewer-server](../psd-viewer-server) on 62000.

Because the source PSDs are hundreds of MB, all decoding happens server-side. The
client just asks the server for `GET /api/psd/png?path=…`, shows the returned PNG
in an `<img>`, and offers a **Save as PNG** button that downloads that same blob —
so a file is decoded exactly once per open.

## Run

Start the server first, then:

```bash
pnpm --filter @shatteredarchive/psd-viewer-client dev
```

Open http://localhost:62080, click a preset (or type a full `.psd` path) → **Open**.
