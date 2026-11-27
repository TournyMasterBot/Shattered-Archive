---
type: proposal
title: Word-boundary wrapping of the play-area output in the web game client
slug: 2026-11-20_play-area-word-boundary-wrapping
created: 2026-11-20
state: proposed
data-classification: personal
---

# Word-boundary wrapping of the play-area output in the web game client

## Problem or opportunity

Long lines in the main output pane (the play area) are cut at the pane edge in the middle of a word instead of at a word boundary. The
owner first asked for a custom-CSS override to fix this. Split out of `2026-11-20_chat-unread-dots-word-wrap-and-bell-cleanup` at scope
time because it changes the terminal write path, not the chat UI.

## Proposed work

As the owner stated it: break the play-area output on a word rather than mid-letter, and offer an optional split at 120 characters.
Which settings page controls it, and whether the web and mobile clients both get it, follows the parent item's decision that new
behaviour of this kind is gated behind the appropriate settings page.

## Who benefits

Players using the web game client (and mobile if included): they read output that wraps at word boundaries.

## Constraints and known unknowns

Facts found while scoping the parent item (code as of 2026-11-20, branch `performance/Allocation-hunt`, commit `9191edc`):

- **The play area is xterm.js, not HTML.** Text is laid out on a fixed column grid sized by `FitAddon` (`apps/game-client/src/hooks/useTerminal.ts`),
  so CSS wrap rules have no effect. Wrapping has to happen in code before the text is written; the single write point is the
  `shatteredarchive:write-terminal` listener (`features/terminal/shatteredArchiveTerminal.ts:150-182`, `t.write(raw)` at :171). 11 emit sites
  in 7 non-test source files feed that event.
- The MUD already wraps its own lines (usually at 80 columns), which interacts with a narrower pane.
- Re-wrapping bakes newlines into the terminal buffer, so scrollback does not reflow when the pane is resized.
- Consumers of the play-area text to check: the text-to-speech plugin (groups consecutive lines and reasons about the MUD's own wrap),
  the highlighter, and line squelch / omit rules (`features/userScripts/userScriptRuntime.ts:665`).
- Two payload field names are in use for raw lines (`rawText` in `userScriptRuntime.ts:659`, `text` in `features/audio/audio-runtime.ts:38`).
- The mobile client re-wraps terminal lines to a column count already (`shatteredarchive-mobile/dsl-client/app/(tabs)/chat.tsx` mentions
  `wrapSegments`; the Settings screen describes "Terminal lines re-wrap to fit"); how that compares was not examined.

Known unknowns: the default, whether 120 is a preset or a user-entered number, whether it is capped at the pane's column count, and how
ANSI colour sequences, multi-chunk lines and the plugins above behave when the text is re-wrapped first.

## Related

- Parent item: `.ai-plans/proposed/2026-11-20_chat-unread-dots-word-wrap-and-bell-cleanup/` (its `scope.md` has the full research).
- `apps/game-client/src/hooks/useTerminal.ts`, `features/terminal/shatteredArchiveTerminal.ts`
- `docs/styles/style-snippets/play-area-line-height.md` (an existing play-area style snippet)
