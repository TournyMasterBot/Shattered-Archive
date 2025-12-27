// apps/game-client/src/components/LibraryModal.tsx

import React from 'react';
import styles from '../styles/LibraryModal.module.scss';
import useLibrary from '../hooks/useLibrary';
import { renderDslToHtml } from '../features/library/renderDslColorPreviewHtml';
import type { LibraryBook, LibraryBookPage, LibraryNote } from '../features/library/library-types';

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
}

type TabId = 'notes' | 'books' | 'colors';

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

export const LibraryModal: React.FC<LibraryModalProps> = ({ isOpen, onClose, connectionId }) => {
  const lib = useLibrary(connectionId);
  const [tab, setTab] = React.useState<TabId>('notes');

  const [activeNoteId, setActiveNoteId] = React.useState<string | null>(null);
  const [activeBookId, setActiveBookId] = React.useState<string | null>(null);

  const activeNote: LibraryNote | null = activeNoteId ? (lib.notesById.get(activeNoteId) ?? null) : null;
  const activeBook: LibraryBook | null = activeBookId ? (lib.booksById.get(activeBookId) ?? null) : null;

  const [activeBookPage, setActiveBookPage] = React.useState<number>(1);

  const [draftTitle, setDraftTitle] = React.useState('');
  const [draftBody, setDraftBody] = React.useState('');

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

  React.useEffect(() => {
    if (tab === 'notes') {
      const n = activeNote;
      setDraftTitle(n?.title ?? '');
      setDraftBody(n?.body ?? '');
      return;
    }

    if (tab === 'books') {
      const b = activeBook;

      let nextPage = activeBookPage;
      if (b) {
        const pageSet = pagesToSet(b.pages);
        if (!pageSet.has(nextPage)) {
          const sorted = Array.from(pageSet).sort((x, y) => x - y);
          nextPage = sorted[0] ?? 1;
        }
      } else {
        nextPage = 1;
      }

      if (nextPage !== activeBookPage) setActiveBookPage(nextPage);

      setDraftTitle(b?.title ?? '');
      setDraftBody(getPageBody(b, nextPage));
      return;
    }

    setDraftTitle('');
    setDraftBody('gos {Rhello{B!{x');
  }, [tab, activeNote, activeBook, activeBookPage]);

  React.useEffect(() => {
    if (tab !== 'books') return;
    const b = activeBook;
    if (!b) {
      setActiveBookPage(1);
      return;
    }
    const set = pagesToSet(b.pages);
    const sorted = Array.from(set).sort((x, y) => x - y);
    setActiveBookPage(sorted[0] ?? 1);
  }, [tab, activeBookId]);

  const previewHtml = React.useMemo(() => renderDslToHtml(draftBody), [draftBody]);

  const handleNewNote = React.useCallback(async () => {
    const created = await lib.createNote('New Note');
    setTab('notes');
    setActiveNoteId(created.id);
  }, [lib]);

  const handleNewBook = React.useCallback(async () => {
    const created = await lib.createBook('New Book');
    setTab('books');
    setActiveBookId(created.id);
    setActiveBookPage(1);
  }, [lib]);

  const handleSave = React.useCallback(async () => {
    if (tab === 'notes' && activeNote) {
      await lib.saveNote({ ...activeNote, title: draftTitle, body: draftBody, updatedAt: Date.now() });
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
  }, [tab, activeNote, activeBook, activeBookPage, draftTitle, draftBody, lib]);

  const handleDelete = React.useCallback(async () => {
    if (tab === 'notes' && activeNote) {
      await lib.deleteNote(activeNote.id);
      setActiveNoteId(null);
    }
    if (tab === 'books' && activeBook) {
      if (!confirmLoseBookChanges()) return;
      await lib.deleteBook(activeBook.id);
      setActiveBookId(null);
      setActiveBookPage(1);
    }
  }, [tab, activeNote, activeBook, lib, confirmLoseBookChanges]);

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

    await lib.tearOutBookPage(activeBook, activeBookPage);

    const refreshed = lib.booksById.get(activeBook.id);
    const b = refreshed ?? activeBook;
    const set = pagesToSet(b.pages);

    if (set.has(activeBookPage)) return;

    const prev = activeBookPage - 1;
    const next = activeBookPage + 1;
    if (prev >= 1 && set.has(prev)) setActiveBookPage(prev);
    else if (set.has(next)) setActiveBookPage(next);
    else {
      const sorted = Array.from(set).sort((x, y) => x - y);
      setActiveBookPage(sorted[0] ?? 1);
    }
  }, [activeBook, activeBookPage, lib, confirmLoseBookChanges]);

  const handleRestorePage = React.useCallback(async () => {
    if (!activeBook) return;
    if (!confirmLoseBookChanges()) return;
    await lib.addBookPage(activeBook, activeBookPage);
    setDraftBody('');
  }, [activeBook, activeBookPage, lib, confirmLoseBookChanges]);

  const handleSetTab = React.useCallback(
    (next: TabId) => {
      if (tab === next) return;
      if (tab === 'books' && next !== 'books') {
        if (!confirmLoseBookChanges()) return;
      }
      setTab(next);
    },
    [tab, confirmLoseBookChanges],
  );

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

  const [isScribeOpen, setIsScribeOpen] = React.useState(false);

  const [scribeParchment, setScribeParchment] = React.useState('');
  const [scribeInk, setScribeInk] = React.useState('');
  const [scribeQuill, setScribeQuill] = React.useState('');
  const [scribeTitle, setScribeTitle] = React.useState('');

  const openScribe = React.useCallback(() => {
    if (tab === 'notes') {
      const fallbackId = lib.notes[0]?.id ?? null;
      const nextId = activeNoteId ?? fallbackId;
      if (!nextId) {
        window.alert('You have no notes to scribe yet.');
        return;
      }
      setActiveNoteId(nextId);

      const n = lib.notesById.get(nextId);
      if (n && !scribeTitle) setScribeTitle(n.title ?? '');

      setIsScribeOpen(true);
      return;
    }

    if (tab === 'books') {
      setIsScribeOpen(true);
    }
  }, [tab, lib.notes, lib.notesById, activeNoteId, scribeTitle]);

  const closeScribe = React.useCallback(() => {
    if (tab === 'books' && !confirmLoseBookChanges()) return;
    setIsScribeOpen(false);
  }, [tab, confirmLoseBookChanges]);

  const handleSelectNoteForScribe = React.useCallback(
    (id: string) => {
      if (tab !== 'notes') return;
      setActiveNoteId(id);
      const n = lib.notesById.get(id);
      if (n) setScribeTitle(n.title ?? '');
    },
    [tab, lib.notesById],
  );

  const handleScribeNote = React.useCallback(() => {
    if (tab !== 'notes') return;

    const note = activeNote;
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

    for (const line of lines) {
      sendGameCommand(line);
    }

    sendGameCommand(`@`);
    setIsScribeOpen(false);
  }, [tab, activeNote, scribeParchment, scribeInk, scribeQuill, scribeTitle]);

  const isBookPageMissing = tab === 'books' && activeBook ? !hasPage(activeBook, activeBookPage) : false;
  const maxPages = tab === 'books' && activeBook ? Math.max(1, getMaxPage(activeBook.pages)) : 1;

  if (!isOpen) return null;

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
            className={`${styles.tabButton} ${tab === 'notes' ? styles.tabButtonActive : ''}`}
            onClick={() => handleSetTab('notes')}
          >
            Parchment
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
            {tab === 'notes' && (
              <button type="button" className={styles.primaryButton} onClick={handleNewNote}>
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
          {(tab === 'notes' || tab === 'books') && (
            <div className={styles.split}>
              <div className={styles.splitHeader}>
                <div className={styles.listHeader}>
                  <div className={styles.listTitle}>{tab === 'notes' ? 'Notes' : 'Books'}</div>
                  <button type="button" className={styles.secondaryButton} onClick={openScribe}>
                    Scribe…
                  </button>
                </div>

                <div className={styles.editorHeader}>
                  <input
                    className={styles.titleInput}
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    placeholder={tab === 'notes' ? 'Note title' : 'Book title'}
                  />

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
                      disabled={tab === 'notes' ? !activeNote : !activeBook}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.splitBody}>
                <div className={styles.listPane}>
                  <div className={styles.list}>
                    {(tab === 'notes' ? lib.notes : lib.books).map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`${styles.listItem} ${
                          (tab === 'notes' ? activeNoteId : activeBookId) === item.id ? styles.listItemActive : ''
                        }`}
                        onClick={() => {
                          if (tab === 'notes') {
                            if (isScribeOpen) handleSelectNoteForScribe(item.id);
                            else setActiveNoteId(item.id);
                          } else handleSelectBook(item.id);
                        }}
                      >
                        <div className={styles.listItemTitle}>{item.title || '(untitled)'}</div>
                        <div className={styles.listItemMeta}>{new Date(item.updatedAt).toLocaleString()}</div>
                      </button>
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
                          tab === 'notes'
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
                          {tab === 'notes' ? 'Scribe Note' : 'Scribe Book'}
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

                      {tab === 'notes' && (
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
                              <div className={styles.scribeFieldLabel}>Note</div>
                              <div className={styles.scribeSelectWrap}>
                                <select
                                  className={styles.scribeSelect}
                                  value={activeNoteId ?? ''}
                                  onChange={(e) => handleSelectNoteForScribe(e.target.value)}
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
                              onClick={handleScribeNote}
                              disabled={!activeNote}
                            >
                              Scribe
                            </button>
                          </div>
                        </>
                      )}

                      {tab === 'books' && (
                        <div className={styles.scribePlaceholder}>
                          Book scribing placeholder — next we’ll add page-aware selection + preview.
                        </div>
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
