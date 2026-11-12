import { BeatVectorData, VectorStrokePath, WhiteboardInkColor } from "@/types/whiteboard-video";

export const SVG_CANVAS_WIDTH = 1200;
export const SVG_CANVAS_HEIGHT = 896;

export interface RawSvgStrokeInput {
  d: string;
  color: WhiteboardInkColor;
  strokeWidth?: number;
}

type CanonicalOp =
  | { type: "M"; x: number; y: number }
  | { type: "L"; x: number; y: number }
  | { type: "Q"; cx: number; cy: number; x: number; y: number }
  | { type: "C"; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }
  | { type: "Z" };

const TOKEN_RE = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const SAFE_PATH_RE = /^[MmLlHhVvCcSsQqTtAaZz0-9.,+\-eE\s]+$/;

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

function sampleQuadLength(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number
): number {
  let len = 0;
  let px = x0;
  let py = y0;
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const nx = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
    const ny = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
    len += dist(px, py, nx, ny);
    px = nx;
    py = ny;
  }
  return len;
}

function sampleCubicLength(
  x0: number,
  y0: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x1: number,
  y1: number
): number {
  let len = 0;
  let px = x0;
  let py = y0;
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const nx =
      mt * mt * mt * x0 +
      3 * mt * mt * t * c1x +
      3 * mt * t * t * c2x +
      t * t * t * x1;
    const ny =
      mt * mt * mt * y0 +
      3 * mt * mt * t * c1y +
      3 * mt * t * t * c2y +
      t * t * t * y1;
    len += dist(px, py, nx, ny);
    px = nx;
    py = ny;
  }
  return len;
}

/**
 * Converts SVG arc command endpoints to a polyline of absolute points (W3C F.6.5/F.6.6).
 */
function sampleSvgArcPoints(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  xAxisRotDeg: number,
  largeArcFlag: number,
  sweepFlag: number,
  x2: number,
  y2: number
): Array<{ x: number; y: number }> {
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx < 1e-3 || ry < 1e-3) {
    return [{ x: x2, y: y2 }];
  }

  const phi = (xAxisRotDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  const rxSq = rx * rx;
  const rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;

  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }

  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const num = Math.max(0, rx2 * ry2 - rx2 * y1pSq - ry2 * x1pSq);
  const den = rx2 * y1pSq + ry2 * x1pSq;
  const coef = (largeArcFlag === sweepFlag ? -1 : 1) * Math.sqrt(den > 0 ? num / den : 0);
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const vecAngle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    const ratio = len > 0 ? Math.max(-1, Math.min(1, dot / len)) : 1;
    const sign = ux * vy - uy * vx < 0 ? -1 : 1;
    return sign * Math.acos(ratio);
  };

  const v1x = (x1p - cxp) / rx;
  const v1y = (y1p - cyp) / ry;
  const v2x = (-x1p - cxp) / rx;
  const v2y = (-y1p - cyp) / ry;

  const theta1 = vecAngle(1, 0, v1x, v1y);
  let dTheta = vecAngle(v1x, v1y, v2x, v2y);
  if (!sweepFlag && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweepFlag && dTheta < 0) dTheta += 2 * Math.PI;

  const segments = Math.max(6, Math.min(24, Math.ceil(Math.abs(dTheta) / (Math.PI / 8))));
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 1; i <= segments; i++) {
    const angle = theta1 + (dTheta * i) / segments;
    const ex = rx * Math.cos(angle);
    const ey = ry * Math.sin(angle);
    pts.push({
      x: cosPhi * ex - sinPhi * ey + cx,
      y: sinPhi * ex + cosPhi * ey + cy,
    });
  }
  return pts;
}

/**
 * Parses an SVG path string into canonical absolute M/L/Q/C/Z operations.
 */
