---
name: shattered-archive-hub
description: Find the right ShatteredArchive demo service for a MUD player or builder task, know which ones need a sign-in, and point someone at the self-hosting steps. Use when a question mentions ShatteredArchive, its demo hosts, MUD Builder, Simulacrum, the web or game client, the Auth Hub, Scrum Poker or Soulsteel.
---

# ShatteredArchive hub

`https://shatteredarchive.dev/` is the landing page for a Docker Compose stack of small, independent services for MUD players and builders. Every service below runs as a shared public demo. Anything created on a demo is disposable.

## Pick a service

| Task | Service | Needs sign-in |
| --- | --- | --- |
| Play a MUD in the browser with triggers, plugins and Lua/Python scripts | Game Client, `https://game-client.shatteredarchive.dev` | No |
| Browse maps, continents, areas and reference data | Web Client, `https://web-client.shatteredarchive.dev` | No |
| Estimate a story with planning poker | Scrum Poker, `https://scrum-poker.shatteredarchive.dev` | No: the room link is the only membership |
| Create or manage an account, API keys, SSO | Auth Hub, `https://auth.shatteredarchive.dev` | Creates the account |
| Run a Soulsteel / Umbral Cloak game as Herald | Soulsteel, `https://soulsteel.shatteredarchive.dev` | No: state stays in the browser |
| Author MUD areas (rooms, mobs, objects, resets, scripts, maps) | MUD Builder, `https://build.shatteredarchive.dev` | Browsing is free; editing needs trusted tier or above |
| Connect to the ROM 2.4 world MUD Builder edits | Simulacrum, `https://simulacrum.shatteredarchive.dev` | Yes, trusted tier or above, via the Auth Hub |

## Rules of thumb

- Do not guess credentials or try to bypass sign-in. Account, editing and Simulacrum access go through the Auth Hub.
- Only the landing page, its privacy notice and Scrum Poker's home page are meant to be indexed. The other hosts are application shells or APIs and disallow crawling.
- The landing page's live demo cards are the source of truth for what is up. If a card is marked "Coming soon", the service is not deployed.

## Run it locally

1. Map the development domains to `127.0.0.1` with `pnpm setup:hosts:win` (Administrator PowerShell) or `sudo pnpm setup:hosts:nix`.
2. From `deploy/`, run `docker compose -f docker-compose.yml up -d`. MUD Builder and Simulacrum need the experimental compose file as well.
3. Open `http://game-client.shatteredarchive.dev`. If the hub page appears instead, the host entries from step 1 have not taken effect.

## Where to read more

- Source and compose files: https://github.com/TournyMasterBot/Shattered-Archive
- Docker guide: https://github.com/TournyMasterBot/Shattered-Archive/blob/main/docs/docker.md
- Machine-readable index: https://shatteredarchive.dev/llms.txt
- Privacy notice: https://shatteredarchive.dev/privacy
