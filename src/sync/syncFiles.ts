import { join } from "@tauri-apps/api/path";
import { mkdir, readDir, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { getDb } from "../store/tauriDb";
import { getSetting, setSetting } from "../store/db";
import { isMac } from "../platform";
import { describeMerge, isEmptyPlan, mergeRemote, type MergePlan, type SyncSnapshot } from "./merge";
import { applyPlan, readSyncData } from "./syncDb";

// PC 간 동기화 파일 읽기·쓰기. Drive 폴더(번들 폴더와 같은 곳)의 sync/ 아래에
// PC 마다 자기 파일 하나(<이름>-<id>.json)만 쓰고, 다른 PC 파일은 읽어서 합친다(merge.ts).

export const SYNC_DIR = "sync";

export interface Device {
  id: string;
  name: string; // "Mac" / "Windows"
  fileName: string;
}

// 이 PC 의 고유 id(처음 한 번 만들어 DB 설정에 저장).
// 여러 곳에서 동시에 불러도 id 를 두 번 만들지 않도록 한 번의 작업을 공유한다.
let devicePromise: Promise<Device> | null = null;
export function getDevice(): Promise<Device> {
  devicePromise ??= loadDevice();
  return devicePromise;
}

async function loadDevice(): Promise<Device> {
  const db = await getDb();
  let id = await getSetting(db, "sync.deviceId");
  if (!id) {
    id = crypto.randomUUID();
    await setSetting(db, "sync.deviceId", id);
  }
  const name = isMac ? "Mac" : "Windows";
  return { id, name, fileName: `${name.toLowerCase()}-${id.slice(0, 8)}.json` };
}

// 내 라이브러리 전체를 sync/<내 파일> 에 쓴다(임시 파일에 쓴 뒤 이름 바꾸기).
export async function writeMySnapshot(dir: string, device: Device): Promise<void> {
  const db = await getDb();
  const snapshot: SyncSnapshot = {
    format: 1,
    app: "PaperBoard",
    deviceId: device.id,
    deviceName: device.name,
    writtenAt: new Date().toISOString(),
    ...(await readSyncData(db)),
  };
  const syncDir = await join(dir, SYNC_DIR);
  await mkdir(syncDir, { recursive: true });
  const target = await join(syncDir, device.fileName);
  await writeTextFile(`${target}.tmp`, JSON.stringify(snapshot));
  await rename(`${target}.tmp`, target);
}

export interface MergeResult {
  deviceName: string;
  plan: MergePlan;
  message: string | null;
}

// 다른 PC 파일들을 읽어 내 DB 에 합친다. 지난번에 합친 뒤 바뀌지 않은 파일은 건너뛴다.
export async function mergeOthers(dir: string, device: Device): Promise<MergeResult[]> {
  const syncDir = await join(dir, SYNC_DIR);
  let entries: Awaited<ReturnType<typeof readDir>>;
  try {
    entries = await readDir(syncDir);
  } catch {
    return []; // 아직 sync 폴더가 없음(이 PC 가 처음 쓰기 전)
  }
  const db = await getDb();
  const results: MergeResult[] = [];
  for (const entry of entries) {
    if (!entry.isFile || !entry.name.endsWith(".json") || entry.name === device.fileName) continue;
    let snap: SyncSnapshot;
    try {
      snap = JSON.parse(await readTextFile(await join(syncDir, entry.name))) as SyncSnapshot;
    } catch (e) {
      console.warn("sync file unreadable (Drive 가 아직 받는 중일 수 있음)", entry.name, e);
      continue;
    }
    if (snap.app !== "PaperBoard" || snap.format !== 1 || snap.deviceId === device.id) continue;
    const key = `sync.merged.${snap.deviceId}`;
    const lastMergedAt = await getSetting(db, key);
    if (lastMergedAt === snap.writtenAt) continue; // 이미 합친 버전
    const plan = mergeRemote(await readSyncData(db), snap, lastMergedAt);
    if (!isEmptyPlan(plan)) await applyPlan(db, plan, new Date().toISOString(), snap.deviceName);
    await setSetting(db, key, snap.writtenAt);
    results.push({ deviceName: snap.deviceName, plan, message: describeMerge(snap.deviceName, plan.stats) });
  }
  return results;
}
