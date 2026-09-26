const DB_NAME = "ledger-offer-letters";
const STORE = "files";
const DB_VERSION = 2;

export interface StoredOfferLetter {
  employeeId: string;
  fileName: string;
  mimeType: string;
  uploadedAt: string;
  blob: Blob;
}

/** Scopes the row to the signed-in owner, matching localStorage.ts's per-user keying. */
function rowId(ownerId: string | null, employeeId: string): string {
  return `${ownerId ?? "local"}:${employeeId}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      // v1 keyed rows by bare employeeId with no owner scoping. Rows here are
      // a local cache only (cloud storage / the roster backfill is the source
      // of truth), so dropping them on upgrade is simpler than migrating keys.
      if (db.objectStoreNames.contains(STORE)) {
        db.deleteObjectStore(STORE);
      }
      db.createObjectStore(STORE, { keyPath: "id" });
    };
  });
}

export async function saveOfferLetterFile(
  record: StoredOfferLetter,
  ownerId: string | null
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put({ ...record, id: rowId(ownerId, record.employeeId) });
  });
}

export async function getOfferLetterFile(
  employeeId: string,
  ownerId: string | null
): Promise<StoredOfferLetter | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(rowId(ownerId, employeeId));
    req.onsuccess = () => {
      db.close();
      resolve((req.result as StoredOfferLetter | undefined) ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteOfferLetterFile(
  employeeId: string,
  ownerId: string | null
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(rowId(ownerId, employeeId));
  });
}
