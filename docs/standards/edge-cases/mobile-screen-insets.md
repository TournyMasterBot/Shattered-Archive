---
topic: "React Native screens and modals that draw their own header or footer and meet the system bars"
prefix: INSET
applies-when: "React Native Modal, full-screen page, header action, Save or Done button at a screen edge, status bar, display cutout, navigation bar, edge-to-edge, keyboard, safe area, shatteredarchive-mobile screens"
---

### INSET-01 A header or footer action drawn at a screen edge sits under the system bars and cannot be tapped
- Applies when: a React Native `Modal`, page or panel draws a control (Save, Done, Close, a footer bar) at the top, bottom or side of the screen without using the safe-area insets or a safe-area container.
- Edge case: with edge-to-edge on (Expo SDK 58, React Native 0.88) the app draws under the status bar, the display cutout and the navigation bar. A control placed in the first or last row of such a screen is covered by the system UI on some Android devices, or lies under the keyboard, so it is visible or half visible but cannot be tapped. A `Modal` does not inherit the screen's insets, and `presentationStyle="pageSheet"` only changes iOS.
- Required behaviour: every edge control sits inside the safe area (insets from `react-native-safe-area-context`, read inside the Modal's own tree), is above the keyboard when the keyboard is up, and works in portrait and landscape; a primary action is not placed in a corner the system UI can cover.
- Verify: a component test with the insets mocked to a tall top inset, a cutout and a bottom inset asserts the control's container applies them and the control is not inside the header row; an Android emulator capture with the keyboard open and closed, in both orientations, with the control tapped and its effect seen.
- Origin: 2026-09-12_autoleveling-mobile-port (the Save button of the alias, trigger and timer editor)
