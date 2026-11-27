# Edge-case classifiers

A catalog of edge cases that have bitten, or will bite, any work touching a given feature or technology. `/tech-plan` applies it when
planning, `/implement-plan` proves each applicable classifier and adds the ones it discovers, `/pr-review` checks the diff against it.
The goal is that a mistake made once (a dark form whose scrollbar stayed light) is caught on every later piece of work.

One file per feature or technology, named for the topic (`theming-dark-mode.md`, `http-endpoints.md`, `react-forms.md`). A file holds
classifiers; a classifier is one edge case phrased so it can be checked against any new work in that area.

## File format

```
---
topic: <what this file covers>
prefix: <a readable word from the topic, up to 8 capital letters, unique across files>
applies-when: <keywords a skill matches against the work: technologies, UI kinds, data kinds, paths>
---
```

then one section per classifier:

```
### <PREFIX>-NN <the edge case in one line>
- Applies when: <the condition that makes it relevant to a piece of work>
- Edge case: <what goes wrong, concretely>
- Required behaviour: <what must be true instead>
- Verify: <test, API call or screenshot that proves it; say what must be visible or asserted>
- Origin: <work item slug, bug or PR that taught it; "general" for platform behaviour>
```

The front matter is YAML: put any value containing `: ` or starting with a quote, `[`, `{` or `#` in double quotes.

Rules: ids are never reused or renumbered (a retired classifier is marked `Retired:` with the reason and stays); one edge case per
classifier; phrase it by the **category of mistake**, not the one component it happened in; no Personal or Restricted values
(`docs/standards/data-classification.md`); a `Verify` line that only says "check manually" is not enough: name what to look at.

## Index

Skills read this table to choose files; keep it current whenever a file is added or its `applies-when` changes.

| File | Prefix | Applies when |
|---|---|---|
| [theming-dark-mode.md](theming-dark-mode.md) | TH | themed or dark/light UI: forms, modals, panels, lists, anything with colors that follow a theme |
| [persisted-settings-and-defaults.md](persisted-settings-and-defaults.md) | SETTINGS | saved settings or user config merged with defaults; localStorage / AsyncStorage / cloud-synced settings; settings import and migrations; rows rebuilt from named fields |
| [expo-native-upgrade.md](expo-native-upgrade.md) | EXPO | Expo / React Native SDK upgrades; `expo prebuild` and committed `android/` / `ios/` folders; config plugins; native module changes; package pins and `minimumReleaseAge` |
| [local-only-features.md](local-only-features.md) | LOCAL | local-only / dev-docker-only features; build flags; compose profiles; nginx, csproj and Dockerfile files shared with production; adding a workspace project |
| [log-tailing.md](log-tailing.md) | LOGTAIL | following growing, rotated or gated jsonl logs (game-server logs, SOH gate, offset checkpoints) |
| [auto-approval-policy.md](auto-approval-policy.md) | AUTOAPPR | an agent proposing actions with approval, auto-approval, confidence thresholds, hard floors and escalation |
| [game-data-privacy.md](game-data-privacy.md) | PRIVNAME | game text (logs, chat, room text, whoisic) exported, summarised, scrubbed or committed; character names and codenames |
| [ansi-color-handling.md](ansi-color-handling.md) | ANSI | ANSI escape sequences, the BEL character and DSL `{X` colour codes: parsing, storing, converting, stripping |
| [cloud-synced-user-content.md](cloud-synced-user-content.md) | CLOUDSYNC | cloud sync, Save/Load to cloud, /api/user-content, UserRecord kinds, whole-collection PUT, personal overrides, web and mobile sharing stored data |
| [served-fallback-data.md](served-fallback-data.md) | FALLBACK | bundled offline snapshots served when an upstream call fails; web-server proxy; SHATTEREDARCHIVE_BASE |
| [world-map-identity.md](world-map-identity.md) | MAPID | building a room/area/world map from observations: identity, fixtures, transient contents, baselines |
| [admin-tooling.md](admin-tooling.md) | ADMIN | admin or operator tools that issue privileged commands: command catalogs, destructive and bulk commands, confirmation, showing results |
| [shared-event-bus.md](shared-event-bus.md) | EVENTBUS | subscribing to events on the shared dispatcher (`ListenEvent`, `DispatchEvent`, `game:remote-server:*`): listener keys, replaced listeners, hot reload |
| [pointer-interaction.md](pointer-interaction.md) | POINTER | a surface that pans, zooms or drags (map, canvas, floating window) with clickable children: pointer capture, drag deltas, the wheel |
| [live-stream-views.md](live-stream-views.md) | LIVESTRM | views that capture a live stream (GMCP, socket output, tailed logs) in memory: buffers, caps, listeners |
| [work-item-folders.md](work-item-folders.md) | WORKITEM | moving, renaming, closing or signing off plans and work-item folders; closed-incomplete; marking a plan COMPLETE |
| [public-page-seo.md](public-page-seo.md) | SEO | public Razor views and search engines: titles, meta descriptions, generated page text, sitemaps, per-entity pages |
| [command-templates.md](command-templates.md) | CMDTPL | stored command templates with placeholders (`{name}`, `<potion>`) filled in when sent to the game: autopilot buff, fight, in-combat and initiation commands, aliases |
| [web-archive-crawl.md](web-archive-crawl.md) | WEBARCH | crawler, scraper, forum archive, snapshot of a login-protected website, Playwright session, session id in URLs, raw HTML snapshots, browsing archived third-party HTML, resume after interruption |
| [automation-run-loops.md](automation-run-loops.md) | RUNLOOP | long-running automation loops (autopilot engine): backstop timers, lap waits, retries and re-arming buffs, pause versus stop, command queue and lag, timers across a dropped connection |
| [connection-lifecycle.md](connection-lifecycle.md) | CONNLIFE | live connections (WebSocket, TCP): connect, drop, replace, reconnect, state gated on being connected or learned during a session |
| [mobile-screen-insets.md](mobile-screen-insets.md) | INSET | React Native modals and pages that draw a header or footer action at a screen edge: status bar, cutout, navigation bar, edge-to-edge, keyboard |
| [web-to-app-port.md](web-to-app-port.md) | PORT | porting a web-client feature to the mobile app: events and helper modules the web produces in plugins, the script runtime or other folders |
| [test-environments.md](test-environments.md) | TESTENV | tests that drive a client (browser, emulator, device) against an environment: production defaults, dev settings, sign-in and cloud writes during a test, test accounts |
| [unread-indicators.md](unread-indicators.md) | UNREAD | unread dots, counts and badges derived from a message list: chat panes, tab badges, last-seen markers, frozen or hidden views |

## How the skills use it

1. **Select.** From the work's affected areas and what it builds, pick every file whose `applies-when` matches (when unsure, include it).
2. **Apply.** Every classifier in a picked file whose *Applies when* is true becomes a row in the plan's edge-case table, with a test
   or verification. "Not applicable" is allowed only with a one-line reason in the plan.
3. **Propose, confirm, then add.** Any reusable edge case found while planning, implementing, reviewing or at the user's sign-off
   (something the user finds wrong while testing is the strongest source) is drafted as a classifier and shown to the user. It is
   written into the matching file (or a new file plus an index row) only after the user confirms it; the user may reword it first.
   Skills never add a classifier unasked.
