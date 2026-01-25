// apps\game-client\src\features\library\library-store.ts
import type { LibraryBook, LibraryBookPage, LibraryNote, NoteSpool, UserNote } from './library-types';

const DB_NAME = 'shatteredArchive.library';
const DB_VERSION = 4;

const STORE_NOTES = 'notes'; // parchment (existing)
const STORE_BOOKS = 'books';
const STORE_USER_NOTES = 'user_notes'; // Notes tab

type HasUpdatedAt = { updatedAt?: number };

function newId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function normalizePages(input: unknown): LibraryBookPage[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((p): p is Record<string, unknown> => isRecord(p) && Number.isFinite(p.page))
    .map((p) => ({
      page: Math.max(1, Math.floor(Number(p.page))),
      body: typeof p.body === 'string' ? p.body : '',
    }))
    .sort((a, b) => a.page - b.page);
}

function normalizeKeywords(row: Record<string, unknown>, fallbackTitle: string) {
  const title = typeof row.title === 'string' ? row.title : fallbackTitle;

  const keyword = typeof row.keyword === 'string' ? row.keyword : title;
  const keywordAfterTitle = typeof row.keywordAfterTitle === 'string' ? row.keywordAfterTitle : keyword;

  return { title, keyword, keywordAfterTitle };
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
        s.createIndex('by_connection_updated', ['connectionId', 'updatedAt'], {
          unique: false,
        });
        s.createIndex('by_connection_spool_updated', ['connectionId', 'spool', 'updatedAt'], { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_NOTES)) {
        const s = db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
        s.createIndex('by_connection', 'connectionId', { unique: false });
        s.createIndex('by_connection_updated', ['connectionId', 'updatedAt'], {
          unique: false,
        });
      }

      if (!db.objectStoreNames.contains(STORE_BOOKS)) {
        const s = db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
        s.createIndex('by_connection', 'connectionId', { unique: false });
        s.createIndex('by_connection_updated', ['connectionId', 'updatedAt'], {
          unique: false,
        });
      } else if (tx) {
        // Migrations / normalization
        const store = tx.objectStore(STORE_BOOKS);
        const getAllReq = store.getAll();

        getAllReq.onsuccess = () => {
          const rows = (getAllReq.result ?? []) as unknown[];

          for (const raw of rows) {
            if (!isRecord(raw)) continue;

            // v1 → v2: { body } → { pages }
            if (typeof raw.body === 'string' && !Array.isArray(raw.pages)) {
              const body = raw.body;
              delete raw.body;
              raw.pages = [{ page: 1, body }];
            }

            // Normalize pages (allow empty)
            raw.pages = normalizePages(raw.pages);

            // v4: keywords for scribing
            const { title, keyword, keywordAfterTitle } = normalizeKeywords(raw, '');

            raw.title = title;
            raw.keyword = keyword;
            raw.keywordAfterTitle = keywordAfterTitle;

            store.put(raw);
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

async function getAllByConnection<T extends HasUpdatedAt>(storeName: string, connectionId: string): Promise<T[]> {
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

  rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return rows;
}

/* ---------------- Notes / Parchment ---------------- */

export async function listNotes(connectionId: string): Promise<LibraryNote[]> {
  return getAllByConnection<LibraryNote>(STORE_NOTES, connectionId);
}

export async function upsertNote(note: LibraryNote): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NOTES, 'readwrite');
  tx.objectStore(STORE_NOTES).put(note);
  await txDone(tx);
}

export async function deleteNote(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NOTES, 'readwrite');
  tx.objectStore(STORE_NOTES).delete(id);
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

/* ---------------- Books ---------------- */

export async function listBooks(connectionId: string): Promise<LibraryBook[]> {
  const books = await getAllByConnection<LibraryBook>(STORE_BOOKS, connectionId);

  for (const b of books) {
    b.pages = normalizePages(b.pages);

    const keyword = typeof b.keyword === 'string' ? b.keyword : (b.title ?? '');
    const keywordAfterTitle = typeof b.keywordAfterTitle === 'string' ? b.keywordAfterTitle : keyword;

    b.keyword = keyword;
    b.keywordAfterTitle = keywordAfterTitle;
  }

  return books;
}

export async function upsertBook(book: LibraryBook): Promise<void> {
  const title = book.title ?? '';
  const keyword = typeof book.keyword === 'string' ? book.keyword : title;
  const keywordAfterTitle = typeof book.keywordAfterTitle === 'string' ? book.keywordAfterTitle : keyword;

  const normalized: LibraryBook = {
    ...book,
    title,
    keyword,
    keywordAfterTitle,
    pages: normalizePages(book.pages),
  };

  const db = await openDb();
  const tx = db.transaction(STORE_BOOKS, 'readwrite');
  tx.objectStore(STORE_BOOKS).put(normalized);
  await txDone(tx);
}

export async function deleteBook(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_BOOKS, 'readwrite');
  tx.objectStore(STORE_BOOKS).delete(id);
  await txDone(tx);
}

export async function createBook(connectionId: string, title: string): Promise<LibraryBook> {
  const now = Date.now();
  const book: LibraryBook = {
    id: newId(),
    connectionId,
    title,
    keyword: title,
    keywordAfterTitle: title,
    pages: [{ page: 1, body: '' }],
    createdAt: now,
    updatedAt: now,
  };
  await upsertBook(book);
  return book;
}

/* ---------------- Aliases ---------------- */

export const listParchment = listNotes;
export const upsertParchment = upsertNote;
export const deleteParchment = deleteNote;
export const createParchment = createNote;

/* ---------------- User Notes ---------------- */

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
