// PC 간 동기화: 합치는 규칙(순수 함수). DB·파일과 무관해서 Node 에서 테스트한다.
//
// 구조
//   - 각 PC 는 Drive 폴더의 sync/<PC>.json 에 자기 라이브러리 전체(SyncData)를 쓴다. 남의 파일은 읽기만 한다.
//   - 다른 PC 파일을 읽으면 mergeRemote(내 상태, 남의 상태) 로 "내 DB 에 적용할 것(MergePlan)"을 구한다.
//
// 규칙
//   - 문서: 합집합. 경로는 PC 마다 달라서 동기화하지 않는다(문서 id 는 PDF 내용 해시라 어느 PC 든 같다).
//   - 하이라이트: updatedAt 이 늦은 쪽이 이긴다. 삭제도 "지웠음(deletedAt)" 표시가 붙은 수정으로 취급해
//     같은 규칙으로 전파된다(표시가 없으면 다른 PC 에 남은 사본이 되살아난다).
//   - 노트: 본문(body)과 보드(board)를 따로, 각자의 수정 시각으로 비교한다.
//   - 시각이 같으면 그대로 둔다(이미 같은 내용).
//   - 충돌: 마지막으로 그 PC 와 합친 뒤(lastMergedAt) 양쪽 모두 같은 노트를 고쳤고 남의 것이 이기면,
//     내 것은 사라지기 전에 백업(backups)으로 남긴다. 번갈아 쓰면 거의 생기지 않는다.
//   - 시각은 각 PC 의 시계(ISO 8601 UTC 문자열)라 문자열 비교로 순서를 정한다.

export interface SyncDocument {
  id: string;
  title: string;
  addedAt: string;
  lastOpenedAt: string;
}

