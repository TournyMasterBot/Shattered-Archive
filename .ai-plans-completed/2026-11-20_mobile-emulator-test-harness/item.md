---
type: proposal
title: Mobile emulator test harness - dev-stack routing, the real auth flow and one reusable test account
slug: 2026-11-20_mobile-emulator-test-harness
created: 2026-11-20
state: completed
data-classification: restricted
---

# Mobile emulator test harness - dev-stack routing, the real auth flow and one reusable test account

## Problem or opportunity

Live checks of the mobile app (`shatteredarchive-mobile`) on the Android emulator need a signed-in account, and today there is no formal way to get one.
The owner states that creating the auth account and exercising the real, full auth flow is an expected usage path for local simulacrum testing, and
that the emulator should be launched by the assistant for such tests. Two risks follow from how it is set up now:

- The auth service exists twice: a local dev one at `https://auth.shatteredarchive.dev` (reached over the network from this machine) and a
  production one. The owner suspects the emulator currently uses the production service and asks that it be pointed at the dev servers and the dev C#
  server, with care taken over routing in the test environment.
- Without a registry of test accounts, repeated testing could create thousands of accounts.

Facts read while capturing this (2026-11-20, not yet scoped or verified on a device):

- `dsl-client/features/auth/site-api.ts` defaults the site address to the production site, and `app.json` sets no `extra.siteApi`, so a build as it
  stands signs in and saves to cloud against production. The world map, the walkable areas and the web reference screen default to the emulator's alias
  for this machine (`http://10.0.2.2:5000`) in a development build.
- The local C# container (`DSL/Server/docker-compose.yml`) sets `GameSso__AllowedReturnOrigins` at indices 0 to 2 with web origins only, which replaces
  the base file's `dslclient://auth-callback`, so the local site would refuse the app's sign-in. Its sign-in callback and hub redirect addresses are
  `http://localhost:5000/...`, which on the emulator is the emulator itself unless a port reverse maps it to this machine.
- The hub name is a hosts-file name on this machine with a self-signed edge certificate: the emulator needs the name to resolve to this machine and the
  certificate to be trusted before its browser can show the login page.
- A local dev test account already exists in a git-ignored file under `.ai-plans/active/2026-11-05_copilot-ai-training-sibling-to-autopilot/`
  (`test-account.local.json`), and `Shattered-AI/tools/browser-test/lib/sa-login.mjs` signs the web client in with it through the real popup flow.

## Proposed work

In the owner's words: the assistant launches the emulator for testing and creates the auth account and exercises the real, full auth flow. If a helper
tool is needed to do this, create it, and ideally preserve information so testing does not end up with thousands of accounts. Formalize a usage pattern,
and when asked to run emulation tests make sure the assistant reaches for that plan through a rule or some other guardrail. The emulator should be
pointed at the dev servers and the dev C# server, not production.

Already done as an interim step (2026-11-20, not part of this item's build): a rule in `CLAUDE.md` ("Emulator and device tests of the mobile app"),
`docs/claude/emulator-testing.md` with the hard rules and the known state, a pointer in the mobile repo's `CLAUDE.md`, and a memory entry.

Wanted, as stated and as read from the facts above:

1. Routing: the emulator build resolves every origin (site and sign-in, hub, game relay, autopilot catalog, maps) to the local dev stack and the dev C#
   server; a check refuses production.
2. A helper tool for emulator runs: uses `emulator-5554` only, preflights and prints the origins, sets up the routing to this machine, signs in through
   the app's own Log in button, the hub login page and the consent screen, and keeps a registry so one account per purpose is reused and its data reset
   rather than a new account made.
3. The usage pattern and a guardrail (a rule exists now; whether a hook is added is the owner's choice).

## Who benefits

The owner, as the person who signs off live checks of the mobile app; the assistant, which currently has no safe way to run them. First dependents:
`2026-09-12_autoleveling-mobile-port` (the cloud-sync live check and the device run against the simulacrum) and any later mobile feature check.

## Constraints and known unknowns

Constraints (stated by the owner):

- Local, over the network, with a production version of the auth service in existence: routing in the test environment must be handled carefully.
- No thousands of accounts: information about test accounts is preserved and reused.
- The assistant boots the emulator itself for these tests; the physical phone and Metro stay out of scope.

Known unknowns (not yet answered):

- Whether the emulator resolves the hub's hosts-file name to this machine, and whether it can be made to trust the self-signed certificate (and whether the
  app's own requests, as opposed to its sign-in browser, need that trust in a debug build).
- Whether the sign-in browser on the emulator can be driven by the existing Playwright code (over the browser's debugging connection) or needs another way.
- Which hub and which C# server the app should use for sign-in on a real phone on the local network, as opposed to the emulator.
- Where the account registry lives and in what shape (today a single git-ignored JSON file belongs to another work item's folder), and how "reset its
  data" works for each kind of data the app stores (cloud content, characters).
- Whether the local C# compose and the hub's service registry need changes (the app's return address; the callback address) or whether port mapping is
  enough.
- Whether a hook should block emulator or install commands that skip the preflight.

## Related

- `.ai-plans/active/2026-09-12_autoleveling-mobile-port/` (first consumer; its phases 3, 8 and the live checks wait on this)
- `.ai-plans/active/2026-11-05_copilot-ai-training-sibling-to-autopilot/` (holds the existing local test account file and the simulacrum sign-in pattern in `.claude/skills/copilot-train/scripts/lib/simulacrum.mjs`)
- `Shattered-AI/tools/browser-test/lib/sa-login.mjs`, `Shattered-AI/tools/mobile-test/`
- `docs/claude/emulator-testing.md`, `CLAUDE.md` section "Emulator and device tests of the mobile app" (the interim rule)
