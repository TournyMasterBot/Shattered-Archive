import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LibraryBook, LibraryNote } from '../features/library/library-types';
import { createBook, createNote, deleteBook, deleteNote, listBooks, listNotes, upsertBook, upsertNote } from '../features/library/library-store';
export function useLibrary(connectionId: string) {
  const [notes, setNotes] = useState<LibraryNote[]>([]);
  const [books, setBooks] = useState<LibraryBook[]>([]);

  const connRef = useRef(connectionId);
  useEffect(() => {
    connRef.current = connectionId;
  }, [connectionId]);

  const refresh = useCallback(async () => {
    const cid = connRef.current;
    const [n, b] = await Promise.all([listNotes(cid), listBooks(cid)]);
    setNotes(n);
    setBooks(b);
  }, []);

  useEffect(() => {
    refresh();
  }, [connectionId, refresh]);

  const createNoteAction = useCallback(
    async (title?: string) => {
      const cid = connRef.current;
      const created = await createNote(cid, title ?? 'New Note');
      await refresh();
      return created;
    },
    [refresh],
  );

  const createBookAction = useCallback(
    async (title?: string) => {
      const cid = connRef.current;
      const created = await createBook(cid, title ?? 'New Book');
      await refresh();
      return created;
    },
    [refresh],
  );

  const saveNote = useCallback(
    async (note: LibraryNote) => {
      await upsertNote(note);
      await refresh();
    },
    [refresh],
  );

  const saveBook = useCallback(
    async (book: LibraryBook) => {
      await upsertBook(book);
      await refresh();
    },
    [refresh],
  );

  const deleteNoteAction = useCallback(
    async (id: string) => {
      await deleteNote(id);
      await refresh();
    },
    [refresh],
  );

  const deleteBookAction = useCallback(
    async (id: string) => {
      await deleteBook(id);
      await refresh();
    },
    [refresh],
  );

  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  return {
    notes,
    books,
    notesById,
    booksById,

    refresh,
    createNote: createNoteAction,
    createBook: createBookAction,
    saveNote,
    saveBook,
    deleteNote: deleteNoteAction,
    deleteBook: deleteBookAction,
  };
}

export default useLibrary;
