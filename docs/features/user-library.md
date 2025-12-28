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
  - [Saving](#saving)
  - [Deleting (and safety confirmations)](#deleting-and-safety-confirmations)
  - [Unsaved changes guard (Books)](#unsaved-changes-guard-books)
  - [Scribe panel (sending content into the game)](#scribe-panel-sending-content-into-the-game)
    - [Parchment scribe](#parchment-scribe)
    - [Notes scribe](#notes-scribe)
    - [Book scribe](#book-scribe)
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

## Unsaved changes guard (Books)

Books can have multiple pages, and it’s easy to lose edits when switching pages or switching books.

To protect the user:
- The modal checks if the current book page is "dirty" (draft differs from saved version)
- If dirty, it prompts before:
  - changing page
  - switching tabs away from books
  - closing the modal
  - deleting the book

This guard applies only to the books editor, because page navigation is the most common place for accidental loss.

---

## Scribe panel (sending content into the game)

"Scribing" means sending a sequence of in-game commands to write content.

LibraryModal sends commands through:

- `window.dispatchEvent(new CustomEvent('game:send-command', { detail: { cmd } }))`

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

## "Why does it do it this way?"

A few design choices that are intentional:

- **Draft editing** keeps typing responsive and avoids overwriting storage on every keystroke.
- **Missing pages** allow page navigation even when the page wasn’t created yet (or was removed).
- **Scribing** is separated from saving. Saving stores locally; scribing sends commands to the game.

---

## Glossary

- **Modal**: a pop-up window on top of the app.
- **Draft**: the text you are editing right now, before saving.
- **Spool**: a category/channel used by the game for notes.
- **Scribe**: send a sequence of commands to the game to write content.
- **Missing page**: a page number you can navigate to, but there is no saved page content for it.

---
