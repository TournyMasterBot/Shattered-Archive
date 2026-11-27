---
topic: "Subscribing to events on a shared dispatcher that keeps one listener per key"
prefix: EVENTBUS
applies-when: "ListenEvent, DispatchEvent, event-dispatcher, window events, game:remote-server events, shatteredarchive: events, a feature that listens to an event the app already listens to, HMR-safe listener registry"
---

### EVENTBUS-01 A listener added to a shared event name silently replaces the app's own listener
- Applies when: code subscribes to an event name that other code already listens to, through a dispatcher that keeps one listener per key (`features/event-emitter/event-dispatcher.ts`).
- Edge case: the dispatcher's default key is derived from the event name (`<name>::event`), and registering an existing key removes the earlier listener. The new subscription replaces the app's, so the app loses its own handling while the feature appears to work, or the reverse after a hot reload.
- Required behaviour: every subscription passes a key unique to its owner (`<feature>::<purpose>`); the feature's tests register an app listener with the default key and prove both receive each event, and that disposing the feature leaves the app listener working.
- Verify: a test per subscribed event name that registers a default-key listener before and after the feature's, dispatches the event and asserts both were called; removing the key from the production code makes that test fail.
- Origin: 2026-11-07_simulacrum-admin-panel
