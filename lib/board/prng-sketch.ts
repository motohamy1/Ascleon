export interface SketchPoint {
  x: number;
  y: number;
  /** Pressure factor [0.2 .. 1.3] */
  p?: number;
}

export interface InkStroke {
  id: string;
  /** 'p' = pen, 'h' = highlighter */
  k: "p" | "h";
  c: string;
  w: number;
  points: SketchPoint[];
}

/**
 * Deterministic 32-bit FNV-1a hash from an arbitrary element identity key.
 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Mulberry32 deterministic PRNG seeded from a 32-bit integer.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeededRng(key: string): () => number {
  return mulberry32(fnv1a32(key));
}

function dist(a: SketchPoint, b: SketchPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Resamples a polyline at uniform spacing so perpendicular jitter and partialStroke()
 * produce consistent, silky marker strokes regardless of segment length.
 */
export function resamplePolyline(
  pts: SketchPoint[],
  stepPx = 10
): SketchPoint[] {
  if (pts.length <= 1) return pts.slice();
  const out: SketchPoint[] = [{ ...pts[0] }];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const d = dist(a, b);
    const steps = Math.max(1, Math.ceil(d / stepPx));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        p:
          a.p !== undefined && b.p !== undefined
            ? a.p + (b.p - a.p) * t
            : 0.85,
      });
    }
  }
  return out;
}

/**
 * Offsets points perpendicular to the stroke direction using a smooth sine envelope
 * plus deterministic micro-jitter keyed on `seedKey`. Zero flicker across repaints.
 */
export function sketchPolyline(
  pts: SketchPoint[],
  seedKey: string,
  wobbleAmp = 1.6,
  stepPx = 10
): SketchPoint[] {
  const resampled = resamplePolyline(pts, stepPx);
  if (resampled.length < 2) return resampled;

  const rng = createSeededRng(seedKey);
  const phase = rng() * Math.PI * 2;
  const freq = 1.5 + rng() * 2.2;
  const n = resampled.length;

  return resampled.map((pt, i) => {
    if (i === 0 || i === n - 1) {
      return { x: pt.x, y: pt.y, p: 0.72 };
    }
    const prev = resampled[i - 1];
    const next = resampled[i + 1];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    const t = i / (n - 1);
    const envelope = Math.sin(t * Math.PI);
    const wave = Math.sin(t * Math.PI * freq + phase) * wobbleAmp * 0.7;
    const jitter = (rng() - 0.5) * wobbleAmp * 0.85;
    const offset = (wave + jitter) * envelope;

    const pressure = 0.76 + Math.sin(t * Math.PI) * 0.24 + (rng() - 0.5) * 0.1;
    return {
      x: Number((pt.x + nx * offset).toFixed(2)),
      y: Number((pt.y + ny * offset).toFixed(2)),
      p: Math.max(0.45, Math.min(1.15, pressure)),
    };
  });
}

export function sketchLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seedKey: string,
  wobbleAmp = 1.4
): SketchPoint[] {
  return sketchPolyline(
    [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ],
    seedKey,
    wobbleAmp,
    10
  );
}

export function sketchRoundedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  seedKey: string,
  wobbleAmp = 1.5
): SketchPoint[] {
  const rad = Math.max(2, Math.min(r, w / 2, h / 2));
  const corners: SketchPoint[] = [];
  const arcSteps = 4;

  const pushArc = (cx: number, cy: number, startAng: number, endAng: number) => {
    for (let i = 0; i <= arcSteps; i++) {
      const a = startAng + ((endAng - startAng) * i) / arcSteps;
      corners.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
    }
  };

  pushArc(x + w - rad, y + rad, -Math.PI / 2, 0);
  pushArc(x + w - rad, y + h - rad, 0, Math.PI / 2);
  pushArc(x + rad, y + h - rad, Math.PI / 2, Math.PI);
  pushArc(x + rad, y + rad, Math.PI, Math.PI * 1.5);
  corners.push({ ...corners[0] });

  return sketchPolyline(corners, seedKey, wobbleAmp, 14);
}

export function sketchEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seedKey: string,
  wobbleAmp = 1.6
): SketchPoint[] {
  const pts: SketchPoint[] = [];
  const segs = 28;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push({
      x: cx + Math.cos(a) * rx,
      y: cy + Math.sin(a) * ry,
    });
  }
  return sketchPolyline(pts, seedKey, wobbleAmp, 12);
}

export function sketchArrow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seedKey: string,
  headSize = 10
): SketchPoint[][] {
  const shaft = sketchLine(x1, y1, x2, y2, `${seedKey}:shaft`, 1.3);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 6;
  const h1x = x2 - headSize * Math.cos(angle - spread);
  const h1y = y2 - headSize * Math.sin(angle - spread);
  const h2x = x2 - headSize * Math.cos(angle + spread);
  const h2y = y2 - headSize * Math.sin(angle + spread);
  const head = sketchPolyline(
    [
      { x: h1x, y: h1y },
      { x: x2, y: y2 },
      { x: h2x, y: h2y },
    ],
    `${seedKey}:head`,
    0.7,
    8
  );
  return [shaft, head];
}

