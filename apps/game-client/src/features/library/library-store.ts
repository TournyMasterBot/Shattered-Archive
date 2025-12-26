import type { LibraryBook, LibraryNote } from './library-types';

const DB_NAME = 'shatteredArchive.library';
const DB_VERSION = 1;

const STORE_NOTES = 'notes';
const STORE_BOOKS = 'books';

function newId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_NOTES)) {
        const s = db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
        s.createIndex('by_connection', 'connectionId', { unique: false });
        s.createIndex('by_connection_updated', ['connectionId', 'updatedAt'], { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_BOOKS)) {
        const s = db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
        s.createIndex('by_connection', 'connectionId', { unique: false });
        s.createIndex('by_connection_updated', ['connectionId', 'updatedAt'], { unique: false });
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
  return getAllByConnection<LibraryBook>(STORE_BOOKS, connectionId);
}

export async function upsertNote(note: LibraryNote): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NOTES, 'readwrite');
  tx.objectStore(STORE_NOTES).put(note);
  await txDone(tx);
}

export async function upsertBook(book: LibraryBook): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_BOOKS, 'readwrite');
  tx.objectStore(STORE_BOOKS).put(book);
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
    body: '',
    createdAt: now,
    updatedAt: now,
  };
  await upsertBook(book);
  return book;
}
