# Scope: Upgrade the mobile app to the latest stable Expo SDK

Item: item.md · Type: proposal · Scoped against: ShatteredArchive `performance/Allocation-hunt` @ a565d53; shatteredarchive-mobile `optimization/Performance-and-Diagnostics` @ a40bd52 (+ 6 uncommitted files) · Date: 2026-11-01
Data classification of this work: internal (rules: docs/standards/data-classification.md, DRAFT — owner has not confirmed it)

## What the work is
Move the mobile app `shatteredarchive-mobile/dsl-client` from Expo SDK 52 (`expo` ~52.0.11, installed 52.0.49; `react-native` 0.76.9; `react` 18.3.1) to the latest stable Expo SDK, together with the React Native and React versions that SDK pins. Expo's `latest` tag is 58.0.22 and its `bundledNativeModules.json` pins `react-native` 0.88.1 and `react` 19.3.0 (fetched 2026-11-01). The item (decisions below) also covers replacing `@supersami/rn-foreground-service`.

Decisions recorded 2026-11-01 (user, via AskUserQuestion):
- Target SDK 58 in one jump (not stepwise, not stopping at 56).
- Native projects `android/` and `ios/` are regenerated with `expo prebuild`, and the repo's custom edits are re-applied.
- Platforms built and verified: Android only; iOS configuration is updated but not built.
- Replacing `@supersami/rn-foreground-service` is part of this work.

