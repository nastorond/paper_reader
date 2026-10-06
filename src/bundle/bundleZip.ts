import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { BUNDLE_SCHEMA_VERSION, LIBRARY_JSON, type BundleLibrary } from "./schema";

// 번들 zip 만들기/읽기. DOM 없이 동작하므로 맥·폰 공용이고 Node 에서 왕복 테스트한다.

export function writeBundle(library: BundleLibrary, boards: Map<string, string>): Uint8Array {
  const files: Record<string, Uint8Array> = { [LIBRARY_JSON]: strToU8(JSON.stringify(library)) };
  for (const [path, svg] of boards) files[path] = strToU8(svg);
  // SVG·JSON 은 잘 압축되므로 deflate. mtime 을 고정해 같은 내용이면 같은 바이트가 나오게 한다.
  return zipSync(files, { level: 6, mtime: new Date("2020-01-01T00:00:00Z") });
}

export type ReadBundleResult =
  | { ok: true; library: BundleLibrary; boards: Map<string, string> }
  | { ok: false; reason: "invalid" | "unsupported-version"; version?: number };

export function readBundle(data: Uint8Array): ReadBundleResult {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const raw = files[LIBRARY_JSON];
  if (!raw) return { ok: false, reason: "invalid" };
  let library: BundleLibrary;
  try {
    library = JSON.parse(strFromU8(raw)) as BundleLibrary;
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (typeof library.schemaVersion !== "number") return { ok: false, reason: "invalid" };
  if (library.schemaVersion > BUNDLE_SCHEMA_VERSION) {
    return { ok: false, reason: "unsupported-version", version: library.schemaVersion };
  }
  const boards = new Map<string, string>();
  for (const [path, bytes] of Object.entries(files)) {
    if (path.startsWith("boards/")) boards.set(path, strFromU8(bytes));
  }
  return { ok: true, library, boards };
}
