# Findings: review of 3 active plans and 9 closed-incomplete plans

Reviewed against: ShatteredArchive `performance/Allocation-hunt` @ 9191edc · Date started: 2026-11-18 · Written by: `/implement-plan` (this item)
Status: all 12 sections and the summary table written (Phases 2-8). Moves are made only on the owner's word, recorded at the end of this file.

## Method

- A plan's own text and `test-results.md` are the **claim**. The **proof** is a file and symbol found in the working tree this session (`path:line`), plus a test rerun where the plan names tests. A plan's recorded counts are quoted as "recorded by the plan", never as verified.
- A step marked done with no proof found is reported as open. A step that needs a real game session, a device, the Play Console or the owner's hosts file is an **owner step** and is never marked verified here.
- Code in a sibling repo's working tree that is not committed is labelled "working tree only".
- No log line, character name, account, address or credential is copied into this file. A local test account is never read.
- Per-step table columns: `Step | Plan says | Found at (path:line) | Verified by | Open? | Owner step?`

### Verdict vocabulary

| Verdict | Meaning |
|---|---|
| Implemented and verified | every step is done and has a recorded verifier (a test run, a log, or the owner's word) |
| Implemented, owner test open | code and tests are present; what remains is a real-session, device or account check that only the owner can run |
| Open work | at least one step has code or content still to write |
| Not started | the phases exist only as text |

### Repository baseline at the start of the review

| Repo | Branch | HEAD | `git status --short` entries |
|---|---|---|---|
| ShatteredArchive | performance/Allocation-hunt | 9191edc | 9 (includes this item's folder move) |
| shatteredarchive-mobile | optimization/Performance-and-Diagnostics | 09b5d85 | 2 |
| merc-mud | main | a0b9a35 | 15 |
| DSL | main | abb9840c | 26 |
| DslMapper | main | ee8ce9e | 0 |
| DslLogViewer | main | ea86b2f | 0 |

## Summary table

| # | Plan | Verdict | Open items (owner / code) | Recommended move |
|---|---|---|---|---|
| 1 | SDK 52 to 58 upgrade (active) | Implemented, owner test open | owner: device sign-in (E5), Doze, push, voice, iOS build; Play Console declaration; keep or veto one lint suppression; scratch folders. Code: two tracked Gradle fixtures dirty; 11 Expo patch versions behind | **Closed as complete and moved to `.ai-plans-completed/2026-11-01_mobile-expo-sdk-upgrade/` on 2026-11-18, on the owner's word** |
| 2 | Simulacrum admin panel (active) | Implemented, owner test open | owner: real relay session (b); commit merc-mud (c). Code: the merc-mud changes (11 files plus 4 untracked paths) are not committed | Stay in `active/` until (b) and (c) |
| 3 | Editable autopilot targets (active) | Open work | owner: Phase 6b round trip on a test account. Not started: mobile phases 7-11 | Stay in `active/` |
| 4 | autoleveling-redesign | Open work | code: `AutoLevelingModal.tsx`, its SCSS and `autoleveling-saved-targets.ts` still exist; owner: a recorded play-test | Stay in `closed-incomplete/` |
| 5 | autoleveling-combat-rest-tuning | Implemented, owner test open | owner: live play-test of eight behaviours (step 13) | Stay in `closed-incomplete/` |
| 6 | movement-tracking-fix | Implemented, owner test open | owner: real-play check on a real character (step 6, plus step 5's lagged-attack check) | Stay in `closed-incomplete/` |
| 7 | centralized-auth-rollout-all-services | Open work | step E device verification; H not started; I (live three-site smoke, rotation runbook, container recreate) not recorded; F's app not in this repo | Stay in `closed-incomplete/` |
| 8 | auth-rollout-phaseB-csharp-clean-cut | Implemented and verified | checkbox of step 5 only (content present); no automated test for the SSO flow | **Moved to `completed/` on 2026-11-18, on the owner's word**; three path mentions updated |
| 9 | mud-parity-new-subsystems | Implemented and verified | craft skill dropped by decision; step 6 checkbox only (index entries committed) | **Moved to `completed/` on 2026-11-18, on the owner's word**; no path mention needed changing |
| 10 | deep-review-log-classification | Open work | steps 5 and 6 never started; step 6 is an owner decision | Stay in `closed-incomplete/` |
| 11 | sitemaps-and-seo | Implemented, owner test open | steps 4 and 5 partial by the plan's own words; step-1 unit test not found; Search Console is the owner's | **Finished and moved to `completed/` on 2026-11-18** through its own work item (`2026-11-18_finish-sitemaps-and-seo-plan`): filter test written, all public page views given descriptions, Search Console done by the owner, dispositions written into the plan |
| 12 | mobile-sweep-remainder-and-globals-bucket | Implemented, owner test open | step 8: on-device 25-minute runs and the reporter's re-test | Stay in `closed-incomplete/` |

### Open work, in the order the owner meets it

1. Commit merc-mud (plan 2; the only code not in git). Decide the untracked `.ai-rules.md`, `2.4/character-sync/`, `docs/` there.
2. Run plan 3 Phase 6b (a test account, two browser contexts) and report; then sign off the web half so the mobile phases can start.
3. Run the real-session checks that several plans share: a Simulacrum relay session (plan 2), a recorded autoleveling play-test (plans 4 and 5), a movement real-play check (plan 6), the mobile device runs (plans 1, 7, 12).
4. Delete the three dead autoleveling files (plan 4), or keep them as a rollback path on purpose.
5. Decide on the tracked Gradle fixture files and the Expo patch drift (plan 1).
6. Decide what to do about auth steps H and I (plan 7) and Deep Review step 6 (plan 10).

### Corrections to plan texts found while reviewing

- Plan 2 (Simulacrum): owner step (a) (hosts line and nginx recreate) is done; its text still lists it as open.
- Plan 7 (auth umbrella): the "OPEN ITEM" on the architecture flag is resolved by the SDK 58 upgrade; its header says COMPLETE while H and I are open.
- Plan 1 (SDK 58): `expo install --check` is no longer clean; test and warning counts have grown since its recorded figures.

## 1. SDK 52 to SDK 58 upgrade (`.ai-plans/active/2026-11-01_mobile-expo-sdk-upgrade`)

**Verdict: Implemented, owner test open.** All 9 phases are `[x]` (`tech-plan.md:124-235`). Nothing in the code is left to write. What remains are owner tests and owner actions, listed below. The mobile work is committed (commit `f290ff1` moved `expo` to `^58`; `3b49c46` and `09b5d85` follow), so the "committing the mobile work" item in the plan's owner list is done.

Proof found this session (mobile repo, `dsl-client/`): `package.json:27` `expo ^58.0.22`, `:51` `react-native 0.88.1`, `:49` `react 19.3.0`, `:52` `react-native-background-actions ^4.1.0`, `:54` `react-native-reanimated 4.7.1`, `:61` `react-native-worklets 0.13.0`, `:75` `react-test-renderer 19.3.0`; the old foreground-service package is absent from source and appears only in a test that asserts it is gone (`plugins/__tests__/withAndroidManifestEntries-test.js:62`); `features/connection/connection-service.ts:4-11` uses the new library; `pnpm config get minimumReleaseAge` = 1440, `nodeLinker` = hoisted.

### Per-step table

| Step | Plan says | Found at | Verified by | Open? | Owner step? |
|---|---|---|---|---|---|
| Phase 0: baseline and safety nets | baseline green, APK and ignored native files saved outside the repos | `C:/Projects/_sdk52-baseline/` holds `app-debug-sdk52.apk` and `native-local/` (contents not read) | `test-results.md` Phase 0 block; folder present | no | removal of the scratch folders is an owner action |
| Phase 1: spike on a scratch copy | every module builds on SDK 58; type decision `specialUse` | scratch copies present: `C:/Projects/_expo52-scratch`, `_expo58-spike`, `C:/cxx/rn`, `rn58` | `test-results.md` Phase 1 and the foreground-service section (`:236`, amendment A2 owner decision) | no | scratch folders still exist (owner removes) |
| Phase 2: config plugins | three Android plugins, 55 tests, scratch prebuild diff | `plugins/withAndroidManifestEntries.js`, `withAndroidGradleCustomizations.js`, `withAndroidProguardRules.js` and their `-test.js` files; `docs/native-customizations.md` | full mobile jest rerun below; docs present | no | no |
| Phase 3: replace the foreground service | new library behind the same four exports | `features/connection/connection-service.ts:4-11`; `features/connection/__tests__/connection-service-test.ts` | rerun below; `test-results.md` Phase 3 device check on the emulator | no | Doze and battery on a physical phone |
| Phase 4: the SDK jump | builds, tsc, lint, suites on SDK 58 | `package.json` versions above; `features/book-editor/__tests__/import-export-test.ts` (EXPO-02) | tsc, lint, jest rerun below | no | no |
| Phase 5: Android runtime matrix | every row pass, fixed or unverified with a reason | 31 incremental screenshot files in the item's `screenshots/incremental/` | `test-results.md` Phase 5 block | no | push and Firebase init and test crash (E15), voice dictation, Timing Diagnostics (E16) |
| Phase 6: in-place upgrade | data and login survive | none in code (a device check) | `test-results.md` Phase 6 block: keys and values identical after two starts, same install | sign-in persistence (E5) not verified | E5 on a physical phone with a real account |
| Phase 7: iOS configuration review | plugins reproduce the regenerated iOS project, not built | `plugins/withFmtConstevalFix.js`, `withDevelopmentTeam.js`, `withoutPushEntitlement.js` and their tests; `docs/run-ios.md` | rerun below | `ios/Podfile.lock` still lists Expo 52.0.14 (`ios/Podfile.lock:14`) and hermes-engine 0.76.3 (`:74`) | `pod install` on the Mac and commit the regenerated lockfile; Xcode 26 with fmt 12.1.0 unverified |
| Phase 8: docs, indexes, final verification | docs match code; six showcase shots | six files in `screenshots/showcase/` (`showcase_01_home` to `showcase_06_book-editor-preview`); `docs/playstore/remediations.md:67` (Play Console declaration as Pending item 3) | rerun below | no | no |

### Reruns this session (2026-11-18, host PowerShell, working tree of the mobile repo)

| Check | Plan's recorded figure | Rerun | Note |
|---|---|---|---|
| Jest, whole app | 891 tests in 69 suites | **1137 passed in 82 suites**, exit 0 | the suite grew after the plan closed (later commits); the earlier intermittent `ConnectModal-test` failure did not recur |
| `tsc --noEmit` | exit 0 | **exit 0** | |
| `pnpm run lint` | 0 errors, 66 warnings | **0 errors, 85 warnings** | warnings grew after the plan closed |
| `expo install --check` | "Dependencies are up to date" | **fails: 11 packages are one or two patch versions behind the expected SDK 58 set** (`expo` 58.0.22 vs ~58.0.26, `expo-router` 58.0.29 vs ~58.0.32, `jest-expo` 58.0.13 vs ~58.0.15, and eight more) | patch releases published after the plan closed; not a defect of the upgrade. The `jest-expo` 58.0.15 release time is 2026-11-17, inside or just past the 1440-minute quarantine |
| `minimumReleaseAge`, `nodeLinker` | 1440, hoisted | **1440, hoisted** | |

### Open items beyond testing, as found

1. **Two tracked Gradle cache files are modified** in the mobile working tree: `plugins/__tests__/fixtures/sdk52/.gradle/9.8.1/fileHashes/fileHashes.lock` and the `sdk58` twin (binary, same size). They are tracked by git and not ignored, so every Gradle run that touches those fixtures dirties the tree. The plan did not mention them. Decision for the owner: untrack and ignore them, or leave. This is not part of the upgrade's behaviour.
2. **Expo patch drift** (table above). A routine `expo install --fix` would bring it in line; it needs the quarantine to have passed for each version, and is the owner's call.
3. **Stale `ios/Podfile.lock`** is known and documented (`docs/run-ios.md`, `docs/mac-build-server.md`); it resolves on the first Mac build.
4. **One `react-hooks/refs` suppression** remains at `components/hud/FloatingSpeechStop.tsx:100` (`eslint-disable-next-line react-hooks/refs`, with the reason in the comment above it). The plan's amendment A7 left "keep or veto" to the owner.
5. **Scratch folders still exist**: `C:/Projects/_expo52-scratch`, `C:/Projects/_expo58-spike`, `C:/Projects/_sdk52-baseline` (kept deliberately until the owner releases the backup), `C:/cxx/rn`, `C:/cxx/rn58`.

### Owner tests (cannot be run by an agent)

Sign-in persistence across the update on a physical phone with a real account (E5); Doze and vendor battery behaviour on a physical phone; push registration, Firebase Performance and Messaging initialisation and the test-crash report (E15); voice dictation start and stop; Timing Diagnostics before and after (E16, no baseline recorded); the iOS build on the Mac (`pod install`, commit the lockfile; Xcode 26 with fmt 12.1.0).

### Owner actions

Play Console foreground-service (`specialUse`) declaration (recorded as Pending item 3 in `docs/playstore/remediations.md:67`); keep or veto the `react-hooks/refs` suppression; remove the scratch folders; decide on the tracked Gradle fixtures.

### Edge-case classifiers (E11)

The plan applied EXPO-01 to EXPO-06 (counts of mentions in `test-results.md`: EXPO-01 1, EXPO-02 3, EXPO-04 2, EXPO-05 2, EXPO-06 1; EXPO-03 has no mention by that id but its content, the quarantine, is proven under the plan's own id E3: "Nothing was refused by `minimumReleaseAge: 1440`" (`test-results.md:74`)). The one proof the plan could not give is E5 (still signed in after the update), which needs a real account on a physical phone.

### Recommendation

Per the decision recorded in scope.md ("close with owner items accepted"): close this plan as complete. Nothing beyond testing and owner actions is open. The five items above are listed so the owner can accept or schedule them; none changes the verdict. Move on the owner's word in Phase 8.

## 2. Simulacrum admin panel (`.ai-plans/active/2026-11-07_simulacrum-admin-panel`)

**Verdict: Implemented, owner test open.** All 15 phases are `[x]` (`tech-plan.md:214-417`, including 4a) and the plan says "awaiting sign-off". The ShatteredArchive code is committed (all 48 files of `features/simulacrumAdmin/` are tracked, `git log` shows `9191edc`; `git status` of `apps/game-client/src`, `deploy`, `scripts` and `docs/game` is clean). **Open on the code side: the merc-mud changes for this plan are not committed** (see item 1). One owner step the plan lists as open (hosts line and nginx recreate) is already done.

### Per-step table

| Step | Plan says | Found at | Verified by | Open? | Owner step? |
|---|---|---|---|---|---|
| 1: local-only boundary | build flag, marker, guard | `apps/game-client/src/features/simulacrumAdmin/marker.ts:5` (`sa-simulacrum-admin-local-v1`), `index.ts`, `scripts/check-local-only.mjs` and its test | guards 121/121, `check:local-only` OK, rerun below | no | no |
| 2: connection gate and runtime | gate, runtime | `connectionGate.ts`, `runtime.ts` and tests | simulacrumAdmin tests pass | no | no |
| 3: window shell, menu, guide start | window, menu item | `components/SimulacrumAdminWindow.tsx`; `DSL/docs/simulacrum-admin/user-guide.md` (committed, `abb9840ca`) | tests pass | no | no |
| 4a: GMCP parity in merc-mud | `login_data`, half-hour clock, GMCP on from the first byte | `merc-mud/2.4/src/gmcp_compose.c` (396 lines), `interp.c:132` (`scan`), 11 modified source files | merc-mud check rerun: **all assertions held** | **working tree only, not committed** | commit; decide the allowlist (plan step (c)) |
| 4: GMCP capture | capped capture, unique listener keys (A1) | `gmcpCapture.ts`, `gmcpCapture.test.ts`, `runtime.ts` | tests pass | no | no |
| 5: GMCP tab, Parity view | schema and parity checker | `dslGmcpSchema.ts`, `gmcpParity.ts`, `components/simulacrumAdmin/GmcpTab.tsx` | tests pass | Parity not seen on a real relay session | step (b) |
| 6: command catalog | generated table, syntax | `commandTable.generated.ts`, `commandSyntax.ts`, `scripts/generate-simulacrum-admin-commands.mjs` | `--check`: "matches the source" | no | no |
| 7: builder, sender, collector | builder, sender, reply collector | `commandBuilder.ts`, `sender.ts`, `replyCollector.ts`, `confirmPolicy.ts`, tests | pass | no | no |
| 8: Commands and Activity tabs | tabs | `CommandsTab.tsx`, `ActivityTab.tsx`, `activityLog.ts` | pass | no | no |
| 9: Players tab | tab | `PlayersTab.tsx`, `characterInfo.ts` | pass | no | no |
| 10: world vhost | read-only vhost, CSP origin | `deploy/nginx/edge-simulacrum-admin.conf`, `deploy/nginx/edge-copilot-csp.conf`, `deploy/docker-compose.shattered-archive-experimental.yml` | **live probe this session**: `GET /api/map` on the real name answers 200 with `Access-Control-Allow-Origin` echoing the game-client origin and **no** allow-origin header for a foreign origin | no | no (step (a) done) |
| 11: world index in the client | loader | `loader.ts`, `loader.test.ts` | pass | no | no |
| 12: World tab, teleport picker | tab, picker | `WorldTab.tsx`, `RoomPicker.tsx` | pass | no | no |
| 13: Server tab | tab, confirmations | `ServerTab.tsx`, `ConfirmDialog.tsx`, `useConfirmation.ts` | pass | no | no |
| 14: final checks, docs, showcase | docs, 7 showcase files | `docs/game/simulacrum-admin.md`, `docs/game/gmcp-parity.md`; seven `showcase_01..07` PNGs in the item's `screenshots/showcase/` | rerun below | no | step (b) |

### Reruns this session (2026-11-18, host PowerShell)

| Check | Plan's recorded figure | Rerun | Note |
|---|---|---|---|
| Simulacrum feature tests (`features/simulacrumAdmin`, `components/simulacrumAdmin`, window) | whole feature at 100% coverage | **580 passed in 33 suites**, exit 0 | coverage not re-measured |
| Whole game-client jest | 3293 tests in 188 suites | **3467 passed in 200 suites**, exit 0 | the suite grew with other work since |
| `pnpm typecheck` | OK | exit 0 | |
| `pnpm test:guards` | 109 | **121 pass, 0 fail, 0 skipped** (5 suites) | the intermittent 1-of-43 failure the plan noted did not recur |
| `check:manifests` | OK, 32 projects | OK, 32 projects | |
| `check:local-only` | OK | OK ("source files clean, 1 dist folder without the marker") | |
| `check:private-names` | 1157 names, 2278 files | OK, 1157 names, **2342 files** | |
| generator `--check` | matches | "commandTable.generated.ts matches the source" | |
| merc-mud `scripts/gmcp-compose-check/run.mjs` | 15 assertions | **exit 0, "all assertions held"** (builds a scratch image from a copy; the running game server was not touched) | |

### Open items, as found

1. **merc-mud changes are uncommitted.** Eleven modified source files (`act_info.c`, `act_wiz.c`, `comm.c`, `copyover.c`, `db.c`, `gmcp_compose.c`, `gmcp_compose.h`, `interp.c`, `merc.h`, `update.c`, and `.annotated`) and four untracked paths (`.ai-rules.md`, `2.4/character-sync/`, `docs/`, `scripts/gmcp-compose-check/`) sit in `C:/Projects/merc-mud` on `main`. The plan names the first group and `scripts/gmcp-compose-check/` as its own. `.ai-rules.md`, `character-sync/` and `docs/` are not named by the plan: whether they belong to this plan is not determined. Player-visible effect noted in the plan (A3): GMCP now starts on for every connection.
2. **Owner step (b) is open**: connect the rebuilt client to the real simulacrum through the relay with the access code, and confirm the menu entry (and its absence on the live game), the accepted hostname and port pair (the plan's Unknown 9), the GMCP tab and Parity view on real traffic, and one harmless command from each of Players, World and Server. Everything so far used a mocked game socket and, for the server, a real login over loopback in Phase 4a.
3. **Owner step (c) is open**: commit the merc-mud changes and decide whether to add the LAN pair to `GAME_PROXY_ALLOWLIST`.
4. **Owner step (a) is done**: the hosts file has an entry for the world vhost name and the nginx container serves it (probe above, the plan's own check at `docs/game/simulacrum-admin.md:389`). The plan's text and `test-results.md:166` still list it as not done.
5. **Known gaps the plan recorded**: the open select popup and the scrollbar track are proven by computed style, not photographed; the earlier one-off guard-suite failure was not reproduced in two runs here.
6. **Lint**: the plan recorded 46 repository errors in seven files, six outside this work (`docs/userscripts/**`). Not rerun; this review touched no code.

### Edge-case classifiers (E11)

Mentions in the plan's `test-results.md`: LOCAL-01 1, LOCAL-02 2, LOCAL-04 2, LOCAL-05 1; LOCAL-03 has none, justified in the plan as not applicable ("no workspace project is added", `tech-plan.md:182`); ADMIN-01 2, ADMIN-02 2, ADMIN-03 5; LIVESTRM-01 4; TH-01 to TH-04 7, 3, 2, 7. Every applicable classifier has proof recorded.

### Recommendation

The plan is implemented and verified to the limit of what an agent can show. Two things stand between it and a clean sign-off, both the owner's: the real-session check (b) and committing merc-mud (c). Suggested order: commit merc-mud (it is the only code not in git), run (b), then sign off. Update the plan's own text for step (a). Move on the owner's word in Phase 8; per the recorded scope decision, a plan with an unexecuted owner step is not filed as completed (WORKITEM-02), so this plan stays in `active/` until (b) and (c) are done or waived.

## 3. Editable autopilot targets (`.ai-plans/active/2026-11-13_editable-autopilot-targets-synced`)

**Verdict: Open work.** The web half (Phases 1-6) is implemented, committed and passes its tests. Phase 6b (the authenticated round trip) is open and owner-run. Phases 7-11 (mobile) are not started by design: the plan makes them wait for the owner's sign-off of the web half (`tech-plan.md:202`, `:216`). Phases done: 6 of 12 (`tech-plan.md:114-191`); open: 6b (`:204`) and 7-11 (`:214-258`).

### Per-step table

| Step | Plan says | Found at | Verified by | Open? | Owner step? |
|---|---|---|---|---|---|
| 1: serve the complete class and area catalog | proxy policy, 48 classes, snapshots, `.v2` cache keys | `apps/web-server/src/mapsResponsePolicy.ts` and its test | web-server 10/10 rerun; **live probe**: `GET /api/web/maps/autoleveling/classes` answers 200, `X-Maps-Source: upstream`, `Cache-Control: public, max-age=2592000`, **48 classes** | no | no |
| 2: server accepts and validates every record kind | seven kinds, override shape | `DSL/Server/Server.Dsl/AgentApi/AutolevelUserRecords.cs`, `Server.Dsl.Tests/AutolevelUserRecordsTests.cs` (committed in DSL, `abb9840ca`) | `dotnet test` filter over the three test classes the plan touched: **50/50** (the plan recorded 33 for `AutolevelUserRecordsTests` alone) | the authenticated PUT of one record per kind was deferred | moved to 6b |
| 3: override storage and sync contract | override rules, store, `SYNCED_RECORD_KINDS` | `features/autoleveling/autoleveling-target-overrides.ts` (+ test), `autoleveling-user-data.ts` (+ test), `docs/game/autopilot.md` | game-client tests rerun | no | no |
| 4: edit the pre-loaded targets | Targets step editor | `components/wizard/TargetsStep.tsx`, `TargetsStep.test.tsx`, `useWizardDraft.ts` (+ test) | rerun; in-app help `TargetsHelp` | no | no |
| 5: class picker and pre-population | full class picker, class defaults | `features/autoleveling/autoleveling-class-defaults.ts` (+ test), `components/wizard/CombatStep.tsx`, `CombatStep.prefill.test.tsx` | rerun | no | no |
| 6: web sync round trip | merge-first Save, cap, load summary | `hooks/useAccountModal` and its tests, `features/auth` cloud sync files | rerun; `showcase_01` and `showcase_02` present | the two-session round trip and `showcase_03_sync-result.png` | **yes, 6b** |
| 6b: authenticated round trip | two browser contexts on one local test account; 7-kind PUT/GET; 400 on unknown kind | not run | not run | **open** | **yes**, needs a local test account |
| 7-11: mobile content API, store, engine port, UI, verification | all mobile | none (plan says not started) | none | **not started** | owner's sign-off of the web half is the gate |

### Reruns this session (2026-11-18, host)

| Check | Plan's recorded figure | Rerun | Note |
|---|---|---|---|
| game-client targeted (autoleveling features, wizard, account modal, auth) | per-phase counts | **537 passed in 24 suites** | |
| game-client whole suite (see section 2) | 2984 tests in 172 suites at the plan's last entry | 3467 in 200 suites, all pass | other work added tests since |
| web-server | 10 tests | **10/10** | |
| DSL C# (`AutolevelUserRecordsTests`, `AutoPilotClassCacheTests`, `NewClassesTests`) | 33 plus pre-existing failures elsewhere | **50/50, 0 failed** | the plan's pre-existing failures are in other test classes (`PlayerBookTests`, `RaceClassSiteConsistencyTests`) and were not in this filter |
| live classes endpoint | 48 classes, source `upstream` | 48 classes, `upstream` | read-only GET |

### Open items, as found

1. **Phase 6b is the one thing between the web half and sign-off.** The plan's own steps (`tech-plan.md:209`): from two separate browser contexts signed in to the same local test account, (1) `PUT /api/user-content/autoleveling` through the real "Save to cloud" after creating one record of each of the seven kinds, then `GET` returns all seven; (2) A edits a target and saves, B loads and sees it, B hides another and saves, A loads and sees both; (3) B, which never loaded, saves a different edit and the cloud copy still holds A's records; (4) a record with an unknown kind answers 400 with the server's message; plus the screenshot `showcase_03_sync-result.png` of the account window after a real Save and a real Load. Per scope decision 3 the owner runs this and reports; this review ran nothing against an account and read no account file.
2. **Mobile phases 7-11 not started**, as planned.
3. **The plan's `tech-plan.md` has one uncommitted line** (a progress-log entry dated 2026-11-18 pointing at the twelve live-test observations, now the proposed item `2026-11-18_autopilot-live-test-findings`).
4. **Plan amendments A7 and A8** (pause a fight command; paused buffs with warnings; lag-aware room scan) were owner requests after Phase 6 and are in `test-results.md` with tests; the room-scan paragraph says one thing is NOT done: buff casts in `start.pre` and `recheckBuffs` are still paced by a fixed settle time, not by their own replies (`test-results.md:81`).
5. **Showcase set is incomplete by design**: files present are `showcase_01`, `showcase_02`, `showcase_04`, `showcase_05`; `showcase_03_sync-result.png` waits on 6b.
6. **Known data gap recorded by the plan**: the areas extractor yields 31 of 32 live areas (`venerable-forest` missing), and about a quarter of the catalog's abilities have no semantic group (Risks, `tech-plan.md:273`); the live probe now shows classes at 48. The area count was not rechecked.

### Edge-case classifiers (E11)

Proven in the plan's `test-results.md`: CLOUDSYNC-01 (kind list pinned on server and client, `:22`, `:33`, `:63`), CLOUDSYNC-03 (unmatched overrides kept and re-attach, `:33`, `:43`), SETTINGS-01/02/06 (`:33`, `:53`), FALLBACK-01 (`:11`, `:53`). **CLOUDSYNC-02** (a save from a device that never loaded must not overwrite the other) is covered by an order test ("merge-before-export", `:63`) but its live proof is exactly the Phase 6b step (3).

### Recommendation

Not closable: Phase 6b and the mobile phases are open work. Nothing to move. The next action is the owner's: run 6b (or point the reviewer to an account), then sign off the web half; after that, Phases 7-11 can start. The plan's checkboxes already say all of this correctly.

## 4. `20260909-0739-autoleveling-redesign`

**Verdict: Open work (three dead files not yet deleted, and the live run is unrecorded).** Steps 1-12 are `[x]` and their code is in the tree and committed. Step 13 (`:336`) has three parts; the code part was half done outside this plan, the live part has no record in this plan.

| Step | Plan says | Found at | Verified by | Open? | Owner step? |
|---|---|---|---|---|---|
| 1-2 wizard scaffold, shared DTO | wizard component, `send_cooldown` | `components/AutoLevelingWizard.tsx`, `features/autoleveling/autoleveling-types.ts` | autoleveling folder tests **255/255 in 9 suites** rerun | no | no |
| 3, 10 C# areas and classes endpoints, proxy, offline | served by the C# service | live probe in section 3: classes endpoint answers `upstream`, 48 classes | probe; DSL C# tests (section 3) | no | no |
| 4 client cache, user-data store | IndexedDB read-through, store | `autoleveling-idb.ts`, `autoleveling-content.ts`, `autoleveling-user-data.ts` | rerun | no | no |
| 5-7 wizard steps, buff catalog | Area, Targets, Combat, Review | `components/wizard/AreaStep.tsx`, `TargetsStep.tsx`, `CombatStep.tsx`, `ReviewStep.tsx`, `autoleveling-buff-catalog.ts` | rerun | no | no |
| 8-9 draft to config, engine shore-up | `draftToConfig`, triplets run | `autoleveling-wizard-config.ts`, `autoleveling-engine.ts` | rerun | no | no |
| 11 class-driven pickers | class pickers, alignment | `components/wizard/dsl-classes.ts`, `autoleveling-classes.ts`, `autoleveling-alignment.ts` | rerun | no | no |
| 12 area data gaps, profile cloud sync | C# area files; cloud sync of overlays | cloud sync proven by plan 3's work (section 3, `features/auth`); the three C# area files are in the DSL repo (not individually opened in this review) | section 3 reruns | the three C# area data fills not individually re-checked | no |
| **13a** play-test (at least 2 real rounds) | recorded clean run | none recorded in this plan | none in this plan; later real use exists: the proposed item `2026-11-18_autopilot-live-test-findings` records twelve observations from live testing on 2026-11-14 | **unrecorded** | **yes**, a recorded clean run |
| **13b** retire the flag and wire the wizard unconditionally | `MainContainer.tsx` unconditional | **done**: `pages/MainContainer.tsx:33` imports only `AutoLevelingWizard`, `:426` renders it, no flag read anywhere in `apps/game-client/src` | grep for `autoleveling.wizard` finds no flag read | no | no |
| **13c** delete the old modal, its SCSS and `autoleveling-saved-targets.ts` | files removed, no imports | **not done**: `components/AutoLevelingModal.tsx`, `styles/AutoLevelingModal.module.scss` and `features/autoleveling/autoleveling-saved-targets.ts` still exist; the only production importer is the modal itself; two test harnesses still mock it (`pages/MainContainer.themeDurability.test.tsx:186`, `testing/mainContainerHarness.tsx:197`); `components/.annotated:19` still describes it | the plan's own Verify (`grep -r AutoLevelingModal` shows no imports) does **not** hold | **open code work** | no |

Open: (i) delete three dead files and update two test mocks and index entries (no behaviour change, an owner decision whether to still keep the rollback path); (ii) a recorded play-test, which later real use makes likely but does not document. The plan's own text says the flag was already opt-out since 2026-09-12 (`:117`).

## 5. `20260912-1629-autoleveling-combat-rest-tuning`

**Verdict: Implemented, owner test open.** Steps 1-12 are `[x]` and found in the tree and committed; only step 13 (`:419`), the live play-test and docs refresh, is unchecked.

| Step | Plan says | Found at | Verified by | Open? | Owner step? |
|---|---|---|---|---|---|
| 1-2 vitals gate model, UI | percentage gates | `features/autoleveling/autoleveling-types.ts:19-30`, `autoleveling-engine.ts:648` (`vitalsGateSatisfied`), `components/wizard/CombatStep.tsx` | autoleveling tests 255/255 | no | no |
| 3 once-per-round and once-per-fight | toggles | `autoleveling-types.ts:35-41` (`AutoLevelOnceKey`) | rerun | no | no |
| 4 queue clear on leaving combat | `~` only when a queue built up | `autoleveling-engine.ts:818` (`clearQueueIfBuiltUp`) | rerun | no | no |
| 5 auto-tuned cooldown | queue-buildup detection, persisted learning | `autoleveling-engine.ts:435` (`learnedCooldownSec`), `:928` | rerun | no | no |
| 6-7 Rest step | data model, engine, UI | `components/wizard/RestStep.tsx`; Rest in wizard steps (`AutoLevelingWizard.tsx:99`) | rerun | no | no |
| 8 flee-pause hardening, look-first resume | pause on flee, resync on resume | `autoleveling-engine.ts:570`, `:1094-1096`, `:1254` (`refreshRunSnapshot`) | rerun | no | no |
| 9-10 weight gate | drop sequence once at threshold | `autoleveling-engine.ts:409`, `:744-761` (`weightGateFired`); `components/wizard/WeightStep.tsx` | rerun | no | no |
| 11-12 live-apply, pause-to-edit resync | edits take effect | `autoleveling-engine.ts:400`, `:1254`, `:1306`, `:1493` | rerun | no | no |
| **13** live play-test of eight behaviours, docs refresh | recorded clean run | none recorded | none | **unrecorded** | **yes**, the eight behaviours listed in the plan (`:419-434`) |

The plan's index and flow regeneration ("regenerate `.flows`", the Continue-session `/document-flows` note at the end of its log) was not found to be done in this review: not checked, listed as unknown.

## 6. `20260813-1325-movement-tracking-fix`

**Verdict: Implemented, owner test open.** Steps 1-5 are `[x]`, found in the tree and committed; step 6 (`:408`), the real-play verification against the live merc-mud instance, is the only unchecked step, and the plan itself flags step 5 as "UNVERIFIED LIVE" (`:403`).

| Step | Plan says | Found at | Verified by | Open? | Owner step? |
|---|---|---|---|---|---|
| 1 shared classifier, central "command sent" signal | `classifyMovement` | `features/movement/classifyMovement.ts` (+ test) | movement tests **28/28 in 3 suites** rerun | no | no |
| 2 shared tracker | `movementTracker` | `features/movement/movementTracker.ts` (+ two test files); `pendingCount()` at `:135` | rerun | no | no |
| 3 migrate `useCompassBlock` | uses tracker | `hooks/useCompassBlock.ts` references `movementTracker` | rerun; whole suite passes | no | no |
| 4 migrate the engine | uses tracker | `features/autoleveling/autoleveling-engine.ts` imports `movementTracker` | rerun | no | no |
| 5 queue-depth-aware engage timeout | timeout does not fire while the queue is working | `autoleveling-engine.ts:2168-2185` (`movementTracker.pendingCount()`), `:2242` | rerun | no | **yes** (live, plan: "deliberately-lagged attack") |
| **6** real-play verification | compass click, no-exit move, stacked `n;n;n;e;e;e`-style command, a scripted path, timing the "Alas" failure | none recorded | none | **unrecorded** | **yes**, with a real character on the dev stack |

Note for the move: three source comments (`classifyMovement.ts:5`, `movementTracker.ts:9`, `movementTracker.test.ts:5`) and two `.annotated` lines (`components/.annotated`, `features/movement/.annotated`) name this plan's `closed-incomplete/` path.

## 7. `20260726-1953-centralized-auth-rollout-all-services` (umbrella, 10 steps A-I)

**Verdict: Open work.** Seven steps are `[x]` (A, A2, B, C, D, F, G), three are `[ ]`: E (`:417`), H (`:449`) and I (`:468`). The file's own header says "Status: COMPLETE", which is not true of H and I (WORKITEM-02). The plan's last progress entry says "Umbrella still 7/10" (`:861`).

| Step | Plan says | Found at | Verified by | Open? | Owner step? |
|---|---|---|---|---|---|
| A hub foundations: SSO hand-off, per-service roles | `apps/auth-server`, `apps/auth-client` | `apps/auth-server`, `apps/auth-client` exist; `docs/auth-server.md:242` (SSO hand-off), `:273` (token exchange) | auth-server tests rerun: **294/294 in 23 suites**; sub-plan `completed/20260727-0905-auth-rollout-phaseA-hub-sso-roles.md` | no | no |
| A2 hub user management, visual refresh | admin endpoints | `docs/auth-server.md:314-342`; sub-plan `completed/20260727-1145-...` | auth-server tests | no | no |
| B C# identity replacement | SSO hand-off in `Server.Web.Public` | see section 8 | see section 8 | no | no |
| C C# user-data APIs, dashboard shell | content APIs, dashboard | `DSL/Server/Server.Web.Public/Controllers/UserContentController.cs`, `OrganizationContentController.cs`; sub-plan `completed/20260727-1243-...-phaseC-...` | committed in DSL; no C# test class for these controllers found | no | no |
| D web game wiring | token store, cloud sync, account panel | `apps/game-client/src/features/auth/` (`authTokenStore.ts`, `cloudSync.ts`, `gameSso.ts`, `siteApi.ts` and their tests); sub-plan `completed/20260727-1420-...-phaseD-...` | whole game-client suite passes (section 2) | no | no |
| **E mobile wiring** | same APIs from the Expo app; sign-in survives background and restart | code present: `dsl-client/features/auth/` (`auth-fragment.ts`, `auth-token-storage.ts`, `cloud-sync.ts`, `game-sso.ts`, `site-api.ts`, `use-account.ts`, `android-auth-redirect-bridge.ts`), `dsl-client/app/auth-callback.tsx` | mobile suite 1137/1137 (section 1); the plan's last E entry says a **live retest with Chrome as the resolved browser is "still not independently verified"** and E "stays unchecked until that passes" (`:1286-1306`) | **code complete, device verification pending** | **yes**, sign in on a physical Android phone and confirm the alias round trip and that sign-in survives restart |
| F "a removed app": WS auth, persistence, dashboard | `apps/removed-app-*` | no `removed-app` folder exists under `apps/` now (listing: `auth-client`, `auth-server`, `mud-builder-client`, `mud-builder-server`, and others); the step names the app generically | not verifiable in this repo today | cannot be proven here | the owner states whether the app was removed on purpose |
| G MUD Builder per-user content and role gate | role store, content | `apps/mud-builder-server/src/role-store.ts`, `auth-store.ts`; sub-plan `completed/20260728-0858-mud-builder-phaseG-roles-content.md` | mud-builder-server tests rerun: **187/187 in 18 suites** | no | no |
| **H** Mapper and LogViewer dashboards, central roll-up | SSO login in `DslMapper` and `DslLogViewer`, summary endpoints, roll-up | no sign-in code in either repo (a case-insensitive search for `sso|login|auth-server` over their `.ts/.tsx/.js/.jsx` sources found only unrelated words); the work has its own proposed item `.ai-plans/proposed/2026-07-28_auth-rollout-phaseH-mapper-logviewer-dashboard` ("never scoped") | none | **not started** | no |
| **I** program close-out | deploy wiring, key-rotation runbook verified live, three-site smoke, container recreate survival | a rotation endpoint is documented (`docs/auth-server.md:183`); no log entry records the live three-property smoke, the live rotation runbook or the container-recreate check (the log mentions them only as planned: `:473-479`, `:538`) | none | **open** | **yes** |

Items beyond the ten steps:

- **The "OPEN ITEM" at `:1138`** (Android old architecture against iOS new architecture) is **resolved by the SDK 58 upgrade**: `android/gradle.properties:44` now reads `newArchEnabled=true`, `ios/Podfile.properties.json:4` is `"true"`, and the SDK plan's Phase 5 proved `react-native-tcp-socket` on the new architecture (section 1). The plan text still shows it as open.
- Sub-plans of A, A2, C, D and G live in `completed/` and name this umbrella's `closed-incomplete/` path (4 files, see Phase 8).
- Whether anything finished H or I since the log ended (2026-08) was searched in the Mapper and LogViewer repos only; the C# dashboard side of H was not searched.

## 8. `20260727-1022-auth-rollout-phaseB-csharp-clean-cut`

**Verdict: Implemented and verified (one unticked checkbox, its content done).** Steps 1-4 are `[x]`; step 5 (`:191`, docs, indexes, bookkeeping) is unchecked. Its content is present:

| Step | Plan says | Found at | Verified by | Open? | Owner step? |
|---|---|---|---|---|---|
| 1 C# clean-cut implementation | hub client, middleware, user controller rewritten, legacy deleted | `DSL/Server/Server.Web.Public/Controllers/SiteSsoController.cs`, `UserController.cs`, `Middleware/HubAuthMiddleware.cs`, `Models/AuthHubOptions.cs`, `Services/AuthHub/` (committed in DSL; the SSO controller was last committed in `9220736b5`) | plan log: build 0 errors | no | no |
| 2 local certification | scripted E2E against a scratch hub | no repo test; a one-off script run | plan log: **20/20 PASS** (signed off) | no automated test in the DSL repo covers the login flow (a search of the DSL test projects for `SiteSso` and `HubAuth` found nothing) | no |
| 3 live hub registration, key custody | `shattered-web` registered | `docs/auth-server.md:794` ("`shattered-web` is registered") | doc statement | no | no |
| 4 live TABLE_USERS check, deploy, live E2E | live checks at the real edge | plan log lines at `:316-321`: live checks at the edge (legacy `POST /user/authenticate` 404, anonymous dashboard redirects to login, audience isolation shown "on production"); the last log entry adds a corrected localhost loop, **16/16 PASS** | plan log | no | no |
| 5 docs, indexes, bookkeeping | `docs/auth-server.md` consumer table, DSL `.annotated`, umbrella step B to `[x]`, memory line | `docs/auth-server.md:794-842` records Phase B as done with its evidence path; `Controllers/.annotated`, `Middleware/.annotated`, `Services/.annotated`, `Models/.annotated` in `Server.Web.Public` mention the hub/SSO; the umbrella's step B is `[x]` (`:341`) | read this session; the memory line is outside the repo and was not checked | checkbox only | no |

Open: the checkbox of step 5 (the owner can tick it); the lack of an automated test for the SSO flow is a test-coverage observation, not part of this plan's steps.

### Reruns this session (2026-11-18, host)

| Check | Rerun |
|---|---|
| `@shatteredarchive/auth-server` tests | **294 passed in 23 suites**, exit 0 |
| `@shatteredarchive/mud-builder-server` tests | **187 passed in 18 suites**, exit 0 |
| mobile whole suite (auth files included) | 1137/1137 (section 1) |
| game-client whole suite (auth feature included) | 3467/3467 (section 2) |

The plans recorded 278 mobile tests and other counts at their time; those figures are not compared here because the suites have grown.

## 9. `20260723-1145-mud-parity-new-subsystems`

**Verdict: Implemented and verified, with one step dropped by decision.** Steps 2-5 are `[x]`; step 1 (craft skill, `:62`) is unchecked because it was deliberately reverted; step 6 (`:131`, indexes) is unchecked but its content is present.

| Step | Plan says | Found at | Verified by | Open? | Owner step? |
|---|---|---|---|---|---|
| 1 craft skill | practiced skill with a gsn | **no `gsn_craft` or `"craft"` entry in `merc-mud/2.4/src/const.c` or `merc.h`** | plan log: added at 15:22, then "step 1 REVERTED per explicit user correction" (crafting is not a practice skill); the file's last entries repeat "that subsystem was reverted, not deferred" | no: **dropped by the owner's decision**, not missing work | no |
| 2 quest points | persisted currency, `qpoints` command | `merc-mud/2.4/src/merc.h`, `save.c`, `act_wiz.c`, `comm.c`, `interp.c`, `interp.h` (`do_qpoints`, `quest_points`) | committed in merc-mud (`a0b9a35`, "Feature/web UI integrations (#1)"); plan log: `qpoints ... set 42` showed in the prompt and the GMCP stream live | no | no |
| 3 battle stance | `do_stance`, light combat effect | `act_info.c`, `interp.c`, `interp.h` | committed; plan log: stance showed in prompt and GMCP | no | no |
| 4 language | `do_speak`, garbling | `act_comm.c`, `interp.c`, `interp.h`, `merc.h` | committed; plan log: live session | no | no |
| 5 build and persistence regression | clean build, old save loads | whole tree builds: the merc-mud compose check built a scratch image and passed (section 2) | plan log; section 2 rerun | no | no |
| 6 refresh AI indexes | `.annotated` entries for the touched files | `merc-mud/2.4/src/.annotated` mentions stance (`:55`), speak (`:45-46`) and qpoints (`:69`); **the committed `.annotated` at HEAD already holds 14 such mentions** | read this session | checkbox only; the optional `custom-commands/admin-commands.md` addition was conditional ("confirm scope before adding") and is not present | no |

Note: the merc-mud working tree now carries uncommitted changes from the Simulacrum plan (section 2); none of them is part of this plan.

## 10. `20260723-1616-deep-review-log-classification`

**Verdict: Open work, by the plan's own words (steps 5 and 6 never started).** Steps 1-4 are `[x]` and present; steps 5 (`:114`) and 6 (`:126`) are unchecked, and the plan's log says "plan left ACTIVE with steps 5-6 unchecked for a future session" (`:141-145`).

| Step | Plan says | Found at | Verified by | Open? | Owner step? |
|---|---|---|---|---|---|
| 1-3 pipeline, fixes, JSON envelope unwrapping | extraction and classification scripts | `DSL/Deep Review/scripts/classify-logs.js`, `rules.json` (402 lines); `PLAN.md`; `.ai-context` and `.annotated` in the folder; all tracked, last commit `a523ba420` | plan log; `reports/run-stats.json` read | no | no |
| 4 cross-reference the pattern reference, two rules batches | Unclassified 50.8% to 31.0% | `reports/run-stats.json`: 46,925,304 records extracted, `Unclassified` 14,550,522, which is **31.0%** | arithmetic from the committed stats file | no | no |
| **5** mine the reference doc's native-only and unconfirmed tail | new rules, measured against the 31.0% baseline | the plan's log (2026-08-02) says the pattern research is done but "Step 5's own deliverable (`scripts/rules.json` + a `classify-logs.js` run) was NOT touched" | none | **open** (not started) | no |
| **6** decide how to handle the room-prose tail | a decision | none | none | **open** (the plan flags it as a decision for the owner, "not a default-yes step") | **yes**, a decision |

`rules.json` and `CapturedPatterns_Reference.txt` live in the DSL repo (the reference file was not found under the DSL repo's first three levels in this review; the plan's log says it was verified against the corpus).

## 11. `20260805-1500-sitemaps-and-seo`

**Verdict: Implemented, owner test open, with two steps marked partial by the plan itself.** The plan's checkboxes are `[x]` for steps 1, 2, 3, 6 and `[~]` for steps 4 and 5; there are no `[ ]` steps, which is why the folder scan counted it as having none open. Its header says "COMPLETE — ... step 4 PARTIAL ... step 5 PARTIAL".

| Step | Plan says | Found at | Verified by | Open? | Owner step? |
|---|---|---|---|---|---|
| 1 route half of the `.com` sitemap generator | `SitemapService`, with a unit test that an `[Authorize]` action is excluded | `DSL/Server/Server.Web.Public/Services/SitemapService.cs` | the plan log says live-verified; **no unit test for the filter was found**: `Server.Dsl.Tests` and `Server.Jobs.Tests` contain no sitemap test (the three files that mention "Sitemap" are agent-API tests) | the test the step asked for is missing | no |
| 2 content half | eight content types | same service | plan log: 10,326 URLs; **live probe this session**: the local site's `/sitemap.xml` answers 200 `application/xml` and is a sitemap **index** with 10 `<loc>` entries | no | no |
| 3 serve, cache, declare | `SitemapController`, robots line | `Controllers/SitemapController.cs`; `wwwroot/robots.txt:17` documents the generated sitemap | probe above | no | no |
| 4 on-page SEO baseline | canonical, OG, JSON-LD | `deploy/index.html` carries canonical (`:27`) and Open Graph (`:39`); the C# `_Layout` baseline is in the DSL repo (not opened); **11 of the 69 `.cshtml` files under `Server.Web.Public/Views` set `ViewData["Description"]`** (layouts and partials included in the 69) | plan log says "STILL TO DO: the remaining ~30 views" | **partial by the plan's own words** | no |
| 5 cross-domain hygiene, Search Console | hygiene confirmed; the owner sets up Search Console | `deploy/sitemap.xml` (3 urls, tracked) | plan log | Search Console is not started | **yes**, needs the owner's Google account |
| 6 `.dev` SPA indexing | closed, no work | n/a | plan log | no | no |

## 12. `20261029-1927-mobile-sweep-remainder-and-globals-bucket`

**Verdict: Implemented, owner test open.** Steps 1-7 are `[x]` (step 5 is marked DROPPED by decision); step 8 (`:114`, on-device and SanbonRift verification) is unchecked and is explicitly "a host/user task".

| Step | Plan says | Found at | Verified by | Open? | Owner step? |
|---|---|---|---|---|---|
| 1 web connection-scoped storage fix | Globals keep their script on reopen | `apps/game-client/src/features/userScripts/globalScriptsStore.ts`, `hooks/useGlobalScripts.ts`, `components/UserScriptSandboxModal.globals.test.tsx` | whole game-client suite passes (section 2); plan log: real-browser check | no | the reporter's confirmation (step 8) |
| 2 cloud save and load safe, tells the user | summaries and guards | `features/auth/cloudSync.ts`, `loadImpact.ts` (+ tests), `hooks/useAccountModal.ts`; mobile `features/auth/load-impact.ts` | rerun | no | no |
| 3 web per-line allocation hot paths | plugin host and core plugins | `features/plugins/pluginHost.ts` exists; the individual allocation fixes were not re-inspected | suite passes | not individually re-inspected | no |
| 4 script-language runtimes | one Lua state and one Skulpt configure per run | `features/userScripts/luaRuntime.ts`, `pythonRuntime.ts`; mobile `features/scripts/__tests__/language-runtimes-test.ts` | suites pass | not individually re-inspected | no |
| 5 mobile global-scripts bucket | DROPPED | none, by decision | plan log | no | no |
| 6 mobile partial-lines double-processing | fixed | `dsl-client/features/connection/connection-manager.ts`, `script-engine.ts`; tests `line-routing-test.ts` | mobile suite 1137/1137 (section 1) | no | no |
| 7 mobile small items and unreviewed screens | replay cap tied to `maxScrollbackLines`, `AnsiLine` memo, screens reviewed | `connection-manager.ts:114` (`subscribeHudSettings(s => this.replay.setCap(...))`), `components/AnsiLine.tsx:47` (`React.memo`), `__tests__/replay-buffer-test.ts` | suite passes | no | no |
| 7b (added later) unsaved-changes guard on writing surfaces, web and mobile | consistent warnings | web: `components/LibraryModal.unsaved.test.tsx`, `OrganizationsPane.unsaved.test.tsx` | suite passes; plan log: 16/16 real-browser checks | no | no |
| **8** on-device and reporter verification | tab behaviour, two diagnostics exports compared, the reporter confirms both web symptoms are gone | none (no export comparison or confirmation is recorded) | none | **open** | **yes**, device play of about 25 minutes twice, and the reporter's re-test |

### Reruns for sections 9-12

The merc-mud compose check (section 2), the mobile suite (1137/1137, section 1) and the game-client suite (3467/3467, section 2) cover the code these four plans touched. No separate test run was made for the DSL Deep Review scripts or the sitemap service (no test project covers them).

## Owner decisions and moves (2026-11-18)

| Question (one per plan, with the evidence shown) | Owner's answer | Done |
|---|---|---|
| Close the SDK 52 to 58 upgrade as complete and move it? | Yes | `item.md` `state: completed`; progress-log line added (owner items accepted); folder moved with `git mv` to `.ai-plans-completed/2026-11-01_mobile-expo-sdk-upgrade/` (31 incremental and 6 showcase screenshots moved with it). Ready for `/pr-review` and `/pr-package`; not run here |
| Move auth Phase B to `completed/`? | Yes | disposition of step 5 appended to the plan; `git mv`; three path mentions updated: `docs/auth-server.md:797` and two in the auth umbrella (`:342`, `:640`) |
| Move mud-parity new subsystems to `completed/`? | Yes | dispositions of steps 1 and 6 appended; `git mv`; the two plans in `completed/` that name it do so by bare file name in the same folder, so nothing needed changing |
| Move sitemaps and SEO anyway? | "Complete the work, then close it" | not moved at first; the remaining work (the step-1 filter test, descriptions for the views that lack them, Search Console) was done in its own work item `2026-11-18_finish-sitemaps-and-seo-plan`, after which the plan was moved to `completed/` (4 path mentions updated, old-path search clean) |

Reference sweep (WORKITEM-01): before the moves, `git grep --untracked` over nine sibling repos found the old paths only in this repo. After the moves the search for `closed-incomplete/20260727-1022`, `closed-incomplete/20260723-1145` and `.ai-plans/active/2026-11-01_mobile-expo-sdk-upgrade` finds one remaining hit, kept on purpose: the SDK plan's `test-results.md:220` "Files changed" line names its own old folder as it was when written (historical). Mentions of the SDK plan's slug in `docs/standards/javascript.md` and `docs/standards/edge-cases/expo-native-upgrade.md` are slug references (a slug never changes), so they remain valid.

Not moved, and why: plans 2 and 3 stay in `active/` (open owner steps and open phases); plans 4, 5, 6, 7, 10 and 12 stay in `closed-incomplete/` (plan 11, sitemaps, was moved later the same day, see its row) (each has an unexecuted step with its disposition in the table above). `.ai-plans-completed/.ai-context:3` and `docs/claude/work-item-workflow.md:23` still describe the folders correctly (`closed-incomplete/` held 7 plans then, 6 after plan 11 moved), so neither was reworded.
