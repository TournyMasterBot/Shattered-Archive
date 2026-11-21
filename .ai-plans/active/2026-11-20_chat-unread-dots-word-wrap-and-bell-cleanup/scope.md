# Scope: Chat unread dots, word-boundary output wrapping and BEL cleanup in the web game client

Item: item.md · Type: proposal · Scoped against: performance/Allocation-hunt @ 9191edc · Date: 2026-11-20
Data classification of this work: personal (highest class touched; rules: docs/standards/data-classification.md). The work reads chat lines, which carry speaker names and messages; it stores, sends and logs none of them (see Data touched). This document and the item contain placeholders only.

## Status after the scope decisions (2026-11-20)

The owner's answers (full list under *Decisions for the human*) changed this scope:

- **Word-boundary wrapping moved** to its own item, `2026-11-20_play-area-word-boundary-wrapping`. Rows, risks and counts below that are about the play-area terminal, the write path or the plugins reading it (marked *wrapping item*) belong to that item and are kept here only as the research they share.
- **Mobile is in scope**, with a dot on the Chat bottom tab (mobile has no per-channel tabs).
- **The setting lives under the chat gear** on both platforms, not on a settings page. Web already has a chat gear menu; mobile's chat screen has none.
- **Built into the client**, not shipped as a script. With strict chat format off, no dots, and a hint in the setting says why.

## What the work is

Three changes to the web game client, all requested by the owner: (1) a dot on a named chat-pane tab when a message for that channel arrives, cleared when the tab is clicked, never on the "All" tab, with a way to turn it off; (2) wrapping the main play-area output at word boundaries, with an optional split at 120 characters; (3) removing the BEL character that shows as a box glyph before tells in the chat pane. A user-side prototype of (1) and (3) (custom CSS, a Globals JavaScript file and a trigger on `shatteredarchive:chat-line`) was confirmed working by the owner; this item is to make the behaviour official.

## Affected areas

