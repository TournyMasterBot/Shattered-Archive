# Scrum Poker

Planning poker for the dev team, at **https://scrum-poker.shatteredarchive.dev**.

Create a room, share its invite link, everyone picks a card, reveal together. No accounts,
no profiles: people exist only while they're active in a room.

> Looking for how to *use* it rather than how it's built?
> See [the user guide](./scrum-poker-user-guide.md).

---

## Packages

| Package | What it is |
|---|---|
| `services/scrum-poker-core` | Isomorphic domain: types, deck rules, room reducers, wire protocol. Imported unchanged by both sides. |
| `apps/scrum-poker-server` | Express 5 + `ws` on port **63000**. Transport, persistence, the clock, permissions. |
| `apps/scrum-poker-client` | Vite + React 19 SPA, dev port **63080**. |

Port convention: game 30080/31000, web 40080/41000, KT 50080/51000, mud-builder 60080/61000,
auth 62080/62000 → **scrum-poker 63080/63000**.

## Running locally

```bash
pnpm dev:scrum-poker          # server + client together
pnpm dev:scrum-poker-server   # just the API/websocket
pnpm dev:scrum-poker-client   # just the SPA (proxies /api, /health and /ws/scrum to :63000)
```

Then open http://localhost:63080.

## How it works

The client holds one websocket to `/ws/scrum`. Every mutation goes
**parse → core reducer → save → broadcast**, and broadcasts are projected *per connection*,
because each viewer must see their own hidden vote and nobody else's.

**Vote hiding is enforced server-side.** While a room is unrevealed, other participants'
votes are erased from the payload in `toRoomView` — the values never leave the server, so
nobody can read the answer out of devtools. `hasVoted` still ships, which is what lets the
table show "done, but hidden".

**There are three identities, all possession-based.** The room id is membership. The
`hostToken`, returned exactly once by `POST /api/scrum/rooms` and kept in the creator's
`localStorage`, is organizer — it gates room settings. It cannot be re-minted; a room whose
creator loses it simply has no organizer, and everything guests are permitted to do still works.
The `participantSecret`, issued to a single connection in its `joined` ack, is *one seat* — it
is what re-attaches you to your own row, with your vote, after a refresh.

**A participant has a public id and a private secret, and they are not the same value.** The
id is in every roster the server broadcasts: it is a render key, and how a client spots its own
row. The secret never appears in a broadcast. Collapsing the two — which is how this was first
built — meant every member could read every other member's re-attach credential straight out of
a state frame, then rejoin as them: vote in their name, and see their estimate before the
reveal, since a viewer is always shown their own card. That is exactly the peeking
`hideUntilRevealed` exists to prevent, so the split is load-bearing rather than tidiness.

**Room ids are UUIDs.** The reference site's 8-digit code reads better down a phone line, but
here the id *is* the access boundary — there are no accounts, so anyone holding it is a member —
and a 90M-wide numeric space is enumerable by anyone who cares to try. 122 random bits settles
both the collision question and the guessing one. The cost is that nobody transcribes a room id
any more, so the join field accepts a pasted **invite link** as well as a bare id, and the
header shows a short stub of the id with the full value on hover.

Ids read off disk are not required to match this format, and the client's path pattern is
deliberately permissive, so links to rooms created before the switch keep working.

### Timeouts

| | Default | Env var |
|---|---|---|
| Participant idle sweep | 1 hour | `SCRUM_IDLE_TIMEOUT_MS` |
| Room deleted after inactivity | 30 days | `SCRUM_ROOM_TTL_MS` |
| Room **nobody ever joined** deleted | 24 hours | `SCRUM_EMPTY_ROOM_TTL_MS` |

That last one exists because `POST /api/scrum/rooms` is unauthenticated by design: without it,
a script could mint `maxRooms` rooms and every later creation would 503 for a month. It
reclaims *only* rooms that were never joined — a room counts as "never joined" while its
`lastActiveAt` still equals its `createdAt`, which stops being true the instant the first
person arrives. A real team's room is never caught by it, even once everyone has idled out of
the roster.

### Limits

| | Default | Where |
|---|---|---|
| Stored rooms | 10,000 | `SCRUM_MAX_ROOMS` |
| Participants per room | 100 | `MAX_PARTICIPANTS` (core) |
| Websocket frame size | 16 KB | `maxPayload` (gateway) |
| Room creations per IP | 10/min, burst 10 | nginx `limit_req` |
| Websockets per IP | 128 | nginx `limit_conn` |

