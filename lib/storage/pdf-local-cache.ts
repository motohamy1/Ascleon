/**
 * Local IndexedDB cache for PDF documents and pre-warmed study space assets.
 * Eliminates redundant network downloads and allows <100ms instant opening in Study Space.
 */

const DB_NAME = "ascleon_pdf_cache_db";
const STORE_NAME = "pdf_documents";
const DB_VERSION = 1;

interface CachedPdfRecord {
  urlOrKey: string;
  data: ArrayBuffer;
  cachedAt: number;
  sizeBytes: number;
}

function openCacheDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "urlOrKey" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Stores a PDF ArrayBuffer in IndexedDB
 */
export async function cachePdfBuffer(urlOrKey: string, buffer: ArrayBuffer): Promise<void> {
  try {
    const db = await openCacheDatabase();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const record: CachedPdfRecord = {
      urlOrKey,
      data: buffer,
      cachedAt: Date.now(),
      sizeBytes: buffer.byteLength,
    };

    await new Promise<void>((resolve, reject) => {
      const putReq = store.put(record);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    });
  } catch (err) {
    console.warn("Failed to cache PDF buffer to IndexedDB:", err);
  }
}

/**
 * Retrieves a cached PDF ArrayBuffer from IndexedDB
 */
export async function getCachedPdfBuffer(urlOrKey: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openCacheDatabase();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    const record = await new Promise<CachedPdfRecord | null>((resolve, reject) => {
      const getReq = store.get(urlOrKey);
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => reject(getReq.error);
    });

    return record ? record.data : null;
  } catch (err) {
    console.warn("Failed to get cached PDF buffer from IndexedDB:", err);
    return null;
  }
}

/**
 * Checks if a PDF is already cached
 */
export async function hasCachedPdf(urlOrKey: string): Promise<boolean> {
  const buf = await getCachedPdfBuffer(urlOrKey);
  return buf !== null;
}
