const DB_NAME = "ledger-offer-letters";
const STORE = "files";
const DB_VERSION = 1;

export interface StoredOfferLetter {
  employeeId: string;
  fileName: string;
  mimeType: string;
  uploadedAt: string;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "employeeId" });
      }
    };
  });
}

export async function saveOfferLetterFile(record: StoredOfferLetter): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(record);
  });
}

export async function getOfferLetterFile(employeeId: string): Promise<StoredOfferLetter | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(employeeId);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as StoredOfferLetter | undefined) ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteOfferLetterFile(employeeId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(employeeId);
  });
}
