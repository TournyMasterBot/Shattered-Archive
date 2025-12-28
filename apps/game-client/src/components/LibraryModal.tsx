import React from 'react';
import styles from '../styles/LibraryModal.module.scss';
import useLibrary from '../hooks/useLibrary';
import { renderDslToHtml } from '../features/library/renderDslColorPreviewHtml';
import type { LibraryBook, LibraryBookPage, LibraryNote, UserNote, NoteSpool } from '../features/library/library-types';

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
}

type TabId = 'parchment' | 'notes' | 'books' | 'colors';

const NOTE_SPOOLS: Array<{ id: NoteSpool; label: string }> = [
  { id: 'note', label: 'note (normal)' },
  { id: 'anote', label: 'anote (auctions)' },
  { id: 'storynote', label: 'storynote (story)' },
  { id: 'oocn', label: 'oocn (OOC)' },
  { id: 'qnote', label: 'qnote (quests)' },
  { id: 'history', label: 'history (world)' },
  { id: 'news', label: 'news (game news)' },
  { id: 'changes', label: 'changes (game changes)' },
];

function normalizeParensSpacing(s: string): string {
  const raw = s ?? '';
  const spaced = raw.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ');
  return spaced.replace(/\s+/g, ' ').trim();
}

function pagesToSet(pages: LibraryBookPage[] | undefined): Set<number> {
  return new Set((pages ?? []).map((p) => p.page));
}

function getMaxPage(pages: LibraryBookPage[] | undefined): number {
  const ps = pages ?? [];
  let max = 1;
  for (const p of ps) max = Math.max(max, p.page);
  return max;
}

function getPageBody(book: LibraryBook | null, page: number): string {
  if (!book) return '';
  const hit = (book.pages ?? []).find((p) => p.page === page);
  return hit?.body ?? '';
}

function hasPage(book: LibraryBook | null, page: number): boolean {
  if (!book) return false;
  return (book.pages ?? []).some((p) => p.page === page);
}

