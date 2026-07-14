# MUD Builder — command crib sheet

## Dev servers

```bash
# API server (port 61000) — preview/download only by default
pnpm --filter @shatteredarchive/mud-builder-server dev

# API server with disk writes ENABLED (deliberate!)
MUD_WRITE_ENABLED=true pnpm --filter @shatteredarchive/mud-builder-server dev

# UI (port 60080, proxies /api → 61000)
pnpm --filter @shatteredarchive/mud-builder-client dev
```

## Deployed stack (experimental compose — the ONLY writes-enabled env)

```bash
# build + (re)start just the builder pair; game and other services untouched
docker compose -f deploy/docker-compose.shattered-archive-experimental.yml \
  up -d --build mud-builder-server mud-builder-client

# UI  → https://build.shatteredarchive.dev
# API → https://build.shatteredarchive.dev/api/capabilities

# apply edge nginx config changes WITHOUT downtime (regen template → test → SIGHUP)
docker exec shatteredarchive-nginx sh -c \
  '/docker-entrypoint.d/20-envsubst-on-templates.sh; nginx -t && nginx -s reload'
```

Shared volume: `C:/Projects/merc-mud/2.4/area` is mounted in the game
(`/opt/merc-mud/area`) AND the builder server (`/mud/area`); the game itself
stays in `C:/Projects/merc-mud/docker-compose.yml` so this stack can never
take it down.

## Tests / builds

```bash
pnpm --filter @shatteredarchive/merc-area test          # parser/emitter + FULL corpus round trip
pnpm --filter @shatteredarchive/mud-builder-server test # REST API (write gate, preview, backups)
pnpm --filter @shatteredarchive/mud-builder-client test # room/mob/object/script editors + gated-UI tests
pnpm --filter @shatteredarchive/mud-builder-server build
pnpm --filter @shatteredarchive/mud-builder-client build
```

## The game (from C:\Projects\merc-mud)

```bash
docker compose up -d              # start/recreate the MUD (port 4000)
docker compose build              # recompile the C source into a new image
docker logs -f merc-mud2.4       # watch boot + area_reload/copyover logs
telnet localhost 4000            # play

# script-engine self test (boots the world, no sockets, PASS/FAIL + exit code)
docker exec -w /opt/merc-mud/area merc-mud2.4 ../src/rom --mp-test
```

## REST API (mud-builder-server, port 61000)

```bash
curl localhost:61000/health
curl localhost:61000/api/capabilities            # shows writeEnabled + target path
curl localhost:61000/api/areas                   # list (from area.lst)
curl localhost:61000/api/areas/midgaard.are      # parsed JSON model
curl localhost:61000/api/areas/midgaard.are/download -o midgaard.are

# preview an edited model (never writes):
curl -X POST localhost:61000/api/areas/midgaard.are/preview \
     -H 'Content-Type: application/json' -d '{"area": {...}}'

# save (403 unless MUD_WRITE_ENABLED=true; atomic + backup in area/backups/):
curl -X PUT localhost:61000/api/areas/midgaard.are \
     -H 'Content-Type: application/json' -d '{"area": {...}}'

# reload the running game:
curl -X POST localhost:61000/api/reload -H 'Content-Type: application/json' \
     -d '{"mode":"hot","file":"midgaard.are"}'      # zero-downtime, one area
curl -X POST localhost:61000/api/reload -H 'Content-Type: application/json' \
     -d '{"mode":"copyover"}'                        # fresh slate, keeps connections
```

## In-game commands (implementor level)

```
areload <file.are>    hot-reload one area in place; errors leave the world untouched
copyover confirm      fresh-slate warm reboot; players stay connected
```

## Mob scripts (#SCRIPTS section, Phase 2)

```
#SCRIPTS
M <mobVnum> <trigger> <phrase>~
<script body, one command per line>~
#0
```

Triggers: `speech greet entry rand fight death give bribe` (`act` reserved).
Commands: `say emote echo goto transfer mload oload purge force`,
`if rand|ispc|isnpc|level|name ... else ... endif`; `$n`/`$i` expansion;
max 256 lines; scripts can never trigger scripts. Author them in the UI's
Scripts tab — validation runs in the browser, the server (400), and the MUD's
staged reload, so a bad script can't reach the game.

## Sentinel files (what the API's reload endpoint writes)

The game polls its area directory once per second:

```
area/reload.signal     contents = area file name → hot reload it
area/copyover.signal   existence → copyover
```

You can drive these by hand: `echo school.are > 2.4/area/reload.signal`.

## Where things land

```
merc-mud/2.4/area/*.are          the world (host copy IS the live copy — bind-mounted)
merc-mud/2.4/area/backups/       timestamped .bak written before every save
merc-mud/2.4/area/area.lst       boot list; new areas need an entry + copyover/reboot
```

## Troubleshooting

- **Save returns 403** — the server is (correctly) write-gated. Restart it with
  `MUD_WRITE_ENABLED=true` if you truly mean to write.
- **Hot reload log says "string space too low"** — run a copyover (fresh boot
  compacts interned strings), then retry.
- **Hot reload log says "'x.are' is not a booted area"** — brand-new areas
  aren't hot-loadable yet: add to `area.lst`, then copyover.
- **Edited an area but the game didn't change** — check `docker logs
  merc-mud2.4` for the `area_reload:` line; a validation error names the exact
  line of the problem.
