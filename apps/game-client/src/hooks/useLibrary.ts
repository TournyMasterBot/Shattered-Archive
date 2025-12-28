import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryBook, LibraryBookPage, LibraryNote, UserNote, NoteSpool } from '../features/library/library-types';
import {
  createBook,
  createNote,
  deleteBook,
  deleteNote,
  listBooks,
  listNotes,
  upsertBook,
  upsertNote,

  // ✅ Notes (new store)
  listUserNotes,
  createUserNote,
  upsertUserNote,
  deleteUserNote,
} from '../features/library/library-store';

function normalizeBookPages(pages: LibraryBookPage[] | undefined): LibraryBookPage[] {
  // ✅ IMPORTANT: allow empty pages to represent "all pages missing"
  return (
    (pages ?? [])
      .filter((x) => x && Number.isFinite(x.page))
      .map((x) => ({ page: Math.max(1, Math.floor(x.page)), body: x.body ?? '' }))
      .sort((a, b) => a.page - b.page) || []
  );
}

export function useLibrary(connectionId: string) {
  // Parchment (existing)
  const [notes, setNotes] = useState<LibraryNote[]>([]);
  const [books, setBooks] = useState<LibraryBook[]>([]);

  // Notes (new)
  const [userNotes, setUserNotes] = useState<UserNote[]>([]);

  const connRef = useRef(connectionId);
  useEffect(() => {
    connRef.current = connectionId;
  }, [connectionId]);

  const refresh = useCallback(async () => {
    const cid = connRef.current;

    const [n, b, un] = await Promise.all([listNotes(cid), listBooks(cid), listUserNotes(cid)]);

    setNotes(n);
    // ✅ no longer force a synthetic page 1 here
    setBooks(b.map((x) => ({ ...x, pages: normalizeBookPages(x.pages) })));
    setUserNotes(un);
  }, []);

  useEffect(() => {
    refresh();
  }, [connectionId, refresh]);

  // -----------------------------
  // Parchment actions (existing)
  // -----------------------------

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
      // ✅ allow empty pages
      await upsertBook({ ...book, pages: normalizeBookPages(book.pages) });
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

  // -----------------------------
  // Books page helpers (existing)
  // -----------------------------

  const setBookPageBody = useCallback(
    async (book: LibraryBook, page: number, body: string) => {
      const pages = normalizeBookPages(book.pages);
      const idx = pages.findIndex((p) => p.page === page);

      let nextPages: LibraryBookPage[];
      if (idx >= 0) {
        nextPages = pages.slice();
        nextPages[idx] = { page, body };
      } else {
        nextPages = pages.concat([{ page, body }]).sort((a, b) => a.page - b.page);
      }

      await saveBook({
        ...book,
        updatedAt: Date.now(),
        pages: nextPages,
      });
    },
    [saveBook],
  );

  const tearOutBookPage = useCallback(
    async (book: LibraryBook, page: number) => {
      const pages = normalizeBookPages(book.pages);
      const nextPages = pages.filter((p) => p.page !== page);

      // ✅ IMPORTANT: do NOT force page 1 back in.
      // Empty pages array means "everything is missing".
      await saveBook({
        ...book,
        updatedAt: Date.now(),
        pages: nextPages,
      });
    },
    [saveBook],
  );

  const addBookPage = useCallback(
    async (book: LibraryBook, page: number) => {
      const pages = normalizeBookPages(book.pages);
      if (pages.some((p) => p.page === page)) return;

      const nextPages = pages.concat([{ page, body: '' }]).sort((a, b) => a.page - b.page);

      await saveBook({
        ...book,
        updatedAt: Date.now(),
        pages: nextPages,
      });
    },
    [saveBook],
  );

  // -----------------------------
  // Notes (new store) actions
  // -----------------------------

  const createUserNoteAction = useCallback(
    async (spool: NoteSpool, subject?: string) => {
      const cid = connRef.current;
      const created = await createUserNote(cid, spool, subject ?? 'New Note');
      await refresh();
      return created;
    },
    [refresh],
  );

  const saveUserNote = useCallback(
    async (note: UserNote) => {
      await upsertUserNote(note);
      await refresh();
    },
    [refresh],
  );

  const deleteUserNoteAction = useCallback(
    async (id: string) => {
      await deleteUserNote(id);
      await refresh();
    },
    [refresh],
  );

  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const userNotesById = useMemo(() => new Map(userNotes.map((n) => [n.id, n])), [userNotes]);

  return {
    // parchment + books
    notes,
    books,
    notesById,
    booksById,

    // notes (new)
    userNotes,
    userNotesById,

    refresh,

    createNote: createNoteAction,
    createBook: createBookAction,
    saveNote,
    saveBook,
    deleteNote: deleteNoteAction,
    deleteBook: deleteBookAction,

    // Book page ops
    setBookPageBody,
    tearOutBookPage,
    addBookPage,

    // Notes (new)
    createUserNote: createUserNoteAction,
    saveUserNote,
    deleteUserNote: deleteUserNoteAction,
  };
}

export default useLibrary;
