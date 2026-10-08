import { exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { getDb } from "./db/tauriDb";
import { listHighlights, listRecentDocuments, upsertDocument, type RecentDocument } from "./db/db";
import { readPdfFile } from "./files/openPdf";
import { sha256Hex } from "./files/hash";
import { loadPdf, type PDFDocumentProxy } from "./pdf/pdfjs";
import type { Highlight } from "../logic/types";

// 문서(PDF) 열기와 최근 문서. 파일 읽기 → 내용 해시(문서 id) → pdf.js 로드 → DB 기록·하이라이트 읽기.

export interface OpenedDocument {
  id: string; // PDF 내용 SHA-256
  path: string;
  title: string;
  pdf: PDFDocumentProxy;
  firstPageWidth: number;
  highlights: Highlight[];
  // expectId 와 내용이 달라 새 문서로 열었는지(최근 문서를 다른 파일로 다시 고른 경우)
  differentFromExpected: boolean;
}

export async function openDocument(path: string, expectId?: string): Promise<OpenedDocument> {
  const file = await readPdfFile(path);
  // loadPdf 가 데이터를 워커로 넘기면(transfer) 원본 버퍼가 비므로 해시를 먼저 구한다.
  const id = await sha256Hex(file.data);
  const pdf = await loadPdf(file.data);
  const first = await pdf.getPage(1);
  const firstPageWidth = first.getViewport({ scale: 1 }).width;
  const meta = await pdf.getMetadata().catch(() => null);
  const infoTitle = (meta?.info as { Title?: string } | undefined)?.Title?.trim();
  const db = await getDb();
  const record = await upsertDocument(db, { id, path, title: infoTitle || file.name }, new Date().toISOString());
  return {
    id,
    path,
    title: record.title,
    pdf,
    firstPageWidth,
    highlights: await listHighlights(db, id),
    differentFromExpected: !!expectId && id !== expectId,
  };
}

export async function loadHighlights(documentId: string): Promise<Highlight[]> {
  return listHighlights(await getDb(), documentId);
}

export async function listRecent(): Promise<RecentDocument[]> {
  return listRecentDocuments(await getDb());
}

// 최근 문서의 PDF 를 이 PC 에서 찾는다: 기록된 경로 → Drive 폴더의 PDF 원문 사본(pdfs/<id>.pdf). 없으면 null.
export async function locateDocumentFile(d: RecentDocument, driveDir: string | null): Promise<string | null> {
  if (d.path && (await exists(d.path).catch(() => false))) return d.path;
  if (driveDir) {
    const copy = await join(driveDir, "pdfs", `${d.id}.pdf`);
    if (await exists(copy).catch(() => false)) return copy;
  }
  return null;
}

export type { RecentDocument };
