/**
 * Check-ins and photos waiting on the phone for signal (Today tab). Kept in
 * IndexedDB so photos fit and survive closing the page; sent oldest first so
 * a check-out never arrives before its check-in or photos. Falls back to
 * memory if this browser blocks storage. Browser only.
 */

export type Tap = {
  action: "in" | "out";
  jobKey: string;
  crewCount: number | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  tappedAt: string;
};

export type QueuedPhoto = {
  jobKey: string;
  kind: "before" | "after";
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  takenAt: string;
  blob: Blob;
};

export type QueueItem = { id: number; token: string; createdAt: number } & ({ type: "tap"; tap: Tap } | { type: "photo"; photo: QueuedPhoto });
type NewItem = { type: "tap"; tap: Tap } | { type: "photo"; photo: QueuedPhoto };

const DB_NAME = "sueep-sub";
const STORE = "queue";
/** The server takes a queued item's own time for this long (subCheckIns.ts tapTime); older ones are dropped */
export const QUEUE_MAX_AGE_MS = 2 * 3_600_000;

let memory: QueueItem[] = [];
// Negative so they never match an IndexedDB id
let memoryId = -1;
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function addToQueue(token: string, item: NewItem): Promise<void> {
  const row = { ...item, token, createdAt: Date.now() };
  const db = await openDb();
  if (db) {
    try {
      await run(db, "readwrite", (s) => s.add(row));
      return;
    } catch {
      // fall through to memory
    }
  }
  memory.push({ ...row, id: memoryId-- } as QueueItem);
}

/** This link's waiting items, oldest first. Too-old ones are removed. */
export async function readQueue(token: string): Promise<QueueItem[]> {
  const db = await openDb();
  let all: QueueItem[] = memory;
  if (db) {
    try {
      all = [...(await run<QueueItem[]>(db, "readonly", (s) => s.getAll() as IDBRequest<QueueItem[]>)), ...memory];
    } catch {
      all = memory;
    }
  }
  const mine = all.filter((i) => i.token === token).sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  const stale = mine.filter((i) => Date.now() - i.createdAt > QUEUE_MAX_AGE_MS);
  for (const i of stale) await removeFromQueue(i.id);
  return mine.filter((i) => !stale.includes(i));
}

export async function removeFromQueue(id: number): Promise<void> {
  if (memory.some((i) => i.id === id)) {
    memory = memory.filter((i) => i.id !== id);
    return;
  }
  const db = await openDb();
  if (!db) return;
  try {
    await run(db, "readwrite", (s) => s.delete(id));
  } catch {
    // already gone
  }
}
