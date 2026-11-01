import type { ScanInfo } from './messages';

/**
 * What "Fetch from scan" keeps on this computer, in IndexedDB: the connected folder, the files saved for
 * a form (at most one per upload field), and which scans were already used. The worker and the scan
 * window both use it. Saved files never leave this browser except into the website's upload field.
 */

export type SavedScan = ScanInfo & { blob: Blob };

const NAME = 'vf-scans';
const FOLDER = 'folder';
const SCANS = 'scans';
const USED = 'used';
/** How long a scan shows as Used: the folder itself keeps it for as long as the shop does. */
const USED_MS = 7 * 86_400_000;

let opened: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opened ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore(FOLDER);
      db.createObjectStore(SCANS, { keyPath: 'id' });
      db.createObjectStore(USED);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opened;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req ? req.result : (undefined as T));
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

/** One field keeps one file: saving again replaces it. */
export const scanId = (sessionCode: string, fieldKey: string) => `${sessionCode}:${fieldKey}`;

export const getFolder = <T>() => run<T | undefined>(FOLDER, 'readonly', (s) => s.get(FOLDER));
export const setFolder = (handle: unknown) => run(FOLDER, 'readwrite', (s) => void s.put(handle, FOLDER));

export const putScan = (scan: SavedScan) => run(SCANS, 'readwrite', (s) => void s.put(scan));
export const getScan = (id: string) => run<SavedScan | undefined>(SCANS, 'readonly', (s) => s.get(id));
export const deleteScan = (id: string) => run(SCANS, 'readwrite', (s) => void s.delete(id));
export const clearScans = () => run(SCANS, 'readwrite', (s) => void s.clear());

/** The saved scans, without their files. */
export async function listScans(): Promise<ScanInfo[]> {
  const all = await run<SavedScan[]>(SCANS, 'readonly', (s) => s.getAll());
  return all.map(({ blob: _blob, ...info }) => info);
}

export async function setScanStatus(id: string, status: ScanInfo['status'], reason: string | null) {
  await run(SCANS, 'readwrite', (s) => {
    const req = s.get(id);
    req.onsuccess = () => {
      if (req.result) s.put({ ...req.result, status, reason });
    };
  });
}

export async function deleteScans(match: (scan: ScanInfo) => boolean) {
  const gone = (await listScans()).filter(match);
  await Promise.all(gone.map((s) => deleteScan(s.id)));
}

export const markUsed = (keys: string[]) =>
  run(USED, 'readwrite', (s) => {
    for (const key of keys) s.put(Date.now(), key);
  });

/** Scans already saved to a form lately; older marks are dropped. */
export async function usedScans(): Promise<Set<string>> {
  const keys: string[] = [];
  await run(USED, 'readwrite', (s) => {
    const cursor = s.openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return;
      if (Date.now() - (c.value as number) > USED_MS) c.delete();
      else keys.push(String(c.key));
      c.continue();
    };
  });
  return new Set(keys);
}