## Affected areas
| Area | Role in the work | Kind | Evidence |
|---|---|---|---|
| `dsl-client/package.json` | Every Expo-pinned dependency changes. Direct dependencies today: 46 `dependencies` + 11 `devDependencies` | change | `dsl-client/package.json` lines 16-76 |
| `dsl-client/app.json` + `plugins/` (3 custom config plugins) | Config plugins for expo-router, splash, speech recognition; custom `withFmtConstevalFix`, `withDevelopmentTeam`, `withoutPushEntitlement` | change / re-check | `app.json` `plugins`; `plugins/withFmtConstevalFix.js` (patches RN's vendored `fmt` for Xcode 26; written against fmt of RN 0.76.x) |
| `dsl-client/android/` (committed, 90 tracked files across android+ios) | Regenerated; must keep the repo's edits: Firebase Gradle plugins (google-services 4.5.0, crashlytics-gradle 3.0.7, perf-plugin 2.0.2), R8/shrink flags, `buildStagingDirectory = file("C:/cxx/rn")` for Reanimated, `keystore.properties` wiring, `versionCode`, `proguard-rules.pro` | change | `android/build.gradle` (buildscript `classpath`, `subprojects` block), `android/app/build.gradle` (plugin lines 2-8), `android/gradle.properties` |
| `dsl-client/ios/` (committed) | Config updated, not built (Android only). Podfile has the `fmt` post_install patch | change (unbuilt) | `ios/Podfile` lines ~49-55, `ios/Podfile.properties.json` |
| Android toolchain pins | Gradle 8.10.2, `kotlinVersion` 1.9.25, NDK 26.1.10909125, `compileSdk` 35, `targetSdk` 34, `minSdk` 24 | change | `android/gradle/wrapper/gradle-wrapper.properties`, `android/build.gradle` `ext` block |
| `@react-native-firebase/*` (analytics, app, crashlytics, messaging, perf) | Native modules plus 5 source files using them; installed 21.14.0, registry latest 27.1.0; Gradle plugins on the Android side | change | `package.json` 19-23; source: `app/_layout.tsx`, `app/(tabs)/settings.tsx`, `features/analytics/analytics-tracking.tsx`, `features/push/push-token-registration.ts`, `features/diagnostics/timing-diagnostics-firebase.ts` |
| `@supersami/rn-foreground-service` | Android keepalive for the game connection; last release 2025-04 (2.2.5); builds an emitter whose native side lacks `addListener` (the Metro `NativeEventEmitter` warnings). To be replaced | remove / new | `package.json` 26; single importer `features/connection/connection-service.ts`; `docs/features/background-connection.md` |
| `react-native-tcp-socket` | Game connection socket; installed 6.4.1, latest 6.4.3 | change / verify | `package.json` 58; 2 importing files |
| `react-native-reanimated` + new `react-native-worklets` | SDK 58 pins Reanimated 4.7.1, whose peers are `react-native` 0.86-0.88 and `react-native-worklets` 0.13.x; today 3.16.x | change | `package.json` 54; 3 importing files; `babel` plugin / `jest.config.js` line `/node_modules/react-native-reanimated/plugin/` |
| `react-native-render-html` 6.3.4 | Registry latest is 6.3.4 (installed = latest); renders ANSI output; emits React 18.3 `defaultProps` warnings today, React 19 behaviour unknown | verify | `package.json` 55; 2 importing files (`components/AnsiViewer.tsx`) |
| `react-native-webview`, `react-native-screens`, `react-native-safe-area-context`, `react-native-gesture-handler`, `react-native-web` | Versions pinned by SDK 58: webview 14.0.1, screens ~4.30.1, safe-area-context ~5.10.1, gesture-handler ~3.3.0, web ~0.21.4. gesture-handler has 0 direct imports | change | `package.json` 53, 56-57, 59, 62; bundledNativeModules |
| `@react-native-async-storage/async-storage` | Pinned 1.23.1 today, SDK 58 pins 2.2.0. 45 source files import it; all app data lives in it | change | `package.json` 18; count from `grep -rlE "from '@react-native-async-storage"` over app/components/features/hooks/utils |
| `expo-*` modules (≈20) incl. `expo-router` (~4.0.9 → ~58.0.29), `expo-file-system` (2 files), `expo-secure-store` (1 file), `expo-speech-recognition` (^1.1.1 → 58.0.1 on the registry; 2 files), `expo-linking` | Version bumps and API changes of each | change | `package.json` 31-48; `components/scripts/UserScriptsSection.tsx`, `features/book-editor/import-export.ts` import `expo-file-system` |
| Test setup | `jest-expo` ~52.0.2 → ~58.0.13; `react-test-renderer` 18.3.1 and `@types/react` ~18.3.12 follow React 19; the pnpm-aware `transformIgnorePatterns` allowlist (`TRANSPILE`) may need new package names. 51 test files today | change | `dsl-client/jest.config.js`; `find` of `*-test.ts(x)` → 51 |
| Metro | `metro.config.js` fengari shims through `resolveRequest`; `getDefaultConfig` from `expo/metro-config` | verify | `dsl-client/metro.config.js` |
| pnpm config | `nodeLinker: hoisted`, `minimumReleaseAge: 1440`, `overrides` (tar, undici), `allowBuilds` (foreground-service, protobufjs, unrs-resolver); a replaced/new native dep changes `allowBuilds` | change | `dsl-client/pnpm-workspace.yaml` |
| Docs of the mobile repo | Version statements to update: `CLAUDE.md` (layout block, "expo ~52, react-native ^0.76"), `docs/reference/index.md:14`, `docs/reference/mobile.md:3`, `docs/playstore/remediations.md:67-77` (the SDK-upgrade note), `docs/development.md` (says Node v18+, JDK 17), `docs/features/background-connection.md` | change | the files named |
| Root scripts | `scripts/build-android.js`, `start-android.js`, `build-apk.js`, `deploy-apk.js`, `package-apk.js` wrap `expo run:android`; behaviour on SDK 58 unverified | verify | `shatteredarchive-mobile/package.json` scripts |

## Stakeholders
- **Owner / mobile developers:** one decision on the target SDK is made (58); commits the pending Firebase edits first; reviews the regenerated native projects.
- **Mobile players on Android:** receive the new build; background connection (foreground service), push, speech recognition, scripts and the terminal view are what they touch.
- **Release / Play Store:** `docs/playstore/remediations.md` records that Google's required `targetSdkVersion` is expected to rise to API 36 around late 2026 / early 2027; the current `targetSdk` is 34 in `android/build.gradle`. Whether API 34 still meets the current requirement is not verified here.
- **iOS users and the Mac build server (docs/mac-build-server.md):** not built in this work (decision), so iOS config is left changed but unproven; a follow-up build is implied.
- **Firebase project owner:** Crashlytics, Analytics, Performance and FCM keep reporting; consoles are the only place to confirm.
- **Docs readers:** the mobile repo's `CLAUDE.md` and `docs/` are the stakeholder documents.
- **End-user documentation:** none found for the mobile app in this repo beyond `docs/features/*.md` (developer-facing); the in-app help (`app/(tabs)/explore.tsx`) is the end-user surface. No user-visible feature change is intended.

## Data touched
| Data | Class | Read/Write/Store/Send/Log | Change in handling |
|---|---|---|---|
| App data in AsyncStorage (plugin records and configs, user scripts, books, settings, game-connection options; may contain character names the player typed) | Personal | Read/Write/Store (on device) | None intended; `async-storage` 1.23.1 → 2.2.0 and the new-architecture switch could change how existing data is read: a stored-data compatibility check is an unknown |
| Auth token in `expo-secure-store` (1 importing file) | Restricted | Read/Write/Store (on device keystore) | None intended; whether existing encrypted entries survive the `expo-secure-store` major bump is an unknown (a failure would log the player out) |
| Firebase Analytics screen views, Crashlytics reports, Performance traces, FCM device token | Personal (device identifier, crash data) | Send | None intended; a 21 → 27 major jump may change defaults or consent behaviour: unverified |
| Firebase config `google-services.json` and signing keys | Restricted | Store (local) | `google-services.json` is **not** git-tracked (`git ls-files` finds none); `keystore.properties.example` is the only tracked key file (plus `debug.keystore` files). The work must not add either; no values appear in this document |
| Metro/Gradle build logs | Internal | Log | Build output must be scrubbed before it goes into `test-results.md` |

## Inputs for sizing
Not sized: that is for a human. Countable facts and the search that produced each:
- Repos touched: 2 (`shatteredarchive-mobile` code; `ShatteredArchive` holds only the work-item documents). Cross-repo coordination with the web repo: none found.
- Direct dependencies in `dsl-client/package.json`: 46 `dependencies` + 11 `devDependencies` (counted with `node -e` over the file).
- SDK 58 pins from `bundledNativeModules.json` (`curl` of `unpkg.com/expo@58.0.22`) for the packages this app uses: `react` 18.3.1 → 19.3.0; `react-native` 0.76.9 → 0.88.1; `react-native-reanimated` 3.16 → 4.7.1; `react-native-gesture-handler` 2.20 → 3.3; `async-storage` 1.23.1 → 2.2.0; `expo-router` 4 → 58.
- Source files importing upgrade-sensitive modules (grep `from '<pkg>`): async-storage 45, expo-router 13, safe-area-context 13, vector-icons 18, reanimated 3, `react-native-render-html` 2, `react-native-tcp-socket` 2, `expo-file-system` 2, `expo-speech-recognition` 2, `expo-symbols` 2, Firebase 5, foreground-service 1, webview 1, secure-store 1, gesture-handler 0, screens 0.
- Source files using `forwardRef` / `defaultProps` / `propTypes` / `findDOMNode`: 2 (`grep -rlE` over app/components/features/hooks).
- Test files: 51 (suites), 699 tests at the last run; one of them mocks Firebase (`timing-diagnostics-firebase-test.ts`).
- Committed native project files: 90 tracked under `dsl-client/android` + `dsl-client/ios`. Custom config plugins: 3.
- Mobile docs naming the current SDK or versions: 5 files (`CLAUDE.md`, `docs/reference/index.md`, `docs/reference/mobile.md`, `docs/playstore/remediations.md`, `docs/development.md`).
- Open Unknowns in this document: 11.
- Local toolchain facts found: Node v26.12.1 (RN 0.88.1 requires `^22.13 || ^24.3 || >=26`); the mobile dev doc still states Node v18+ and JDK 17.

## Dependencies and order
- The 6 uncommitted mobile files (Firebase modular-API migration) should be committed or set aside before any dependency change; otherwise the diff mixes two jobs. The plugin-config overrides work is already committed in the mobile repo (HEAD a40bd52), which differs from what `item.md` says ("uncommitted").
- The upgrade needs a baseline: `tsc --noEmit`, `expo lint`, `jest` (51 suites / 699 tests today) and a working Android debug build on the current SDK, so a regression is attributable.
- A replacement for `@supersami/rn-foreground-service` has to exist before the dependency is removed, or the Android background connection is lost in between.
- Android build and an emulator exist on the dev machine (Pixel8 AVD, dev client against Metro on 8081); a physical Android device is needed for foreground-service, push and speech-recognition behaviour that an emulator cannot show.
- Firebase consoles (outside the repo) are the only place to confirm that Crashlytics, Analytics, Performance and FCM still arrive.
- Out-of-repo blockers: none identified; Play Store submission is not part of this.

## Risks and unknowns
1. **Library support for SDK 58 / RN 0.88 is unconfirmed for:** `react-native-tcp-socket` 6.4.3 (peer `react-native >=0.60`, nothing newer), `@supersami/rn-foreground-service` (peer `>=0.59`, last published 2025-04), `react-native-render-html` 6.3.4 (unmaintained; React 19 effect unknown). Peer-dependency ranges say nothing about whether they compile or run.
2. **Legacy architecture:** `android/gradle.properties` has `newArchEnabled=false` while `app.json` and `ios/Podfile.properties.json` say `true`, so Android and iOS differ today. Whether RN 0.88 still allows the legacy architecture is not verified here; a regenerated project follows `app.json`.
3. **Reanimated 4 + `react-native-worklets`** is a new native dependency; the committed `C:/cxx/rn` CMake staging path exists for Windows path-length limits and may need re-evaluating.
4. **Firebase 21 → 27** crosses several majors; the Gradle plugin versions in `android/build.gradle` and the `google-services.json` format may need to follow; `crashlytics/lib/handlers.js` still calls the namespaced API internally (source of the remaining `getApp()` deprecation warning).
5. **`expo-file-system` (2 files)** and other SDK modules changed their APIs across SDK 53-58 in ways not checked here.
6. **Existing-install data:** `async-storage` 2.x and `expo-secure-store` majors on top of a changed architecture could affect reading data written by a SDK 52 build; no migration or on-device check has been defined.
7. **Config plugins:** `withFmtConstevalFix` is written for RN 0.76.x's `fmt`; `withDevelopmentTeam` and `withoutPushEntitlement` have not been read for SDK 58 compatibility.
8. **Jest transform allowlist** (`jest.config.js` `TRANSPILE`) may not cover new package names; the mobile memory records that this once broke every suite.
9. **Play Store:** whether `targetSdk` 34 satisfies the current requirement, and what SDK 58 sets, is not verified (only the repo's own note exists).
10. **Docs and scripts:** the root scripts (`build-android.js` etc.) were not read; they may embed SDK-52-specific flags.
11. **Replacement choice** for the foreground service (own Expo module vs a maintained library vs `expo-task-manager`/notification-based approach) is not researched here; it determines how much new native code the repo owns.

A wrong assumption in 1, 2 or 6 breaks the game connection, the build, or existing players' stored data respectively.

## Out of scope
- Building or verifying iOS (config only; decision).
- Stopping at an intermediate SDK or stepping through SDKs (decision).
- Play Store submission, release signing changes, store listing.
- Any new feature of the app; the plugin-config work already committed.
- Replacing `react-native-render-html` or other libraries beyond the foreground service, unless found broken during planning (would be a new item).
- The web repo (`ShatteredArchive` apps) and the C# server.

## Decisions for the human
Resolved above (SDK 58 one jump; regenerate native projects; Android only; replace the foreground service). Still open:
1. **Replacement for the foreground service** — own Expo native module (owns Kotlin code, full control); a maintained community library if one is found in planning; or a different Android mechanism. Consequence: decides the amount of native code the repo owns and the `allowBuilds` entries.
2. **Android legacy architecture** — if RN 0.88 allows it, keep `newArchEnabled=false` on Android for now, or move Android to the new architecture with this upgrade. Consequence: the second is what iOS and `app.json` already declare, but it changes every native module's runtime at once.
3. **Existing-install data** — require an on-device check that a SDK 52 install upgraded in place keeps its stored data and login, or accept a fresh-install-only check. Consequence: the first needs an old build on a device/emulator to upgrade from.
