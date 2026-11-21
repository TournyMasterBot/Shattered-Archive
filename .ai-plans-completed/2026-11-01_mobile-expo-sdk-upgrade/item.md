---
type: proposal
title: Upgrade the mobile app to the latest stable Expo SDK
slug: 2026-11-01_mobile-expo-sdk-upgrade
created: 2026-11-01
state: completed
data-classification: restricted
---

# Upgrade the mobile app to the latest stable Expo SDK

## Problem or opportunity
The mobile app (`shatteredarchive-mobile`, app folder `dsl-client`) is on Expo SDK 52 (`expo` 52.0.49, `react-native` 0.76.9). The npm registry's `latest` tag for `expo` was 58.0.22 on 2026-11-01, so the app is several SDKs behind. Expo pins one React Native version per SDK, so React Native cannot be moved on its own (0.77 exists, but no Expo SDK targets it as far as the owner and the assistant know; not verified).

Known symptoms seen on a cold start of the current tree: two `NativeEventEmitter` warnings printed to Metro, caused by `@supersami/rn-foreground-service` 2.2.5 (its Android module has no `addListener` / `removeListeners`). React Native always prints that warning to the console, so only changing the library silences it. The user chose to leave that as is for now.

## Proposed work
"Let's update to the latest stable" Expo SDK. That means the SDK the registry marks `latest` (SDK 58 at capture time), together with the React Native and React versions it pins.

## Who benefits
- The owner and developers of the mobile app: current tooling, current docs, security and Play Store target-level fixes that older SDKs no longer receive.
- Mobile players: whatever the newer React Native and Android target bring; not yet known.

## Constraints and known unknowns
- Not planned, scoped or sized here.
- Native and JS modules whose support for the target SDK is unknown and must be checked: `@react-native-firebase/*` 21.14 (the code was just moved to the modular API), `@supersami/rn-foreground-service` 2.2.5 (Android foreground keepalive for the game connection), `react-native-tcp-socket`, `react-native-reanimated`, `react-native-render-html` (emits React 18.3 `defaultProps` warnings today), `expo-speech-recognition`, `react-native-webview`, `react-native-gesture-handler`, `skulpt` / `fengari` script runtimes.
- Tooling: `expo-router` 4 and `jest-expo` follow the SDK; the repo's pnpm 12 settings (settings only in `pnpm-workspace.yaml`, `nodeLinker` hoisted for React Native, a pnpm-aware `transformIgnorePatterns`) must keep working; `minimumReleaseAge` is intentional and must not be lowered.
- Newer SDKs may enable the New Architecture by default; the effect on each native module is unknown.
- The Android dev client, the build pipeline (EAS or local Gradle) and the emulator recipe (Pixel8 AVD, dev client against Metro on 8081) all need rebuilding; iOS status of the project is unknown.
- Uncommitted mobile work on branch `optimization/Performance-and-Diagnostics` (plugin-config overrides, the Firebase modular-API migration) should be committed or otherwise settled before a dependency upgrade starts.
- Question for the owner: is jumping straight to the latest SDK acceptable, or should it go one SDK at a time (Expo's usual advice)?

## Related
- `.ai-plans-completed/2026-10-17_plugin-config-save-freezes-defaults` (its mobile half is uncommitted on the branch above).
- `.ai-plans/proposed/2026-09-12_autoleveling-mobile-port` (builds on the mobile app; the SDK it ships on matters).
- Mobile docs: `shatteredarchive-mobile/docs/` (feature docs per area; to be checked when scoped).
