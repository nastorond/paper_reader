import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import type { PDFDocumentProxy } from "./pdfjs";
import { PdfPage, type PageSize } from "./PdfPage";
import { anchorToScrollTop, currentPageIndex, makeAnchor, type ScrollAnchor } from "./pageTracking";
import { draftFromSelection, type DraftResult } from "../highlight/fromSelection";
import { pdfRectToPercent } from "../highlight/geometry";
import "./pdf.css";
import type { Highlight } from "../store/types";

export interface PdfViewerHandle {
  scrollToPage(index: number): void;
  // 하이라이트 위치가 화면 위쪽 1/3 쯤 오도록 스크롤한다.
  scrollToHighlight(h: Highlight): void;
  // 현재 텍스트 선택 영역을 하이라이트 초안(PDF 좌표)으로 만든다.
  draftFromSelection(): DraftResult;
}

interface Props {
  doc: PDFDocumentProxy;
  scale: number;
  onPageChange(index: number): void;
  highlights: Highlight[];
  selectedHighlightId: string | null;
  onHighlightClick(id: string | null): void;
  // 처음 열릴 때 이 하이라이트 위치로 스크롤(폰 "원문 보기")
  focusHighlightId?: string;
  ref?: Ref<PdfViewerHandle>;
}

const NO_HIGHLIGHTS: Highlight[] = [];

// 모든 페이지를 세로로 이어 붙인 스크롤 뷰. 화면 근처 페이지만 실제로 렌더링한다.
export function PdfViewer({
  doc,
  scale,
  onPageChange,
  highlights,
  selectedHighlightId,
  onHighlightClick,
  focusHighlightId,
  ref,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<PageSize[] | null>(null);
  const [active, setActive] = useState<Set<number>>(() => new Set());
  const anchorRef = useRef<ScrollAnchor>({ pageIndex: 0, offsetRatio: 0 });

  // 1) 문서가 바뀌면 모든 페이지의 기본 크기를 먼저 구한다(자리 잡기용, 렌더링은 안 함).
  useEffect(() => {
    let cancelled = false;
    setSizes(null);
    setActive(new Set());
    anchorRef.current = { pageIndex: 0, offsetRatio: 0 };
    (async () => {
      const result: PageSize[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        result.push({ width: vp.width, height: vp.height, userUnit: page.userUnit, viewport: vp });
      }
      if (!cancelled) setSizes(result);
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [doc]);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return { tops: [] as number[], heights: [] as number[] };
    const pages = el.querySelectorAll<HTMLElement>(".pdf-page");
    return {
      tops: Array.from(pages, (p) => p.offsetTop),
      heights: Array.from(pages, (p) => p.offsetHeight),
    };
  }, []);

  // 2) 스크롤할 때 현재 페이지와 확대/축소용 앵커를 갱신한다.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { tops, heights } = measure();
    anchorRef.current = makeAnchor(tops, heights, el.scrollTop);
    onPageChange(currentPageIndex(tops, el.scrollTop, el.clientHeight));
  }, [measure, onPageChange]);

  // 페이지 크기를 구한 뒤 한 번, focusHighlightId 위치로 스크롤하도록 앵커를 맞춘다(아래 3번 effect 가 적용).
  const focusedRef = useRef(false);
  useLayoutEffect(() => {
    if (!sizes || focusedRef.current || !focusHighlightId) return;
    const h = highlights.find((x) => x.id === focusHighlightId);
    const vp = h && sizes[h.pageIndex]?.viewport;
    if (!h || !vp || h.rects.length === 0) return;
    focusedRef.current = true;
    const top = Math.min(...h.rects.map((r) => pdfRectToPercent(r, vp).top)) / 100;
    // 화면 위쪽 1/4 지점에 오도록 페이지 높이 비율로 앵커를 잡는다
    const el = scrollRef.current;
    const pageH = sizes[h.pageIndex].height * scale;
    const back = el ? el.clientHeight / 4 / pageH : 0;
    anchorRef.current = { pageIndex: h.pageIndex, offsetRatio: Math.max(0, top - back) };
  }, [sizes, focusHighlightId, highlights, scale]);

  // 3) 배율이 바뀌면 DOM 크기가 바뀐 직후(그리기 전) 같은 내용이 보이도록 스크롤을 맞춘다.
  //    useLayoutEffect 는 브라우저가 화면을 그리기 전에 동기 실행되어 튀는 게 안 보인다.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !sizes) return;
    const { tops, heights } = measure();
    el.scrollTop = anchorToScrollTop(anchorRef.current, tops, heights);
  }, [scale, sizes, measure]);

  // 4) 화면 위아래로 한 화면 높이 이내에 있는 페이지만 active.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !sizes) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setActive((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const i = Number((e.target as HTMLElement).dataset.pageIndex);
            if (e.isIntersecting) next.add(i);
            else next.delete(i);
          }
          return next;
        });
      },
      { root: el, rootMargin: "100% 0px" },
    );
    el.querySelectorAll(".pdf-page").forEach((p) => observer.observe(p));
    return () => observer.disconnect();
  }, [sizes]);

  // 페이지별로 나눠 두면 다른 페이지의 하이라이트가 바뀔 때 배열 참조가 유지된다.
  const byPage = useMemo(() => {
    const map = new Map<number, Highlight[]>();
    for (const h of highlights) {
      const list = map.get(h.pageIndex);
      if (list) list.push(h);
      else map.set(h.pageIndex, [h]);
    }
    return map;
  }, [highlights]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToPage(index: number) {
        const el = scrollRef.current;
        if (!el) return;
        const page = el.querySelector<HTMLElement>(`.pdf-page[data-page-index="${index}"]`);
        if (page) el.scrollTop = page.offsetTop - 12;
      },
      scrollToHighlight(h: Highlight) {
        const el = scrollRef.current;
        const vp = sizes?.[h.pageIndex]?.viewport;
        const page = el?.querySelector<HTMLElement>(`.pdf-page[data-page-index="${h.pageIndex}"]`);
        if (!el || !vp || !page || h.rects.length === 0) return;
        const top = Math.min(...h.rects.map((r) => pdfRectToPercent(r, vp).top));
        el.scrollTop = page.offsetTop + (top / 100) * page.offsetHeight - el.clientHeight / 3;
      },
      draftFromSelection() {
        return draftFromSelection((i) => sizes?.[i]?.viewport);
      },
    }),
    [sizes],
  );

  return (
    <div className="pdf-scroll" ref={scrollRef} onScroll={onScroll}>
      <div className="pdf-pages">
        {sizes?.map((size, i) => (
          <PdfPage
            key={i}
            doc={doc}
            index={i}
            size={size}
            scale={scale}
            active={active.has(i)}
            highlights={byPage.get(i) ?? NO_HIGHLIGHTS}
            selectedHighlightId={selectedHighlightId}
            onHighlightClick={onHighlightClick}
          />
        ))}
      </div>
    </div>
  );
}
