"use client";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import katex from "katex";
import {
  BOARD,
  BoardOpsLayout,
  BoardPrimitive,
  revealAt,
} from "@/lib/board/ops-layout";
import {
  decimateStrokePoints,
  eraseFromInkStroke,
  InkStroke,
  SketchPoint,
  strokeToPath2D,
} from "@/lib/board/prng-sketch";
export type InkTool = "none" | "pen" | "highlighter" | "eraser";

export interface HandwrittenBoardSurfaceHandle {
  exportToCanvas: (targetWidth?: number) => HTMLCanvasElement | null;
  undoInk: () => void;
  redoInk: () => void;
  clearInk: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface HandwrittenBoardSurfaceProps {
  layout: BoardOpsLayout;
  fraction: number;
  isPlaying: boolean;
  isPosterFull?: boolean;
  activeNodeId?: string | null;
  inkTool?: InkTool;
  inkColor?: string;
  inkWidth?: number;
  onNavigateToPage?: (page: number) => void;
  onInkHistoryChange?: (state: { canUndo: boolean; canRedo: boolean; count: number }) => void;
}

function getFontStack(fontKind: "hand" | "body" | "mono", rtl?: boolean): string {
  if (fontKind === "mono") {
    return "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  }
  if (fontKind === "body") {
    return rtl
      ? "var(--font-playpen-arabic), var(--font-marhey), var(--font-mona-sans), sans-serif"
      : "var(--font-mona-sans), system-ui, sans-serif";
  }
  return rtl
    ? "var(--font-playpen-arabic), var(--font-marhey), var(--font-kalam), cursive"
    : "var(--font-kalam), var(--font-caveat), var(--font-playpen-arabic), cursive";
}

function PencilCursor({
  x,
  y,
  visible,
  isWriting,
  color,
}: {
  x: number;
  y: number;
  visible: boolean;
  isWriting: boolean;
  color: string;
}) {
  if (!visible) return null;
  const tilt = isWriting ? Math.sin(x * 0.12 + y * 0.12) * 3 : 0;
  const accent = color || "#18181B";

  return (
    <g
      transform={`translate(${x.toFixed(1)}, ${y.toFixed(1)}) rotate(${tilt.toFixed(2)})`}
      style={{ pointerEvents: "none" }}
      opacity={0.9}
    >
      {/* Subtle ink contact halo directly at drawing tip (0,0) */}
      <circle cx="0" cy="0" r="4.5" fill={accent} fillOpacity="0.18" />
      <circle cx="0" cy="0" r="1.8" fill={accent} />
      {/* Slender pencil-only wooden cone + graphite tip (no bulky hand) */}
      <polygon points="0,0 8.5,-5 11.5,-1.5" fill="#FDE68A" stroke="#18181B" strokeWidth="1" strokeLinejoin="round" />
      <polygon points="0,0 4.5,-2.6 5.8,-0.8" fill={accent} />
      {/* Sleek amber/slate pencil shaft */}
      <polygon points="8.5,-5 38,-28 42.5,-23 11.5,-1.5" fill="#F59E0B" stroke="#18181B" strokeWidth="1.2" strokeLinejoin="round" />
      {/* Ferrule + eraser cap */}
      <polygon points="38,-28 43,-32 47.5,-27 42.5,-23" fill="#CBD5E1" stroke="#334155" strokeWidth="1" />
      <polygon points="43,-32 47,-35.2 51.5,-30.2 47.5,-27" fill="#FB7185" stroke="#334155" strokeWidth="1" />
    </g>
  );
}

function paintStrokeList(
  ctx: CanvasRenderingContext2D,
  strokes: Array<{ points: SketchPoint[]; color: string; width: number; alpha?: number }>
) {
  for (const s of strokes) {
    if (s.points.length < 2) continue;
    ctx.save();
    ctx.globalAlpha = s.alpha ?? 1;
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.color;
    const path = strokeToPath2D(s.points, s.width);
    if (path) {
      ctx.fill(path);
    } else {
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i].x, s.points[i].y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

function paintStudentInk(ctx: CanvasRenderingContext2D, strokes: InkStroke[]) {
  // Pass 1: Multiply-blended highlighter strokes
  for (const s of strokes) {
    if (s.k !== "h" || s.points.length < 2) continue;
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.38;
    ctx.strokeStyle = s.c;
    ctx.lineWidth = s.w;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i].x, s.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Pass 2: Pen strokes with pressure ribbon
  paintStrokeList(
    ctx,
    strokes
      .filter((s) => s.k === "p")
      .map((s) => ({ points: s.points, color: s.c, width: s.w, alpha: 1 }))
  );
}

interface MeasuredTextNodeProps {
  prim: Extract<BoardPrimitive, { k: "text" }>;
  progress: number;
  isActiveNode: boolean;
  fontsReadySeq: number;
}

function MeasuredTextNode({
  prim,
  progress,
  isActiveNode,
  fontsReadySeq,
}: MeasuredTextNodeProps) {
  const spanRef = useRef<HTMLSpanElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [scaleX, setScaleX] = useState(1);

  useEffect(() => {
    const span = spanRef.current;
    const box = boxRef.current;
    if (!span || !box) return;
    const avail = box.clientWidth;
    const needed = span.scrollWidth;
    if (avail > 0 && needed > avail + 2) {
      setScaleX(Math.max(BOARD.minScale, avail / needed));
    } else {
      setScaleX(1);
    }
  }, [prim.text, prim.w, prim.fontSize, fontsReadySeq]);

  if (progress <= 0.01) return null;

  const revealPct = Math.round((1 - progress) * 100);
  const justify =
    prim.align === "center"
      ? "center"
      : prim.align === "right"
      ? "flex-end"
      : "flex-start";

  const clipPath = prim.rtl
    ? `inset(0 0 0 ${revealPct}%)`
    : `inset(0 ${revealPct}% 0 0)`;

  return (
    <div
      ref={boxRef}
      dir={prim.rtl ? "rtl" : "ltr"}
      data-board-text="true"
      style={{
        position: "absolute",
        left: `${(prim.x / BOARD.w) * 100}%`,
        top: `${(prim.y / BOARD.h) * 100}%`,
        width: `${(prim.w / BOARD.w) * 100}%`,
        height: `${(prim.h / BOARD.h) * 100}%`,
        display: "flex",
        alignItems: "center",
        justifyContent: justify,
        color: isActiveNode ? "#0F172A" : prim.color,
        fontFamily: getFontStack(prim.fontKind, prim.rtl),
        fontWeight: prim.weight,
        fontSize: `clamp(10px, ${(prim.fontSize / BOARD.w) * 100}cqw, ${prim.fontSize * 1.25}px)`,
        lineHeight: 1.08,
        whiteSpace: "nowrap",
        overflow: "hidden",
        clipPath,
        pointerEvents: "none",
      }}
    >
      <span
        ref={spanRef}
        dir="auto"
        style={{
          display: "inline-block",
          unicodeBidi: "isolate",
          transform: scaleX < 0.99 ? `scaleX(${scaleX.toFixed(3)})` : undefined,
          transformOrigin:
            prim.align === "center"
              ? "center center"
              : prim.align === "right" || prim.rtl
              ? "right center"
              : "left center",
        }}
      >
        {prim.text}
      </span>
    </div>
  );
}

function KaTeXFormulaNode({
  prim,
  progress,
}: {
  prim: Extract<BoardPrimitive, { k: "formula" }>;
  progress: number;
}) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(prim.tex, {
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      return prim.tex;
    }
  }, [prim.tex]);

  if (progress <= 0.02) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: `${(prim.x / BOARD.w) * 100}%`,
        top: `${(prim.y / BOARD.h) * 100}%`,
        width: `${(prim.w / BOARD.w) * 100}%`,
        height: `${(prim.h / BOARD.h) * 100}%`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: Math.min(1, progress * 1.25),
        color: prim.color,
        fontSize: `clamp(11px, ${(20 / BOARD.w) * 100}cqw, 24px)`,
        pointerEvents: "none",
        overflow: "hidden",
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export const HandwrittenBoardSurface = forwardRef<
  HandwrittenBoardSurfaceHandle,
  HandwrittenBoardSurfaceProps
>(function HandwrittenBoardSurface(
  {
    layout,
    fraction,
    isPlaying,
    isPosterFull = false,
    activeNodeId = null,
    inkTool = "none",
    inkColor = "#1D4ED8",
    inkWidth = 3.6,
    onNavigateToPage,
    onInkHistoryChange,
  },
  ref
) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [surfaceSize, setSurfaceSize] = useState({ width: 800, height: 500 });
  const [fontsReadySeq, setFontsReadySeq] = useState(0);

  // Freehand Student Ink state with bounded Undo/Redo
  const [inkPast, setInkPast] = useState<InkStroke[][]>([]);
  const [inkPresent, setInkPresent] = useState<InkStroke[]>([]);
  const [inkFuture, setInkFuture] = useState<InkStroke[][]>([]);
  const activeInkRef = useRef<InkStroke | null>(null);
  const isDrawingRef = useRef(false);

  const notifyInk = useCallback(
    (past: InkStroke[][], present: InkStroke[], future: InkStroke[][]) => {
      onInkHistoryChange?.({
        canUndo: past.length > 0,
        canRedo: future.length > 0,
        count: present.length,
      });
    },
    [onInkHistoryChange]
  );

  const commitInkState = useCallback(
    (nextPresent: InkStroke[]) => {
      setInkPast((prevPast) => {
        const nextPast = [...prevPast.slice(-24), inkPresent];
        setInkPresent(nextPresent);
        setInkFuture([]);
        notifyInk(nextPast, nextPresent, []);
        return nextPast;
      });
    },
    [inkPresent, notifyInk]
  );

  const undoInk = useCallback(() => {
    if (inkPast.length === 0) return;
    const previous = inkPast[inkPast.length - 1];
    const nextPast = inkPast.slice(0, -1);
    const nextFuture = [inkPresent, ...inkFuture.slice(0, 24)];
    setInkPast(nextPast);
    setInkPresent(previous);
    setInkFuture(nextFuture);
    notifyInk(nextPast, previous, nextFuture);
  }, [inkPast, inkPresent, inkFuture, notifyInk]);

  const redoInk = useCallback(() => {
    if (inkFuture.length === 0) return;
    const next = inkFuture[0];
    const nextFuture = inkFuture.slice(1);
    const nextPast = [...inkPast.slice(-24), inkPresent];
    setInkPast(nextPast);
    setInkPresent(next);
    setInkFuture(nextFuture);
    notifyInk(nextPast, next, nextFuture);
  }, [inkPast, inkPresent, inkFuture, notifyInk]);

  const clearInk = useCallback(() => {
    if (inkPresent.length === 0) return;
    commitInkState([]);
  }, [inkPresent.length, commitInkState]);

  // Explicitly wait on handwriting fonts before measuring text
  useEffect(() => {
    if (typeof document === "undefined" || !("fonts" in document)) return;
    let cancelled = false;
    const bump = () => {
      if (!cancelled) setFontsReadySeq((n) => n + 1);
    };
    Promise.allSettled([
      document.fonts.load("400 22px Kalam"),
      document.fonts.load("700 22px Kalam"),
      document.fonts.load("400 22px 'Playpen Sans Arabic'"),
      document.fonts.load("700 22px 'Playpen Sans Arabic'"),
      document.fonts.ready,
    ]).then(bump);
    document.fonts.addEventListener?.("loadingdone", bump);
    return () => {
      cancelled = true;
      document.fonts.removeEventListener?.("loadingdone", bump);
    };
  }, []);

  // Track responsive canvas pixel dimensions
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        setSurfaceSize({ width: rect.width, height: rect.height });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const reveal = useMemo(
    () =>
      revealAt(layout, fraction, {
        isPosterFull,
        activeNodeId,
      }),
    [layout, fraction, isPosterFull, activeNodeId]
  );

  // Paint deterministic sketchy strokes + fills + student ink onto high-DPI canvas
  const paintToCanvas = useCallback(
    (
      canvas: HTMLCanvasElement,
      targetW: number,
      targetH: number,
      includeTextForExport = false
    ) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = targetW;
      canvas.height = targetH;

      ctx.save();
      ctx.scale(targetW / BOARD.w, targetH / BOARD.h);

      if (includeTextForExport) {
        ctx.fillStyle = "#FCFBF8";
        ctx.fillRect(0, 0, BOARD.w, BOARD.h);
        // Subtle export dot grid
        ctx.fillStyle = "rgba(148, 163, 184, 0.35)";
        for (let gx = 24; gx < BOARD.w; gx += 24) {
          for (let gy = 24; gy < BOARD.h; gy += 24) {
            ctx.beginPath();
            ctx.arc(gx, gy, 1.1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else {
        ctx.clearRect(0, 0, BOARD.w, BOARD.h);
      }

      // 1. Pastel highlight fills
      for (const prim of layout.primitives) {
        if (prim.k !== "fill") continue;
        const p = reveal.progressById[prim.id] ?? 0;
        if (p <= 0.02) continue;
        ctx.save();
        ctx.globalAlpha = (prim.alpha ?? 0.85) * Math.min(1, p * 1.4);
        ctx.fillStyle = prim.color;
        ctx.beginPath();
        ctx.roundRect(prim.x, prim.y, prim.w, prim.h, prim.r);
        ctx.fill();
        ctx.restore();
      }

      // 2. Active node soft orange halo
      if (activeNodeId && !isPosterFull) {
        for (const prim of layout.primitives) {
          if (prim.k === "fill" && prim.nodeId === activeNodeId) {
            ctx.save();
            ctx.strokeStyle = "rgba(255, 76, 0, 0.45)";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.roundRect(prim.x - 4, prim.y - 4, prim.w + 8, prim.h + 8, prim.r + 3);
            ctx.stroke();
            ctx.restore();
            break;
          }
        }
      }

      // 3. Export text if requested (offscreen WYSIWYG PNG export)
      if (includeTextForExport) {
        for (const prim of layout.primitives) {
          if (prim.k === "text") {
            const p = reveal.progressById[prim.id] ?? 0;
            if (p <= 0.05) continue;
            ctx.save();
            ctx.fillStyle = prim.color;
            ctx.font = `${prim.weight} ${prim.fontSize}px ${
              prim.fontKind === "mono"
                ? "monospace"
                : prim.fontKind === "body"
                ? "sans-serif"
                : "Kalam, Caveat, cursive"
            }`;
            ctx.textBaseline = "middle";
            const ty = prim.y + prim.h / 2;
            let tx = prim.x;
            if (prim.align === "center") {
              ctx.textAlign = "center";
              tx = prim.x + prim.w / 2;
            } else if (prim.align === "right") {
              ctx.textAlign = "right";
              tx = prim.x + prim.w;
            } else {
              ctx.textAlign = "left";
            }
            const measured = ctx.measureText(prim.text).width;
            if (measured > prim.w && prim.w > 0) {
              const sx = Math.max(BOARD.minScale, prim.w / measured);
              ctx.translate(tx, ty);
              ctx.scale(sx, 1);
              ctx.fillText(prim.text, 0, 0);
            } else {
              ctx.fillText(prim.text, tx, ty);
            }
            ctx.restore();
          } else if (prim.k === "formula") {
            ctx.save();
            ctx.fillStyle = prim.color;
            ctx.font = "600 18px serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(prim.tex, prim.x + prim.w / 2, prim.y + prim.h / 2);
            ctx.restore();
          }
        }
      }

      // 4. Deterministic sketchy ink strokes
      const strokeDrawList: Array<{
        points: SketchPoint[];
        color: string;
        width: number;
        alpha?: number;
      }> = [];
      for (const prim of layout.primitives) {
        if (prim.k !== "stroke") continue;
        const pts = reveal.visibleStrokes.get(prim.id);
        if (!pts || pts.length < 2) continue;
        strokeDrawList.push({
          points: pts,
          color: prim.color,
          width: prim.width,
          alpha: prim.alpha,
        });
      }
      paintStrokeList(ctx, strokeDrawList);

      // 5. Freehand Student Ink + active stroke preview
      const allInk = activeInkRef.current
        ? [...inkPresent, activeInkRef.current]
        : inkPresent;
      paintStudentInk(ctx, allInk);

      ctx.restore();
    },
    [layout, reveal, activeNodeId, isPosterFull, inkPresent]
  );

  // Trigger canvas repaint whenever layout, reveal, size, or student ink changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr =
      typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2.5) : 1;
    const targetW = Math.max(400, Math.round(surfaceSize.width * dpr));
    const targetH = Math.max(250, Math.round(surfaceSize.height * dpr));
    paintToCanvas(canvas, targetW, targetH, false);
  }, [surfaceSize, paintToCanvas]);

  useImperativeHandle(
    ref,
    () => ({
      exportToCanvas: (targetWidth = 2000) => {
        if (typeof document === "undefined") return null;
        const off = document.createElement("canvas");
        const targetH = Math.round((targetWidth * BOARD.h) / BOARD.w);
        paintToCanvas(off, targetWidth, targetH, true);
        return off;
      },
      undoInk,
      redoInk,
      clearInk,
      canUndo: inkPast.length > 0,
      canRedo: inkFuture.length > 0,
    }),
    [paintToCanvas, undoInk, redoInk, clearInk, inkPast.length, inkFuture.length]
  );

  // Freehand pointer interaction mapped into 1000x625 board coordinates
  const toBoardPoint = (e: React.PointerEvent<HTMLDivElement>): SketchPoint => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0, p: 0.85 };
    return {
      x: ((e.clientX - rect.left) / rect.width) * BOARD.w,
      y: ((e.clientY - rect.top) / rect.height) * BOARD.h,
      p: e.pressure && e.pressure > 0 ? Math.max(0.4, Math.min(1.25, e.pressure * 1.1)) : 0.85,
    };
  };

  const repaintLiveInk = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr =
      typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2.5) : 1;
    paintToCanvas(
      canvas,
      Math.max(400, Math.round(surfaceSize.width * dpr)),
      Math.max(250, Math.round(surfaceSize.height * dpr)),
      false
    );
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (inkTool === "none") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toBoardPoint(e);

