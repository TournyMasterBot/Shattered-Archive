---
topic: "Character names and other personal data inside game text that is exported, summarised or committed"
prefix: PRIVNAME
applies-when: "game logs, chat lines, tells, room text, whoisic, character names, codenames, scrubbing, export to Claude, fixtures, committed docs, copilot"
---

### PRIVNAME-01 Character names inside free text slip past field-level scrubbing
- Applies when: game text leaves its private store (to Claude, a committed document, a fixture, a log).
- Edge case: names appear in tells, room lines ("X is here"), `whoisic` headers and quoted speech; replacing only a `name` field leaves them in the text.
- Required behaviour: the scrubber replaces every registered name, case-insensitively and inside longer words, and every name-shaped token it cannot classify; the output carries codenames only.
- Verify: tests with names in each of those positions, plus a scan of every export folder and committed fixture for any registered name.
- Origin: 2026-11-05_copilot-ai-training-sibling-to-autopilot
