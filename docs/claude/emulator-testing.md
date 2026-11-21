# Emulator and device testing of the mobile app (rule and usage pattern)

Applies whenever you are asked to run the mobile app (`shatteredarchive-mobile`, `dsl-client`) on the Android emulator, to "run emulation tests", to
take device captures, or to check a feature live on the app. `CLAUDE.md` points here; open this file before the first `adb`, `emulator` or
`expo run:android` call of the task. Decided by the owner on 2026-11-20 (work item `2026-09-12_autoleveling-mobile-port`, then built as `2026-11-20_mobile-emulator-test-harness`).

## Rules that never bend

1. **Emulator only, and you start it.** Target `emulator-5554` (AVD `Pixel8`) and always pass `adb -s emulator-5554`. A physical phone is usually
   attached too: never install to it, never touch it. The owner has approved that you boot the emulator yourself whenever you are asked to run
   emulation tests (boot-wait and unlock recipe: memory `android-emulator-capture-recipe`, `feedback-emulator-start-allowed-expo-upgrade`). Metro
   (port 8081): if the owner has started it, leave it alone and do not start a second one; otherwise you may start the one you need for emulator
   testing, but only while implementing a planned phase with `/implement-plan` (owner decision 2026-11-20), with the dev settings of rule 2, and you stop
   only the process you started. Never kill a process you did not start.
2. **Production is never the target.** Every origin the app under test uses (the C# site for sign-in and cloud sync, the auth hub, the game relay,
   the autopilot catalog, the maps) must resolve to this machine's local dev stack: `https://*.shatteredarchive.dev` names on this machine, or
   `localhost` through `adb reverse`. **Before the first sign-in or Save**, print the resolved origins and stop if any is `shatteredarchive.com`
   (or any host that is neither `*.shatteredarchive.dev` nor loopback). A build made without the dev settings talks to production: see "Known
   state" below.
3. **The real, full auth flow, one reusable account.** Sign in through the app's own Log in button, the hub's login page and its consent screen; do not
   inject a token. The account is a local dev test account kept in the tool's git-ignored registry,
   `Shattered-AI/tools/mobile-test/private/accounts.json` (one entry per purpose; today `mobile-emulator`, imported once from the older account file of
   the copilot item, which stays where it is). Use it through `node C:/Projects/Shattered-AI/tools/mobile-test/accounts.mjs list | check <purpose>`.
   **Reuse it. Never register a new account while one exists for the purpose**: `accounts.mjs create <purpose> --create` refuses when the purpose has
   an entry, and a new purpose needs the owner's word first. To get a clean state, delete that account's own records (its cloud content, its throwaway
   characters), not the account.
4. **Credentials and tokens are never printed, logged, committed or photographed.** Read the file inside the script; captures are taken on screens that
   show no password and no token (data-classification: test accounts and fake characters only).
5. **Throwaway game characters are local and cleaned up.** Created on the local simulacrum only (never the production game), named as placeholders in
   anything committed, deleted when the test is done and only with the owner's word.
6. **Say what is on the screen.** Open every capture before you rely on it (`docs/claude/work-item-workflow.md`, "Screenshots").

## How the dev stack is reached (measured 2026-11-20, `2026-11-20_mobile-emulator-test-harness`)

