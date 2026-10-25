import type { SaveFile } from '@cx/host';

/**
 * Saved games in the browser (IndexedDB: room for many saves, unlike localStorage). Each record
 * is a whole `SaveFile`; listing reads only the small fields. One slot, `autosave`, is rewritten
 * at the start of every turn.
 */

const DB = 'civius-maximus';
const STORE = 'saves';
export const AUTOSAVE = 'autosave';
/** The autosave of the online game this browser hosts (resumed online, not as hotseat). */
export const ONLINE_AUTOSAVE = 'autosave-online';

export interface SaveSummary {
  id: string;
  name: string;
  savedAt: string;
  turn: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open saved games'));
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = body(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error('Saved games failed'));
      tx.onabort = () => reject(tx.error ?? new Error('Saved games failed'));
    });
  } finally {
    db.close();
  }
}

export async function listSaves(): Promise<SaveSummary[]> {
  const all = await run('readonly', (s) => s.getAll() as IDBRequest<(SaveFile & { id: string })[]>);
  return all
    .map(({ id, name, savedAt, turn }) => ({ id, name, savedAt, turn }))
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

export async function storeSave(id: string, save: SaveFile): Promise<void> {
  await run('readwrite', (s) => s.put({ ...save, id }));
}

export async function loadSave(id: string): Promise<SaveFile | undefined> {
  const rec = await run(
    'readonly',
    (s) => s.get(id) as IDBRequest<(SaveFile & { id: string }) | undefined>,
  );
  if (!rec) return undefined;
  const { id: _id, ...save } = rec;
  void _id;
  return save;
}

export async function deleteSave(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
}

/** Offers a save as a file download. */
export function downloadSave(save: SaveFile) {
  const blob = new Blob([JSON.stringify(save)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${save.name.replace(/[^\w -]+/g, '').trim() || 'game'} - turn ${save.turn}.civius.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
