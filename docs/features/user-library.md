- [LibraryModal (Developer Notes)](#librarymodal-developer-notes)
  - [What is LibraryModal?](#what-is-librarymodal)
  - [High-level layout](#high-level-layout)
  - [Tabs and what each one does](#tabs-and-what-each-one-does)
    - [Parchment tab](#parchment-tab)
    - [Notes tab](#notes-tab)
    - [Books tab](#books-tab)
      - [Missing pages](#missing-pages)
      - [Tear Out vs Delete Page](#tear-out-vs-delete-page)
    - [Color Preview tab](#color-preview-tab)
  - [Editing and preview](#editing-and-preview)
    - [Draft state](#draft-state)
    - [Preview](#preview)
  - [Tags and grouping](#tags-and-grouping)
  - [Line and character limit warnings](#line-and-character-limit-warnings)
  - [Saving](#saving)
  - [Deleting (and safety confirmations)](#deleting-and-safety-confirmations)
  - [Unsaved changes guard](#unsaved-changes-guard)
  - [Scribe panel (sending content into the game)](#scribe-panel-sending-content-into-the-game)
    - [Parchment scribe](#parchment-scribe)
    - [Notes scribe](#notes-scribe)
    - [Book scribe](#book-scribe)
  - [Cloud sync (optional)](#cloud-sync-optional)
  - ["Why does it do it this way?"](#why-does-it-do-it-this-way)
  - [Glossary](#glossary)


# LibraryModal (Developer Notes)

This document explains what **`LibraryModal.tsx`** does, how it is organized, and what to watch out for when maintaining it.  
It’s written for someone who may be new to the codebase (or new to React).

---

## What is LibraryModal?

**LibraryModal** is a pop‑up window (a "modal") that lets the user manage in‑game writing content:

- **Parchment** (simple documents)
- **Notes** (messages that can be sent through different "spools" like `note`, `anote`, etc.)
- **Books** (documents with multiple numbered pages)
- **Color Preview** (a safe place to test DSL color codes and see how they render)

It is driven by the `useLibrary(connectionId)` hook, which provides the stored items and save/delete actions.
Items can be tagged for sidebar grouping (see [Tags and grouping](#tags-and-grouping)), and everything
optionally syncs to the user's account (see [Cloud sync](#cloud-sync-optional)) — both purely local by default.

---

## High-level layout

When open, the modal is mostly split into:

1. **Left pane:** a list of items (parchment / notes / books)
2. **Right pane:** an editor for the selected item (title + body + preview)
3. **Top tabs:** switch between Parchment / Notes / Books / Color Preview
4. **Scribe panel:** an inline panel that helps send the current content to the MUD via commands

---

## Tabs and what each one does

### Parchment tab
**Purpose:** create/edit/delete parchment documents.

**User can:**
- Make a new parchment
- Select an existing parchment from the list
- Edit title and body
- Save changes
- Delete the parchment (with confirmation)
- Open the **Scribe** panel to write it into the game

---

### Notes tab
**Purpose:** create/edit/delete notes that belong to a "spool" category.

A "spool" is basically a message channel in the game (examples: `note`, `anote`, `storynote`, etc).

**User can:**
- Choose a spool from a dropdown (affects how notes are grouped)
- Create a new note in the selected spool
- Edit subject and body
- Save changes
- Delete the note (with confirmation)
- Use the **Scribe** panel to send the note in-game (to specific people, with a subject)

Notes are grouped in the left list by spool, so the user sees a simple "tree" like:

- note
- anote
- storynote
- ...

---

### Books tab
**Purpose:** manage books made of numbered pages.

A book has:
- a **title**
- a list of **pages**, where each page is `{ page: number, body: string }`

**User can:**
- Create a new book
- Select a book from the list
- Navigate pages using ◀ / ▶
- Type a page number directly
- Add the next page (creates a new page number after the largest existing page)
- Save changes for the current page
- Delete the entire book (with confirmation)

#### Missing pages
A page number can exist as a "slot" the user navigates to even if there is no saved page entry.

When a page is missing, the UI shows:

- **`(missing)`** next to the page number  
- a **Restore** button (to create the page again)

This is useful if the user "tore out" a page, or navigated to a page number that doesn’t exist.

#### Tear Out vs Delete Page
LibraryModal supports two different "remove page" behaviors:

- **Tear Out**: makes the page **missing** (soft remove)  
  The page number remains usable, and can be restored later.

- **Delete Page**: removes the page entry **permanently** (hard remove)  
  This is useful if someone accidentally created a page.

Both actions are protected by "Are you sure?" confirmations so users don’t lose work by mistake.

---

### Color Preview tab
**Purpose:** let the user test color tokens without changing their saved notes/books.

**User can:**
- Type colored text (like `{Rhello{x`)
- See the rendered output on the right side

This uses the same renderer as the main preview, so it is a good "sandbox" for colors.

---

## Editing and preview

### Draft state
The modal uses **draft state** so the user can type without instantly overwriting stored content.

Common draft fields:
- `draftTitle`
- `draftBody`

When the selection changes (switch item, switch tab, switch page), the modal updates the drafts to match the selected item.

### Preview
The right-side preview uses:

- `renderDslToHtml(draftBody)`

This turns DSL color codes into HTML so users can see what the text will look like in-game.

---

## Tags and grouping

Every item (parchment, note, or book) can carry an optional **tag** — a free-text field the
user types into an `<input>` under the title/page controls. It has no effect on the item
itself; it only changes how the sidebar groups things.

`groupByTag` (ported from the mobile app's `BookEditorScreen.tsx`) buckets items by tag,
with untagged items falling into a shared `UNTAGGED` bucket. Notes are grouped by **spool
first, then tag** — a tag header only appears within a spool if more than one tag (or an
untagged group) exists there. `tag` round-trips through the JSON export/import bundle
(`ParchmentExport`/`NoteExport`/`BookExport`) so it survives being shared as a file, and
through cloud sync (below).

---

## Line and character limit warnings

The editor shows two live indicators, fed by `getLineStats`/`getWarnings` in
`library-types.ts` (a verbatim port of the same functions in the mobile app's
`book-types.ts`, so both editors warn at the same thresholds):

| Indicator | Warn | Over |
|---|---|---|
| Total lines | > 60 | > 70 |
| Current line length | > 80 | > 100 |

These are soft guidance, not a hard stop — the editor never blocks typing or saving past
them. `bodyCursorPos` tracks the textarea's cursor (via `onChange`/`onSelect`) so "current
line" always means the line the cursor is actually on.

---

## Saving

The **Save** button changes behavior depending on the active tab:

- Parchment → saves `title` and `body`
- Notes → saves `spool`, `subject`, and `body`
- Books → saves the book’s `title` and updates/creates the current page body

For books, saving a page updates the `pages[]` list:
- If the page exists → replace it
- If it doesn’t → add it

Pages are then sorted by page number.

---

## Deleting (and safety confirmations)

Delete actions should always ask the user "Are you sure?" and mention exactly what will be deleted.

Expected delete confirmations:

- **Delete parchment**: "Delete parchment ‘X’? This cannot be undone."
- **Delete note**: "Delete note [spool] ‘Subject’? This cannot be undone."
- **Delete book**: "Delete book ‘Title’? This deletes all pages."
- **Delete page**: "Permanently delete page N from ‘Title’?"

This helps prevent accidental loss.

---

## Unsaved changes guard

Every writing surface asks before it would throw away something you typed: parchment, notes, book pages and
organization content. (Colors and Scratch pad hold nothing saved, so they do not ask.)

"Unsaved" means the editor differs from what is saved (`features/library/unsavedChanges.ts`):
- An edit typed back to the saved text is not unsaved.
- A tag is compared without surrounding spaces, and a blank tag is the same as none.
- For an organization item, the title and folder path are compared the way the save cleans them up, and the
  note spool only counts for notes.
- With nothing open there is nothing to lose.

If something is unsaved, the library prompts ("You have unsaved changes to the parchment "Alpha". Discard them?")
before:
- picking another item in the list, or in the Scribe panel's pickers (clicking the item that is already open never asks)
- switching tabs
- creating a new parchment, note, book or organization item
- importing a JSON file (the import reloads the library under the editor)
- changing the organization or its content type
- closing the modal
- changing book page, adding, restoring or tearing out a page, and deleting a book (books, as before)

Closing or reloading the browser tab while something is unsaved shows the browser's own "Leave site?" prompt.

Deleting a parchment, note or organization item asks only its own question; the unsaved changes go with the item. Deleting a book asks about unsaved changes first, as it always did.

Before 2026-10-31 only the books editor was guarded; parchment, notes and organization items were dropped silently.
The mobile app's book editor autosaves parchment and notes, so only a failed save leaves anything unsaved there; its
Organizations screen asks Save / Discard / Cancel like the book editor does.

---

## Scribe panel (sending content into the game)

"Scribing" means sending a sequence of in-game commands to write content.

LibraryModal sends commands through:

- `DispatchEvent('shatteredarchive:send-command', { cmd, connectionId });`

So the UI is not directly writing to a socket; it is raising an event that the game client listens to.

### Parchment scribe
- dips quill into ink
- sets a parchment title
- enters writing mode
- clears existing content
- sends lines
- exits writing mode
- reads the parchment

### Notes scribe
- sets spool + recipients ("to" line)
- sets subject
- enters note writing mode (`++`)
- clears existing content
- sends lines
- exits writing mode
- shows the note

### Book scribe
- dips quill into ink
- sets the book title
- for each page
  - dips quill into ink
  - writes each page by page number
    - clears page content
    - sends page body lines
    - exits writing mode

---

## Cloud sync (optional)

LibraryModal's own storage is 100% local (IndexedDB, via `useLibrary`) — cloud sync is a
separate, opt-in layer on top, wired through the same Account modal (File → Account…) that
already syncs scripts/plugins. For what this looks like to a player, see
[docs/features/library-sync.md](library-sync.md); this section is the implementation view.

- **`features/auth/cloudSync.ts`** — nine thin fetch wrappers (load/upsert/delete ×
  parchment/notes/books) against the C# backend's `library/my-writings/*` endpoints.
- **`features/library/librarySync.ts`** (new) — `saveLibraryToCloud(connectionId)` /
  `loadLibraryFromCloud(connectionId)`. Save upserts every local item, then deletes cloud
  rows **only** if they belong to *this* `connectionId` and no longer exist locally — it
  never touches another connection's rows or connection-less rows created by the mobile app
  or the site's My Writings page. This is deliberately narrower than the pre-existing
  scripts sync, whose whole-blob PUT can silently clobber other connections' scripts.
- **`hooks/useAccountModal.ts`** — wires both functions into the existing Save/Load
  `Promise.all`, and reports back a per-type item count in the status line.
- **Load merges, it does not replace.** Unlike scripts/plugins (which Load fully
  overwrites), library content from the cloud is added/updated into local storage —
  nothing local is ever deleted by a Load. The confirmation dialog text says so explicitly.

---

## "Why does it do it this way?"

A few design choices that are intentional:

- **Draft editing** keeps typing responsive and avoids overwriting storage on every keystroke.
- **Missing pages** allow page navigation even when the page wasn’t created yet (or was removed).
- **Scribing** is separated from saving. Saving stores locally; scribing sends commands to the game.
- **Sync deletes are connection-scoped, and Load never deletes.** A device can't tell "I
  deleted this on purpose" apart from "I've simply never seen this yet" (an item created
  through the My Writings page or another device) — so the safer default is to only ever
  delete what this exact connection is sure it owns, and to let Load only add.

---

## Glossary

- **Modal**: a pop-up window on top of the app.
- **Draft**: the text you are editing right now, before saving.
- **Spool**: a category/channel used by the game for notes.
- **Scribe**: send a sequence of commands to the game to write content.
- **Missing page**: a page number you can navigate to, but there is no saved page content for it.

---
