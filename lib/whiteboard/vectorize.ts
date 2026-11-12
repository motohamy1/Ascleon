import { PNG } from "pngjs";
import { BeatVectorData, VectorStrokePath, WhiteboardInkColor } from "@/types/whiteboard-video";

type InkMaskKey = "black" | "blue" | "red";

const INK_HEX: Record<InkMaskKey, WhiteboardInkColor> = {
  black: "#18181B",
  blue: "#2563EB",
  red: "#DC2626",
};

interface Point {
  x: number;
  y: number;
}

export interface PngQualityReport {
  width: number;
  height: number;
  inkRatio: number;
  whiteBackgroundRatio: number;
  isValid: boolean;
  reason?: string;
}

const TARGET_VIEWBOX_W = 1200;
const TARGET_VIEWBOX_H = 896;

/**
 * Checks whether a generated whiteboard PNG has clean white paper and visible non-empty marker strokes.
 */
export function inspectWhiteboardPngQuality(pngBuffer: Buffer): PngQualityReport {
  const png = PNG.sync.read(pngBuffer);
  const { width, height, data } = png;
  const totalPixels = width * height;
  let whiteBg = 0;
  let inkPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 32 || (r > 224 && g > 224 && b > 224)) {
      whiteBg++;
    } else if (classifyPixel(r, g, b, a) !== null) {
      inkPixels++;
    }
  }

  const inkRatio = inkPixels / Math.max(1, totalPixels);
  const whiteBackgroundRatio = whiteBg / Math.max(1, totalPixels);

  if (whiteBackgroundRatio < 0.52) {
    return {
      width,
      height,
      inkRatio,
      whiteBackgroundRatio,
      isValid: false,
      reason: `Background too dark/busy (${Math.round(whiteBackgroundRatio * 100)}% white)`,
    };
  }
  if (inkRatio < 0.003) {
    return {
      width,
      height,
      inkRatio,
      whiteBackgroundRatio,
      isValid: false,
      reason: "Generated image is nearly blank",
    };
  }
  if (inkRatio > 0.42) {
    return {
      width,
      height,
      inkRatio,
      whiteBackgroundRatio,
      isValid: false,
      reason: "Generated image contains heavy dark fills instead of line art",
    };
  }

  return { width, height, inkRatio, whiteBackgroundRatio, isValid: true };
}

function classifyPixel(r: number, g: number, b: number, a: number): InkMaskKey | null {
  if (a < 64) return null;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;

  // Background white / light paper noise
  if (lum > 212 && chroma < 32) return null;

  // Red marker (pathology/lesion)
  if (chroma >= 42 && r - g >= 34 && r - b >= 34 && r >= 95) {
    return "red";
  }

  // Blue marker (normal physiology / therapy)
  if (chroma >= 38 && b - r >= 28 && b >= g - 18 && b >= 90) {
    return "blue";
  }

  // Dark neutral black/charcoal marker strokes
  if (lum < 178) {
    return "black";
  }

  return null;
}

/**
 * Downsamples raw PNG pixels into a clean working grid (~600x448) while preserving thin marker lines.
 */
