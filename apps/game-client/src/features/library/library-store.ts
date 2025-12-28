import type { LibraryBook, LibraryBookPage, LibraryNote, NoteSpool, UserNote } from './library-types';

const DB_NAME = 'shatteredArchive.library';
const DB_VERSION = 4;

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
        // Migrations / normalization
        const store = tx.objectStore(STORE_BOOKS);

        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => {
          const rows = (getAllReq.result ?? []) as any[];

          for (const row of rows) {
            if (!row) continue;

            // v1 -> v2: { body } -> { pages }
            if (typeof row.body === 'string' && !Array.isArray(row.pages)) {
              const body = row.body ?? '';
              delete row.body;
              row.pages = [{ page: 1, body }];
            }

            // Normalize pages if present, but allow empty pages
            if (Array.isArray(row.pages)) {
              row.pages = row.pages
                .filter((p: any) => p && Number.isFinite(p.page))
                .map((p: any) => ({ page: Math.max(1, Math.floor(p.page)), body: p.body ?? '' }))
                .sort((a: LibraryBookPage, b: LibraryBookPage) => a.page - b.page);
            } else {
              // If missing entirely, treat as empty (all pages missing)
              row.pages = [];
            }

            // v4: keywords for scribing
            const title = typeof row.title === 'string' ? row.title : '';
            if (typeof row.keyword !== 'string') row.keyword = title;
            if (typeof row.keywordAfterTitle !== 'string') row.keywordAfterTitle = row.keyword;

            store.put(row);
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

  (rows as any[]).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return rows;
}

export async function listNotes(connectionId: string): Promise<LibraryNote[]> {
  return getAllByConnection<LibraryNote>(STORE_NOTES, connectionId);
}

export async function listBooks(connectionId: string): Promise<LibraryBook[]> {
  const books = await getAllByConnection<LibraryBook>(STORE_BOOKS, connectionId);

  // Normalize + sort pages + keyword fields (defensive), allow empty pages
  for (const b of books as any[]) {
    if (!Array.isArray(b.pages)) b.pages = [];
    b.pages = (b.pages as any[])
      .filter((p) => p && Number.isFinite(p.page))
      .map((p) => ({ page: Math.max(1, Math.floor(p.page)), body: p.body ?? '' }))
      .sort((a: LibraryBookPage, c: LibraryBookPage) => a.page - c.page);

    if (typeof b.keyword !== 'string') b.keyword = b.title ?? '';
    if (typeof b.keywordAfterTitle !== 'string') b.keywordAfterTitle = b.keyword;
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
  const title = book.title ?? '';
  const keyword = typeof (book as any).keyword === 'string' ? (book as any).keyword : title;
  const keywordAfterTitle =
    typeof (book as any).keywordAfterTitle === 'string' ? (book as any).keywordAfterTitle : keyword;

  const normalized: LibraryBook = {
    ...book,
    title,
    keyword,
    keywordAfterTitle,
    pages:
      (book.pages ?? [])
        .filter((p) => p && Number.isFinite(p.page))
        .map((p) => ({ page: Math.max(1, Math.floor(p.page)), body: p.body ?? '' }))
        .sort((a, b) => a.page - b.page) || [],
  };

  // ✅ IMPORTANT: allow empty pages; do NOT force [{page:1,...}]
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
    keyword: title,
    keywordAfterTitle: title,
    // Keep initial page 1 for new books (your existing UX),
    // but you can tear it out and still show "(missing)" afterwards.
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
