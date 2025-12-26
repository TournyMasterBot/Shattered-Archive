import React from 'react';
import styles from '../styles/LibraryModal.module.scss';
import useLibrary from '../hooks/useLibrary';
import { renderDslToHtml } from '../features/library/renderDslColorPreviewHtml';

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
}

type TabId = 'notes' | 'books' | 'colors';

export const LibraryModal: React.FC<LibraryModalProps> = ({ isOpen, onClose, connectionId }) => {
  const lib = useLibrary(connectionId);
  const [tab, setTab] = React.useState<TabId>('notes');

  const [activeNoteId, setActiveNoteId] = React.useState<string | null>(null);
  const [activeBookId, setActiveBookId] = React.useState<string | null>(null);

  const activeNote = activeNoteId ? lib.notesById.get(activeNoteId) ?? null : null;
  const activeBook = activeBookId ? lib.booksById.get(activeBookId) ?? null : null;

  const [draftTitle, setDraftTitle] = React.useState('');
  const [draftBody, setDraftBody] = React.useState('');

  React.useEffect(() => {
    if (tab === 'notes') {
      const n = activeNote;
      setDraftTitle(n?.title ?? '');
      setDraftBody(n?.body ?? '');
    } else if (tab === 'books') {
      const b = activeBook;
      setDraftTitle(b?.title ?? '');
      setDraftBody(b?.body ?? '');
    } else {
      setDraftTitle('');
      setDraftBody("gos {Rhello{B!{x");
    }
  }, [tab, activeNote, activeBook]);

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
  };

  const handleSave = async () => {
    if (tab === 'notes' && activeNote) {
      await lib.saveNote({ ...activeNote, title: draftTitle, body: draftBody });
    }
    if (tab === 'books' && activeBook) {
      await lib.saveBook({ ...activeBook, title: draftTitle, body: draftBody });
    }
  };

  const handleDelete = async () => {
    if (tab === 'notes' && activeNote) {
      await lib.deleteNote(activeNote.id);
      setActiveNoteId(null);
    }
    if (tab === 'books' && activeBook) {
      await lib.deleteBook(activeBook.id);
      setActiveBookId(null);
    }
  };

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.title}>Library</div>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.tabBar}>
          <button
            type="button"
            className={`${styles.tabButton} ${tab === 'notes' ? styles.tabButtonActive : ''}`}
            onClick={() => setTab('notes')}
          >
            Notes
          </button>
          <button
            type="button"
            className={`${styles.tabButton} ${tab === 'books' ? styles.tabButtonActive : ''}`}
            onClick={() => setTab('books')}
          >
            Books
          </button>
          <button
            type="button"
            className={`${styles.tabButton} ${tab === 'colors' ? styles.tabButtonActive : ''}`}
            onClick={() => setTab('colors')}
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
                        else setActiveBookId(item.id);
                      }}
                    >
                      <div className={styles.listItemTitle}>{item.title || '(untitled)'}</div>
                      <div className={styles.listItemMeta}>
                        {new Date(item.updatedAt).toLocaleString()}
                      </div>
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

                  <div className={styles.editorButtons}>
                    <button type="button" className={styles.secondaryButton} onClick={handleSave} disabled={!draftTitle && !draftBody}>
                      Save
                    </button>
                    <button type="button" className={styles.dangerButton} onClick={handleDelete} disabled={tab === 'notes' ? !activeNote : !activeBook}>
                      Delete
                    </button>
                  </div>
                </div>

                <div className={styles.editorGrid}>
                  <textarea
                    className={styles.textArea}
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    placeholder="Type text here. DSL colors: {r {G ... end with {x"
                  />

                  <div className={styles.previewPane}>
                    <div className={styles.previewTitle}>Preview</div>
                    <div
                      className={styles.previewBody}
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'colors' && (
            <div className={styles.colorsPane}>
              <div className={styles.colorsHint}>
                Use DSL color tokens like <code>{'{R'}</code>, <code>{'{b'}</code>, end with <code>{'{x'}</code>.
                Use <code>{'{{'}</code> to write a literal <code>{'{'}</code>.
              </div>

              <div className={styles.editorGrid}>
                <textarea
                  className={styles.textArea}
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                />
                <div className={styles.previewPane}>
                  <div className={styles.previewTitle}>Rendered ANSI Preview</div>
                  <div
                    className={styles.previewBody}
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
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
