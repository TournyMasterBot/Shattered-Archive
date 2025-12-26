// apps/game-client/src/hooks/useLibrary.ts

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryBook, LibraryBookPage, LibraryNote } from '../features/library/library-types';
import {
  createBook,
  createNote,
  deleteBook,
  deleteNote,
  listBooks,
  listNotes,
  upsertBook,
  upsertNote,
} from '../features/library/library-store';

function normalizeBookPages(pages: LibraryBookPage[] | undefined): LibraryBookPage[] {
  const p =
    (pages ?? [])
      .filter((x) => x && Number.isFinite(x.page))
      .map((x) => ({ page: Math.max(1, Math.floor(x.page)), body: x.body ?? '' }))
      .sort((a, b) => a.page - b.page) || [];

  return p.length > 0 ? p : [{ page: 1, body: '' }];
}

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
    setBooks(b.map((x) => ({ ...x, pages: normalizeBookPages(x.pages) })));
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

  // Book page helpers (end-to-end actions)
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

      // If they tear out the last remaining page, keep page 1 as empty so the book stays editable
      const safePages = nextPages.length > 0 ? nextPages : [{ page: 1, body: '' }];

      await saveBook({
        ...book,
        updatedAt: Date.now(),
        pages: safePages,
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

    // Book page ops
    setBookPageBody,
    tearOutBookPage,
    addBookPage,
  };
}

export default useLibrary;
