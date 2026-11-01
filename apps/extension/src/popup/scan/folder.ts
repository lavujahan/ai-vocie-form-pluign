import { getFolder, setFolder } from '../../scans-db';

/**
 * The folder the scanner saves to. Read-only: the extension can't change or delete anything in it. Chrome
 * keeps the folder between visits but may ask for permission again, which takes a click (Reconnect).
 */

type Permission = { mode: 'read' };
export type DirHandle = FileSystemDirectoryHandle & {
  entries(): AsyncIterable<[string, FileSystemHandle]>;
  queryPermission(p: Permission): Promise<PermissionState>;
  requestPermission(p: Permission): Promise<PermissionState>;
};
declare global {
  interface Window {
    showDirectoryPicker?(options: { id?: string; mode?: 'read'; startIn?: string }): Promise<DirHandle>;
  }
}

export type FolderFile = { path: string; name: string; size: number; modified: number; handle?: FileSystemFileHandle };

/** A file listed in the scan window. `key` tells one scan from a later file with the same name. */
export type ScanFile = FolderFile & { key: string; pdf: boolean };

export const NOT_ALLOWED =
  "Chrome doesn't allow this folder. Make a folder just for scans, such as D:\\Scans, and set your scanner to save there.";

const IMAGE = ['jpg', 'jpeg', 'png', 'bmp', 'webp'];
/** Scanner apps often make a folder per day. */
const DEPTH = 2;
const HOUR_MS = 3_600_000;
const NEWEST = 30;

const extOf = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase();
/** A file being written, or a system file. */
const isTemp = (name: string) => /^[.~]/.test(name) || !name.includes('.');

/** What a file is to the scan window; null for anything it ignores (temp files, other types). */
export function kindOf(name: string): 'image' | 'pdf' | 'tiff' | null {
  if (isTemp(name)) return null;
  const ext = extOf(name);
  if (IMAGE.includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  return ext === 'tif' || ext === 'tiff' ? 'tiff' : null;
}

export type Listing = {
  scans: ScanFile[];
  /** Still being written by the scanner: their size changed since the last look. */
  settling: number;
  /** Chrome can't open these. */
  tiff: number;
};

/**
 * What to show from a look at the folder. A file counts once its size is the same as at the last look
 * (`sizes`, by path), so a scan still being written isn't opened half done. Only recent files are shown:
 * the folder also holds other customers' papers.
 */
export function listScans(files: FolderFile[], sizes: Map<string, number>, { now, older = false }: { now: number; older?: boolean }): Listing {
  const out: Listing = { scans: [], settling: 0, tiff: 0 };
  const recent = files.filter((f) => older || now - f.modified < HOUR_MS).sort((a, b) => b.modified - a.modified);
  for (const f of recent) {
    const kind = kindOf(f.name);
    if (!kind) continue;
    if (kind === 'tiff') out.tiff++;
    else if (f.size > 0 && sizes.get(f.path) === f.size) out.scans.push({ ...f, key: `${f.path}|${f.size}|${f.modified}`, pdf: kind === 'pdf' });
    else out.settling++;
  }
  out.scans = out.scans.slice(0, older ? NEWEST * 2 : NEWEST);
  return out;
}

/** The files of the folder and its subfolders that the scan window could use. */
export async function readFolder(dir: DirHandle, depth = DEPTH, prefix = ''): Promise<FolderFile[]> {
  const out: FolderFile[] = [];
  for await (const [name, entry] of dir.entries()) {
    const path = prefix + name;
    if (entry.kind === 'directory') {
      if (depth > 1) out.push(...(await readFolder(entry as DirHandle, depth - 1, `${path}/`)));
      continue;
    }
    if (!kindOf(name)) continue;
    try {
      const handle = entry as FileSystemFileHandle;
      const file = await handle.getFile();
      out.push({ path, name, size: file.size, modified: file.lastModified, handle });
    } catch {
      // The scanner still holds this file: it is listed on a later look.
    }
  }
  return out;
}

export type FolderState = { status: 'loading' | 'none' } | { status: 'connected' | 'reconnect'; dir: DirHandle };

export async function loadFolder(): Promise<FolderState> {
  const dir = await getFolder<DirHandle>();
  if (!dir) return { status: 'none' };
  return { status: (await dir.queryPermission({ mode: 'read' })) === 'granted' ? 'connected' : 'reconnect', dir };
}

/** Asks the operator to choose the folder (needs a click). Null: they closed the dialog. */
export async function connectFolder(): Promise<FolderState | null> {
  if (!window.showDirectoryPicker) throw new Error("This browser can't open a folder. Use Google Chrome.");
  try {
    const dir = await window.showDirectoryPicker({ id: 'vf-scans', mode: 'read' });
    await setFolder(dir);
    return { status: 'connected', dir };
  } catch (e) {
    if ((e as Error).name === 'AbortError') return null;
    throw new Error(NOT_ALLOWED);
  }
}

/** Chrome asks again for the saved folder (needs a click). */
export async function reconnectFolder(dir: DirHandle): Promise<FolderState> {
  return { status: (await dir.requestPermission({ mode: 'read' })) === 'granted' ? 'connected' : 'reconnect', dir };
}
