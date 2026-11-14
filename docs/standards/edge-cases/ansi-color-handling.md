---
topic: "ANSI escape sequences and DSL {X colour codes: parsing, storing, converting"
prefix: ANSI
applies-when: "ANSI, SGR, escape sequence, colour codes, DSL {R codes, dslToAnsi, whoisic description, log viewer, colour conversion"
---

### ANSI-01 Colour conversion garbles wrapped or non-normalised sequences, or loses the original
- Applies when: converting between ANSI and DSL colour codes, or storing coloured game text.
- Edge case: logs wrap mid-escape (`ESC[1;31<CRLF>m`); the game sends `1;30` (bold black) and `0;37` while the DSL table uses `90`-`97`; only the converted text is kept, so a wrong mapping is permanent.
- Required behaviour: sequences are rejoined before parsing; both SGR styles are normalised; the raw ANSI is always stored beside the converted text; an unmapped colour passes through as plain text with a flag instead of being dropped.
- Verify: round-trip tests against `DSL_ANSI_COLORS` for every code in both SGR styles, a wrapped-escape fixture, and an unmapped 256-colour code.
- Origin: 2026-11-05_copilot-ai-training-sibling-to-autopilot
