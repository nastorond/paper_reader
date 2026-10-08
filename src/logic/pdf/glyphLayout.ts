// PDF 연산자 목록(operator list)에서 글리프별 위치를 계산해 "단어 조각(segment)"으로 묶는다.
//
// 왜 필요한가: pdf.js 의 textContent 는 양쪽 정렬된 한 줄을 항목 하나로 합쳐 주고,
// 텍스트 레이어는 그 줄 전체에 가로 배율 하나만 적용한다. 그래서 줄 양 끝은 맞아도
// 단어 간격이 늘어난 줄의 중간에서는 선택 영역이 실제 글자와 어긋난다.
// 여기서는 pdf.js 캔버스 렌더러(showText)와 같은 계산으로 글리프 위치를 구해
// 단어 단위로 위치를 잡을 수 있게 한다.
//
// DOM 없이 동작하는 순수 로직이라 Node(vitest)에서 테스트한다.

export type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

// pdf.js Util.transform 과 같은 규칙: m1 다음에 m2 를 적용하는 행렬 (CTM = CTM · m)
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

export function applyPoint(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

// 연산자 목록의 showText 인자에 들어 있는 글리프(필요한 필드만)
export interface GlyphLike {
  unicode: string;
  width: number;
  isSpace: boolean;
}

export interface FontLike {
  fontMatrix?: number[];
  vertical?: boolean;
  isType3Font?: boolean;
}

// pdf.js 의 OPS 상수 중 여기서 쓰는 것들. (테스트에서 legacy 빌드의 OPS 를 넘길 수 있게 주입받는다)
export interface OpsLike {
  save: number;
  restore: number;
  transform: number;
  beginText: number;
  setTextMatrix: number;
  moveText: number;
  setLeadingMoveText: number;
  nextLine: number;
  setFont: number;
  setCharSpacing: number;
  setWordSpacing: number;
  setHScale: number;
  setLeading: number;
  setTextRise: number;
  setGState: number;
  showText: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  beginGroup: number;
  endGroup: number;
}

// PDF 사용자 공간(포인트, y 위쪽 증가) 기준의 글리프 한 개
export interface PositionedGlyph {
  str: string;
  isSpace: boolean;
  // 기준선(baseline) 위 시작점과 끝점
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  // 화면상 글자 높이(포인트)
  size: number;
  fontName: string;
}

interface TextState {
  ctm: Matrix;
  tm: Matrix;
  x: number;
  y: number;
  lineX: number;
  lineY: number;
  leading: number;
  charSpacing: number;
  wordSpacing: number;
  hScale: number;
  rise: number;
  fontName: string | null;
  font: FontLike | null;
  fontSize: number;
  fontDirection: number;
}

function initialState(): TextState {
  return {
    ctm: IDENTITY,
    tm: IDENTITY,
    x: 0,
    y: 0,
    lineX: 0,
    lineY: 0,
    leading: 0,
    charSpacing: 0,
    wordSpacing: 0,
    hScale: 1,
    rise: 0,
    fontName: null,
    font: null,
    fontSize: 0,
    fontDirection: 1,
  };
}

function toMatrix(v: unknown): Matrix | null {
  if (v && typeof v === "object" && "length" in v && (v as ArrayLike<number>).length === 6) {
    return Array.from(v as ArrayLike<number>) as Matrix;
  }
  return null;
}

// pdf.js 캔버스 렌더러(src/display/canvas.js)의 텍스트 상태 처리를 그대로 따라간다.
export function extractGlyphs(
  fnArray: ArrayLike<number>,
  argsArray: ArrayLike<unknown[] | null>,
  OPS: OpsLike,
  getFont: (name: string) => FontLike | null,
): PositionedGlyph[] {
  const out: PositionedGlyph[] = [];
  let s = initialState();
  const stack: TextState[] = [];
  const push = () => stack.push({ ...s });
  const pop = () => {
    const prev = stack.pop();
    if (prev) s = prev;
  };
  const moveText = (x: number, y: number) => {
    s.x = s.lineX += x;
    s.y = s.lineY += y;
  };
  const setFont = (name: string, size: number) => {
    s.fontName = name;
    s.font = getFont(name);
    s.fontDirection = size < 0 ? -1 : 1;
    s.fontSize = Math.abs(size);
  };

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] ?? [];
    switch (fn) {
      case OPS.save:
        push();
        break;
      case OPS.restore:
        pop();
        break;
      case OPS.transform: {
        const m = toMatrix(args);
        if (m) s.ctm = multiply(s.ctm, m);
        break;
      }
      case OPS.paintFormXObjectBegin: {
        push();
        const m = toMatrix(args[0]);
        if (m) s.ctm = multiply(s.ctm, m);
        break;
      }
      case OPS.paintFormXObjectEnd:
        pop();
        break;
      case OPS.beginGroup: {
        push();
        const m = toMatrix((args[0] as { matrix?: unknown } | undefined)?.matrix);
        if (m) s.ctm = multiply(s.ctm, m);
        break;
      }
      case OPS.endGroup:
        pop();
        break;
      case OPS.beginText:
        s.tm = IDENTITY;
        s.x = s.lineX = 0;
        s.y = s.lineY = 0;
        break;
      case OPS.setTextMatrix: {
        const m = toMatrix(args[0]) ?? toMatrix(args);
        if (m) s.tm = m;
        s.x = s.lineX = 0;
        s.y = s.lineY = 0;
        break;
      }
      case OPS.moveText:
        moveText(args[0] as number, args[1] as number);
        break;
      case OPS.setLeadingMoveText:
        s.leading = args[1] as number;
        moveText(args[0] as number, args[1] as number);
        break;
      case OPS.nextLine:
        moveText(0, s.leading);
        break;
      case OPS.setLeading:
        s.leading = -(args[0] as number);
        break;
      case OPS.setFont:
        setFont(args[0] as string, args[1] as number);
        break;
      case OPS.setCharSpacing:
        s.charSpacing = args[0] as number;
        break;
      case OPS.setWordSpacing:
        s.wordSpacing = args[0] as number;
        break;
      case OPS.setHScale:
        s.hScale = (args[0] as number) / 100;
        break;
      case OPS.setTextRise:
        s.rise = args[0] as number;
        break;
      case OPS.setGState:
        for (const entry of (args[0] as [string, unknown][] | undefined) ?? []) {
          if (entry[0] === "Font") {
            const [name, size] = entry[1] as [string, number];
            setFont(name, size);
          }
        }
        break;
      case OPS.showText:
        showText(s, args[0] as (GlyphLike | number)[], out);
        break;
    }
  }
  return out;
}

