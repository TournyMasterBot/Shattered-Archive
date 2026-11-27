---
topic: "Expo / React Native SDK upgrades and committed native projects: regeneration, removed APIs, install quarantine"
prefix: EXPO
applies-when: "Expo SDK upgrade, React Native upgrade, expo prebuild, committed android/ or ios/ folders, config plugins, native modules, AndroidManifest, Gradle, Podfile, package pins, minimumReleaseAge"
---

### EXPO-01 Regenerating committed native projects drops the repo's hand edits
- Applies when: `android/` or `ios/` is committed and is regenerated (`expo prebuild --clean`, an SDK upgrade), or a native module is added or removed.
- Edge case: manifest entries (services, receivers, permissions, intent filters), Gradle plugins, signing config, build flags, ProGuard rules and Podfile hooks added by hand disappear or are replaced by template defaults. The build still succeeds and the feature fails at runtime (for example no foreground service starts). Untracked local files inside the folders (service credentials, signing properties) are deleted by `--clean`.
- Required behaviour: every hand edit is inventoried before regeneration and re-applied by a config plugin (or recorded as dropped, with the reason); untracked local files are backed up and restored; the regenerated tree is diffed against the old one and every difference is accounted for.
- Verify: a plugin unit test on a fixture per edit (second run changes nothing); a scratch `expo prebuild` whose diff against the committed folder shows only accounted differences; the affected feature run on a device.
- Origin: 2026-11-01_mobile-expo-sdk-upgrade

### EXPO-02 A deprecated API still compiles but throws at runtime
- Applies when: a library upgrade moves an API to a new entry point or replaces it (for example a `/legacy` subpath), or a changelog lists removed or async-only methods.
- Edge case: the old import still type-checks (or only warns) and unit tests that mock the module pass, but the call throws on a device, so a user action (an import or an export) fails with no build error.
- Required behaviour: every call site is migrated or pointed at the supported entry point, and the real, unmocked call is exercised.
- Verify: a grep of call sites against the changelog's moved/removed list; a test whose mock throws for the old entry point and works for the new one; a device run of each affected user action with the result checked.
- Origin: 2026-11-01_mobile-expo-sdk-upgrade

### EXPO-03 A version pinned by the SDK is younger than the install quarantine
- Applies when: installing versions that were published recently into a repo with a release-age quarantine setting (`minimumReleaseAge`).
- Edge case: the install refuses, or resolves an older version than the SDK pins, which leaves a mismatched native/JS pair that only fails at build or run time.
- Required behaviour: each pinned version's publish time is checked against the quarantine first; wait, or take the newest allowed matching patch; never lower or remove the setting.
- Verify: `expo install --check` and `expo-doctor` are clean after the install, and `pnpm config get minimumReleaseAge` is unchanged.
- Origin: 2026-11-01_mobile-expo-sdk-upgrade


### EXPO-04 A route reached only by navigation is registered as a hidden tab
- Applies when: an Expo Router `Tabs` layout lists screens that are opened from tiles, links or a menu and that have no tab-bar item.
- Edge case: since Expo Router 56 `href: null` becomes React Navigation's `hidden`, and a hidden tab cannot be focused: navigating to it silently lands on the first visible tab. Type-checks and unit tests pass; on a device the tap does nothing and the log shows no error.
- Required behaviour: such screens are registered without a tab-bar item but still focusable (for example `tabBarItemStyle: { display: 'none' }`), and every destination is opened on a device.
- Verify: a layout test asserting no navigation destination carries `href: null` or `hidden`, and that each tile or menu route maps to a registered screen; a device tap on each tile and menu entry.
- Origin: 2026-11-01_mobile-expo-sdk-upgrade

### EXPO-05 A library keeps its defaults in `defaultProps` and React 19 ignores them
- Applies when: a React 19 upgrade meets a dependency that sets `defaultProps` on function components and the bundler builds it from its `src` entry (`"react-native": "src/"`).
- Edge case: the library renders with none of its defaults (for example inline-CSS processing off, so colours and fonts are dropped). Jest loads the prebuilt `lib` (built with `React.createElement`, which still applies `defaultProps`), so the tests pass while the device shows broken output.
- Required behaviour: the defaults are passed explicitly through one wrapper that every caller uses, the wrapper's props are asserted in a test, and the rendering is checked on a device.
- Verify: `grep defaultProps` in the dependency; compare its `main` and `react-native` entries in `package.json`; a before-and-after device screenshot.
- Origin: 2026-11-01_mobile-expo-sdk-upgrade

### EXPO-06 An in-place update test must prove that the app ran
- Applies when: testing on an emulator or device that an updated build keeps the stored data (install over the old build with no uninstall).
- Edge case: an APK without the device's ABI crashes at start (`libreactnative.so` not found), or the dev server is unreachable and the app stays on the splash screen; the stored data is then unchanged because nothing ran, and a comparison of it "passes".
- Required behaviour: the APK's ABIs are checked against the device before the run, each counted start waits for the app's own "main is running" log line, and a run without that line is discarded.
- Verify: `unzip -l` of the APK, `dumpsys package` `primaryCpuAbi`, and the log line in every counted run.
- Origin: 2026-11-01_mobile-expo-sdk-upgrade