/**
 * Returns a progressive slice [0..1] of a stroke polyline for reveal-only animation.
 */
export function partialStroke(
  pts: SketchPoint[],
  fraction: number
): SketchPoint[] {
  if (fraction <= 0 || pts.length === 0) return [];
  if (fraction >= 1 || pts.length === 1) return pts;

  const exactIdx = fraction * (pts.length - 1);
  const whole = Math.floor(exactIdx);
  const rem = exactIdx - whole;
  const out = pts.slice(0, whole + 1);
  if (whole + 1 < pts.length && rem > 0.01) {
    const a = pts[whole];
    const b = pts[whole + 1];
    out.push({
      x: a.x + (b.x - a.x) * rem,
      y: a.y + (b.y - a.y) * rem,
      p: a.p ?? 0.85,
    });
  }
  return out;
}

/**
 * Converts a pressure-aware polyline into a closed ribbon polygon outline.
 */
export function buildStrokeRibbonOutline(
  pts: SketchPoint[],
  baseWidth: number
): SketchPoint[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) {
    const p = pts[0];
    const r = baseWidth * 0.5;
    return [
      { x: p.x - r, y: p.y },
      { x: p.x, y: p.y - r },
      { x: p.x + r, y: p.y },
      { x: p.x, y: p.y + r },
    ];
  }

  const left: SketchPoint[] = [];
  const right: SketchPoint[] = [];

  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const pressure = pts[i].p ?? 0.85;
    const halfW = Math.max(0.5, (baseWidth * pressure) / 2);

    left.push({ x: pts[i].x + nx * halfW, y: pts[i].y + ny * halfW });
    right.push({ x: pts[i].x - nx * halfW, y: pts[i].y - ny * halfW });
  }

  return [...left, ...right.reverse()];
}

const pathCache = new WeakMap<SketchPoint[], Path2D>();

export function strokeToPath2D(pts: SketchPoint[], baseWidth: number): Path2D | null {
  if (typeof Path2D === "undefined" || pts.length < 2) return null;
  const cached = pathCache.get(pts);
  if (cached) return cached;

  const ribbon = buildStrokeRibbonOutline(pts, baseWidth);
  const path = new Path2D();
  if (ribbon.length > 0) {
    path.moveTo(ribbon[0].x, ribbon[0].y);
    for (let i = 1; i < ribbon.length; i++) {
      path.lineTo(ribbon[i].x, ribbon[i].y);
    }
    path.closePath();
  }
  pathCache.set(pts, path);
  return path;
}

// =============================================================================
// FREEHAND INK ENGINE HELPERS (Decimation, Eraser Splitting, Lasso)
// =============================================================================

export function decimateStrokePoints(
  pts: SketchPoint[],
  minDist = 2.2,
  maxPoints = 320
): SketchPoint[] {
  if (pts.length <= 2) {
    return pts.length === 1 ? [pts[0], { x: pts[0].x + 0.5, y: pts[0].y + 0.5, p: pts[0].p }] : pts;
  }
  const filtered: SketchPoint[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    if (dist(filtered[filtered.length - 1], pts[i]) >= minDist) {
      filtered.push(pts[i]);
    }
  }
  filtered.push(pts[pts.length - 1]);

  if (filtered.length <= maxPoints) return filtered;
  const stride = Math.ceil(filtered.length / maxPoints);
  const reduced = filtered.filter((_, idx) => idx % stride === 0 || idx === filtered.length - 1);
  return reduced.length >= 2 ? reduced : [filtered[0], filtered[filtered.length - 1]];
}

/**
 * Splits a stroke around an eraser point at (ex, ey) with radius `eraserR`,
 * matching PhysioTalk's crisp partial stroke erasure.
 */
export function eraseFromInkStroke(
  stroke: InkStroke,
  ex: number,
  ey: number,
  eraserR = 14
): InkStroke[] {
  const hitsAny = stroke.points.some((pt) => Math.hypot(pt.x - ex, pt.y - ey) <= eraserR);
  if (!hitsAny) return [stroke];

  const segments: SketchPoint[][] = [];
  let current: SketchPoint[] = [];

  for (const pt of stroke.points) {
    if (Math.hypot(pt.x - ex, pt.y - ey) > eraserR) {
      current.push(pt);
    } else {
      if (current.length >= 2) {
        segments.push(current);
      }
      current = [];
    }
  }
  if (current.length >= 2) {
    segments.push(current);
  }

  return segments.map((pts, idx) => ({
    ...stroke,
    id: `${stroke.id}_e${idx}_${Math.round(ex)}`,
    points: pts,
  }));
}
