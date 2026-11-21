---
type: proposal
title: Chat unread dots, word-boundary output wrapping and BEL cleanup in the web game client
slug: 2026-11-20_chat-unread-dots-word-wrap-and-bell-cleanup
created: 2026-11-20
state: active
data-classification: personal
---

# Chat unread dots, word-boundary output wrapping and BEL cleanup in the web game client

## Problem or opportunity

Three gaps the owner hit while using the web game client (`apps/game-client`):

1. **No sign of new chat on a pane you are not looking at.** The chat panel has a tab per channel (All, Say, Tell, Gossip, Clan, ...). A
   message that lands in a channel tab you are not on gives no indication, so a tell can sit unseen while another tab is open.
2. **Play-area text breaks mid-word.** Long lines in the main output pane are cut at the pane edge in the middle of a word instead of at
   a word boundary. The owner first asked for a custom-CSS override to fix this.
3. **The terminal bell shows as a box.** A tell arrives with a BEL character (`\u0007`) in front of it, which shows in the chat pane as an
   empty box glyph before the speaker's name (for example `<box><Name> tells you 'test'`).

A working prototype of (1) and (3) was built and confirmed working in the owner's client as user-side scripts (a Custom CSS block, a
Globals JavaScript file and a trigger on `shatteredarchive:chat-line`). That proves the behaviour; this item is to make it an official,
supported feature instead of something each player pastes in. The prototype code is not stored in this item.

## Proposed work

As the owner stated it:

- **Unread dot.** When a chat message is received, put a dot on the relevant named chat tab. Never on the "All" tab. The dot is removed
  when the user clicks that tab. It must not create orphan listeners if it needs to add one. There must be a way to disable the dot.
  Which tab a message belongs to must follow the app's own strict chat classification.
- **Word-boundary wrapping.** Break the play-area output on a word rather than mid-letter. Offer an optional split at 120 characters.
- **BEL cleanup.** Make sure tells strip the ANSI beep (BEL) so no box glyph shows in the chat pane.

Scope decisions (2026-11-20, see `scope.md`): built into the client; the dot is gated behind a setting under the chat gear on web and mobile
(on mobile the dot sits on the Chat bottom tab); with strict chat format off there are no dots and the setting says why; **word-boundary
wrapping was split out** into `2026-11-20_play-area-word-boundary-wrapping`, so only the unread dot and the BEL cleanup remain here.

## Who benefits

- Players using the web game client: they see unread channel traffic at a glance and read output that wraps cleanly.
- The owner, who asked for all three.

## Constraints and known unknowns

Facts found while building the prototype (code as of 2026-11-20):

- **The play area is xterm.js, not HTML.** It lays text out on a fixed column grid sized by `FitAddon` (`hooks/useTerminal.ts`), so CSS
  wrap rules (`word-break`, `overflow-wrap`, `white-space`) have no effect on it. Word-boundary wrapping has to happen in code before the
  text is written (single write point: `features/terminal/shatteredArchiveTerminal.ts`, the `shatteredarchive:write-terminal` listener).
  Server-side the MUD already wraps its own lines, usually at 80 columns, which interacts with a narrower pane.
- **Re-wrapping bakes newlines into the terminal buffer**, so scrollback does not reflow on resize.
- **The chat tabs carry no per-channel attribute**, only their label text (`components/ChatPane.tsx`). The prototype reads that text from
  the DOM. A built-in version could use the pane id the component already has.
- **Channel classification** is `classifyStrictChatSubtype` (`features/chat/strict-chat-classifier.ts`). It matches only the part of a line
  before the opening quote, so a keyword inside a message does not count. The chat panes are fed by the `shatteredarchive:chat-line`
  event (`features/userScripts/runtimeSingleton.ts`). When strict chat format is off, lines get no subtype and named tabs stay empty;
  how a dot should behave then is unknown.
- **BEL is deliberate upstream.** The audio "beep on bell" setting (`features/audio/audio-beep.ts`) reads `\u0007` from the raw line, so
  the character must survive for that feature and only the displayed chat text should lose it.
- **Script-call rule learned the hard way:** a JS trigger calls a Globals export by bare name (`chatDot(x)`); `global.javascript.x(...)`
  throws `global is not defined`, and a Globals function that declares two parameters is called as `(api, args)`.

Known unknowns for the owner to decide:

- Built-in feature or shipped script/plugin? Where would the on/off and per-channel mute settings live?
- Should "disable the dot" be one switch, per-channel, or both? (The prototype had both.)
- Should dots clear on the "All" tab, and should your own lines (`You tell ...`) ever raise a dot? (Prototype: no, and no.)
- Wrapping: what is the default, is 120 a preset or a user-entered number, and is it capped at the pane's column count?
- Does wrapping need to leave ANSI colour codes, the line-squelch plugin and the text-to-speech line grouping unaffected?
- Mobile client (`shatteredarchive-mobile`): in or out of scope? (Project rule: finish a web feature before porting it.)

## Related

- `apps/game-client/src/components/ChatPane.tsx`, `features/chat/strict-chat-classifier.ts`, `features/chat/chat-settings-store.ts`
- `apps/game-client/src/hooks/useTerminal.ts`, `features/terminal/shatteredArchiveTerminal.ts`
- `apps/game-client/src/features/audio/audio-beep.ts`
- `apps/game-client/src/components/UserStyleOverrideModal.tsx` (the Custom CSS Overrides tool the first request used)
- No related item in `.ai-plans/proposed` or `.ai-plans/active`.