| Area | Role in the work | Kind | Evidence |
|---|---|---|---|
| `apps/game-client` chat UI | Renders the tab strip (`role="tablist"`, one `role="tab"` button per pane) and the per-pane message lists; any built-in dot, its clearing on click, and the active-pane state live here | change | `components/ChatPane.tsx:81` (`activePane` state), `:285-314` (pill buttons), `:117` (named tabs exist only once the channel has a message, unless `showHiddenChatPanes`) |
| `apps/game-client` chat state | Message store and settings: `appendChatLine` converts the raw line to HTML and keeps `subtype`; settings hold `strictChatFormat`, `enableChatPanes`, `enabledPanes`, `paneOrder` | change (if unread state or new settings are built in) | `features/chat/chat-store.ts:17-30`; `features/chat/chat-settings-store.ts:51-64` (storage key `shatteredArchive.chatSettings.v1`) |
| `apps/game-client` chat classification | Decides which pane a line belongs to (21 subtypes, matched on the text before the opening quote); the prototype re-implements it | none, or reuse | `features/chat/strict-chat-classifier.ts:52-159`; `features/chat/chat-settings-store.ts:3-24` |
| `apps/game-client` chat feed | The only producer of chat-store lines is a listener on `shatteredarchive:chat-line`, applying the classifier when `strictChatFormat` is true and dropping unmatched lines in strict mode | none, or hook point | `features/userScripts/runtimeSingleton.ts:287-317`; dispatch of the event at `features/userScripts/userScriptRuntime.ts:676-682` |
| `apps/game-client` play-area terminal | Wrapping happens here: xterm.js on a fixed column grid sized by `FitAddon`, font 13px, re-fit by a `ResizeObserver`; the single write point for all play-area text is the `shatteredarchive:write-terminal` listener | change | `hooks/useTerminal.ts:66-84, 133`; `features/terminal/shatteredArchiveTerminal.ts:150-182` (`t.write(raw)` at :171) |
| `apps/game-client` raw line pipeline | `processRawEvent` strips ANSI for omit checks and re-emits every non-omitted raw line to `write-terminal` | none, or hook point | `features/userScripts/userScriptRuntime.ts:658-687` |
| `apps/game-client` audio (BEL) | "Beep on bell" reads `\u0007` from the raw line; the BEL must survive upstream for it, so cleanup is display-side only | none (constraint) | `features/audio/audio-beep.ts:5-7, 162`; `features/audio/audio-runtime.ts:35-39` (reads `payload.text`) |
| `utils/utils-client` ANSI to HTML | Builds the chat-bubble HTML; a search of the file for BEL handling found none, so a BEL reaches the bubble as text | change, or handle earlier | `utils/utils-client/src/ansi-to-html.ts` (no `\x07`/`\u0007` match); used at `chat-store.ts:23` |
| Styles | Pill styling is defined in two SCSS modules; only `ChatPane.tsx` renders the tablist | change (dot style) | `styles/ChatPane.module.scss` (11 matches for chatPill/chatPills/chatTopBar), `styles/LayoutShell.module.scss` (8) |
| Custom CSS overrides tool and snippet docs | The existing user-facing way to ship CSS; 8 snippet files already document paste-in overrides (including one for the chat pill bar and one for play-area line height) | possible new snippet | `components/UserStyleOverrideModal.tsx`; `docs/styles/style-snippets/*.md` (8 files) |
| Scripting help and event docs | The in-app help's event table lists raw-data, tick, char/room data, etc.; a search of `ScriptingHelpModal.tsx` found no mention of `shatteredarchive:chat-line`, which the prototype relies on | change if the event is to be a supported trigger source | `components/ScriptingHelpModal.tsx:488-520` |
| Plugins on the play-area text path | Text-to-speech groups consecutive play-area lines (it reasons about the MUD's own word-wrap); the highlighter subscribes to `chat-line`; line squelch uses omit rules | consumers to check | `features/plugins/core-plugins/text-to-speech.plugin.ts:11, 1641`; `highlighter.plugin.ts` (uses `classifyStrictChatSubtype`); `userScriptRuntime.ts:665` (`shouldOmitLine`) |
| Mobile chat screen (`shatteredarchive-mobile`) | One list of messages with a badge per message (`badge(item.subtype)`); no per-channel tabs, no gear or menu (the file reads only the terminal font size from HUD settings). The chat gear that will hold the dot setting does not exist here yet | change (new gear UI) | `dsl-client/app/(tabs)/chat.tsx:62-63, 91, 136-139` |
| Mobile tab bar | The Chat bottom tab is defined with a title and icon only; this is where the dot would sit. A comment notes that every chat line re-reconciling the whole Chat list was a past performance problem | change | `dsl-client/app/(tabs)/_layout.tsx:93, 124-127` |
| Mobile chat state and settings | Own copies of the store, probe, classifier (which already strips BEL when normalising) and settings; settings hold only `strictChatFormat` (pane and order fields were not carried over), stored in AsyncStorage key `chat:settings`; the Settings tab has a Chat section with the Strict Chat Format toggle | change; classifier is a second copy to keep in step | `dsl-client/features/chat/chat-store.ts`, `chat-probe.ts`, `chat-classifier.ts:13`, `chat-settings-storage.ts:11-24`; `dsl-client/app/(tabs)/settings.tsx:459-466` |
| Mobile script engine and TTS plugin (wrapping item) | Mirror the web script engine; five files mention `chat-line` or the classifier | none for this item | `dsl-client/features/scripts/*`, `plugins/text-to-speech.plugin.ts` |

## Stakeholders

- **Players of the web game client**: all three behaviours are visible to them; the dot and the wrapping would be on for everyone unless a setting says otherwise.
- **The owner**: requested all three; decides built-in versus script (see Decisions).
- **Players who use screen readers or custom themes**: a dot drawn only with CSS has no text alternative; the HUD theme engine styles the chat pane, and its completed plan notes chat-pane styling per theme (`.ai-plans-completed/completed/20260920-0005-hud-theme-engine.md:927`).
- **Players who already paste their own scripts or CSS** (the existing Custom CSS and Globals tools): a built-in feature may overlap with what they have.
- **Docs**: developer doc and end-user help for chat panes (see Inputs for sizing).
- **Mobile players and maintainers**: mobile is in scope (dot on the Chat bottom tab, setting under a new chat gear).

## Data touched

| Data | Class | Read/Write/Store/Send/Log | Change in handling |
|---|---|---|---|
| Incoming chat lines (speaker names, message text) | Personal | Read (classify, strip BEL); Written to the DOM already today | No new storage, sending or logging. The prototype's debug `log(...)` lines printed payloads to the browser console; a shipped version must not log line text. |
| Unread state (which pane names have unseen messages) | Internal | Store (memory; optionally persisted) | New; contains pane names only, no line text. |
| Settings: dot on/off, per-channel mute, wrap width / on-off | Internal | Write/Read (browser localStorage, like `shatteredArchive.chatSettings.v1`) | New keys or fields; whether they sync to the account is unknown (no mention of chat settings in `features/auth/cloudSync.ts`; custom CSS is stored in localStorage via `userStyleOverrideStore.ts:8-16`). |
| Play-area text (game output) | Personal | Read, transformed, Written to the terminal | Wrapping would re-write the text before display; no new copies kept. |

## Inputs for sizing

Not sized: that is for a human. Counted facts and the commands that produced them:

- Apps/packages touched: 2 in this repo (`apps/game-client`, `utils/utils-client` if the BEL is removed in the HTML conversion) and 1 sibling repo (`shatteredarchive-mobile`, `dsl-client`).
- Mobile: 4 chat source files (`chat-store.ts`, `chat-probe.ts`, `chat-classifier.ts`, `chat-settings-storage.ts`) plus 1 test file (`__tests__/chat-classifier-test.ts`), the chat screen, the tab layout and the Settings screen; no existing chat gear.
- Chat feature folder: 9 files (`Glob apps/game-client/src/features/chat/*`), plus `ChatPane.tsx`, `useChatPane.ts`, `useChatLog.ts` and 2 SCSS modules with chat-pill rules (19 matches).
- Chat subtypes: 21 (`ChatSubtype` union). Named tabs are created only for a subtype that has messages (or all enabled ones when `showHiddenChatPanes` is on).
- Play-area writers: 11 emit sites for `shatteredarchive:write-terminal` in 7 non-test source files, and 1 listener (`Grep`, non-test). The wrapper would sit at the listener.
- Existing tests in the area, by name: `ChatPane.test.tsx`, `strict-chat-classifier.test.ts`, `chat-probe.test.ts`, `shatteredArchiveTerminal.test.ts`, `UserStyleOverrideModal.test.tsx` (5 files). No test file was found by name for `chat-store`, `chat-settings-store`, `useTerminal`, or `audio-beep`.
- Documentation: `docs/game-client.md` mentions chat 7 times; no feature doc for chat panes or the terminal was found under `docs/game/` (15 files listed there); 8 style-snippet docs exist under `docs/styles/style-snippets/`; no end-user help text about chat panes was found by this search. The end-user audience is players.
- Completion gate (CLAUDE.md): changes under `apps/game-client/src/` need related tests, index updates for the touched folders (the chat folder's `.ai-context` is one generic paragraph), and, for JSX changes, a fresh showcase screenshot.
- New storage keys / events / endpoints: 0 endpoints; storage keys 0 to 2 depending on the decisions; no migration or backfill implied.
- Deploy surface: client bundle only; no Dockerfile, compose, nginx or port change identified.
- Accessibility check exists: `Shattered-AI/tools/browser-test/a11y-audit.mjs` with a baseline file.
- Unknowns: 9 (see Risks and unknowns).

## Dependencies and order

- Wrapping has no dependency on the chat work; the dot and the BEL cleanup both depend on how chat lines reach the pane (`chat-line` listener) and can share one change.
- The BEL cleanup must keep the BEL in the raw line (audio feature) and remove it only from displayed chat text.
- If the dot is built in, the decision on strict chat format (below) comes first, because it decides what a "named tab" means.
- Nothing outside this repo blocks it.

## Risks and unknowns

1. **First message in a channel has no tab to dot.** Named tabs only render once the channel has a message (`ChatPane.tsx:117`), and the prototype found the tab by reading the DOM, so the first message of a new channel cannot be dotted that way. A built-in version that holds unread state beside the store would not have this gap. Not tested in a live client.
2. **Strict chat format is off by default** (`chat-settings-store.ts:67`, and `enableChatPanes: false` at :68). With it off, lines get no subtype and named tabs stay empty. What the dot should do then is not defined.
3. **Wrapping re-writes text before it reaches xterm.** Unknown: effect on ANSI colour sequences split across a wrap, on the text-to-speech line grouping, on highlighter and squelch rules that match on the line, and on lines that arrive in several network chunks. The prototype design was not run.
4. **Scrollback does not reflow** once newlines are inserted, so resizing the pane leaves older output at its old width.
5. **Two payload field names are in use for raw lines**: `processRawEvent` reads `payload.rawText` (`userScriptRuntime.ts:659`) while the beep reads `payload.text` (`audio-runtime.ts:38`). Which of them a given producer sets was not checked across the 11 emit sites.
6. **The `shatteredarchive:chat-line` event is not in the in-app help event list.** A built-in feature avoids it; a script-based one makes it a supported surface.
7. **A pill dot is a pure visual cue**; whether it needs a text alternative for assistive technology is unknown.
8. **Both `ChatPane.module.scss` and `LayoutShell.module.scss` style chat pills**; only `ChatPane.tsx` renders them, so whether the second set is live was not determined.
9. **Mobile has no chat gear and no per-channel tabs** (checked: `chat.tsx` has neither). The gear, its menu and where the dot setting lives in it are new UI; how that menu should look is not defined. Unknown whether mobile strips the BEL from displayed chat text (its classifier does, `chat-classifier.ts:13`, but the screen's rendering was not checked).
10. **Mobile performance**: `_layout.tsx:93` records that a chat line re-reconciling the whole Chat list was a past problem, so how the unread flag reaches the tab bar without re-rendering per line is unknown.
11. **Two classifier copies** (web `strict-chat-classifier.ts`, mobile `chat-classifier.ts`) already exist; a built-in dot uses whichever platform's own copy, and the two must stay in step.
12. **Risks 3 to 5 above belong to the wrapping item** after the split.

A wrong assumption on (2) or (3) would show as dots or wrapped text that disagree with what the panes or terminal actually contain.

## Out of scope

- Any change to chat classification rules or to the MUD's own wrapping.
- Removing the BEL from the raw line or from the audio feature.
- Per-channel tabs or channel chips on mobile (the decision is a dot on the Chat bottom tab only).
- Word-boundary wrapping of the play-area output (moved to `2026-11-20_play-area-word-boundary-wrapping`).
- A shipped script or CSS snippet for the dot (the decision is built into the client).
- Re-flowing existing scrollback on resize.
- Server-side or account-synced chat settings.

## Decisions for the human

Asked on 2026-11-20 and answered by the owner:

| Decision | Options offered | Answer | Consequence |
|---|---|---|---|
| How the dot and BEL cleanup are delivered | built into the client; documented script + CSS; both | **Built into the client** | Changes `ChatPane.tsx` and the chat store; needs tests, index updates and a showcase screenshot under the completion gate; no first-message gap; the prototype is reference only. |
| Is wrapping part of this item | split it out; keep together; drop for now | **Split into its own item** | Created `2026-11-20_play-area-word-boundary-wrapping`; this item keeps the dot and BEL cleanup. |
| Dot when strict chat format is off | no dots plus a hint; turn strict on with the dot setting; classify for dots only | **No dots, with a hint in the setting** | The dot setting shows a note that it needs strict chat format (and chat panes on web); no classification outside the strict path. |
| Is mobile in scope | no, web first; yes | **Yes**, with the feature gated behind a setting on both platforms | Mobile work is in this item. (The first answer said "the appropriate settings page"; the later answer below puts it under the chat gear.) |
| Where the dot goes on mobile | Chat bottom tab; channel chips with dots; both | **On the Chat bottom tab** | One dot on the tab-bar icon, cleared when Chat is opened. No new per-channel UI. |
| Where the setting lives | (owner's wording) | **Under the chat gear, not the Settings page** | Web: the existing gear menu in `ChatPane.tsx` (`:358-392`). Mobile: a chat gear that does not exist yet, so new UI on the Chat screen. |

No open scope decisions remain. Open unknowns are listed under *Risks and unknowns*.