    if (inkTool === "eraser") {
      isDrawingRef.current = true;
      const next = inkPresent.flatMap((s) => eraseFromInkStroke(s, pt.x, pt.y, 15));
      if (next.length !== inkPresent.length) {
        commitInkState(next);
      }
      return;
    }

    isDrawingRef.current = true;
    activeInkRef.current = {
      id: `ink_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      k: inkTool === "highlighter" ? "h" : "p",
      c: inkColor,
      w: inkTool === "highlighter" ? 22 : inkWidth,
      points: [pt],
    };
    repaintLiveInk();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawingRef.current || inkTool === "none") return;
    const pt = toBoardPoint(e);

    if (inkTool === "eraser") {
      const next = inkPresent.flatMap((s) => eraseFromInkStroke(s, pt.x, pt.y, 15));
      if (next.length !== inkPresent.length || next.some((s, i) => s !== inkPresent[i])) {
        commitInkState(next);
      }
      return;
    }

    if (activeInkRef.current) {
      activeInkRef.current.points.push(pt);
      repaintLiveInk();
    }
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (activeInkRef.current) {
      const finished: InkStroke = {
        ...activeInkRef.current,
        points: decimateStrokePoints(activeInkRef.current.points),
      };
      activeInkRef.current = null;
      commitInkState([...inkPresent, finished]);
    }
  };

  return (
    <div
      ref={surfaceRef}
      data-board-surface="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        aspectRatio: "1000 / 625",
        containerType: "inline-size",
        touchAction: inkTool !== "none" ? "none" : "auto",
      }}
      className="relative w-full max-h-full overflow-hidden rounded-[14px] border-2 border-[#18181B] bg-[#FCFBF8] shadow-[0_6px_24px_rgba(15,14,16,0.12)] select-none"
    >
      {/* Subtle dry-erase dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(#cbd5e1 1.1px, transparent 1.1px)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* High-DPI Canvas for fills, seeded PRNG strokes & student freehand ink */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full"
      />

      {/* Percentage-positioned measured text, KaTeX formulas & page badges */}
      {layout.primitives.map((prim) => {
        const p = reveal.progressById[prim.id] ?? 0;
        if (prim.k === "text") {
          return (
            <MeasuredTextNode
              key={prim.id}
              prim={prim}
              progress={p}
              isActiveNode={Boolean(activeNodeId && prim.nodeId === activeNodeId)}
              fontsReadySeq={fontsReadySeq}
            />
          );
        }
        if (prim.k === "formula") {
          return <KaTeXFormulaNode key={prim.id} prim={prim} progress={p} />;
        }
        if (prim.k === "badge" && p > 0.45 && prim.page) {
          return (
            <button
              key={prim.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToPage?.(prim.page!);
              }}
              title={
                prim.inferred
                  ? `Synthesized context from Page ${prim.page}`
                  : `Jump to Page ${prim.page}: "${prim.quote || ""}"`
              }
              style={{
                position: "absolute",
                left: `${(prim.x / BOARD.w) * 100}%`,
                top: `${(prim.y / BOARD.h) * 100}%`,
                width: `${(prim.w / BOARD.w) * 100}%`,
                height: `${(prim.h / BOARD.h) * 100}%`,
              }}
              className="z-10 cursor-pointer flex items-center justify-center rounded-full border border-slate-300 bg-white/95 font-mono text-[10px] font-black text-slate-700 hover:border-[#ff4c00] hover:text-[#ff4c00] transition-colors shadow-2xs"
            >
              {prim.label}
            </button>
          );
        }
        return null;
      })}

      {/* Live Pencil Nib tracking the active drawing tip (pencil-only, zero bulky hand) */}
      {isPlaying && reveal.penTip && !isPosterFull && (
        <svg
          viewBox={`0 0 ${BOARD.w} ${BOARD.h}`}
          className="pointer-events-none absolute inset-0 z-20 size-full"
        >
          <PencilCursor
            x={reveal.penTip.x}
            y={reveal.penTip.y}
            visible={reveal.penTip.active}
            isWriting={isPlaying}
            color={reveal.penTip.color}
          />
        </svg>
      )}
    </div>
  );
});