export interface SyncHighlight {
  id: string;
  documentId: string;
  pageIndex: number;
  rects: { x1: number; y1: number; x2: number; y2: number }[];
  text: string;
  prefix: string;
  suffix: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SyncNote {
  highlightId: string;
  body: unknown | null;
  bodyUpdatedAt: string | null;
  board: unknown | null;
  boardUpdatedAt: string | null;
}

export interface SyncData {
  documents: SyncDocument[];
  highlights: SyncHighlight[];
  notes: SyncNote[];
}

// sync/<PC>.json 파일 내용
export interface SyncSnapshot extends SyncData {
  format: 1;
  app: "PaperBoard";
  deviceId: string;
  deviceName: string;
  writtenAt: string;
}

export interface NoteFieldUpdate {
  value: unknown | null;
  updatedAt: string;
}

export interface MergePlan {
  documents: SyncDocument[]; // 추가하거나 바꿀 문서(경로는 적용하는 쪽이 유지)
  highlights: SyncHighlight[]; // 추가하거나 바꿀 하이라이트(지운 표시 포함)
  notes: { highlightId: string; body?: NoteFieldUpdate; board?: NoteFieldUpdate }[];
  deleteNotes: string[]; // 하이라이트가 지워져 함께 지울 노트
  backups: { highlightId: string; field: "body" | "board"; content: unknown | null; updatedAt: string | null }[];
  stats: {
    highlightsAdded: number;
    highlightsUpdated: number;
    highlightsDeleted: number;
    notesUpdated: number;
    conflicts: number;
  };
}

const later = (a: string | null | undefined, b: string | null | undefined) => (a ?? "") > (b ?? "");

export function mergeRemote(local: SyncData, remote: SyncData, lastMergedAt: string | null): MergePlan {
  const plan: MergePlan = {
    documents: [],
    highlights: [],
    notes: [],
    deleteNotes: [],
    backups: [],
    stats: { highlightsAdded: 0, highlightsUpdated: 0, highlightsDeleted: 0, notesUpdated: 0, conflicts: 0 },
  };
  const since = lastMergedAt ?? "";

  // 문서: 없으면 추가, 있으면 최근 연 시각만 늦은 쪽으로
  const localDocs = new Map(local.documents.map((d) => [d.id, d]));
  for (const rd of remote.documents) {
    const ld = localDocs.get(rd.id);
    if (!ld) plan.documents.push(rd);
    else if (later(rd.lastOpenedAt, ld.lastOpenedAt) || later(ld.addedAt, rd.addedAt)) {
      plan.documents.push({
        ...ld,
        lastOpenedAt: later(rd.lastOpenedAt, ld.lastOpenedAt) ? rd.lastOpenedAt : ld.lastOpenedAt,
        addedAt: later(ld.addedAt, rd.addedAt) ? rd.addedAt : ld.addedAt,
      });
    }
  }

  // 하이라이트
  const localHls = new Map(local.highlights.map((h) => [h.id, h]));
  const deletedAfter = new Set<string>(local.highlights.filter((h) => h.deletedAt).map((h) => h.id));
  for (const rh of remote.highlights) {
    const lh = localHls.get(rh.id);
    if (!lh) {
      plan.highlights.push(rh);
      if (rh.deletedAt) deletedAfter.add(rh.id);
      else plan.stats.highlightsAdded++;
      continue;
    }
    if (!later(rh.updatedAt, lh.updatedAt)) continue;
    plan.highlights.push(rh);
    if (rh.deletedAt && !lh.deletedAt) {
      plan.stats.highlightsDeleted++;
      deletedAfter.add(rh.id);
      plan.deleteNotes.push(rh.id);
    } else if (!rh.deletedAt && lh.deletedAt) {
      // 지운 뒤 다른 PC 에서 더 나중에 고친 경우: 되살린다
      plan.stats.highlightsAdded++;
      deletedAfter.delete(rh.id);
    } else if (!rh.deletedAt) {
      plan.stats.highlightsUpdated++;
    }
  }

  // 노트: 본문·보드를 따로
  const localNotes = new Map(local.notes.map((n) => [n.highlightId, n]));
  for (const rn of remote.notes) {
    if (deletedAfter.has(rn.highlightId)) continue;
    const ln = localNotes.get(rn.highlightId);
    const update: MergePlan["notes"][number] = { highlightId: rn.highlightId };
    for (const field of ["body", "board"] as const) {
      const rAt = field === "body" ? rn.bodyUpdatedAt : rn.boardUpdatedAt;
      const lAt = ln ? (field === "body" ? ln.bodyUpdatedAt : ln.boardUpdatedAt) : null;
      if (!rAt || !later(rAt, lAt)) continue;
      const rVal = rn[field];
      const lVal = ln ? ln[field] : null;
      update[field] = { value: rVal, updatedAt: rAt };
      // 충돌: 마지막 합치기 이후 내 쪽도 고쳤고 내용이 다르면, 내 것을 백업
      if (lAt && later(lAt, since) && later(rAt, since) && JSON.stringify(lVal) !== JSON.stringify(rVal)) {
        plan.backups.push({ highlightId: rn.highlightId, field, content: lVal, updatedAt: lAt });
        plan.stats.conflicts++;
      }
    }
    if (update.body || update.board) {
      plan.notes.push(update);
      plan.stats.notesUpdated++;
    }
  }

  return plan;
}

export function isEmptyPlan(p: MergePlan): boolean {
  return p.documents.length + p.highlights.length + p.notes.length + p.deleteNotes.length + p.backups.length === 0;
}

// "Windows 에서 하이라이트 3개, 노트 1개를 가져왔습니다" 같은 안내. 바뀐 게 없으면 null.
export function describeMerge(deviceName: string, s: MergePlan["stats"]): string | null {
  const parts = [
    s.highlightsAdded && `하이라이트 ${s.highlightsAdded}개 추가`,
    s.highlightsUpdated && `하이라이트 ${s.highlightsUpdated}개 수정`,
    s.highlightsDeleted && `하이라이트 ${s.highlightsDeleted}개 삭제`,
    s.notesUpdated && `노트 ${s.notesUpdated}개 갱신`,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  const conflict = s.conflicts ? ` (겹친 수정 ${s.conflicts}건은 내 쪽 내용을 백업했습니다)` : "";
  return `${deviceName}에서 가져옴: ${parts.join(", ")}${conflict}`;
}
