---
topic: "Porting a web-client feature to the mobile app: inputs and events the web produces elsewhere"
prefix: PORT
applies-when: "port to mobile, port from the web client, dsl-client, shatteredarchive-mobile, ported engine, event:* events, shatteredarchive: events, UserScriptRuntime special lines, movement tracker, plugins that emit events"
---

### PORT-01 A port that swaps the event bus and the send call still misses the events the web produces in other modules
- Applies when: code is ported from the web client to the app and listens to events (`event:*`, `shatteredarchive:*`, `game:*`) or reads helper modules (a tracker, a pattern constant) whose producer or definition lives in a web plugin, the script runtime or another feature folder.
- Edge case: the port compiles and its tests pass against mocks, because the subscription and the handler are ported but nothing on the app ever emits the event. The ported feature then never sees a death, a flee or a completed move and stalls or times out on a real connection.
- Required behaviour: before the port is called complete, list every event the ported code listens to and every module it imports from outside its own folder; name the producer or owner of each on both platforms; build or deliberately stub each one the app lacks, in a phase of its own, with a test that the app emits it from a real sample line.
- Verify: a table in the plan or the developer doc with one row per event and import (web producer, app producer); a test per app-side producer that feeds a sample line and asserts the event and its payload shape; the device run shows a real event reaching the ported code.
- Origin: 2026-09-12_autoleveling-mobile-port (creature death, flee, movement and raw-line events of the autopilot engine)

### PORT-02 A port from synchronous browser storage to asynchronous app storage lets an action overwrite data that has not loaded yet
- Applies when: web code that reads `localStorage` is ported to the app, or any store is read asynchronously and then written back.
- Edge case: a command or tap arrives before the load finishes. The store looks empty, the action adds to the empty store and writes it, and everything saved before is gone. A failed load that is treated as "nothing saved" does the same.
- Required behaviour: writes are refused, with a visible notice, until the load has succeeded; a failed load is not an empty store and is retried; writes to one key are applied in the order they were made.
- Verify: a test with a delayed load that acts first and asserts the refusal and the unchanged stored value; one with a failing read that asserts nothing is written; one with two quick writes and a slow first write that asserts the second value is the stored one.
- Origin: 2026-11-26_mobile-crafting-helper-port-and-hud-docks

### PORT-03 A character identity remembered from a one-time login event survives the session it belongs to
- Applies when: data or commands are keyed on a character name, level or other identity cached from an event that arrives once per login.
- Edge case: the cache is not cleared on disconnect, so the next session (another character, or no login data because it was switched off or not re-sent) reads the previous name and files data under it.
- Required behaviour: the cached identity is cleared at every session end (server close, user disconnect, replaced connection), and an action that needs it refuses, visibly, while it is unknown.
- Verify: a test that logs in, ends the session each of the three ways, connects again without login data and asserts the action is refused and nothing is written.
- Origin: 2026-11-26_mobile-crafting-helper-port-and-hud-docks
