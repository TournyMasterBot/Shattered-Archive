---
topic: "ANSI escape sequences and DSL {X colour codes: parsing, storing, converting"
prefix: ANSI
applies-when: "ANSI, SGR, escape sequence, OSC, BEL, bell character, colour codes, DSL {R codes, dslToAnsi, whoisic description, log viewer, colour conversion"
---

### ANSI-01 Colour conversion garbles wrapped or non-normalised sequences, or loses the original
- Applies when: converting between ANSI and DSL colour codes, or storing coloured game text.
- Edge case: logs wrap mid-escape (`ESC[1;31<CRLF>m`); the game sends `1;30` (bold black) and `0;37` while the DSL table uses `90`-`97`; only the converted text is kept, so a wrong mapping is permanent.
- Required behaviour: sequences are rejoined before parsing; both SGR styles are normalised; the raw ANSI is always stored beside the converted text; an unmapped colour passes through as plain text with a flag instead of being dropped.
- Verify: round-trip tests against `DSL_ANSI_COLORS` for every code in both SGR styles, a wrapped-escape fixture, and an unmapped 256-colour code.
- Origin: 2026-11-05_copilot-ai-training-sibling-to-autopilot

### ANSI-02 Stripping the BEL character as noise breaks sequences that end with it
- Applies when: code removes `\x07` (BEL) from game text to hide a stray beep glyph, or converts text that may hold OSC sequences (`ESC ] ... BEL`).
- Edge case: BEL also terminates OSC sequences such as a window-title change (`ESC ]0;Title BEL`). Removing every BEL first leaves an unterminated sequence that a converter prints as garbage or uses to swallow the text after it.
- Required behaviour: remove complete OSC sequences first, then the remaining BEL; the raw text stays stored untouched, because the audio "beep on bell" setting and the classifiers read it.
- Verify: a test that `ESC]0;Title BEL Hello` becomes `Hello`, that a BEL before a speaker name is removed, and that the stored raw line still contains the BEL.
- Origin: 2026-11-20_chat-unread-dots-word-wrap-and-bell-cleanup
