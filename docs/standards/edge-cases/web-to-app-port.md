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