- **The emulator does not use this machine's hosts file.** Inside `emulator-5554` the `*.shatteredarchive.dev` names resolve to a public address that is
  not this machine, so a login typed there against `auth.shatteredarchive.dev` would reach a real remote host (the hub name is also the one production's own
  sign-in redirects to). So the session writes the emulator's Chrome a command-line file, `/data/local/tmp/chrome-command-line` (read only on the
  debuggable `Pixel8` image, after the browser restarts): `--host-resolver-rules="MAP *.shatteredarchive.dev 127.0.0.1"` plus
  `--ignore-certificate-errors-spki-list=<hash of the dev edge certificate's public key>` (computed from `deploy/nginx/certs/shatteredarchive.dev.pem` at run
  time, no authority installed), with `adb -s emulator-5554 reverse` for 80, 443, 5000 and Metro's 8081 (ports below 1024 need `adb root`, which the session
  runs). The browser's debugging connection lets Playwright fill the hub's login and consent pages, so no password goes on a command line. A cold-booted
  emulator must be unlocked first (PIN in the tool's git-ignored `private/emulator.json`).
- **The app as it stands signs in against PRODUCTION.** `features/auth/site-api.ts` defaults to `https://shatteredarchive.com`. A test build gets the dev
  address only from `EXPO_PUBLIC_SITE_API` (and `EXPO_PUBLIC_WORLD_MAP_API`) in the environment of the Metro that serves it (`up` sets them and checks the
  served bundle carries them); never put a dev address in `app.json`. Do not tap Log in, Save or Load on a build that was not served this way.
- **The local C# site accepts the app's return address** (`GameSso__AllowedReturnOrigins__3` in `DSL/Server/docker-compose.yml`, local stack only;
  `docker-compose-prod.yml` and `appsettings.json` are unchanged). Probe: `GET /user/game-sso/start?returnUrl=dslclient%3A%2F%2Fauth-callback` answers a
  redirect to the hub, a made-up scheme answers 400.
- **About half of the app's launches fail** on this emulator with a red "Compiling JS failed" screen: the development bundle arrives cut short over the
  emulator's network (Metro serves it complete to the host). `up` waits for the Home screen and relaunches, up to five times.

## The usage pattern

Asked to run the mobile app on the emulator, do exactly this, with `T = C:/Projects/Shattered-AI/tools/mobile-test` (details and the code:
`Shattered-AI/doc/mobile-testing.md`):

1. **Preflight and up:** `node T/session.mjs up --planned-phase`. It runs the preflight (target `emulator-5554` only, every origin the build will use printed
   and checked against rule 2, dev site and hub answer, the site accepts the app's return address), maps the ports, writes the browser file, starts Metro
   with the dev settings and checks the served bundle, then launches the installed dev client. `--planned-phase` is the Metro rule: you may start Metro only
   while implementing a planned `/implement-plan` phase and only when the owner has not started one; a Metro you did not start stops the run. The dev client
   must already be installed (building it is not part of the session).
2. **Sign in:** `node T/session.mjs signin`. The real flow with the registered account (rule 3); success only after the app itself shows Log out. The outcome
   is one of `logged-in`, `already-logged-in`, `wrong-password`, `no-login-page`, `cancelled`, `hub-error`, `no-consent`, `no-deep-link`, `not-logged-in`.
3. **The test:** captures, Maestro flows, whatever the phase needs. Open every capture (rule 6).
4. **Reset and down:** `node T/session.mjs down --reset`: deletes what the test saved to the dev site for the account (never the account), clears the app's
   data on the emulator, stops only the Metro it started, and removes the port mappings and the browser file. `status` shows the current state.

**The guard:** `.claude/hooks/emulator-guard.js` (PreToolUse, `Bash|PowerShell`) blocks `adb ... install`, `expo run:android`, `start-android`,
`pnpm start:android`, gradle installs and the old driver's build scripts unless `T/private/preflight.json` is fresh (30 minutes), names `emulator-5554` and lists
only dev, loopback or emulator-alias origins; an `adb install` that does not pin `-s emulator-5554` is blocked even then. Commands that only mention the words
(grep, echo, git, heredoc bodies) pass, and so do the session's own commands. **If it blocks something harmless:** rephrase it (a grep or echo is never
blocked), or run `node T/session.mjs preflight` and repeat. Self-test: `node .claude/hooks/emulator-guard.selftest.js`.

**The account:** `node T/accounts.mjs list | check <purpose>`; one entry per purpose in the tool's private registry; `create <purpose> --create` refuses when the
purpose has an entry (rule 3).

Work item: `.ai-plans-completed/2026-11-20_mobile-emulator-test-harness` (plan, amendments A1 to A11, measurements).
