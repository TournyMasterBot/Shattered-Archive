const DB_NAME = 'sa_audio_assets_v1';
const STORE = 'assets';
const DB_VERSION = 1;

type StoredAsset = {
  id: string;
  name: string;
  mime: string;
  blob: Blob;
  createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore, done: (v: T) => void, fail: (e: any) => void) => void) {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);

        fn(
          store,
          (v) => resolve(v),
          (e) => reject(e),
        );

        t.oncomplete = () => db.close();
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
      }),
  );
}

export async function saveAudioAsset(file: File): Promise<{ assetId: string; name: string; mime: string }> {
  const assetId = `aud_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const record: StoredAsset = {
    id: assetId,
    name: file.name || 'audio',
    mime: file.type || 'application/octet-stream',
    blob: file,
    createdAt: Date.now(),
  };

  await tx<void>('readwrite', (store, done, fail) => {
    const req = store.put(record);
    req.onsuccess = () => done(undefined);
    req.onerror = () => fail(req.error);
  });

  return { assetId, name: record.name, mime: record.mime };
}

export async function getAudioAssetBlob(assetId: string): Promise<Blob | null> {
  if (!assetId) return null;

  return tx<Blob | null>('readonly', (store, done, fail) => {
    const req = store.get(assetId);
    req.onsuccess = () => {
      const v = req.result as StoredAsset | undefined;
      done(v?.blob ?? null);
    };
    req.onerror = () => fail(req.error);
  });
}

export async function deleteAudioAsset(assetId: string): Promise<void> {
  if (!assetId) return;

  await tx<void>('readwrite', (store, done, fail) => {
    const req = store.delete(assetId);
    req.onsuccess = () => done(undefined);
    req.onerror = () => fail(req.error);
  });
}
