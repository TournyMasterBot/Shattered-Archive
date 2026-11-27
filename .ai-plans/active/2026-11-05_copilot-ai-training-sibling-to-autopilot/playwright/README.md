# Copilot UI checks (Playwright, driven like a person)

Run from `C:/Projects/Shattered-AI/tools/browser-test` (the harness allowlists only loopback and `*.shatteredarchive.dev`):

- `copilot-window-ui.mjs <screenshot-dir>`: Phase 12, not connected to any game. Menu to the window, drag, resize, minimum size, mode, reload, close.
- `make-test-account.mjs <credentials-file>`: creates the durable throwaway account `copilot-test` on the LOCAL auth hub and writes `test-account.local.json` (git-ignored). The account then needs the `trusted` tier in the shared role store (`C:/Projects/merc-mud/2.4/area/auth/roles.json`).
- `copilot-window-connected.mjs <credentials-file> <screenshot-dir>`: signs in to simulacrum, takes the access code, connects the game client to `simulacrum-server.shatteredarchive.dev:65001`, and checks the command input behind the open window.

**Scope rule (owner, 2026-11-07): Copilot and Autopilot are driven against SIMULACRUM only. Never the real DSL host.** The game-server proxy allowlist also contains `dsl-mud.org`; these scripts never use it.
- `copilot-review.mjs <credentials-file> <screenshot-dir>`: Phase 13. Connected to simulacrum; answers /suggestions, /tickets and /decisions itself (page.route) so the live ledger gets nothing, and checks the review: cards, correct with a why (counter, colours), the gate refusal after typing, approve, reject, a long list, offline, focus ring.
- `copilot-settings.mjs <credentials-file> <screenshot-dir>`: Phase 14. Connected to simulacrum; answers /state, /suggestions, /tickets, /decisions and /stats/buckets itself (page.route), so the live ledger gets nothing, and checks the settings panel (rules, the threshold by keyboard, the quiet limit, the always-ask list, native control colours), 19 versus 20 answers, a floor command, an unknown command, a stale feed, the typing refusal, reload, reset and a second tab.

## Copilot is off by default (Phase 24a)

The Phase 12-14 scripts (`copilot-window-ui.mjs`, `copilot-window-connected.mjs`, `copilot-review.mjs`, `copilot-settings.mjs`) were written
before the on/off switch and expect the working window. Since Phase 24a a fresh browser starts with Copilot off: set
`localStorage["copilot.enabled.v1"] = "true"` (or press the switch in the window header) before they look for the status, mode or suggestions.
`copilot-switch.mjs` is the Phase 24a check of the switch itself.
