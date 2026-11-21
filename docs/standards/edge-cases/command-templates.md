---
topic: "Stored command templates with placeholders that are filled in when the command is sent to the game"
prefix: CMDTPL
applies-when: "command template, placeholder, {name}, <potion>, kill {name}, cast '<spell>' {name}, autopilot buff or fight command, alias or macro text sent to the game, send-command, initiation command"
---

### CMDTPL-01 A stored command template is expanded on one send path only
- Applies when: a command string holds a placeholder (`{name}`, `<potion>`, a seeded example) that is filled in when the command is sent, or a new place stores such a command.
- Edge case: the initiation command was expanded (`applyInitiationTemplate`) while fight, buff and in-combat commands went out untouched, so the game received `cast 'fog' {name}` and `quaff <potion>` literally; `{n` is a colour code, so the echo showed an orange `ame}`.
- Required behaviour: every send path goes through one expander. A placeholder with no value is dropped (with its separating space) or the command is refused with one visible notice; an unresolved `{...}` or `<...>` is never sent. A seed that needs the player's input is stored empty with a hint, not as a fake command.
- Verify: for every path that produces a command (initiation, fight, buff, in-combat, rest, weight, cloud-loaded and older saved rows), a test with a placeholder asserts the text handed to the send event contains no `{`...`}` or `<`...`>` and, with no value, that the command is dropped or refused.
- Origin: 2026-11-18_autopilot-live-test-findings