function showText(s: TextState, glyphs: (GlyphLike | number)[], out: PositionedGlyph[]) {
  const font = s.font;
  if (!font || !s.fontName || s.fontSize === 0 || !glyphs) return;
  const fontMatrix = font.fontMatrix ?? [0.001, 0, 0, 0.001, 0, 0];
  const vertical = !!font.vertical;
  const textHScale = s.hScale * s.fontDirection;
  const widthAdvanceScale = s.fontSize * fontMatrix[0];
  const spacingDir = vertical ? 1 : -1;
  // 텍스트 공간 → 사용자 공간
  const m = multiply(s.ctm, s.tm);
  const size = s.fontSize * Math.hypot(m[2], m[3]);

  let x = 0;
  for (const glyph of glyphs) {
    if (typeof glyph === "number") {
      x += (spacingDir * glyph * s.fontSize) / 1000;
      continue;
    }
    const spacing = (glyph.isSpace ? s.wordSpacing : 0) + s.charSpacing;
    // 세로쓰기는 지원하지 않는다(텍스트 레이어에서 pdf.js 기본 방식으로 대체).
    const charWidth = glyph.width * widthAdvanceScale + spacing * s.fontDirection;
    if (!vertical) {
      const [x0, y0] = applyPoint(m, s.x + x * textHScale, s.y + s.rise);
      const [x1, y1] = applyPoint(m, s.x + (x + charWidth) * textHScale, s.y + s.rise);
      out.push({ str: glyph.unicode, isSpace: glyph.isSpace || glyph.unicode === " ", x0, y0, x1, y1, size, fontName: s.fontName });
    }
    x += charWidth;
  }
  if (vertical) s.y -= x;
  else s.x += x * textHScale;
}

// ---- 글리프 → 줄 → 단어 조각 ----

// 텍스트 레이어에 span 하나로 들어갈 단위. 단어 + 뒤따르는 공백.
// 같은 줄의 조각들은 빈틈 없이 이어지도록(다음 조각 시작까지) 폭을 잡는다.
export interface TextSegment {
  text: string;
  // 기준선 시작점(사용자 공간)과 진행 방향 길이
  x: number;
  y: number;
  width: number;
  size: number;
  // 진행 방향 각도(라디안, 사용자 공간 기준. 0 = 오른쪽)
  angle: number;
  fontName: string;
  // 줄의 마지막 조각
  endOfLine: boolean;
}

