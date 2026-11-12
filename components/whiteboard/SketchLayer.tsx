"use client";

import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { BeatVectorData, WhiteboardInkColor } from "@/types/whiteboard-video";

export interface ActivePenTip {
  x: number;
  y: number;
  color: WhiteboardInkColor;
  active: boolean;
}

interface SketchLayerProps {
  vectorData: BeatVectorData;
  /** Offset & scale inside the 1920x1080 beat frame */
  frameRect: { x: number; y: number; width: number; height: number };
  /** 0..1 drawing completion of this beat's strokes */
  progress: number;
  onPenUpdate?: (tip: ActivePenTip | null) => void;
}

/**
 * Renders traced 3-color marker SVG paths and animates stroke-dashoffset proportionally
 * to real path arc length, reporting the exact live marker tip coordinates.
 */
export function SketchLayer({
  vectorData,
  frameRect,
  progress,
  onPenUpdate,
}: SketchLayerProps) {
  const pathRefs = useRef<Array<SVGPathElement | null>>([]);
  const [measuredLengths, setMeasuredLengths] = useState<number[]>([]);

  useLayoutEffect(() => {
    const lens = vectorData.paths.map((p, idx) => {
      const el = pathRefs.current[idx];
      if (!el) return p.length || 1;
      try {
        const real = el.getTotalLength();
        return real > 0 ? real : p.length || 1;
      } catch {
        return p.length || 1;
      }
    });
    setMeasuredLengths(lens);
  }, [vectorData]);

  const { segments, totalArcLen } = useMemo(() => {
    const list: Array<{ start: number; end: number; len: number }> = [];
    let running = 0;
    for (let idx = 0; idx < vectorData.paths.length; idx++) {
      const len = measuredLengths[idx] ?? (vectorData.paths[idx].length || 1);
      const start = running;
      const end = running + len;
      list.push({ start, end, len });
      running = end;
    }
    return { segments: list, totalArcLen: Math.max(1, running) };
  }, [vectorData.paths, measuredLengths]);

  const clamped = Math.max(0, Math.min(1, progress));
  const drawnDist = clamped * totalArcLen;

  const scaleX = frameRect.width / Math.max(1, vectorData.width);
  const scaleY = frameRect.height / Math.max(1, vectorData.height);
  const uniformScale = Math.min(scaleX, scaleY);
  const offsetX = frameRect.x + (frameRect.width - vectorData.width * uniformScale) / 2;
  const offsetY = frameRect.y + (frameRect.height - vectorData.height * uniformScale) / 2;

  useLayoutEffect(() => {
    if (!onPenUpdate) return;
    if (clamped <= 0.001 || clamped >= 0.999 || segments.length === 0) {
      onPenUpdate(null);
      return;
    }

    const activeIdx = segments.findIndex((seg) => drawnDist >= seg.start && drawnDist < seg.end);
    if (activeIdx === -1) {
      onPenUpdate(null);
      return;
    }

    const el = pathRefs.current[activeIdx];
    const seg = segments[activeIdx];
    const pathMeta = vectorData.paths[activeIdx];
    if (!el || !pathMeta) {
      onPenUpdate(null);
      return;
    }

    try {
      const localLen = Math.max(0, Math.min(seg.len, drawnDist - seg.start));
      const pt = el.getPointAtLength(localLen);
      onPenUpdate({
        x: offsetX + pt.x * uniformScale,
        y: offsetY + pt.y * uniformScale,
        color: pathMeta.color,
        active: true,
      });
    } catch {
      onPenUpdate(null);
    }
  }, [clamped, drawnDist, segments, vectorData.paths, offsetX, offsetY, uniformScale, onPenUpdate]);

  return (
    <g transform={`translate(${offsetX.toFixed(1)}, ${offsetY.toFixed(1)}) scale(${uniformScale.toFixed(4)})`}>
      {vectorData.paths.map((stroke, idx) => {
        const seg = segments[idx];
        const len = seg ? seg.len : stroke.length || 1;
        const start = seg ? seg.start : 0;
        const end = seg ? seg.end : len;

        let dashOffset = len;
        let visible = true;

        if (drawnDist <= start) {
          dashOffset = len;
          visible = false;
        } else if (drawnDist >= end) {
          dashOffset = 0;
        } else {
          dashOffset = Math.max(0, len - (drawnDist - start));
        }

        return (
          <path
            key={`${stroke.order}-${idx}`}
            ref={(node) => {
              pathRefs.current[idx] = node;
            }}
            d={stroke.d}
            fill="none"
            stroke={stroke.color}
            strokeWidth={stroke.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={len}
            strokeDashoffset={dashOffset}
            opacity={visible ? 1 : 0}
          />
        );
      })}
    </g>
  );
}