function buildColorMasks(png: PNG, workW: number, workH: number): Record<InkMaskKey, Uint8Array> {
  const masks: Record<InkMaskKey, Uint8Array> = {
    black: new Uint8Array(workW * workH),
    blue: new Uint8Array(workW * workH),
    red: new Uint8Array(workW * workH),
  };

  const scaleX = png.width / workW;
  const scaleY = png.height / workH;

  for (let wy = 0; wy < workH; wy++) {
    const sy0 = Math.floor(wy * scaleY);
    const sy1 = Math.min(png.height, Math.max(sy0 + 1, Math.floor((wy + 1) * scaleY)));

    for (let wx = 0; wx < workW; wx++) {
      const sx0 = Math.floor(wx * scaleX);
      const sx1 = Math.min(png.width, Math.max(sx0 + 1, Math.floor((wx + 1) * scaleX)));

      let countBlack = 0;
      let countRed = 0;
      let countBlue = 0;

      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const off = (sy * png.width + sx) * 4;
          const k = classifyPixel(
            png.data[off],
            png.data[off + 1],
            png.data[off + 2],
            png.data[off + 3]
          );
          if (k === "red") countRed++;
          else if (k === "blue") countBlue++;
          else if (k === "black") countBlack++;
        }
      }

      const idx = wy * workW + wx;
      // Preserve chromatic accents over antialiased edge grays
      if (countRed > 0 && countRed >= countBlue) {
        masks.red[idx] = 1;
      } else if (countBlue > 0) {
        masks.blue[idx] = 1;
      } else if (countBlack > 0) {
        masks.black[idx] = 1;
      }
    }
  }

  return masks;
}

/**
 * Removes isolated speckles (< minPixels connected component) from a binary mask.
 */
function despeckleMask(mask: Uint8Array, w: number, h: number, minPixels = 6): void {
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  const comp: number[] = [];

  for (let i = 0; i < w * h; i++) {
    if (mask[i] === 0 || visited[i]) continue;
    let qHead = 0;
    let qTail = 0;
    queue[qTail++] = i;
    visited[i] = 1;
    comp.length = 0;

    while (qHead < qTail) {
      const cur = queue[qHead++];
      comp.push(cur);
      const cx = cur % w;
      const cy = (cur - cx) / w;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          if (nx < 0 || nx >= w) continue;
          const nIdx = ny * w + nx;
          if (mask[nIdx] === 1 && !visited[nIdx]) {
            visited[nIdx] = 1;
            queue[qTail++] = nIdx;
          }
        }
      }
    }

    if (comp.length < minPixels) {
      for (const p of comp) mask[p] = 0;
    }
  }
}

/**
 * Computes approximate half-width of ink strokes before thinning so SVG strokeWidth matches marker thickness.
 */
function estimateStrokeRadiusMap(mask: Uint8Array, w: number, h: number): Uint8Array {
  const radius = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!mask[idx]) continue;
      let r = 1;
      while (r < 6) {
        let allInk = true;
        for (let dy = -r; dy <= r && allInk; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) {
            allInk = false;
            break;
          }
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w || !mask[ny * w + nx]) {
              allInk = false;
              break;
            }
          }
        }
        if (!allInk) break;
        r++;
      }
      radius[idx] = r;
    }
  }
  return radius;
}

/**
 * Zhang-Suen morphological thinning down to 1-px connected centerlines.
 */
function zhangSuenThin(mask: Uint8Array, w: number, h: number): void {
  const toRemove: number[] = [];
  let changed = true;
  let iter = 0;

  while (changed && iter < 24) {
    changed = false;
    iter++;

    for (let step = 0; step < 2; step++) {
      toRemove.length = 0;

      for (let y = 1; y < h - 1; y++) {
        const row = y * w;
        for (let x = 1; x < w - 1; x++) {
          const idx = row + x;
          if (mask[idx] === 0) continue;

          const p2 = mask[idx - w];
          const p3 = mask[idx - w + 1];
          const p4 = mask[idx + 1];
          const p5 = mask[idx + w + 1];
          const p6 = mask[idx + w];
          const p7 = mask[idx + w - 1];
          const p8 = mask[idx - 1];
          const p9 = mask[idx - w - 1];

          const neighbors = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (neighbors < 2 || neighbors > 6) continue;

          let transitions = 0;
          if (p2 === 0 && p3 === 1) transitions++;
          if (p3 === 0 && p4 === 1) transitions++;
          if (p4 === 0 && p5 === 1) transitions++;
          if (p5 === 0 && p6 === 1) transitions++;
          if (p6 === 0 && p7 === 1) transitions++;
          if (p7 === 0 && p8 === 1) transitions++;
          if (p8 === 0 && p9 === 1) transitions++;
          if (p9 === 0 && p2 === 1) transitions++;
          if (transitions !== 1) continue;

          if (step === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }

          toRemove.push(idx);
        }
      }

      if (toRemove.length > 0) {
        changed = true;
        for (const idx of toRemove) mask[idx] = 0;
      }
    }
  }
}

