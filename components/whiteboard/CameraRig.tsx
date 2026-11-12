"use client";

import React, { useMemo } from "react";
import { WhiteboardBeat } from "@/types/whiteboard-video";

interface CameraRigProps {
  beats: WhiteboardBeat[];
  activeBeatIndex: number;
  activeBeatProgress: number;
  isOverview: boolean;
  children: React.ReactNode;
}

/**
 * Infinite virtual 2D whiteboard SVG canvas with smooth pan/zoom camera transitions
 * between beat slots, plus a full-board overview zoom-out at the end of the lesson.
 */
export function CameraRig({
  beats,
  activeBeatIndex,
  activeBeatProgress,
  isOverview,
  children,
}: CameraRigProps) {
  const worldBounds = useMemo(() => {
    if (beats.length === 0) {
      return { minX: 0, minY: 0, width: 1920, height: 1080 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const beat of beats) {
      const s = beat.boardSlot;
      if (s.x < minX) minX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.x + s.width > maxX) maxX = s.x + s.width;
      if (s.y + s.height > maxY) maxY = s.y + s.height;
    }
    const padX = 120;
    const padY = 90;
    return {
      minX: minX - padX,
      minY: minY - padY,
      width: maxX - minX + padX * 2,
      height: maxY - minY + padY * 2,
    };
  }, [beats]);

  const activeSlot = useMemo(
    () =>
      beats[activeBeatIndex]?.boardSlot || {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      },
    [beats, activeBeatIndex]
  );

  // Subtle camera breath while drawing inside active slot, or full board in overview mode
  const zoomEase = isOverview ? 1 : 1 + Math.sin(activeBeatProgress * Math.PI) * 0.025;
  const viewBox = useMemo(() => {
    if (isOverview) {
      return `${worldBounds.minX} ${worldBounds.minY} ${worldBounds.width} ${worldBounds.height}`;
    }
    const w = activeSlot.width / zoomEase;
    const h = activeSlot.height / zoomEase;
    const cx = activeSlot.x + activeSlot.width / 2;
    const cy = activeSlot.y + activeSlot.height / 2;
    return `${(cx - w / 2).toFixed(1)} ${(cy - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
  }, [isOverview, worldBounds, activeSlot, zoomEase]);

  return (
    <div className="relative w-full h-full bg-[#FCFBF8] overflow-hidden select-none">
      {/* Subtle dry-erase whiteboard dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage: "radial-gradient(#cbd5e1 1.2px, transparent 1.2px)",
          backgroundSize: "24px 24px",
        }}
      />

      <svg
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        className="relative z-10 w-full h-full transition-all duration-700 ease-out"
      >
        {/* Hand-drawn flow connector lines shown only in full-board overview */}
        {isOverview && beats.slice(0, -1).map((beat, idx) => {
          const next = beats[idx + 1];
          const fromX = beat.boardSlot.x + beat.boardSlot.width;
          const fromY = beat.boardSlot.y + beat.boardSlot.height / 2;
          const toX = next.boardSlot.x;
          const toY = next.boardSlot.y + next.boardSlot.height / 2;
          const sameRow = Math.abs(beat.boardSlot.y - next.boardSlot.y) < 100;

          if (sameRow) {
            return (
              <path
                key={`conn-${idx}`}
                d={`M ${fromX - 20} ${fromY} Q ${(fromX + toX) / 2} ${fromY - 40} ${toX + 20} ${toY}`}
                fill="none"
                stroke="#94a3b8"
                strokeWidth="5"
                strokeDasharray="14 10"
              />
            );
          }

          return (
            <path
              key={`conn-${idx}`}
              d={`M ${beat.boardSlot.x + beat.boardSlot.width / 2} ${beat.boardSlot.y + beat.boardSlot.height - 10} C ${beat.boardSlot.x + beat.boardSlot.width / 2} ${beat.boardSlot.y + beat.boardSlot.height + 120}, ${next.boardSlot.x + next.boardSlot.width / 2} ${next.boardSlot.y - 120}, ${next.boardSlot.x + next.boardSlot.width / 2} ${next.boardSlot.y + 10}`}
              fill="none"
              stroke="#94a3b8"
              strokeWidth="5"
              strokeDasharray="14 10"
            />
          );
        })}

        {children}
      </svg>
    </div>
  );
}