function parseToCanonicalOps(d: string): CanonicalOp[] | null {
  const trimmed = d.trim();
  if (!trimmed || !SAFE_PATH_RE.test(trimmed)) return null;

  const tokens = trimmed.match(TOKEN_RE);
  if (!tokens || tokens.length < 3 || (tokens[0] !== "M" && tokens[0] !== "m")) {
    return null;
  }

  const ops: CanonicalOp[] = [];
  let i = 0;
  let cmd = "";
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let prevC2x = 0;
  let prevC2y = 0;
  let prevQx = 0;
  let prevQy = 0;
  let prevCmd = "";

  const isCmd = (tok: string | undefined) => Boolean(tok && /^[a-zA-Z]$/.test(tok));
  const nextNum = (): number => {
    const val = Number(tokens[i++]);
    if (!Number.isFinite(val)) throw new Error("NaN coordinate");
    return val;
  };
  const hasMoreNums = () => i < tokens.length && !isCmd(tokens[i]);

  try {
    while (i < tokens.length) {
      if (isCmd(tokens[i])) {
        cmd = tokens[i++];
      } else if (!cmd) {
        return null;
      }

      if (cmd === "Z" || cmd === "z") {
        ops.push({ type: "Z" });
        cx = sx;
        cy = sy;
        prevCmd = cmd;
        cmd = "";
        continue;
      }

      let firstPair = true;
      do {
        if (!hasMoreNums()) break;
        const effectiveCmd =
          !firstPair && cmd === "M" ? "L" : !firstPair && cmd === "m" ? "l" : cmd;
        firstPair = false;

        switch (effectiveCmd) {
          case "M":
          case "m": {
            const x = nextNum() + (effectiveCmd === "m" ? cx : 0);
            const y = nextNum() + (effectiveCmd === "m" ? cy : 0);
            ops.push({ type: "M", x, y });
            cx = x;
            cy = y;
            sx = x;
            sy = y;
            prevCmd = effectiveCmd;
            break;
          }
          case "L":
          case "l": {
            const x = nextNum() + (effectiveCmd === "l" ? cx : 0);
            const y = nextNum() + (effectiveCmd === "l" ? cy : 0);
            ops.push({ type: "L", x, y });
            cx = x;
            cy = y;
            prevCmd = effectiveCmd;
            break;
          }
          case "H":
          case "h": {
            const x = nextNum() + (effectiveCmd === "h" ? cx : 0);
            ops.push({ type: "L", x, y: cy });
            cx = x;
            prevCmd = effectiveCmd;
            break;
          }
          case "V":
          case "v": {
            const y = nextNum() + (effectiveCmd === "v" ? cy : 0);
            ops.push({ type: "L", x: cx, y });
            cy = y;
            prevCmd = effectiveCmd;
            break;
          }
          case "Q":
          case "q": {
            const rel = effectiveCmd === "q";
            const qx = nextNum() + (rel ? cx : 0);
            const qy = nextNum() + (rel ? cy : 0);
            const x = nextNum() + (rel ? cx : 0);
            const y = nextNum() + (rel ? cy : 0);
            ops.push({ type: "Q", cx: qx, cy: qy, x, y });
            prevQx = qx;
            prevQy = qy;
            cx = x;
            cy = y;
            prevCmd = effectiveCmd;
            break;
          }
          case "T":
          case "t": {
            const rel = effectiveCmd === "t";
            const isPrevQ = ["Q", "q", "T", "t"].includes(prevCmd);
            const qx = isPrevQ ? 2 * cx - prevQx : cx;
            const qy = isPrevQ ? 2 * cy - prevQy : cy;
            const x = nextNum() + (rel ? cx : 0);
            const y = nextNum() + (rel ? cy : 0);
            ops.push({ type: "Q", cx: qx, cy: qy, x, y });
            prevQx = qx;
            prevQy = qy;
            cx = x;
            cy = y;
            prevCmd = effectiveCmd;
            break;
          }
          case "C":
          case "c": {
            const rel = effectiveCmd === "c";
            const c1x = nextNum() + (rel ? cx : 0);
            const c1y = nextNum() + (rel ? cy : 0);
            const c2x = nextNum() + (rel ? cx : 0);
            const c2y = nextNum() + (rel ? cy : 0);
            const x = nextNum() + (rel ? cx : 0);
            const y = nextNum() + (rel ? cy : 0);
            ops.push({ type: "C", c1x, c1y, c2x, c2y, x, y });
            prevC2x = c2x;
            prevC2y = c2y;
            cx = x;
            cy = y;
            prevCmd = effectiveCmd;
            break;
          }
          case "S":
          case "s": {
            const rel = effectiveCmd === "s";
            const isPrevC = ["C", "c", "S", "s"].includes(prevCmd);
            const c1x = isPrevC ? 2 * cx - prevC2x : cx;
            const c1y = isPrevC ? 2 * cy - prevC2y : cy;
            const c2x = nextNum() + (rel ? cx : 0);
            const c2y = nextNum() + (rel ? cy : 0);
            const x = nextNum() + (rel ? cx : 0);
            const y = nextNum() + (rel ? cy : 0);
            ops.push({ type: "C", c1x, c1y, c2x, c2y, x, y });
            prevC2x = c2x;
            prevC2y = c2y;
            cx = x;
            cy = y;
            prevCmd = effectiveCmd;
            break;
          }
          case "A":
          case "a": {
            const rel = effectiveCmd === "a";
            const rx = nextNum();
            const ry = nextNum();
            const rot = nextNum();
            const large = nextNum() ? 1 : 0;
            const sweep = nextNum() ? 1 : 0;
            const x = nextNum() + (rel ? cx : 0);
            const y = nextNum() + (rel ? cy : 0);
            const pts = sampleSvgArcPoints(cx, cy, rx, ry, rot, large, sweep, x, y);
            for (const pt of pts) {
              ops.push({ type: "L", x: pt.x, y: pt.y });
            }
            cx = x;
            cy = y;
            prevCmd = effectiveCmd;
            break;
          }
          default:
            return null;
        }
      } while (hasMoreNums());
    }
  } catch {
    return null;
  }

  return ops.length >= 2 ? ops : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function measureAndSerializeOps(
  ops: CanonicalOp[],
  scale: number,
  dx: number,
  dy: number
): { d: string; length: number; minX: number; maxX: number; minY: number; maxY: number } {
  const tx = (x: number) => round1(x * scale + dx);
  const ty = (y: number) => round1(y * scale + dy);

  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let totalLen = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const track = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  const parts: string[] = [];
  for (const op of ops) {
    if (op.type === "M") {
      const x = tx(op.x);
      const y = ty(op.y);
      parts.push(`M ${x} ${y}`);
      cx = x;
      cy = y;
      sx = x;
      sy = y;
      track(x, y);
    } else if (op.type === "L") {
      const x = tx(op.x);
      const y = ty(op.y);
      parts.push(`L ${x} ${y}`);
      totalLen += dist(cx, cy, x, y);
      cx = x;
      cy = y;
      track(x, y);
    } else if (op.type === "Q") {
      const qx = tx(op.cx);
      const qy = ty(op.cy);
      const x = tx(op.x);
      const y = ty(op.y);
      parts.push(`Q ${qx} ${qy} ${x} ${y}`);
      totalLen += sampleQuadLength(cx, cy, qx, qy, x, y);
      cx = x;
      cy = y;
      track(qx, qy);
      track(x, y);
    } else if (op.type === "C") {
      const c1x = tx(op.c1x);
      const c1y = ty(op.c1y);
      const c2x = tx(op.c2x);
      const c2y = ty(op.c2y);
      const x = tx(op.x);
      const y = ty(op.y);
      parts.push(`C ${c1x} ${c1y} ${c2x} ${c2y} ${x} ${y}`);
      totalLen += sampleCubicLength(cx, cy, c1x, c1y, c2x, c2y, x, y);
      cx = x;
      cy = y;
      track(c1x, c1y);
      track(c2x, c2y);
      track(x, y);
    } else if (op.type === "Z") {
      parts.push("Z");
      totalLen += dist(cx, cy, sx, sy);
      cx = sx;
      cy = sy;
    }
  }

  return {
    d: parts.join(" "),
    length: Math.round(totalLen * 10) / 10,
    minX,
    maxX,
    minY,
    maxY,
  };
}

/**
 * Validates raw SVG strokes, normalizes viewport fit within 1200x896 when needed,
 * orders colors by accentOrder, and computes arc lengths for smooth marker animation.
 */
export function validateAndBuildBeatVectorData(
  rawStrokes: RawSvgStrokeInput[],
  accentOrder: "black-blue-red" | "black-red-blue"
): BeatVectorData {
  const parsedList: Array<{
    ops: CanonicalOp[];
    color: WhiteboardInkColor;
    strokeWidth: number;
    seq: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    length: number;
  }> = [];

  for (let idx = 0; idx < rawStrokes.length; idx++) {
    const item = rawStrokes[idx];
    const ops = parseToCanonicalOps(item.d);
    if (!ops) continue;
    const rawMetrics = measureAndSerializeOps(ops, 1, 0, 0);
    if (!Number.isFinite(rawMetrics.length) || rawMetrics.length < 10) continue;

    parsedList.push({
      ops,
      color: item.color,
      strokeWidth: Math.max(3.5, Math.min(8, Number(item.strokeWidth) || 5)),
      seq: idx,
      minX: rawMetrics.minX,
      maxX: rawMetrics.maxX,
      minY: rawMetrics.minY,
      maxY: rawMetrics.maxY,
      length: rawMetrics.length,
    });
  }

  if (parsedList.length < 4) {
    throw new Error(`Vector sketch produced too few valid paths (${parsedList.length}).`);
  }

  let gMinX = Infinity;
  let gMaxX = -Infinity;
  let gMinY = Infinity;
  let gMaxY = -Infinity;
  for (const p of parsedList) {
    if (p.minX < gMinX) gMinX = p.minX;
    if (p.maxX > gMaxX) gMaxX = p.maxX;
    if (p.minY < gMinY) gMinY = p.minY;
    if (p.maxY > gMaxY) gMaxY = p.maxY;
  }

  const bboxW = Math.max(1, gMaxX - gMinX);
  const bboxH = Math.max(1, gMaxY - gMinY);

  // Uniformly refit only if strokes escape canvas padding or occupy too small a corner
  const outOfBounds = gMinX < 18 || gMaxX > SVG_CANVAS_WIDTH - 18 || gMinY < 18 || gMaxY > SVG_CANVAS_HEIGHT - 18;
  const undersized = bboxW < 440 && bboxH < 340;

  let scale = 1;
  let dx = 0;
  let dy = 0;
  if (outOfBounds || undersized) {
    const padX = 76;
    const padY = 60;
    const usableW = SVG_CANVAS_WIDTH - padX * 2;
    const usableH = SVG_CANVAS_HEIGHT - padY * 2;
    scale = Math.min(usableW / bboxW, usableH / bboxH);
    const scaledW = bboxW * scale;
    const scaledH = bboxH * scale;
    dx = (SVG_CANVAS_WIDTH - scaledW) / 2 - gMinX * scale;
    dy = (SVG_CANVAS_HEIGHT - scaledH) / 2 - gMinY * scale;
  }

  const colorRank: Record<WhiteboardInkColor, number> =
    accentOrder === "black-red-blue"
      ? { "#18181B": 0, "#DC2626": 1, "#2563EB": 2 }
      : { "#18181B": 0, "#2563EB": 1, "#DC2626": 2 };

  const ordered = [...parsedList].sort((a, b) => {
    const rankDiff = colorRank[a.color] - colorRank[b.color];
    return rankDiff !== 0 ? rankDiff : a.seq - b.seq;
  });

  let totalLength = 0;
  const paths: VectorStrokePath[] = ordered.map((item, orderIdx) => {
    const normalized = measureAndSerializeOps(item.ops, scale, dx, dy);
    const strokeW = Math.max(3.5, Math.min(8, round1(item.strokeWidth * Math.sqrt(scale))));
    totalLength += normalized.length;
    return {
      d: normalized.d,
      color: item.color,
      strokeWidth: strokeW,
      length: normalized.length,
      order: orderIdx,
    };
  });

  if (totalLength < 220) {
    throw new Error("Vector sketch total ink length is too small.");
  }

  return {
    width: SVG_CANVAS_WIDTH,
    height: SVG_CANVAS_HEIGHT,
    totalLength: Math.round(totalLength),
    paths,
  };
}
