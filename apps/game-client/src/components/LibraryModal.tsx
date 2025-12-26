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

export const LibraryModal: React.FC<LibraryModalProps> = ({ isOpen, onClose, connectionId }) => {
  const lib = useLibrary(connectionId);
  const [tab, setTab] = React.useState<TabId>('notes');

  const [activeNoteId, setActiveNoteId] = React.useState<string | null>(null);
  const [activeBookId, setActiveBookId] = React.useState<string | null>(null);

  const activeNote: LibraryNote | null = activeNoteId ? (lib.notesById.get(activeNoteId) ?? null) : null;
  const activeBook: LibraryBook | null = activeBookId ? (lib.booksById.get(activeBookId) ?? null) : null;

  // Books: current page selection
  const [activeBookPage, setActiveBookPage] = React.useState<number>(1);

  // Draft fields
  const [draftTitle, setDraftTitle] = React.useState('');
  const [draftBody, setDraftBody] = React.useState('');

  // --- Unsaved changes guard (books only) -----------------------------

  const savedBookTitle = activeBook?.title ?? '';
  const savedBookPageBody = getPageBody(activeBook, activeBookPage);

  const isBookContext = tab === 'books' && !!activeBook;
  const isBookDirty = isBookContext && (draftTitle !== savedBookTitle || draftBody !== (savedBookPageBody ?? ''));

  const confirmLoseBookChanges = React.useCallback((): boolean => {
    if (!isBookDirty) return true;
    return window.confirm('You have unsaved changes on this book page. Discard changes?');
  }, [isBookDirty]);

  // Wrap modal close
  const handleRequestClose = React.useCallback(() => {
    if (!confirmLoseBookChanges()) return;
    onClose();
  }, [confirmLoseBookChanges, onClose]);

  // -------------------------------------------------------------------

  // Keep draft in sync with active selection
  React.useEffect(() => {
    if (tab === 'notes') {
      const n = activeNote;
      setDraftTitle(n?.title ?? '');
      setDraftBody(n?.body ?? '');
      return;
    }

    if (tab === 'books') {
      const b = activeBook;

      // IMPORTANT:
      // Missing pages are valid (torn out). Do NOT auto-jump to page 1.
      // Only clamp to >= 1.
      const nextPage = Math.max(1, Math.floor(activeBookPage || 1));
      if (nextPage !== activeBookPage) setActiveBookPage(nextPage);

      setDraftTitle(b?.title ?? '');
      setDraftBody(getPageBody(b, nextPage));
      return;
    }

    // colors tab
    setDraftTitle('');
    setDraftBody('gos {Rhello{B!{x');
  }, [tab, activeNote, activeBook, activeBookPage]);

  // When switching books, DO NOT force page to "first existing".
  // Missing pages are a valid state. Just clamp to >= 1 so the UI is stable.
  React.useEffect(() => {
    if (tab !== 'books') return;
    if (!activeBook) {
      setActiveBookPage(1);
      return;
    }
    setActiveBookPage((p) => Math.max(1, Math.floor(p || 1)));
  }, [tab, activeBookId, activeBook]);

  if (!isOpen) return null;

  const previewHtml = renderDslToHtml(draftBody);

  const handleNewNote = async () => {
    const created = await lib.createNote('New Note');
    setTab('notes');
    setActiveNoteId(created.id);
  };

  const handleNewBook = async () => {
    const created = await lib.createBook('New Book');
    setTab('books');
    setActiveBookId(created.id);
    setActiveBookPage(1);
  };

  const handleSave = async () => {
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
  };

  const handleDelete = async () => {
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
  };

  // ----- guarded book navigation helpers -----------------------------

  const trySetBookPage = (next: number) => {
    if (tab !== 'books') return;
    if (!confirmLoseBookChanges()) return;
    setActiveBookPage(Math.max(1, Math.floor(next)));
  };

  const handlePrevPage = () => trySetBookPage(activeBookPage - 1);
  const handleNextPage = () => trySetBookPage(activeBookPage + 1);

  const handleAddNextPage = async () => {
    if (!activeBook) return;
    if (!confirmLoseBookChanges()) return;
    const next = getMaxPage(activeBook.pages) + 1;
    await lib.addBookPage(activeBook, next);
    setActiveBookPage(next);
  };

  const handleTearOutPage = async () => {
    if (!activeBook) return;
    if (!confirmLoseBookChanges()) return;

    await lib.tearOutBookPage(activeBook, activeBookPage);

    // Stay on this page number (now missing) so:
    // - indicator shows "(missing)"
    // - Restore button is available
    // - Next moves forward correctly
    setDraftBody('');
  };

  const handleRestorePage = async () => {
    if (!activeBook) return;
    if (!confirmLoseBookChanges()) return;
    await lib.addBookPage(activeBook, activeBookPage);
    setDraftBody('');
  };

  // ----- guarded tab switching --------------------------------------

  const handleSetTab = (next: TabId) => {
    if (tab === next) return;

    // leaving books? prompt if dirty
    if (tab === 'books' && next !== 'books') {
      if (!confirmLoseBookChanges()) return;
    }

    setTab(next);
  };

  // ----- guarded book selection -------------------------------------

  const handleSelectBook = (id: string) => {
    if (tab !== 'books') {
      setActiveBookId(id);
      return;
    }
    if (!confirmLoseBookChanges()) return;
    setActiveBookId(id);
  };

  // ------------------------------------------------------------------

  const isBookPageMissing = tab === 'books' && activeBook ? !hasPage(activeBook, activeBookPage) : false;
  const maxPages = tab === 'books' && activeBook ? Math.max(1, getMaxPage(activeBook.pages)) : 1;

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
              <div className={styles.listPane}>
                <div className={styles.listHeader}>
                  <div className={styles.listTitle}>{tab === 'notes' ? 'Notes' : 'Books'}</div>
                  <button type="button" className={styles.secondaryButton} onClick={() => lib.refresh()}>
                    Refresh
                  </button>
                </div>

                <div className={styles.list}>
                  {(tab === 'notes' ? lib.notes : lib.books).map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`${styles.listItem} ${
                        (tab === 'notes' ? activeNoteId : activeBookId) === item.id ? styles.listItemActive : ''
                      }`}
                      onClick={() => {
                        if (tab === 'notes') setActiveNoteId(item.id);
                        else handleSelectBook(item.id);
                      }}
                    >
                      <div className={styles.listItemTitle}>{item.title || '(untitled)'}</div>
                      <div className={styles.listItemMeta}>{new Date(item.updatedAt).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.editorPane}>
                <div className={styles.editorHeader}>
                  <input
                    className={styles.titleInput}
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    placeholder={tab === 'notes' ? 'Note title' : 'Book title'}
                  />

                  {tab === 'books' && (
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
                    <div className={styles.previewBody} dangerouslySetInnerHTML={{ __html: previewHtml }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'colors' && (
            <div className={styles.colorsPane}>
              <div className={styles.colorsHint}>
                Use DSL color tokens like <code>{'{R'}</code>, <code>{'{b'}</code>, end with <code>{'{x'}</code>. Use{' '}
                <code>{'{{'}</code> to write a literal <code>{'{'}</code>. Bell: <code>{'{!'}</code> renders as 🔔.
                <div className={styles.colorsList}>
                  <div className={styles.colorsListTitle}>Codes (from in-game help)</div>

                  <div className={styles.colorsGrid}>
                    <div className={styles.colorsCode}>
                      <code>{'{r'}</code>
                    </div>
                    <div className={styles.colorsLabel}>red</div>
                    <div className={styles.colorsCode}>
                      <code>{'{R'}</code>
                    </div>
                    <div className={styles.colorsLabel}>Lt Red</div>

                    <div className={styles.colorsCode}>
                      <code>{'{y'}</code>
                    </div>
                    <div className={styles.colorsLabel}>yellow</div>
                    <div className={styles.colorsCode}>
                      <code>{'{Y'}</code>
                    </div>
                    <div className={styles.colorsLabel}>Lt Yellow</div>

                    <div className={styles.colorsCode}>
                      <code>{'{b'}</code>
                    </div>
                    <div className={styles.colorsLabel}>blue</div>
                    <div className={styles.colorsCode}>
                      <code>{'{B'}</code>
                    </div>
                    <div className={styles.colorsLabel}>Lt Blue</div>

                    <div className={styles.colorsCode}>
                      <code>{'{c'}</code>
                    </div>
                    <div className={styles.colorsLabel}>cyan</div>
                    <div className={styles.colorsCode}>
                      <code>{'{C'}</code>
                    </div>
                    <div className={styles.colorsLabel}>Lt Cyan</div>

                    <div className={styles.colorsCode}>
                      <code>{'{m'}</code>
                    </div>
                    <div className={styles.colorsLabel}>magenta</div>
                    <div className={styles.colorsCode}>
                      <code>{'{M'}</code>
                    </div>
                    <div className={styles.colorsLabel}>Lt Magenta</div>

                    <div className={styles.colorsCode}>
                      <code>{'{g'}</code>
                    </div>
                    <div className={styles.colorsLabel}>green</div>
                    <div className={styles.colorsCode}>
                      <code>{'{G'}</code>
                    </div>
                    <div className={styles.colorsLabel}>Lt Green</div>

                    <div className={styles.colorsCode}>
                      <code>{'{D'}</code>
                    </div>
                    <div className={styles.colorsLabel}>black</div>
                    <div className={styles.colorsCode}>
                      <code>{'{w'}</code>
                    </div>
                    <div className={styles.colorsLabel}>Grey</div>
                    <div className={styles.colorsCode}>
                      <code>{'{W'}</code>
                    </div>
                    <div className={styles.colorsLabel}>Lt White</div>

                    <div className={styles.colorsCode}>
                      <code>{'{o'}</code>
                    </div>
                    <div className={styles.colorsLabel}>orange</div>
                    <div className={styles.colorsCode}>
                      <code>{'{n'}</code>
                    </div>
                    <div className={styles.colorsLabel}>brown</div>
                    <div className={styles.colorsCode}>
                      <code>{'{p'}</code>
                    </div>
                    <div className={styles.colorsLabel}>pink</div>
                    <div className={styles.colorsCode}>
                      <code>{'{u'}</code>
                    </div>
                    <div className={styles.colorsLabel}>purple</div>

                    <div className={styles.colorsCode}>
                      <code>{'{x'}</code>
                    </div>
                    <div className={styles.colorsLabel}>Reset Colors</div>

                    <div className={styles.colorsCode}>
                      <code>{'{!'}</code>
                    </div>
                    <div className={styles.colorsLabel}>beep</div>
                    <div className={styles.colorsCode}>
                      <code>{'{-'}</code>
                    </div>
                    <div className={styles.colorsLabel}>tilde</div>
                    <div className={styles.colorsCode}>
                      <code>{'{&'}</code>
                    </div>
                    <div className={styles.colorsLabel}>reverse color</div>
                    <div className={styles.colorsCode}>
                      <code>{'{_'}</code>
                    </div>
                    <div className={styles.colorsLabel}>underlines text</div>
                  </div>
                </div>
              </div>

              <div className={styles.editorGrid}>
                <textarea
                  className={styles.textArea}
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                />
                <div className={styles.previewPane}>
                  <div className={styles.previewTitle}>Rendered Preview</div>
                  <div className={styles.previewBody} dangerouslySetInnerHTML={{ __html: previewHtml }} />
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