function splitLinesPreserveBlanks(text: string): string[] {
  const normalized = (text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized.split('\n');
}

function sendGameCommand(cmd: string): void {
  window.dispatchEvent(
    new CustomEvent('game:send-command', {
      detail: { cmd },
    }),
  );
}

function sortedDefinedPages(book: LibraryBook): LibraryBookPage[] {
  const pages = (book.pages ?? [])
    .filter((p) => p && Number.isFinite(p.page))
    .map((p) => ({ page: Math.max(1, Math.floor(p.page)), body: p.body ?? '' }))
    .sort((a, b) => a.page - b.page);

  return pages;
}

export const LibraryModal: React.FC<LibraryModalProps> = ({ isOpen, onClose, connectionId }) => {
  const lib = useLibrary(connectionId);

  const [tab, setTab] = React.useState<TabId>('parchment');

  // parchment selection (existing LibraryNote store)
  const [activeParchmentId, setActiveParchmentId] = React.useState<string | null>(null);
  const activeParchment: LibraryNote | null = activeParchmentId ? (lib.notesById.get(activeParchmentId) ?? null) : null;

  // notes selection (new UserNote store)
  const [activeUserNoteId, setActiveUserNoteId] = React.useState<string | null>(null);
  const activeUserNote: UserNote | null = activeUserNoteId ? (lib.userNotesById.get(activeUserNoteId) ?? null) : null;

  // books selection
  const [activeBookId, setActiveBookId] = React.useState<string | null>(null);
  const activeBook: LibraryBook | null = activeBookId ? (lib.booksById.get(activeBookId) ?? null) : null;

  // Books: current page selection
  const [activeBookPage, setActiveBookPage] = React.useState<number>(1);

  // Draft fields (shared editor UI)
  const [draftTitle, setDraftTitle] = React.useState('');
  const [draftBody, setDraftBody] = React.useState('');

  // Notes: editable metadata (NOT scribing-only — this drives hierarchy + saved note data)
  const [noteSpool, setNoteSpool] = React.useState<NoteSpool>('note');

  // Notes-specific (scribing)
  const [noteToLine, setNoteToLine] = React.useState('');
  const [noteSubject, setNoteSubject] = React.useState('');

  // --- Unsaved changes guard (books only) -----------------------------

  const savedBookTitle = activeBook?.title ?? '';
  const savedBookPageBody = getPageBody(activeBook, activeBookPage);

  const isBookContext = tab === 'books' && !!activeBook;
  const isBookDirty = isBookContext && (draftTitle !== savedBookTitle || draftBody !== (savedBookPageBody ?? ''));

  const confirmLoseBookChanges = React.useCallback((): boolean => {
    if (!isBookDirty) return true;
    return window.confirm('You have unsaved changes on this book page. Discard changes?');
  }, [isBookDirty]);

  const handleRequestClose = React.useCallback(() => {
    if (!confirmLoseBookChanges()) return;
    onClose();
  }, [confirmLoseBookChanges, onClose]);

  // -------------------------------------------------------------------
  // Keep draft in sync with active selection
  // -------------------------------------------------------------------

  React.useEffect(() => {
    if (tab === 'parchment') {
      const n = activeParchment;
      setDraftTitle(n?.title ?? '');
      setDraftBody(n?.body ?? '');
      return;
    }

    if (tab === 'notes') {
      const n = activeUserNote;
      setDraftTitle(n?.subject ?? '');
      setDraftBody(n?.body ?? '');

      // only hydrate spool when the selected note changes
      if (n?.spool) setNoteSpool(n.spool);

      // keep scribe subject defaulted when switching notes
      setNoteSubject(n?.subject ?? '');
      return;
    }

    if (tab === 'books') {
      const b = activeBook;

      // ✅ CHANGE: do NOT auto-jump to another page when current page is missing.
      // Keep the selected page and show empty body (and "(missing)" UI).
      const page = Math.max(1, Math.floor(activeBookPage || 1));
      if (page !== activeBookPage) setActiveBookPage(page);

      setDraftTitle(b?.title ?? '');
      setDraftBody(b && hasPage(b, page) ? getPageBody(b, page) : '');
      return;
    }

    // colors tab
    setDraftTitle('');
    setDraftBody('gos {Rhello{B!{x');
  }, [tab, activeParchment, activeUserNote, activeBook, activeBookPage]);

  // When switching books, reset page to first existing (or 1 if none exist)
  React.useEffect(() => {
    if (tab !== 'books') return;
    const b = activeBook;
    if (!b) {
      setActiveBookPage(1);
      return;
    }
    const set = pagesToSet(b.pages);
    const sorted = Array.from(set).sort((x, y) => x - y);

    // ✅ If a book has no pages, keep on page 1 (missing)
    setActiveBookPage(sorted[0] ?? 1);
  }, [tab, activeBookId]); // intentionally by id

  const previewHtml = React.useMemo(() => renderDslToHtml(draftBody), [draftBody]);

  // -------------------------------------------------------------------
  // Create actions
  // -------------------------------------------------------------------

  const handleNewParchment = React.useCallback(async () => {
    const created = await lib.createNote('New Parchment');
    setTab('parchment');
    setActiveParchmentId(created.id);
  }, [lib]);

  const handleNewUserNote = React.useCallback(async () => {
    const created = await lib.createUserNote(noteSpool, 'New Note');
    setTab('notes');
    setActiveUserNoteId(created.id);

    setDraftTitle(created.subject ?? '');
    setDraftBody(created.body ?? '');
    setNoteSpool(created.spool);
    setNoteSubject(created.subject ?? '');
  }, [lib, noteSpool]);

  const handleNewBook = React.useCallback(async () => {
    const created = await lib.createBook('New Book');
    setTab('books');
    setActiveBookId(created.id);
    setActiveBookPage(1);
  }, [lib]);

  // -------------------------------------------------------------------
  // Save/Delete
  // -------------------------------------------------------------------

  const handleSave = React.useCallback(async () => {
    if (tab === 'parchment' && activeParchment) {
      await lib.saveNote({ ...activeParchment, title: draftTitle, body: draftBody, updatedAt: Date.now() });
      return;
    }

    if (tab === 'notes' && activeUserNote) {
      await lib.saveUserNote({
        ...activeUserNote,
        spool: noteSpool,
        subject: draftTitle,
        body: draftBody,
        updatedAt: Date.now(),
      });

      setNoteSubject(draftTitle);
      return;
    }

    if (tab === 'books' && activeBook) {
      const now = Date.now();

      const pages = (activeBook.pages ?? []).slice();
      const idx = pages.findIndex((p) => p.page === activeBookPage);

      if (idx >= 0) pages[idx] = { page: activeBookPage, body: draftBody };
      else pages.push({ page: activeBookPage, body: draftBody });

      pages.sort((a, b) => a.page - b.page);

      await lib.saveBook({
        ...activeBook,
        title: draftTitle,
        pages,
        updatedAt: now,
      });

      return;
    }
  }, [tab, activeParchment, activeUserNote, activeBook, activeBookPage, draftTitle, draftBody, lib, noteSpool]);

  const handleDelete = React.useCallback(async () => {
    if (tab === 'parchment' && activeParchment) {
      await lib.deleteNote(activeParchment.id);
      setActiveParchmentId(null);
      return;
    }

    if (tab === 'notes' && activeUserNote) {
      await lib.deleteUserNote(activeUserNote.id);
      setActiveUserNoteId(null);
      return;
    }

    if (tab === 'books' && activeBook) {
      if (!confirmLoseBookChanges()) return;
      await lib.deleteBook(activeBook.id);
      setActiveBookId(null);
      setActiveBookPage(1);
    }
  }, [tab, activeParchment, activeUserNote, activeBook, lib, confirmLoseBookChanges]);

  // ----- guarded book navigation helpers -----------------------------

  const trySetBookPage = React.useCallback(
    (next: number) => {
      if (tab !== 'books') return;
      if (!confirmLoseBookChanges()) return;
      setActiveBookPage(Math.max(1, Math.floor(next)));
    },
    [tab, confirmLoseBookChanges],
  );

  const handlePrevPage = React.useCallback(() => trySetBookPage(activeBookPage - 1), [trySetBookPage, activeBookPage]);
  const handleNextPage = React.useCallback(() => trySetBookPage(activeBookPage + 1), [trySetBookPage, activeBookPage]);

  const handleAddNextPage = React.useCallback(async () => {
    if (!activeBook) return;
    if (!confirmLoseBookChanges()) return;
    const next = getMaxPage(activeBook.pages) + 1;
    await lib.addBookPage(activeBook, next);
    setActiveBookPage(next);
  }, [activeBook, lib, confirmLoseBookChanges]);

  const handleTearOutPage = React.useCallback(async () => {
    if (!activeBook) return;
    if (!confirmLoseBookChanges()) return;

    // ✅ CHANGE: stay on the same page; the page becomes "(missing)".
    await lib.tearOutBookPage(activeBook, activeBookPage);

    // Immediately reflect missing state in the editor (refresh may be async)
    setDraftBody('');
    // keep activeBookPage unchanged
  }, [activeBook, activeBookPage, lib, confirmLoseBookChanges]);

  const handleRestorePage = React.useCallback(async () => {
    if (!activeBook) return;
    if (!confirmLoseBookChanges()) return;
    await lib.addBookPage(activeBook, activeBookPage);
    setDraftBody('');
  }, [activeBook, activeBookPage, lib, confirmLoseBookChanges]);

  // ----- guarded tab switching --------------------------------------

  const handleSetTab = React.useCallback(
    (next: TabId) => {
      if (tab === next) return;

      // leaving books? prompt if dirty
      if (tab === 'books' && next !== 'books') {
        if (!confirmLoseBookChanges()) return;
      }

      setTab(next);
    },
    [tab, confirmLoseBookChanges],
  );

  // ----- guarded book selection -------------------------------------

  const handleSelectBook = React.useCallback(
    (id: string) => {
      if (tab !== 'books') {
        setActiveBookId(id);
        return;
      }
      if (!confirmLoseBookChanges()) return;
      setActiveBookId(id);
    },
    [tab, confirmLoseBookChanges],
  );

  // ------------------------------------------------------------------
  // Scribe panel
  // ------------------------------------------------------------------

  const [isScribeOpen, setIsScribeOpen] = React.useState(false);

  // parchment scribe inputs (existing)
  const [scribeParchment, setScribeParchment] = React.useState('');
  const [scribeInk, setScribeInk] = React.useState('');
  const [scribeQuill, setScribeQuill] = React.useState('');
  const [scribeTitle, setScribeTitle] = React.useState('');

  // book scribe inputs (new)
  const [scribeBookInk, setScribeBookInk] = React.useState('');
  const [scribeBookQuill, setScribeBookQuill] = React.useState('');
  const [scribeBookTitle, setScribeBookTitle] = React.useState('');
  const [scribeBookKeyword, setScribeBookKeyword] = React.useState(''); // keyword before title (base book name)
  const [scribeBookKeywordAfterTitle, setScribeBookKeywordAfterTitle] = React.useState(''); // user-editable

  const openScribe = React.useCallback(() => {
    if (tab === 'parchment') {
      const fallbackId = lib.notes[0]?.id ?? null;
      const nextId = activeParchmentId ?? fallbackId;
      if (!nextId) {
        window.alert('You have no parchment to scribe yet.');
        return;
      }
      setActiveParchmentId(nextId);

      const n = lib.notesById.get(nextId);
      if (n && !scribeTitle) setScribeTitle(n.title ?? '');

      setIsScribeOpen(true);
      return;
    }

    if (tab === 'notes') {
      const fallbackId = lib.userNotes[0]?.id ?? null;
      const nextId = activeUserNoteId ?? fallbackId;
      if (!nextId) {
        window.alert('You have no notes to scribe yet.');
        return;
      }
      setActiveUserNoteId(nextId);

      const n = lib.userNotesById.get(nextId);
      if (n && !noteSubject) setNoteSubject(n.subject ?? '');

      setIsScribeOpen(true);
      return;
    }

    if (tab === 'books') {
      const fallbackId = lib.books[0]?.id ?? null;
      const nextId = activeBookId ?? fallbackId;
      if (!nextId) {
        window.alert('You have no books to scribe yet.');
        return;
      }
      setActiveBookId(nextId);

      const b = lib.booksById.get(nextId) ?? null;
      if (b) {
        // Defaults
        if (!scribeBookTitle) setScribeBookTitle(b.title ?? '');
        const baseKeyword = (b as any).keyword ?? b.title ?? '';
        const afterKeyword = (b as any).keywordAfterTitle ?? baseKeyword;

        if (!scribeBookKeyword) setScribeBookKeyword(baseKeyword);
        if (!scribeBookKeywordAfterTitle) setScribeBookKeywordAfterTitle(afterKeyword);
      }

      setIsScribeOpen(true);
    }
  }, [
    tab,
    lib.notes,
    lib.notesById,
    activeParchmentId,
    scribeTitle,
    lib.userNotes,
    lib.userNotesById,
    activeUserNoteId,
    noteSubject,
    lib.books,
    lib.booksById,
    activeBookId,
    scribeBookTitle,
    scribeBookKeyword,
    scribeBookKeywordAfterTitle,
  ]);

  const closeScribe = React.useCallback(() => {
    if (tab === 'books' && !confirmLoseBookChanges()) return;
    setIsScribeOpen(false);
  }, [tab, confirmLoseBookChanges]);

  // parchment select helper (existing)
  const handleSelectParchmentForScribe = React.useCallback(
    (id: string) => {
      if (tab !== 'parchment') return;
      setActiveParchmentId(id);
      const n = lib.notesById.get(id);
      if (n) setScribeTitle(n.title ?? '');
    },
    [tab, lib.notesById],
  );

  // notes select helper
  const handleSelectUserNoteForScribe = React.useCallback(
    (id: string) => {
      if (tab !== 'notes') return;
      setActiveUserNoteId(id);
      const n = lib.userNotesById.get(id);
      if (n) {
        setNoteSpool(n.spool);
        setNoteSubject(n.subject ?? '');
      }
    },
    [tab, lib.userNotesById],
  );

  // books select helper (new)
  const handleSelectBookForScribe = React.useCallback(
    (id: string) => {
      if (tab !== 'books') return;
      setActiveBookId(id);
      const b = lib.booksById.get(id);
      if (b) {
        setScribeBookTitle(b.title ?? '');
        const baseKeyword = (b as any).keyword ?? b.title ?? '';
        const afterKeyword = (b as any).keywordAfterTitle ?? baseKeyword;
        setScribeBookKeyword(baseKeyword);
        setScribeBookKeywordAfterTitle(afterKeyword);
      }
    },
    [tab, lib.booksById],
  );

  const handleScribeParchment = React.useCallback(() => {
    if (tab !== 'parchment') return;

    const note = activeParchment;
    if (!note) return;

    const parchment = scribeParchment;
    const ink = scribeInk;
    const quill = scribeQuill;
    const title = scribeTitle;

    if (!parchment || !ink || !quill || !title) {
      window.alert('Please fill parchment, ink, quill, and title.');
      return;
    }

    const body = note.body ?? '';
    const lines = splitLinesPreserveBlanks(body);
    const numLines = Math.max(1, lines.length);
    const numChars = body.length;

    const ok = window.confirm(
      `Are you sure you wish to write ${parchment} with "${title}"? (${numLines} lines, ${numChars} characters)`,
    );
    if (!ok) return;

    sendGameCommand(`dip ${quill} ${ink}`);
    sendGameCommand(`write ${parchment} title ${title}`);
    sendGameCommand(`write ${parchment}`);
    sendGameCommand(`.c`);

    for (const line of lines) sendGameCommand(line);

    sendGameCommand(`@`);
    sendGameCommand(`read ${title}`);
    setIsScribeOpen(false);
  }, [tab, activeParchment, scribeParchment, scribeInk, scribeQuill, scribeTitle]);

  const handleScribeUserNote = React.useCallback(() => {
    if (tab !== 'notes') return;

    const n = activeUserNote;
    if (!n) return;

    const spool = noteSpool;
    const to = normalizeParensSpacing(noteToLine);
    const subject = (noteSubject ?? '').trim();

    if (!to) {
      window.alert('Please fill the "to" line.');
      return;
    }
    if (!subject) {
      window.alert('Please fill the subject.');
      return;
    }

    const body = n.body ?? '';
    const lines = splitLinesPreserveBlanks(body);

    const ok = window.confirm(`Send ${spool} to: ${to}\nSubject: ${subject}\n(${lines.length} lines)`);
    if (!ok) return;

    sendGameCommand(`${spool} to ${to}`);
    sendGameCommand(`${spool} subject ${subject}`);
    sendGameCommand(`${spool} ++`);
    sendGameCommand(`.c`);

    for (const line of lines) sendGameCommand(line);

    sendGameCommand(`@`);
    sendGameCommand(`${spool} show`);

    setIsScribeOpen(false);
  }, [tab, activeUserNote, noteSpool, noteToLine, noteSubject]);

  const handleScribeBook = React.useCallback(() => {
    if (tab !== 'books') return;

    const b = activeBook;
    if (!b) return;

    const quill = (scribeBookQuill ?? '').trim();
    const ink = (scribeBookInk ?? '').trim();
    const title = (scribeBookTitle ?? '').trim();
    const baseKeyword = (scribeBookKeyword ?? '').trim();
    const afterKeyword = (scribeBookKeywordAfterTitle ?? '').trim();

    if (!quill || !ink) {
      window.alert('Please fill quill and ink.');
      return;
    }
    if (!title) {
      window.alert('Please fill the new title.');
      return;
    }
    if (!baseKeyword) {
      window.alert('Please fill the book keyword (original book name/keyword).');
      return;
    }
    if (!afterKeyword) {
      window.alert('Please fill the keyword to use after changing the title.');
      return;
    }

    // ✅ Skip missing pages automatically: only iterate defined pages
    const pages = sortedDefinedPages(b);
    if (pages.length === 0) {
      window.alert('This book has no defined pages to scribe.');
      return;
    }

    const pageList = pages.map((p) => p.page).join(', ');
    const totalLines = pages.reduce((sum, p) => sum + splitLinesPreserveBlanks(p.body ?? '').length, 0);

    const ok = window.confirm(
      `Scribe book:\n` +
        `Book: ${b.title}\n` +
        `Title -> "${title}"\n` +
        `Keyword (title cmd): ${baseKeyword}\n` +
        `Keyword (page cmd): ${afterKeyword}\n` +
        `Pages: ${pages.length} [${pageList}]\n` +
        `Total lines: ${totalLines}\n\nProceed?`,
    );
    if (!ok) return;

    // per your format:
    // dip quill ink write {book} title {title}
    sendGameCommand(`dip ${quill} ${ink}`);
    sendGameCommand(`write ${baseKeyword} title ${title}`);

    // First page uses dip line in your example; subsequent pages just "write ..."
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const lines = splitLinesPreserveBlanks(p.body ?? '');

      sendGameCommand(`dip ${quill} ${ink}`);
      sendGameCommand(`write ${afterKeyword} page ${p.page}`);

      sendGameCommand(`.c`);
      for (const line of lines) sendGameCommand(line);
      sendGameCommand(`@`);
    }

    setIsScribeOpen(false);
  }, [
    tab,
    activeBook,
    scribeBookQuill,
    scribeBookInk,
    scribeBookTitle,
    scribeBookKeyword,
    scribeBookKeywordAfterTitle,
  ]);

  // ------------------------------------------------------------------

  const isBookPageMissing = tab === 'books' && activeBook ? !hasPage(activeBook, activeBookPage) : false;

  // ✅ CHANGE: include the currently selected page so "/ {maxPages}" doesn't snap back to 1
  // when you're viewing a missing page beyond the last defined page.
  const maxPages = tab === 'books' && activeBook ? Math.max(1, activeBookPage, getMaxPage(activeBook.pages)) : 1;

  const notesBySpool = React.useMemo(() => {
    const groups = new Map<NoteSpool, UserNote[]>();
    for (const n of lib.userNotes) {
      const arr = groups.get(n.spool) ?? [];
      arr.push(n);
      groups.set(n.spool, arr);
    }

    for (const [k, arr] of groups) {
      arr.sort((a, b) => (a.subject ?? '').localeCompare(b.subject ?? '', undefined, { sensitivity: 'base' }));
      groups.set(k, arr);
    }

    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }));
  }, [lib.userNotes]);

  // ✅ IMPORTANT: return null ONLY AFTER ALL HOOKS HAVE RUN
  if (!isOpen) return null;

  const showList = tab === 'parchment' || tab === 'notes' || tab === 'books';

  const leftTitle = tab === 'parchment' ? 'Parchment' : tab === 'notes' ? 'Notes' : tab === 'books' ? 'Books' : '';

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.title}>Library</div>
          <button type="button" className={styles.closeButton} onClick={handleRequestClose}>
            ✕
          </button>
        </div>

        <div className={styles.tabBar}>
          <button
            type="button"
            className={`${styles.tabButton} ${tab === 'parchment' ? styles.tabButtonActive : ''}`}
            onClick={() => handleSetTab('parchment')}
          >
            Parchment
          </button>

          <button
            type="button"
            className={`${styles.tabButton} ${tab === 'notes' ? styles.tabButtonActive : ''}`}
            onClick={() => handleSetTab('notes')}
          >
            Notes
          </button>

          <button
            type="button"
            className={`${styles.tabButton} ${tab === 'books' ? styles.tabButtonActive : ''}`}
            onClick={() => handleSetTab('books')}
          >
            Books
          </button>

          <button
            type="button"
            className={`${styles.tabButton} ${tab === 'colors' ? styles.tabButtonActive : ''}`}
            onClick={() => handleSetTab('colors')}
          >
            Color Preview
          </button>

          <div className={styles.tabActions}>
            {tab === 'parchment' && (
              <button type="button" className={styles.primaryButton} onClick={handleNewParchment}>
                New Parchment
              </button>
            )}
            {tab === 'notes' && (
              <button type="button" className={styles.primaryButton} onClick={handleNewUserNote}>
                New Note
              </button>
            )}
            {tab === 'books' && (
              <button type="button" className={styles.primaryButton} onClick={handleNewBook}>
                New Book
              </button>
            )}
          </div>
        </div>

        <div className={styles.body}>
          {showList && (
            <div className={styles.split}>
              <div className={styles.splitHeader}>
                <div className={styles.listHeader}>
                  <div className={styles.listTitle}>{leftTitle}</div>
                  <button type="button" className={styles.secondaryButton} onClick={openScribe}>
                    Scribe…
                  </button>
                </div>

                <div className={styles.editorHeader}>
                  {tab === 'notes' ? (
                    <div className={styles.titleWithSpool}>
                      <div className={styles.noteSpoolSelectWrap}>
                        <select
                          className={styles.noteSpoolSelect}
                          value={noteSpool}
                          onChange={(e) => setNoteSpool(e.target.value as NoteSpool)}
                          aria-label="Note spool"
                        >
                          {NOTE_SPOOLS.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <input
                        className={styles.titleInput}
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        placeholder="Note subject"
                      />
                    </div>
                  ) : (
                    <input
                      className={styles.titleInput}
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      placeholder={tab === 'parchment' ? 'Parchment title' : 'Book title'}
                    />
                  )}

                  {tab === 'books' ? (
                    <div className={styles.pageControls}>
                      <button type="button" className={styles.secondaryButton} onClick={handlePrevPage}>
                        ◀
                      </button>

                      <div className={styles.pageLabel}>
                        Page{' '}
                        <input
                          className={styles.pageInput}
                          value={String(activeBookPage)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const n = Number(raw);
                            if (!Number.isFinite(n)) return;
                            trySetBookPage(Math.max(1, Math.floor(n)));
                          }}
                        />
                        <span className={styles.pageOf}>/ {maxPages}</span>
                        {isBookPageMissing ? <span className={styles.pageMissing}>(missing)</span> : null}
                      </div>

                      <button type="button" className={styles.secondaryButton} onClick={handleNextPage}>
                        ▶
                      </button>

                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={handleAddNextPage}
                        disabled={!activeBook}
                      >
                        + Page
                      </button>

                      {isBookPageMissing ? (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={handleRestorePage}
                          disabled={!activeBook}
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.dangerButton}
                          onClick={handleTearOutPage}
                          disabled={!activeBook}
                        >
                          Tear Out
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className={styles.headerSpacer} />
                  )}

                  <div className={styles.editorButtons}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={handleSave}
                      disabled={!draftTitle && !draftBody}
                    >
                      Save
                    </button>

                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={handleDelete}
                      disabled={
                        tab === 'parchment'
                          ? !activeParchment
                          : tab === 'notes'
                            ? !activeUserNote
                            : tab === 'books'
                              ? !activeBook
                              : true
                      }
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.splitBody}>
                <div className={styles.listPane}>
                  <div className={styles.list}>
                    {tab === 'parchment' &&
                      lib.notes.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          className={`${styles.listItem} ${activeParchmentId === item.id ? styles.listItemActive : ''}`}
                          onClick={() => setActiveParchmentId(item.id)}
                        >
                          <div className={styles.listItemTitle}>{item.title || '(untitled)'}</div>
                          <div className={styles.listItemMeta}>{new Date(item.updatedAt).toLocaleString()}</div>
                        </button>
                      ))}

                    {tab === 'books' &&
                      lib.books.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          className={`${styles.listItem} ${activeBookId === item.id ? styles.listItemActive : ''}`}
                          onClick={() => handleSelectBook(item.id)}
                        >
                          <div className={styles.listItemTitle}>{item.title || '(untitled)'}</div>
                          <div className={styles.listItemMeta}>{new Date(item.updatedAt).toLocaleString()}</div>
                        </button>
                      ))}

                    {tab === 'notes' &&
                      notesBySpool.map(([spool, items]) => (
                        <div key={spool} className={styles.treeGroup}>
                          <div className={styles.treeGroupHeader}>{spool}</div>

                          {items.map((n) => (
                            <button
                              type="button"
                              key={n.id}
                              className={`${styles.listItem} ${activeUserNoteId === n.id ? styles.listItemActive : ''}`}
                              onClick={() => setActiveUserNoteId(n.id)}
                            >
                              <div className={styles.listItemTitle}>{n.subject || '(untitled)'}</div>
                              <div className={styles.listItemMeta}>{new Date(n.updatedAt).toLocaleString()}</div>
                            </button>
                          ))}
                        </div>
                      ))}
                  </div>
                </div>

                <div className={styles.editorPane}>
                  <div className={styles.editorMain}>
                    <div className={styles.editorGrid}>
                      <textarea
                        className={styles.textArea}
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                        placeholder={
                          tab === 'parchment'
                            ? 'Type parchment text here. DSL colors: {r {G ... end with {x'
                            : tab === 'notes'
                              ? 'Type note text here. DSL colors: {r {G ... end with {x'
                              : 'Type page text here. DSL colors: {r {G ... end with {x'
                        }
                      />

                      <div className={styles.previewPane}>
                        <div className={styles.previewTitle}>Preview</div>
                        <div className={styles.previewBody}>
                          <div className={styles.previewInner} dangerouslySetInnerHTML={{ __html: previewHtml }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {isScribeOpen && (
                    <div className={styles.scribeInline}>
                      <div className={styles.scribeInlineHeader}>
                        <div className={styles.scribeInlineTitle}>
                          {tab === 'parchment' ? 'Scribe Parchment' : tab === 'notes' ? 'Scribe Note' : 'Scribe Book'}
                        </div>
                        <button
                          type="button"
                          className={styles.scribeCloseButton}
                          onClick={closeScribe}
                          aria-label="Close scribe"
                        >
                          ✕
                        </button>
                      </div>

                      {tab === 'parchment' && (
                        <>
                          <div className={styles.scribeGrid}>
                            <div className={styles.scribeField}>
                              <div className={styles.scribeFieldLabel}>Parchment</div>
                              <input
                                className={styles.scribeInput}
                                value={scribeParchment}
                                onChange={(e) => setScribeParchment(e.target.value)}
                                placeholder="parchment name"
                              />
                            </div>

                            <div className={styles.scribeField}>
                              <div className={styles.scribeFieldLabel}>Ink</div>
                              <input
                                className={styles.scribeInput}
                                value={scribeInk}
                                onChange={(e) => setScribeInk(e.target.value)}
                                placeholder="ink name"
                              />
                            </div>

                            <div className={styles.scribeField}>
                              <div className={styles.scribeFieldLabel}>Quill</div>
                              <input
                                className={styles.scribeInput}
                                value={scribeQuill}
                                onChange={(e) => setScribeQuill(e.target.value)}
                                placeholder="quill name"
                              />
                            </div>

                            <div className={styles.scribeField}>
                              <div className={styles.scribeFieldLabel}>Title</div>
                              <input
                                className={styles.scribeInput}
                                value={scribeTitle}
                                onChange={(e) => setScribeTitle(e.target.value)}
                                placeholder="title"
                              />
                            </div>

                            <div className={styles.scribeFieldWide}>
                              <div className={styles.scribeFieldLabel}>Parchment</div>
                              <div className={styles.scribeSelectWrap}>
                                <select
                                  className={styles.scribeSelect}
                                  value={activeParchmentId ?? ''}
                                  onChange={(e) => handleSelectParchmentForScribe(e.target.value)}
                                >
                                  {lib.notes.map((n) => (
                                    <option key={n.id} value={n.id}>
                                      {n.title || '(untitled)'}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>

                          <div className={styles.scribeActions}>
                            <button type="button" className={styles.secondaryButton} onClick={closeScribe}>
                              Cancel
                            </button>
                            <button
                              type="button"
                              className={styles.primaryButton}
                              onClick={handleScribeParchment}
                              disabled={!activeParchment}
                            >
                              Scribe
                            </button>
                          </div>
                        </>
                      )}

                      {tab === 'notes' && (
                        <>
                          <div className={styles.scribeGrid}>
                            <div className={styles.scribeField}>
                              <div className={styles.scribeFieldLabel}>Spool</div>
                              <div className={styles.scribeSelectWrap}>
                                <select
                                  className={styles.scribeSelect}
                                  value={noteSpool}
                                  onChange={(e) => setNoteSpool(e.target.value as NoteSpool)}
                                >
                                  {NOTE_SPOOLS.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className={styles.scribeField}>
                              <div className={styles.scribeFieldLabel}>To</div>
                              <input
                                className={styles.scribeInput}
                                value={noteToLine}
                                onChange={(e) => setNoteToLine(e.target.value)}
                                placeholder="person1 person2 ( person3 )"
                              />
                            </div>

                            <div className={styles.scribeFieldWide}>
                              <div className={styles.scribeFieldLabel}>Subject</div>
                              <input
                                className={styles.scribeInput}
                                value={noteSubject}
                                onChange={(e) => setNoteSubject(e.target.value)}
                                placeholder="My favorite note"
                              />
                            </div>

                            <div className={styles.scribeFieldWide}>
                              <div className={styles.scribeFieldLabel}>Note</div>
                              <div className={styles.scribeSelectWrap}>
                                <select
                                  className={styles.scribeSelect}
                                  value={activeUserNoteId ?? ''}
                                  onChange={(e) => handleSelectUserNoteForScribe(e.target.value)}
                                >
                                  {lib.userNotes
                                    .slice()
                                    .sort((a, b) =>
                                      (a.subject ?? '').localeCompare(b.subject ?? '', undefined, {
                                        sensitivity: 'base',
                                      }),
                                    )
                                    .map((n) => (
                                      <option key={n.id} value={n.id}>
                                        [{n.spool}] {n.subject || '(untitled)'}
                                      </option>
                                    ))}
                                </select>
                              </div>
                            </div>
                          </div>

                          <div className={styles.scribeActions}>
                            <button type="button" className={styles.secondaryButton} onClick={closeScribe}>
                              Cancel
                            </button>
                            <button
                              type="button"
                              className={styles.primaryButton}
                              onClick={handleScribeUserNote}
                              disabled={!activeUserNote}
                            >
                              Scribe
                            </button>
                          </div>
                        </>
                      )}

                      {tab === 'books' && (
                        <>
                          <div className={styles.scribeGrid}>
                            <div className={styles.scribeField}>
                              <div className={styles.scribeFieldLabel}>Quill</div>
                              <input
                                className={styles.scribeInput}
                                value={scribeBookQuill}
                                onChange={(e) => setScribeBookQuill(e.target.value)}
                                placeholder="quill name"
                              />
                            </div>

                            <div className={styles.scribeField}>
                              <div className={styles.scribeFieldLabel}>Ink</div>
                              <input
                                className={styles.scribeInput}
                                value={scribeBookInk}
                                onChange={(e) => setScribeBookInk(e.target.value)}
                                placeholder="ink name"
                              />
                            </div>

                            <div className={styles.scribeFieldWide}>
                              <div className={styles.scribeFieldLabel}>New Title</div>
                              <input
                                className={styles.scribeInput}
                                value={scribeBookTitle}
                                onChange={(e) => setScribeBookTitle(e.target.value)}
                                placeholder="New book title"
                              />
                            </div>

                            <div className={styles.scribeFieldWide}>
                              <div className={styles.scribeFieldLabel}>Book Keyword (for title command)</div>
                              <input
                                className={styles.scribeInput}
                                value={scribeBookKeyword}
                                onChange={(e) => setScribeBookKeyword(e.target.value)}
                                placeholder="original book keyword (defaults to book title)"
                              />
                            </div>

                            <div className={styles.scribeFieldWide}>
                              <div className={styles.scribeFieldLabel}>Keyword After Title (for page commands)</div>
                              <input
                                className={styles.scribeInput}
                                value={scribeBookKeywordAfterTitle}
                                onChange={(e) => setScribeBookKeywordAfterTitle(e.target.value)}
                                placeholder="keyword to use when writing pages"
                              />
                            </div>

                            <div className={styles.scribeFieldWide}>
                              <div className={styles.scribeFieldLabel}>Book</div>
                              <div className={styles.scribeSelectWrap}>
                                <select
                                  className={styles.scribeSelect}
                                  value={activeBookId ?? ''}
                                  onChange={(e) => handleSelectBookForScribe(e.target.value)}
                                >
                                  {lib.books
                                    .slice()
                                    .sort((a, b) =>
                                      (a.title ?? '').localeCompare(b.title ?? '', undefined, { sensitivity: 'base' }),
                                    )
                                    .map((bk) => (
                                      <option key={bk.id} value={bk.id}>
                                        {bk.title || '(untitled)'}
                                      </option>
                                    ))}
                                </select>
                              </div>
                            </div>
                          </div>

                          <div className={styles.scribeActions}>
                            <button type="button" className={styles.secondaryButton} onClick={closeScribe}>
                              Cancel
                            </button>
                            <button
                              type="button"
                              className={styles.primaryButton}
                              onClick={handleScribeBook}
                              disabled={!activeBook}
                            >
                              Scribe
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'colors' && (
            <div className={styles.colorsPane}>
              <div className={styles.colorsHint}>
                Use DSL color tokens like <code>{'{R'}</code>, <code>{'{b'}</code>, end with <code>{'{x'}</code>. Use{' '}
                <code>{'{{'}</code> to write a literal <code>{'{'}</code>. Bell: <code>{'{!'}</code> renders as 🔔.
              </div>

              <div className={styles.editorGrid}>
                <textarea
                  className={styles.textArea}
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                />
                <div className={styles.previewPane}>
                  <div className={styles.previewTitle}>Rendered Preview</div>
                  <div className={styles.previewBody}>
                    <div className={styles.previewInner} dangerouslySetInnerHTML={{ __html: previewHtml }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LibraryModal;
