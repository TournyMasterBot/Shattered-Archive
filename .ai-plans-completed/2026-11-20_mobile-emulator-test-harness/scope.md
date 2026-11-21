# Scope: Mobile emulator test harness - dev-stack routing, the real auth flow and one reusable test account

Item: item.md · Type: proposal · Scoped against: performance/Allocation-hunt @ 9191edc (ShatteredArchive), optimization/Performance-and-Diagnostics @ 09b5d85 (shatteredarchive-mobile) · Date: 2026-11-20
Data classification of this work: Restricted at run time (a test account's password and the sign-in token), nothing of it committed; the documents are Internal (rules: docs/standards/data-classification.md, DRAFT: owner to confirm)

## What the work is

Make live checks of the mobile app on the Android emulator safe and repeatable: the app under test must talk to this machine's local dev stack (the dev C# server and the dev auth hub) and never to production; sign-in goes through the real, full auth flow; and test accounts are kept in a registry so one account per purpose is reused and reset rather than a new one made each run. A rule and a usage pattern make the assistant reach for it whenever it is asked to run emulation tests. An interim rule already exists (`CLAUDE.md`, `docs/claude/emulator-testing.md`); this item builds what the rule describes.

## Affected areas

| Area | Role in the work | Kind | Evidence (path:line) |
|---|---|---|---|
| `Shattered-AI/tools/mobile-test` | **A driver already exists**: a Maestro-based tool that boots an AVD, builds and installs the app, runs flows, captures screenshots, and refuses any app id other than the app's own. It has no handling of routing, sign-in or accounts; its one auth flow (`assert-logged-in.yaml`) assumes the app is already signed in. This is where the helper would be added | change | `package.json` description; `lib/emulator.mjs:5-8,27-60` (boot, `ensureEmulatorBooted`), `lib/maestro.mjs` (`runFlow`, app id guard); `flows/assert-logged-in.yaml`; `doc/mobile-testing.md:17-26` (the guard); 4 files in `lib/`, 2 in `flows/` |
| `shatteredarchive-mobile` site address | The app's one site address (sign-in, cloud sync, organizations, push) defaults to the production site; `app.json` sets no `extra`, so a build as it stands uses production | change or config | `dsl-client/features/auth/site-api.ts:14,30`; `dsl-client/app.json` (no `extra` key); consumers `features/auth/cloud-sync.ts:69`, `features/auth/game-sso.ts:54`, `features/organizations/organizations-api.ts:24`, `features/push/push-token-registration.ts:44` |
| `shatteredarchive-mobile` other origins | Five files decide an address on their own: the shared site address, the world map, the walkable areas, the web reference screen and the new autopilot catalog. Four default to the emulator alias for the host in a dev build, one defaults to production | change or config | `site-api.ts:14`; `features/world-map/api.ts:13-14` (`EXPO_PUBLIC_WORLD_MAP_API`); `features/walkable-areas/api.ts:3-5`; `app/(tabs)/reference.tsx:7-9`; `features/autoleveling/autoleveling-content-api.ts` (follows the shared address, A3 of the autopilot item) |
| `shatteredarchive-mobile` sign-in | The sign-in opens the site's `game-sso/start` in a browser session on top of the app and expects a deep link back; the return address is the fixed `dslclient://auth-callback` | read only (a change only if the dev flow needs one) | `features/auth/game-sso.ts:33,54,58`; `app.json` scheme `dslclient`; 3 auth test files |
| `shatteredarchive-mobile` build and start scripts | The scripts that build and run the app on the emulator; `expo run:android` leaves Metro running | read only / change | `scripts/start-android.js`; `docs/features` has no emulator-testing page |
| DSL local compose | The local C# container's sign-in settings: the allowed return addresses set at indices 0 to 2 replace the base file's `dslclient://auth-callback`, and the sign-in callback and hub redirect are `http://localhost:5000/...` | change (local compose only) | `DSL/Server/docker-compose.yml:61,64,80,87-89`; base list in `DSL/Server/Server.Web.Public/appsettings.json:15`; the production compose carries the mobile address (`docker-compose-prod.yml:70`) |
| auth hub and its service registry | The hub that serves the login and consent pages (`https://auth.shatteredarchive.dev`), the open signup route, and the registered redirect addresses that must byte-match the C# site's | read; change only if the callback address changes | `apps/auth-server/src/routes/` (signup); `docs/auth-server.md:21,83`; `deploy/docker-compose.shattered-archive-experimental.yml:584-587` (`SERVICE_REGISTRY`) |
| local edge: hosts names and certificates | The dev names resolve through this machine's hosts file and the edge serves a certificate made by mkcert; the emulator is a separate machine on its own network | read | `deploy/scripts/add-hosts.ps1`, `mkcert-init.sh:5-12`, `deploy/nginx/includes/tls-dev.conf:9`; `docs/docker.md:32-43` |
| the existing test account | One local dev account in a git-ignored JSON file in another item's folder (keys `purpose`, `authHub`, `username`, `password`, `accountId`, `createdAt`), and the helper that signs the web client in with it | reuse | `.ai-plans/active/2026-11-05_copilot-ai-training-sibling-to-autopilot/test-account.local.json`; `.gitignore:161` (`.ai-plans/**/*.local.json`); `Shattered-AI/tools/browser-test/lib/sa-login.mjs`; `.claude/skills/copilot-train/scripts/lib/simulacrum.mjs` |
| guardrails in the assistant's own setup | The interim rule, the memory entry, and the hook mechanism that can enforce it | change | `CLAUDE.md` (section "Emulator and device tests of the mobile app"), `docs/claude/emulator-testing.md`; `.claude/settings.json:41` (a `Bash|PowerShell` hook matcher exists) and 14 hook scripts under `.claude/hooks/` (for example `no-cd-guard.js`, `jest-guard.js`) |

## Stakeholders

- The owner: signs off live checks, decides where the registry lives, whether a hook blocks commands, and any change to the dev compose or the hub's registry.
- The assistant: the user of the tool and the one the rule must reach.
- Features waiting on a signed-in emulator: `2026-09-12_autoleveling-mobile-port` (the cloud-sync live check and the device run against the simulacrum), and any later mobile feature.
- The DSL repo (local compose; the C# site's sign-in settings), the `shatteredarchive-mobile` repo, the `Shattered-AI` repo (the driver), and the auth hub (its registry if the callback changes).
- Production: the one party that must not be touched by a test run.
- Docs: the mobile repo has no emulator-testing page; `Shattered-AI/doc/mobile-testing.md` describes the driver; `docs/claude/emulator-testing.md` holds the rule. End-user audience: none (developer tooling).

## Data touched

| Data | Class | Read/Write/Store/Send/Log | Change in handling |
|---|---|---|---|
| A test account's username and password | Restricted (the password) | Read from a git-ignored file; Send to the hub's login page on the emulator | Must stay out of logs, output, commits and screenshots; the registry adds a place that holds them |
| The sign-in token stored by the app | Restricted | Store (on the emulator), Send (to the C# site) | Never printed; a run that reaches production would put a production-valid token on the emulator |
| Cloud content saved by the test account (scripts, plugin configs, library writings, the autopilot records) | Personal (per account) | Write, Read | Today a build as it stands writes it to production; the item moves it to the local dev store |
| The account registry (purpose, hub, account id, created date) | Internal (ids), Restricted if it holds passwords | Store | New or extended: must say where the passwords live |
| Throwaway game characters and their passwords | Restricted (password) | Store (a git-ignored file), Send | Local simulacrum only; existing pattern in `copilot-train` |
| Screenshots of the emulator | Internal if they show no account name or token | Store | Open each before relying on it; the login screens show fields |
| `adb` and Maestro output | Restricted if it echoes typed text | Log | Typing a password through `adb input text` or a flow file can leave it in command lines and logs: an Unknown |

## Inputs for sizing

Not sized: that is for a human. Facts counted this session:

- Repos touched: 4 (`Shattered-AI` for the tool, `shatteredarchive-mobile` for the origins, `DSL` for the local compose, `ShatteredArchive` for the rule, the hook and the docs); the auth hub (`apps/auth-server`, in ShatteredArchive) only if its registry changes.
- Files in the mobile app that decide a server address: 5 (`grep -rln "shatteredarchive\.com\|10\.0\.2\.2"` over `app`, `components`, `features`, `hooks`, `utils`, `config`, excluding tests).
- Local compose lines that would change: the `GameSso__AllowedReturnOrigins` group (3 lines) and the two callback addresses (2 lines) at `DSL/Server/docker-compose.yml:61-89`.
- Existing assets: 1 driver (4 lib files, 2 flows, 2 test files), 1 test account file, 1 web sign-in helper, 3 mobile auth test files, 14 hook scripts in `.claude/hooks/`.
- New documents already written (the interim rule): 1 doc, 1 `CLAUDE.md` section, 1 mobile `CLAUDE.md` pointer, 1 memory entry.
- Device facts gathered: `adb devices` shows no emulator running now; the AVD is `Pixel8` (the other, `Pixel_8_Pro_API_34`, has a missing system image per the owner's notes).
- Risks and unknowns listed below: 10.

## Dependencies and order

- The emulator must resolve the hub's name to this machine and trust the edge certificate before a login page can load (or the sign-in must be routed some other way); this decides the rest of the design and has not been tried.
- The dev C# site must accept the app's return address before any sign-in from a build pointed at it can succeed.
- The app must be rebuilt (or re-bundled) with the dev address for any check to leave production; the autopilot item's Phase 3 live check and Phase 8 device run wait on this.
- The owner's go for any change to the local compose or the hub's registry; production files are not touched.
- Outside this repo: the `Shattered-AI` repo holds the driver, so work there follows that repo's own conventions (its `.memory/README.md` was not read for this scoping).

## Risks and unknowns

1. **A run can reach production today.** The app's site address defaults to production and `app.json` sets nothing, so any sign-in or Save from an emulator build as it stands touches production. Wrong assumption: "the emulator uses the dev server because the maps do" (they do, the sign-in does not).
2. **Name resolution inside the emulator.** The dev names are in this machine's hosts file; whether the emulator's resolver sees them, or resolves them to itself, was not tried (no emulator running).
3. **Certificate trust.** The edge certificate comes from mkcert; the emulator's browser needs that authority installed, and the app's own HTTPS calls would need it too unless they use plain HTTP over a port mapping. Not tried.
4. **How the emulator's browser is driven.** The driver uses Maestro (UI automation); whether it can fill the hub's login and consent pages in the browser session, or whether the browser's debugging connection with the existing web code is better, is not known.
5. **Typing the password.** The usual ways to type into an emulator leave the text in command lines and flow files; a way that keeps the password out of logs is needed and not designed.
6. **The return address and callbacks.** The local C# site refuses the app's return address as configured, and its callback is a `localhost` address; whether a port mapping from the emulator to this machine is enough or the hub's registered addresses must change is not known.
7. **Account reset.** What "reset its data" means for each kind of data (cloud content, characters, the app's own storage on the emulator) is not defined; the cloud content has no delete route found in this scoping (not searched exhaustively).
8. **Where the registry lives and who writes it.** Today one account sits in another item's folder; a registry for several purposes, with a rule against a second account per purpose, has no home yet. The hub's signup is open with an anti-bot challenge, so creating accounts is easy, which is the risk the item names.
9. **Metro and the driver.** The driver leaves the bundler running detached after install, while the owner's standing rule is that Metro stays the owner's; these disagree.
10. **A hook can be too blunt.** A block on emulator commands that skip the preflight needs a way to recognise a legitimate command; false blocks stall every mobile task.

## Out of scope

- Production changes of any kind (production compose, the production hub, production accounts).
- The physical phone: no install, no sign-in.
- Building the autopilot features themselves (that item); this item only provides the way to check them.
- Replacing the existing Maestro driver; it is extended.
- Deleting or merging existing accounts on any hub (not asked for).
- iOS.

## Decisions for the human

Answered by the owner on 2026-11-20:

1. **Registry location: A.** A git-ignored registry in the Shattered-AI tool's own private data, one entry per purpose; the existing account file in the Copilot item's folder is repointed or kept read-only. (Not chosen: B, extend the existing file in place.)
2. **Guardrail: B, rule plus a hook.** A hook blocks `adb install`, `expo run:android` and the driver's build step unless the preflight (origins printed and checked, `emulator-5554` only) ran in the session. Consequence accepted: a false block is possible (unknown 10) and is loosened when it happens. (Not chosen: rule only.)
3. **Routing: A, port mapping with `adb reverse`.** `localhost` on the device is this machine, so the dev site's `localhost` callback works as it is and no address goes in a file; the hub's name still has to resolve and be trusted in the device's browser (unknowns 2 and 3). (Not chosen: B, dev names plus the LAN address.)
