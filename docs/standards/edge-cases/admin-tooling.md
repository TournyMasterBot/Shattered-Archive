---
topic: "Admin and operator tooling that issues privileged commands to a server: command catalogs, bulk forms, results"
prefix: ADMIN
applies-when: "admin panel, operator tool, immortal commands, privileged commands, command catalog, command list, destructive actions, confirmation, bulk or wildcard commands, simulacrum"
---

### ADMIN-01 A command catalog copied by hand from the server drifts from it
- Applies when: a tool lists or builds privileged commands (names, levels, arguments) that the server defines in its own command table.
- Edge case: the server gains, loses or re-levels a command and the tool still offers the old list, so it offers commands that do not exist or hides ones that do.
- Required behaviour: the list of names and levels is generated from the server's command table by a script, and a test fails when a generated row has no hand-written argument entry or an argument entry has no generated row.
- Verify: a test that adds a row to a fixture table and asserts the test fails until an argument entry exists; the generator run twice produces identical output.
- Origin: 2026-11-07_simulacrum-admin-panel

### ADMIN-02 The bulk form of a command bypasses the confirmation placed on the single-target form
- Applies when: some commands are marked as needing confirmation, and any of them (or a sibling) accepts `all`, a wildcard or a group target.
- Edge case: the confirmation guards `transfer <name>` but `transfer all`, typed into a free-text argument or chosen from a list, is sent without it.
- Required behaviour: a command is confirmed when its argument list can resolve to more than one target, however the argument was entered; the confirmation names the affected scope.
- Verify: tests send each bulk form through the panel's send path and assert the confirmation step appears and nothing is sent before it is accepted.
- Origin: 2026-11-07_simulacrum-admin-panel

### ADMIN-03 The tool reports success because it sent the command, not because the server accepted it
- Applies when: a tool sends a privileged command and shows an outcome.
- Edge case: the character's trust is too low, the target is absent or the arguments are invalid, the server replies "Huh?" or an error line, and the tool still shows the action as done.
- Required behaviour: the tool shows the server's own reply for that command and marks the action as accepted only from a recognised success reply; an unrecognised or missing reply is shown as unknown, never as done.
- Verify: tests feed a refusal reply, a success reply, no reply within the wait, and an interleaved unrelated line, and assert the state shown for each.
- Origin: 2026-11-07_simulacrum-admin-panel
