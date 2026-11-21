---
topic: "Unread indicators (dots, counts, badges) derived from a live message list"
prefix: UNREAD
applies-when: "unread dot, unread count, new-message badge, tab badge, tabBarBadge, last seen marker, chat panes, notification indicator, freezeOnBlur, frozen or hidden view"
---

### UNREAD-01 An unread indicator derived from "newer than last seen" shows old history as unread
- Applies when: code derives a dot, count or badge from a message list and a per-view "last seen" marker.
- Edge case: with no marker yet (first mount, a remount after the view was hidden, the setting being switched on), every existing message is newer than the marker, so the dot lights for history the user already had.
- Required behaviour: a baseline (the latest message id when the feature is armed) is held outside the view; unread means newer than the larger of the seen marker and the baseline; switching the feature on re-arms it, and a remount keeps the state.
- Verify: tests: history present and the feature turned on gives no dot; a message after arming gives a dot; unmount and remount with nothing new gives no dot; off then on resets the baseline.
- Origin: 2026-11-20_chat-unread-dots-word-wrap-and-bell-cleanup

### UNREAD-02 The unread flag is computed in a view that is frozen, hidden or unmounted while messages arrive
- Applies when: the indicator is shown somewhere other than the message list (a tab-bar badge, a header dot) and the list's view can be frozen (`freezeOnBlur`), blurred or unmounted.
- Edge case: the flag is derived inside the message view, which stops updating while the user is elsewhere, so the dot never lights when it is needed; the opposite failure is a per-message store update that re-renders the whole tab layout.
- Required behaviour: the flag lives in a small store updated where the message enters the app; the indicator subscribes to the boolean only, so it re-renders on a flip and not per message; the navigator reports focus and blur to the store.
- Verify: a test that a message arriving while the view is blurred sets the flag, focus clears it, and 50 messages notify a subscriber once; a render-count assertion on the layout.
- Origin: 2026-11-20_chat-unread-dots-word-wrap-and-bell-cleanup