`SCRUM_MAX_ROOMS` is a backstop, not a quota. Real use is nowhere near it and unjoined rooms
are reclaimed within a day. What it actually bounds is the **persist path**: `rooms.json` is
rewritten whole on every flush, so *total* room count — not active room count — sets the cost
of a single vote. At the default the worst case is a few MB per flush. Raising it much further
means changing how persistence works (per-room files, or an append log), not just moving the
number.

Per-IP abuse is answered at the **edge** instead, because a room cap can only start refusing
*everyone* once it fills. nginx rate-limits room creation per address; the key is empty for
non-POST requests and nginx does not account empty keys, so the join form's `GET` lookups are
never throttled. Both limits are sized for a whole team behind one office NAT address, and both
are declared in `deploy/nginx/edge-subdomains.conf` and mirrored into the HTTPS block in
`includes/tls-dev.conf`.

Activity means **interaction** — voting, renaming, revealing, resetting. The client's
websocket heartbeat deliberately does *not* refresh it, so leaving a tab open all day does not
keep you on the list; if it did, the one-hour sweep would be unreachable.

Two related behaviours that look like bugs but are load-bearing:

- **A disconnect does not remove you.** A refresh or dropped wifi must not wipe someone's vote
  mid-round. The sweeper is what eventually removes them.
- **Being missing from the roster auto-rejoins you — unless you were swept.** That is what makes
  "Clear all users" do its job: stale entries stay gone, and everyone still on the page reappears
  immediately. An idle eviction is the one absence that asks first, because auto-rejoining there
  would defeat the sweep. The client branches on the server's error `code`, never on message text.

## Storage

One `rooms.json` under `DATA_DIR`, written on a 750 ms debounce, atomically (temp+rename), and
flushed on `SIGTERM`. In the deployed stack that's the `scrum-poker-data` named volume, so room
configuration survives a container recreate.

Persistence is best-effort by design: an unwritable volume degrades to memory-only with a
warning rather than taking the service down, and an unparseable file is renamed aside so the
service still boots.

## The ad slot

The app has exactly **one** ad placement — a bounded block (max 120px) below the content,
never sticky, never in the estimating flow. It is **off by default**: with either build arg
missing, nothing renders — no container, no placeholder — and the loader is never injected, so
the page makes **no request to any ad network**.

(The loader *code* does remain in the bundle as dead code. It can't be tree-shaken, because
`AdSlot` takes an injectable `config` prop so it can be tested, which means the minifier can't
prove the branch is unreachable. The guarantee is "no ad request at runtime", not "no ad code
in the bundle".)

To enable it, set both build args on `scrum-poker-client` in the compose file:

```yaml
build:
  args:
    VITE_AD_CLIENT: "ca-pub-XXXXXXXXXXXXXXXX"
    VITE_AD_SLOT: "1234567890"
```

They are read via Vite `define` constants rather than `import.meta.env` — this repo's Jest
client setup cannot compile `import.meta` anywhere in a module graph, and using it would make
`AdSlot` and every importer untestable.

## HTTP API

Only what has to happen before a websocket exists. Everything in-room is websocket-only.

| Route | Purpose |
|---|---|
| `POST /api/scrum/rooms` | Mint a room. Body: `{ friendlyName?, deck?, hideUntilRevealed? }`. Returns `{ roomId, hostToken, settings }`. |
| `GET /api/scrum/rooms/:id` | Verify a pasted link/id. Returns `{ id, friendlyName, participantCount }` — never who is in it. |
| `GET /health` | Standard health probe. |

Both room routes are unauthenticated, deliberately. This service is **not** wired to
auth-server and holds no service key.

## Deployment

Both compose files carry the pair, additively — neither container is in nginx's `depends_on`,
so the rest of the stack starts fine either way.

- `deploy/docker-compose.yml` (prod) and `deploy/docker-compose.shattered-archive-experimental.yml`
- `deploy/scrum-poker-server.Dockerfile`, `deploy/scrum-poker-client.Dockerfile`
- Edge routing: `deploy/nginx/edge-subdomains.conf` (HTTP) and `deploy/nginx/includes/tls-dev.conf`
  (HTTPS). **Keep these two route-for-route identical** — a missing HTTPS block is a real deploy
  gap this repo has hit before, and it only shows up when you request the real hostname.
- SPA fallback lives in `deploy/nginx/scrum-poker-client.conf`; room URLs are real paths
  (`/room/<uuid>`) meant to be pasted into chat, so a cold hit must serve `index.html`.

The `*.shatteredarchive.dev` mkcert wildcard already covers the subdomain — no new certificate
is needed. `pnpm setup:hosts:win` / `setup:hosts:nix` adds the local hosts entry.
