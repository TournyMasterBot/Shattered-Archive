// apps/game-client/src/features/library/library-store.ts

import type { LibraryBook, LibraryBookPage, LibraryNote, NoteSpool, UserNote } from './library-types';

const DB_NAME = 'shatteredArchive.library';
const DB_VERSION = 3;

const STORE_NOTES = 'notes'; // parchment (existing)
const STORE_BOOKS = 'books';
const STORE_USER_NOTES = 'user_notes'; // Notes tab

function newId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      const tx = req.transaction;

      if (!db.objectStoreNames.contains(STORE_USER_NOTES)) {
        const s = db.createObjectStore(STORE_USER_NOTES, { keyPath: 'id' });
        s.createIndex('by_connection', 'connectionId', { unique: false });
        s.createIndex('by_connection_updated', ['connectionId', 'updatedAt'], { unique: false });
        s.createIndex('by_connection_spool_updated', ['connectionId', 'spool', 'updatedAt'], { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_NOTES)) {
        const s = db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
        s.createIndex('by_connection', 'connectionId', { unique: false });
        s.createIndex('by_connection_updated', ['connectionId', 'updatedAt'], { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_BOOKS)) {
        const s = db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
        s.createIndex('by_connection', 'connectionId', { unique: false });
        s.createIndex('by_connection_updated', ['connectionId', 'updatedAt'], { unique: false });
      } else if (tx) {
        // Migration: v1 books had { body: string }. v2 books have { pages: [{page, body}] }.
        const store = tx.objectStore(STORE_BOOKS);

        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => {
          const rows = (getAllReq.result ?? []) as any[];

          for (const row of rows) {
            if (row && typeof row.body === 'string' && !Array.isArray(row.pages)) {
              const body = row.body ?? '';
              delete row.body;

              const pages: LibraryBookPage[] = [{ page: 1, body }];
              row.pages = pages;

              store.put(row);
            }

            // Normalize pages array if present but malformed
            if (row && Array.isArray(row.pages)) {
              row.pages = row.pages
                .filter((p: any) => p && Number.isFinite(p.page) && typeof p.body === 'string')
                .map((p: any) => ({ page: Math.max(1, Math.floor(p.page)), body: p.body ?? '' }))
                .sort((a: LibraryBookPage, b: LibraryBookPage) => a.page - b.page);

              store.put(row);
            }
          }
        };
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllByConnection<T>(storeName: string, connectionId: string): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const idx = store.index('by_connection');

  const req = idx.getAll(connectionId);
  const rows = await new Promise<T[]>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result ?? []) as T[]);
    req.onerror = () => reject(req.error);
  });

  await txDone(tx);

  // newest first (same UX expectation as plugins listing)
  (rows as any[]).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return rows;
}

export async function listNotes(connectionId: string): Promise<LibraryNote[]> {
  return getAllByConnection<LibraryNote>(STORE_NOTES, connectionId);
}

export async function listBooks(connectionId: string): Promise<LibraryBook[]> {
  const books = await getAllByConnection<LibraryBook>(STORE_BOOKS, connectionId);

  // Normalize + sort pages (defensive)
  for (const b of books as any[]) {
    if (!Array.isArray(b.pages)) b.pages = [{ page: 1, body: '' }];
    b.pages = (b.pages as any[])
      .filter((p) => p && Number.isFinite(p.page) && typeof p.body === 'string')
      .map((p) => ({ page: Math.max(1, Math.floor(p.page)), body: p.body ?? '' }))
      .sort((a: LibraryBookPage, c: LibraryBookPage) => a.page - c.page);

    if (b.pages.length === 0) b.pages = [{ page: 1, body: '' }];
  }

  return books;
}

export async function upsertNote(note: LibraryNote): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NOTES, 'readwrite');
  tx.objectStore(STORE_NOTES).put(note);
  await txDone(tx);
}

export async function upsertBook(book: LibraryBook): Promise<void> {
  const normalized: LibraryBook = {
    ...book,
    pages:
      (book.pages ?? [])
        .filter((p) => p && Number.isFinite(p.page))
        .map((p) => ({ page: Math.max(1, Math.floor(p.page)), body: p.body ?? '' }))
        .sort((a, b) => a.page - b.page) || [],
  };

  if (normalized.pages.length === 0) normalized.pages = [{ page: 1, body: '' }];

  const db = await openDb();
  const tx = db.transaction(STORE_BOOKS, 'readwrite');
  tx.objectStore(STORE_BOOKS).put(normalized);
  await txDone(tx);
}

export async function deleteNote(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NOTES, 'readwrite');
  tx.objectStore(STORE_NOTES).delete(id);
  await txDone(tx);
}

export async function deleteBook(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_BOOKS, 'readwrite');
  tx.objectStore(STORE_BOOKS).delete(id);
  await txDone(tx);
}

export async function createNote(connectionId: string, title: string): Promise<LibraryNote> {
  const now = Date.now();
  const note: LibraryNote = {
    id: newId(),
    connectionId,
    title,
    body: '',
    createdAt: now,
    updatedAt: now,
  };
  await upsertNote(note);
  return note;
}

export async function createBook(connectionId: string, title: string): Promise<LibraryBook> {
  const now = Date.now();
  const book: LibraryBook = {
    id: newId(),
    connectionId,
    title,
    pages: [{ page: 1, body: '' }],
    createdAt: now,
    updatedAt: now,
  };
  await upsertBook(book);
  return book;
}

export async function listParchment(connectionId: string): Promise<LibraryNote[]> {
  return listNotes(connectionId);
}

export async function upsertParchment(note: LibraryNote): Promise<void> {
  return upsertNote(note);
}

export async function deleteParchment(id: string): Promise<void> {
  return deleteNote(id);
}

export async function createParchment(connectionId: string, title: string): Promise<LibraryNote> {
  return createNote(connectionId, title);
}

export async function listUserNotes(connectionId: string): Promise<UserNote[]> {
  return getAllByConnection<UserNote>(STORE_USER_NOTES, connectionId);
}

export async function upsertUserNote(note: UserNote): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_USER_NOTES, 'readwrite');
  tx.objectStore(STORE_USER_NOTES).put(note);
  await txDone(tx);
}

export async function deleteUserNote(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_USER_NOTES, 'readwrite');
  tx.objectStore(STORE_USER_NOTES).delete(id);
  await txDone(tx);
}

export async function createUserNote(connectionId: string, spool: NoteSpool, subject: string): Promise<UserNote> {
  const now = Date.now();
  const note: UserNote = {
    id: newId(),
    connectionId,
    spool,
    subject,
    body: '',
    createdAt: now,
    updatedAt: now,
  };
  await upsertUserNote(note);
  return note;
}
