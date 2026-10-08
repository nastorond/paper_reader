import { pickDriveFolder } from "../../services/dialogs";
import { formatDate } from "../../logic/format";
import type { BundleState } from "../hooks/useBundleExport";
import { BUNDLE_FILE_NAME } from "../../logic/bundle/schema";
import type { SyncState } from "../hooks/useSync";

interface Props {
  state: BundleState;
  onSetDir(dir: string): void;
  onSetAuto(auto: boolean): void;
  onSetIncludePdfs(v: boolean): void;
  onExportNow(): void;
  onClose(): void;
  sync: SyncState;
  onSetSync(enabled: boolean): void;
  onSyncNow(): void;
}

// 툴바 "번들" 메뉴: 폰(단어장)용 번들 내보내기 설정.
export function BundlePanel({
  state,
  onSetDir,
  onSetAuto,
  onSetIncludePdfs,
  onExportNow,
  onClose,
  sync,
  onSetSync,
  onSyncNow,
}: Props) {
  const pickDir = async () => {
    const dir = await pickDriveFolder();
    if (dir) onSetDir(dir);
  };
  return (
    <div className="bundle-popover" role="dialog">
      <div className="bundle-head">
        <strong>Drive 폴더 — 폰 번들 · PC 동기화</strong>
        <button className="note-close" onClick={onClose} title="닫기">
          ×
        </button>
      </div>
      <p className="bundle-desc">
        라이브러리 전체(하이라이트·노트·보드)를 <code>{BUNDLE_FILE_NAME}</code> 하나로 저장합니다. Google Drive 동기화 폴더를
        고르면 폰에서 열 수 있습니다.
      </p>
      <div className="bundle-row">
        <span className="bundle-label">폴더</span>
        <span className="bundle-dir" title={state.dir ?? ""}>
          {state.dir ?? "선택 안 됨"}
        </span>
        <button onClick={() => void pickDir()}>선택…</button>
      </div>
      <label className="bundle-row">
        <input type="checkbox" checked={state.auto} disabled={!state.dir} onChange={(e) => onSetAuto(e.target.checked)} />
        노트를 저장할 때마다 자동으로 다시 쓰기 (5초 뒤)
      </label>
      <label className="bundle-row">
        <input
          type="checkbox"
          checked={state.includePdfs}
          disabled={!state.dir}
          onChange={(e) => onSetIncludePdfs(e.target.checked)}
        />
        PDF 원문도 함께 올리기 (폰에서 원문 보기, 논문마다 처음 한 번만 복사)
      </label>
      <div className="bundle-row">
        <button disabled={!state.dir || state.status === "exporting"} onClick={onExportNow}>
          {state.status === "exporting" ? "내보내는 중…" : "지금 내보내기"}
        </button>
        <span className="bundle-status">
          {state.status === "error"
            ? `실패: ${state.error}`
            : state.lastExportedAt
              ? `마지막: ${formatDate(state.lastExportedAt)}${state.lastResult ? ` · ${(state.lastResult.bytes / 1024).toFixed(0)}KB` : ""}${
                  state.lastResult?.pdfsCopied ? ` · PDF ${state.lastResult.pdfsCopied}개 복사` : ""
                }`
              : "아직 내보내지 않음"}
        </span>
      </div>
      {state.lastResult && state.lastResult.pdfsMissing.length > 0 && (
        <p className="bundle-desc">
          원본 PDF 를 찾지 못해 올리지 못한 문서: {state.lastResult.pdfsMissing.join(", ")} — 해당 PDF 를 한 번 다시 열면
          경로가 갱신됩니다.
        </p>
      )}
      <hr className="bundle-sep" />
      <label className="bundle-row">
        <input type="checkbox" checked={sync.enabled} disabled={!state.dir} onChange={(e) => onSetSync(e.target.checked)} />
        다른 PC(맥·Windows)와 동기화
      </label>
      <p className="bundle-desc">
        같은 폴더의 <code>sync/</code> 에 이 PC 의 하이라이트·노트를 쓰고, 다른 PC 것을 읽어 합칩니다. 나중에 고친 쪽이
        남습니다. PC 를 번갈아 쓸 때를 위한 기능이라, 두 PC 에서 같은 노트를 동시에 고치지 마세요. 폰 번들 자동
        내보내기는 한 PC 에서만 켜 두세요.
      </p>
      {sync.enabled && (
        <div className="bundle-row">
          <button disabled={!state.dir || sync.status === "syncing"} onClick={onSyncNow}>
            {sync.status === "syncing" ? "동기화 중…" : "지금 동기화"}
          </button>
          <span className="bundle-status">
            {sync.status === "error"
              ? `실패: ${sync.error}`
              : sync.lastSyncAt
                ? `마지막: ${formatDate(sync.lastSyncAt)}`
                : ""}
            {sync.device ? ` · 이 PC: ${sync.device.name}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
