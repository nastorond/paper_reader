// 폰 뷰어 저장소.
// - IndexedDB: 마지막으로 읽은 번들(오프라인·재시작 때 바로 보여주기), 한 번 연 PDF 원문
// - localStorage: 번들을 어디서 읽는지(폴더 연결 또는 파일 하나)
const DB = "paperboard-viewer";
const BUNDLE_STORE = "bundle";
const PDF_STORE = "pdfs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2); // v2: PDF 원문 저장소 추가
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BUNDLE_STORE)) db.createObjectStore(BUNDLE_STORE);
      if (!db.objectStoreNames.contains(PDF_STORE)) db.createObjectStore(PDF_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function get<T>(store: string, key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function put(store: string, key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface CachedBundle {
  data: Uint8Array;
  readAt: string; // ISO
}

export const loadCachedBundle = () => get<CachedBundle>(BUNDLE_STORE, "latest");
export const saveCachedBundle = (c: CachedBundle) => put(BUNDLE_STORE, "latest", c);

// PDF 원문(문서 id = 내용 해시라 내용이 바뀌지 않는다)
export const loadCachedPdf = (documentId: string) => get<Uint8Array>(PDF_STORE, documentId);
export const saveCachedPdf = (documentId: string, data: Uint8Array) => put(PDF_STORE, documentId, data);

// 번들을 읽는 곳.
// - folder: Drive 의 PaperBoard 폴더(트리 주소). 번들 zip 과 pdfs/ 의 PDF 원문을 모두 읽을 수 있다(권장).
// - file: 번들 zip 파일 하나(예전 방식). PDF 원문은 볼 수 없다.
export type BundleSource = { kind: "folder"; treeUri: string } | { kind: "file"; uri: string };

const SOURCE_KEY = "paperboard.source";
const LEGACY_URI_KEY = "paperboard.bundleUri"; // M7 때 저장한 파일 주소

// 저장된 값(문자열) → BundleSource. 예전 파일 주소도 읽는다. 순수 함수(테스트 대상).
export function parseSource(saved: string | null, legacyUri: string | null): BundleSource | null {
  if (saved) {
    try {
      const s = JSON.parse(saved) as BundleSource;
      if (s.kind === "folder" && typeof s.treeUri === "string") return s;
      if (s.kind === "file" && typeof s.uri === "string") return s;
    } catch {
      /* 아래로 */
    }
  }
  return legacyUri ? { kind: "file", uri: legacyUri } : null;
}

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function savedSource(): BundleSource | null {
  const ls = storage();
  return parseSource(ls?.getItem(SOURCE_KEY) ?? null, ls?.getItem(LEGACY_URI_KEY) ?? null);
}

export function saveSource(src: BundleSource): void {
  try {
    storage()?.setItem(SOURCE_KEY, JSON.stringify(src));
    storage()?.removeItem(LEGACY_URI_KEY);
  } catch {
    /* 저장 실패는 무시: 다음에 다시 고르면 된다 */
  }
}
