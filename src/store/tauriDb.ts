import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { migrate, type SqlDb } from "./db";

let opening: Promise<SqlDb> | null = null;

// 앱 전체에서 DB 연결 하나를 공유한다. 경로는 Rust 의 db_path 명령이 정한다(src-tauri/src/lib.rs).
export function getDb(): Promise<SqlDb> {
  opening ??= (async () => {
    const path = await invoke<string>("db_path");
    const db = await Database.load(`sqlite:${path}`);
    await db.execute("PRAGMA foreign_keys = ON");
    await migrate(db);
    return db;
  })();
  return opening;
}
