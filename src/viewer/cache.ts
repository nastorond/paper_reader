// 폰 뷰어의 번들 캐시(IndexedDB). 마지막으로 읽은 번들을 보관해 오프라인·앱 재시작 때 바로 보여준다.
const DB = "paperboard-viewer";
const STORE = "bundle";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface CachedBundle {
  data: Uint8Array;
  readAt: string; // ISO
}

export async function loadCachedBundle(): Promise<CachedBundle | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get("latest");
    req.onsuccess = () => resolve((req.result as CachedBundle | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCachedBundle(c: CachedBundle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(c, "latest");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// 고른 번들 파일의 주소(Android content:// URI). 새로고침 때 다시 읽는다.
const URI_KEY = "paperboard.bundleUri";
export function savedBundleUri(): string | null {
  try {
    return localStorage.getItem(URI_KEY);
  } catch {
    return null;
  }
}
export function saveBundleUri(uri: string): void {
  try {
    localStorage.setItem(URI_KEY, uri);
  } catch {
    /* 저장 실패는 무시: 다음에 다시 고르면 된다 */
  }
}
