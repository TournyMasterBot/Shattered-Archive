// apps\game-client\src\features\library\librarySync.ts
// Phase E: whole-collection-feeling Save/Load over LibraryController's item-level
// `library/my-writings/*` endpoints — same manual-button UX as scripts/plugin-config sync
// (useAccountModal.ts), but each call diffs+upserts/deletes per item rather than PUTting
// one giant array, since Library content is item-per-row server-side (see cloudSync.ts).
import type { LibraryNote, UserNote, LibraryBook } from './library-types';
import { listNotes, upsertNote, listUserNotes, upsertUserNote, listBooks, upsertBook } from './library-store';
import * as cloudSync from '../auth/cloudSync';

export type LibrarySyncOutcome<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'unauthenticated' }
  | { kind: 'error'; message: string };

export interface LibrarySaveSummary {
  parchment: number;
  notes: number;
  books: number;
}

export interface LibraryLoadSummary {
  parchment: number;
  notes: number;
  books: number;
}

type HasId = { id: string; connectionId?: string };

/**
 * Upserts every local item to the cloud, then deletes cloud rows that belong to THIS
 * connection but no longer exist locally. Never touches a row owned by another
 * connection or with no connectionId (mobile / the My-Writings web editor) — the
 * connectionId-scoping rule that avoids the whole-blob scripts sync's clobber bug
 * (handleSaveToCloud there PUTs the current connection's scripts as the entire cloud
 * array, silently dropping every other connection's saved scripts).
 */
async function pushType<T extends HasId>(
  connectionId: string,
  local: T[],
  loadCloud: () => Promise<cloudSync.CloudSyncResult<HasId[]>>,
  upsertCloud: (item: T) => Promise<cloudSync.CloudSyncResult<{ id: string }>>,
  deleteCloud: (id: string) => Promise<cloudSync.CloudSyncResult<void>>,
): Promise<LibrarySyncOutcome<number>> {
  const cloudResult = await loadCloud();
  if (cloudResult.kind !== 'ok') return cloudResult;

  const localIds = new Set(local.map((item) => item.id));
  const staleCloudIds = cloudResult.data
    .filter((item) => item.connectionId === connectionId && !localIds.has(item.id))
    .map((item) => item.id);

  for (const item of local) {
    const result = await upsertCloud(item);
    if (result.kind !== 'ok') return result;
  }
  for (const id of staleCloudIds) {
    const result = await deleteCloud(id);
    if (result.kind !== 'ok') return result;
  }

  return { kind: 'ok', data: local.length };
}

/**
 * Downloads every cloud item that belongs to THIS connection or to no connection at all
 * (mobile / My-Writings-web-page items are connection-less and therefore visible to
 * every connection), and upserts it into local storage under this connectionId. A
 * universal item loaded this way becomes, from this connection's perspective, a normal
 * local item — a later Save from THIS connection re-PUTs it with connectionId set,
 * which is an accepted simplification (see the plan doc's progress log) rather than a
 * full CRDT-style merge, consistent with the rest of this manual, last-write-wins sync.
 */
async function pullType<TCloud extends HasId, TLocal extends TCloud>(
  connectionId: string,
  loadCloud: () => Promise<cloudSync.CloudSyncResult<TCloud[]>>,
  upsertLocal: (item: TLocal) => Promise<void>,
): Promise<LibrarySyncOutcome<number>> {
  const cloudResult = await loadCloud();
  if (cloudResult.kind !== 'ok') return cloudResult;

  const relevant = cloudResult.data.filter((item) => !item.connectionId || item.connectionId === connectionId);
  for (const item of relevant) {
    await upsertLocal({ ...item, connectionId } as TLocal);
  }
  return { kind: 'ok', data: relevant.length };
}

export async function saveLibraryToCloud(connectionId: string): Promise<LibrarySyncOutcome<LibrarySaveSummary>> {
  const [parchment, userNotes, books] = await Promise.all([
    listNotes(connectionId),
    listUserNotes(connectionId),
    listBooks(connectionId),
  ]);

  const parchmentResult = await pushType(
    connectionId,
    parchment,
    cloudSync.loadParchmentCloud,
    cloudSync.upsertParchmentCloud,
    cloudSync.deleteParchmentCloud,
  );
  if (parchmentResult.kind !== 'ok') return parchmentResult;

  const notesResult = await pushType(
    connectionId,
    userNotes,
    cloudSync.loadUserNotesCloud,
    cloudSync.upsertUserNoteCloud,
    cloudSync.deleteUserNoteCloud,
  );
  if (notesResult.kind !== 'ok') return notesResult;

  const booksResult = await pushType(
    connectionId,
    books,
    cloudSync.loadLibraryBooksCloud,
    cloudSync.upsertLibraryBookCloud,
    cloudSync.deleteLibraryBookCloud,
  );
  if (booksResult.kind !== 'ok') return booksResult;

  return {
    kind: 'ok',
    data: { parchment: parchmentResult.data, notes: notesResult.data, books: booksResult.data },
  };
}

export async function loadLibraryFromCloud(connectionId: string): Promise<LibrarySyncOutcome<LibraryLoadSummary>> {
  const parchmentResult = await pullType<cloudSync.CloudLibraryNote, LibraryNote>(
    connectionId,
    cloudSync.loadParchmentCloud,
    upsertNote,
  );
  if (parchmentResult.kind !== 'ok') return parchmentResult;

  const notesResult = await pullType<cloudSync.CloudUserNote, UserNote>(
    connectionId,
    cloudSync.loadUserNotesCloud,
    upsertUserNote,
  );
  if (notesResult.kind !== 'ok') return notesResult;

  const booksResult = await pullType<cloudSync.CloudLibraryBook, LibraryBook>(
    connectionId,
    cloudSync.loadLibraryBooksCloud,
    upsertBook,
  );
  if (booksResult.kind !== 'ok') return booksResult;

  return {
    kind: 'ok',
    data: { parchment: parchmentResult.data, notes: notesResult.data, books: booksResult.data },
  };
}