interface Line {
  glyphs: PositionedGlyph[];
  angle: number;
}

function glyphAngle(g: PositionedGlyph): number {
  return Math.atan2(g.y1 - g.y0, g.x1 - g.x0);
}

// prev 다음에 g 가 같은 줄에서 이어지는지
function continuesLine(line: Line, g: PositionedGlyph): boolean {
  const prev = line.glyphs[line.glyphs.length - 1];
  const cos = Math.cos(line.angle);
  const sin = Math.sin(line.angle);
  // prev 끝점 기준으로 g 시작점을 줄 방향(along)/수직(across) 성분으로 분해
  const dx = g.x0 - prev.x1;
  const dy = g.y0 - prev.y1;
  const along = dx * cos + dy * sin;
  const across = -dx * sin + dy * cos;
  const size = Math.max(prev.size, g.size);
  if (Math.abs(across) > size * 0.5) return false; // 다른 줄(또는 위/아래 첨자 이상으로 벗어남)
  if (along < -size * 0.5) return false; // 뒤로 돌아감(다음 줄 처음)
  if (along > size * 3) return false; // 너무 멀리 떨어짐(다른 단, 표 칸)
  return Math.abs(glyphAngle(g) - line.angle) < 0.01 || g.x0 === g.x1;
}

export function groupLines(glyphs: PositionedGlyph[]): PositionedGlyph[][] {
  const lines: Line[] = [];
  let cur: Line | null = null;
  for (const g of glyphs) {
    if (cur && continuesLine(cur, g)) {
      cur.glyphs.push(g);
    } else {
      cur = { glyphs: [g], angle: glyphAngle(g) };
      lines.push(cur);
    }
  }
  return lines.map((l) => l.glyphs);
}

// 같은 줄 안에서 이 정도(글자 높이 대비) 이상 벌어지면, 공백 글리프가 없어도 단어 경계로 본다.
// (LaTeX PDF 는 단어 사이를 공백 글자 대신 TJ 간격으로 띄우는 경우가 많다)
const GAP_AS_SPACE = 0.15;

export function buildSegments(glyphs: PositionedGlyph[]): TextSegment[] {
  const segments: TextSegment[] = [];
  for (const line of groupLines(glyphs)) {
    const first = line[0];
    const angle = glyphAngle(first);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // 줄 시작점 기준 진행 방향 좌표
    const pos = (x: number, y: number) => (x - first.x0) * cos + (y - first.y0) * sin;

    let words: { glyphs: PositionedGlyph[]; text: string }[] = [];
    let word: { glyphs: PositionedGlyph[]; text: string } | null = null;
    let prev: PositionedGlyph | null = null;
    for (const g of line) {
      const gap = prev ? pos(g.x0, g.y0) - pos(prev.x1, prev.y1) : 0;
      const afterSpace = prev?.isSpace ?? false;
      const startsWord = !word || (afterSpace && !g.isSpace) || gap > g.size * GAP_AS_SPACE;
      if (startsWord) {
        if (word && gap > g.size * GAP_AS_SPACE && !afterSpace) word.text += " ";
        word = { glyphs: [], text: "" };
        words.push(word);
      }
      word!.glyphs.push(g);
      word!.text += g.str;
      prev = g;
    }
    words = words.filter((w) => w.text.length > 0);

    words.forEach((w, i) => {
      const start = w.glyphs[0];
      const last = w.glyphs[w.glyphs.length - 1];
      const next = words[i + 1]?.glyphs[0];
      // 다음 단어 시작까지 늘려서 줄 안의 조각들이 빈틈 없이 이어지게 한다(선택 영역이 끊기지 않게).
      const end = next ? pos(next.x0, next.y0) : pos(last.x1, last.y1);
      const width = end - pos(start.x0, start.y0);
      if (width <= 0) return;
      segments.push({
        text: w.text,
        x: start.x0,
        y: start.y0,
        width,
        size: Math.max(...w.glyphs.map((g) => g.size)),
        angle,
        fontName: start.fontName,
        endOfLine: i === words.length - 1,
      });
    });
  }
  return segments;
}
