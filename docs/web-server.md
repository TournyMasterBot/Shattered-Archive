- [Overview](#overview)
- [Folder Path](#folder-path)
- [Connections](#connections)
- [API Endpoints](#api-endpoints)
  - [Maps](#maps)
    - [`GET /maps/continent/names`](#get-mapscontinentnames)
    - [`GET /maps/continent/:continent/get-area-names`](#get-mapscontinentcontinentget-area-names)
    - [`GET /maps/area/:areaName/beasts`](#get-mapsareaareanamebeasts)
  - [Health](#health)
    - [`GET /health`](#get-health)
- [Data Flow \& Caching](#data-flow--caching)
- [Configuration](#configuration)
- [Upstream: Shattered Archive Remote Server](#upstream-shattered-archive-remote-server)

---

# Overview

The web server is the REST API backend for the Shattered Archive client. It serves map data (continent names, area names, beast lists) used by the game client's contribute and autoleveling features.

It acts as a **caching proxy** in front of the Shattered Archive Remote Server (`Server.Web.Public`), with an offline fallback for environments where the upstream is unavailable.

# Folder Path

- `apps/web-server`

# Connections

- **Upstream (production):** `https://shatteredarchive.com` — the Shattered Archive Remote Server (`Server.Web.Public`)
- **Offline fallback:** `src/offline/` — bundled JSON data served when upstream is unreachable

---

# API Endpoints

## Maps

### `GET /maps/continent/names`

Returns the list of all continent names.

```json
{
  "continentNames": ["Midgard", "The Heavens", "NE Ocean", "..."]
}
```

### `GET /maps/continent/:continent/get-area-names`

Returns area names for a given continent.

```http
GET /maps/continent/Midgard/get-area-names
```

```json
{
  "areaNames": ["Moria", "Kharduum", "Drow City", "..."]
}
```

### `GET /maps/area/:areaName/beasts`

Returns beast data for a given area.

```http
GET /maps/area/Moria/beasts
```

```json
{
  "beasts": [...]
}
```

## Health

### `GET /health`

```json
{
  "status": "ok",
  "uptimeSeconds": 12345
}
```

---

# Data Flow & Caching

Requests are handled with a three-tier strategy:

1. **In-memory cache** — 30-day TTL. Served instantly after first fetch.
2. **Upstream fetch** — calls the Shattered Archive Remote Server at `SHATTEREDARCHIVE_BASE` if configured.
3. **Offline fallback** — reads bundled JSON from `src/offline/continents/`.

Offline data structure:
```
src/offline/
├── continents/
│   ├── continent-names.json
│   ├── Midgard/
│   │   └── areas.json
│   ├── The Heavens/
│   │   └── areas.json
│   └── ...
```

---

# Configuration

| Variable | Description |
|---|---|
| `PORT` | Server port (required) |
| `SHATTEREDARCHIVE_BASE` | Base URL of the Shattered Archive Remote Server (optional; uses offline fallback if omitted) |
| `ENVIRONMENT` | `"dev"` or `"prod"` (default: `"dev"`) |

---

# Upstream: Shattered Archive Remote Server

The web server proxies to the **Shattered Archive Remote Server** (`Server.Web.Public` ASP.NET Core)

Deployed at: `https://shatteredarchive.com`

This is part of a separate **DSL** repository and is the authoritative data source for:

- Map/continent/area data (via `MapsController.cs`)
- Contribute submissions — item identify and creature lore (via `ContributeController.cs`)
- Library data (via `LibraryController.cs`)

The contribute endpoints (`POST /contribute/identify`, `POST /contribute/creaturelore`) are called **directly** by the game client against `https://shatteredarchive.com` — they do **not** go through `apps/web-server`.

See [features/contribute.md](./features/contribute.md) for the contribute feature documentation.
