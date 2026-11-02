import { open } from "@tauri-apps/plugin-dialog";
import {
  readDir,
  readFile,
  readTextFile,
  remove,
  startAccessingSecurityScopedResource,
  stopAccessingSecurityScopedResource,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { BUNDLE_FILE_NAME, PDF_DIR } from "../../logic/bundle/schema";

const TEST_FILE = "paperboard-ipad-test.txt";

// iPad 시험판: 고른 폴더를 실제로 읽고 쓸 수 있는지 단계별로 확인해 결과 줄을 돌려준다.
// 쓰기 확인용 파일은 만들고 바로 지운다.
export async function probeDriveFolder(): Promise<string[]> {
  const log: string[] = [];
  const step = async <T>(label: string, run: () => Promise<T>, show: (v: T) => string = () => "OK"): Promise<T | null> => {
    const startedAt = performance.now();
    try {
      const v = await run();
      log.push(`✓ ${label}: ${show(v)} (${Math.round(performance.now() - startedAt)}ms)`);
      return v;
    } catch (e) {
      log.push(`✗ ${label}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  };

  const folder = await step(
    "폴더 고르기",
    () => open({ directory: true, fileAccessMode: "scoped" }),
    (p) => String(p),
  );
  if (!folder) {
    log.push("폴더를 고르지 않았거나 고르지 못했습니다.");
    return log;
  }
  const child = (name: string) => `${folder.replace(/\/$/, "")}/${name}`;

  await step("접근 권한 시작", () => startAccessingSecurityScopedResource(folder));
  const entries = await step(
    "목록 읽기",
    () => readDir(folder),
    (list) => list.map((e) => e.name).join(", ") || "(비어 있음)",
  );
  if (entries?.some((e) => e.name === BUNDLE_FILE_NAME)) {
    await step(
      "번들 읽기",
      () => readFile(child(BUNDLE_FILE_NAME)),
      (d) => `${d.byteLength} B`,
    );
  }
  if (entries?.some((e) => e.name === PDF_DIR)) {
    await step(
      "pdfs 목록",
      () => readDir(child(PDF_DIR)),
      (list) => `${list.length}개`,
    );
  }
  const marker = `ipad ${new Date().toISOString()}`;
  const wrote = await step("쓰기", () => writeTextFile(child(TEST_FILE), marker));
  if (wrote !== null) {
    await step(
      "다시 읽기",
      () => readTextFile(child(TEST_FILE)),
      (t) => (t === marker ? "내용 일치" : "내용 다름"),
    );
    await step("시험 파일 지우기", () => remove(child(TEST_FILE)));
  }
  await step("접근 권한 끝", () => stopAccessingSecurityScopedResource(folder));
  return log;
}