const NEIGHBOR_OFFSETS: Array<[number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/**
 * Walks a 1-px skeleton mask into smooth, directional polylines while minimizing breaks at junctions.
 */
function extractPolylines(
  skel: Uint8Array,
  radiusMap: Uint8Array,
  w: number,
  h: number
): Array<{ points: Point[]; avgRadius: number }> {
  const visitedEdge = new Set<string>();
  const degree = new Uint8Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (!skel[idx]) continue;
      let deg = 0;
      for (const [dx, dy] of NEIGHBOR_OFFSETS) {
        if (skel[(y + dy) * w + (x + dx)]) deg++;
      }
      degree[idx] = deg;
    }
  }

  const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const polylines: Array<{ points: Point[]; avgRadius: number }> = [];

  const traceFrom = (startIdx: number, preferStraight: boolean) => {
    const startX = startIdx % w;
    const startY = (startIdx - startX) / w;

    for (const [dx0, dy0] of NEIGHBOR_OFFSETS) {
      const nx0 = startX + dx0;
      const ny0 = startY + dy0;
      if (nx0 < 0 || nx0 >= w || ny0 < 0 || ny0 >= h) continue;
      const nIdx0 = ny0 * w + nx0;
      if (!skel[nIdx0]) continue;
      const ek0 = edgeKey(startIdx, nIdx0);
      if (visitedEdge.has(ek0)) continue;

      visitedEdge.add(ek0);
      const pts: Point[] = [
        { x: startX, y: startY },
        { x: nx0, y: ny0 },
      ];
      let radSum = (radiusMap[startIdx] || 1) + (radiusMap[nIdx0] || 1);

      let prevIdx = startIdx;
      let curIdx = nIdx0;
      let dirX = dx0;
      let dirY = dy0;

      while (true) {
        const cx = curIdx % w;
        const cy = (curIdx - cx) / w;

        let bestNext = -1;
        let bestDot = -2;
        let bestDx = 0;
        let bestDy = 0;

        for (const [dx, dy] of NEIGHBOR_OFFSETS) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const nIdx = ny * w + nx;
          if (!skel[nIdx] || nIdx === prevIdx) continue;
          const ek = edgeKey(curIdx, nIdx);
          if (visitedEdge.has(ek)) continue;

          // Score alignment with current direction
          const normCur = Math.hypot(dirX, dirY) || 1;
          const normStep = Math.hypot(dx, dy) || 1;
          const dot = (dirX * dx + dirY * dy) / (normCur * normStep);
          if (dot > bestDot) {
            bestDot = dot;
            bestNext = nIdx;
            bestDx = dx;
            bestDy = dy;
          }
        }

        if (bestNext === -1) break;
        if (preferStraight && degree[curIdx] > 2 && bestDot < 0.25) break;

        visitedEdge.add(edgeKey(curIdx, bestNext));
        const bx = bestNext % w;
        const by = (bestNext - bx) / w;
        pts.push({ x: bx, y: by });
        radSum += radiusMap[bestNext] || 1;

        prevIdx = curIdx;
        curIdx = bestNext;
        dirX = bestDx;
        dirY = bestDy;

        if (curIdx === startIdx) break;
      }

      if (pts.length >= 3) {
        polylines.push({
          points: pts,
          avgRadius: radSum / pts.length,
        });
      }
    }
  };

  // Pass 1: Trace from endpoints and branch junctions first for clean unbroken strokes
  for (let i = 0; i < w * h; i++) {
    if (skel[i] && degree[i] !== 2) {
      traceFrom(i, true);
    }
  }

  // Pass 2: Trace closed loops (all remaining pixels have degree === 2)
  for (let i = 0; i < w * h; i++) {
    if (skel[i]) {
      traceFrom(i, false);
    }
  }

  return polylines;
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function rdpSimplify(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function polylineLength(pts: Point[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return total;
}

/**
 * Converts a simplified polyline into a smooth quadratic-Bezier SVG path string.
 */
function pointsToSmoothSvgPath(pts: Point[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  if (pts.length === 2) {
    return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;
  }

  const parts: string[] = [`M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`];
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2;
    const midY = (pts[i].y + pts[i + 1].y) / 2;
    parts.push(`Q ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`);
  }
  const last = pts[pts.length - 1];
  parts.push(`L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`);
  return parts.join(" ");
}

/**
 * Traces a 3-ink marker PNG (Black + Blue + Red on white) into draw-ordered SVG centerline strokes.
 */
export function vectorizeWhiteboardPng(
  pngBuffer: Buffer,
  accentOrder: "black-blue-red" | "black-red-blue" = "black-blue-red"
): BeatVectorData {
  const png = PNG.sync.read(pngBuffer);
  const workW = 600;
  const workH = Math.max(240, Math.round((png.height / Math.max(1, png.width)) * workW));
  const scaleX = TARGET_VIEWBOX_W / workW;
  const scaleY = TARGET_VIEWBOX_H / workH;

  const masks = buildColorMasks(png, workW, workH);
  const colorOrder: InkMaskKey[] =
    accentOrder === "black-red-blue" ? ["black", "red", "blue"] : ["black", "blue", "red"];

  const allPaths: VectorStrokePath[] = [];
  let orderCounter = 0;

  for (const colorKey of colorOrder) {
    const mask = masks[colorKey];
    despeckleMask(mask, workW, workH, 5);
    const radiusMap = estimateStrokeRadiusMap(mask, workW, workH);
    zhangSuenThin(mask, workW, workH);

    const rawPolylines = extractPolylines(mask, radiusMap, workW, workH);
    const scaled = rawPolylines
      .map((poly) => {
        const mapped = poly.points.map((p) => ({
          x: p.x * scaleX,
          y: p.y * scaleY,
        }));
        const simplified = rdpSimplify(mapped, 2.2);
        const len = polylineLength(simplified);
        let minY = Infinity;
        let minX = Infinity;
        for (const pt of simplified) {
          if (pt.y < minY) minY = pt.y;
          if (pt.x < minX) minX = pt.x;
        }
        return {
          simplified,
          len,
          avgRadius: poly.avgRadius,
          minY,
          minX,
        };
      })
      .filter((item) => item.len >= 12);

    // Draw structural outlines (longest paths) first, then details top-to-bottom / left-to-right
    scaled.sort((a, b) => {
      const aMajor = a.len > 140 ? 0 : 1;
      const bMajor = b.len > 140 ? 0 : 1;
      if (aMajor !== bMajor) return aMajor - bMajor;
      if (aMajor === 0) return b.len - a.len;
      const yBucketDiff = Math.floor(a.minY / 80) - Math.floor(b.minY / 80);
      if (yBucketDiff !== 0) return yBucketDiff;
      return a.minX - b.minX;
    });

    for (const item of scaled) {
      const d = pointsToSmoothSvgPath(item.simplified);
      const strokeWidth = Math.max(3.4, Math.min(9.5, item.avgRadius * 2.2));
      allPaths.push({
        d,
        color: INK_HEX[colorKey],
        strokeWidth: Number(strokeWidth.toFixed(1)),
        length: Number(item.len.toFixed(1)),
        order: orderCounter++,
      });
    }
  }

  const totalLength = allPaths.reduce((acc, p) => acc + p.length, 0);

  return {
    width: TARGET_VIEWBOX_W,
    height: TARGET_VIEWBOX_H,
    totalLength: Number(totalLength.toFixed(1)),
    paths: allPaths,
  };
}
