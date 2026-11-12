"use client";

import React from "react";
import { BeatLabel, WhiteboardInkColor } from "@/types/whiteboard-video";

interface HandwrittenTextProps {
  beatNumber: number;
  title: string;
  sourcePage: number;
  labels: BeatLabel[];
  /** 0..1 reveal progress for the beat title header */
  headerProgress: number;
  /** 0..1 reveal progress across all beat labels sequentially */
  labelsProgress: number;
}

const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

function getToneStyles(tone: BeatLabel["tone"]): {
  color: WhiteboardInkColor;
  underline: string;
  pillBg: string;
  badgeText: string;
} {
  if (tone === "pathology") {
    return {
      color: "#DC2626",
      underline: "rgba(220, 38, 38, 0.35)",
      pillBg: "rgba(220, 38, 38, 0.08)",
      badgeText: "PATHOLOGY",
    };
  }
  if (tone === "normal") {
    return {
      color: "#2563EB",
      underline: "rgba(37, 99, 235, 0.35)",
      pillBg: "rgba(37, 99, 235, 0.08)",
      badgeText: "NORMAL / TX",
    };
  }
  return {
    color: "#18181B",
    underline: "rgba(24, 24, 27, 0.25)",
    pillBg: "rgba(24, 24, 27, 0.05)",
    badgeText: "KEY POINT",
  };
}

/**
 * Computes the active pen tip coordinate inside the 1920x1080 beat frame while handwriting labels.
 */
export function getLabelPenTip(
  labels: BeatLabel[],
  labelsProgress: number
): { x: number; y: number; color: WhiteboardInkColor } | null {
  if (labels.length === 0 || labelsProgress <= 0.005 || labelsProgress >= 0.995) {
    return null;
  }

  const slotSize = 1 / labels.length;
  const idx = Math.min(labels.length - 1, Math.floor(labelsProgress / slotSize));
  const localP = (labelsProgress - idx * slotSize) / slotSize;
  const lbl = labels[idx];
  const isRtl = ARABIC_REGEX.test(lbl.text);
  const tone = getToneStyles(lbl.tone);

  const baseX = (lbl.x / 100) * 1920;
  const baseY = (lbl.y / 100) * 1080;
  const spanW = Math.min(440, Math.max(180, lbl.text.length * 16));

  const sweepX = isRtl
    ? baseX + spanW * (1 - localP)
    : baseX + spanW * localP;
  const waveY = baseY + Math.sin(localP * Math.PI * 10) * 8;

  return { x: sweepX, y: waveY, color: tone.color };
}

/**
 * Renders the beat title and crisp BiDi-safe handwritten callout labels using foreignObject
 * inside the 1920x1080 beat SVG coordinate system.
 */
export function HandwrittenText({
  beatNumber,
  title,
  sourcePage,
  labels,
  headerProgress,
  labelsProgress,
}: HandwrittenTextProps) {
  const titleIsRtl = ARABIC_REGEX.test(title);
  const titleClip = titleIsRtl
    ? `inset(0 0 0 ${Math.round((1 - Math.min(1, Math.max(0, headerProgress))) * 100)}%)`
    : `inset(0 ${Math.round((1 - Math.min(1, Math.max(0, headerProgress))) * 100)}% 0 0)`;

  return (
    <foreignObject x="0" y="0" width="1920" height="1080" style={{ pointerEvents: "none" }}>
      <div className="relative w-[1920px] h-[1080px] select-none overflow-hidden">
        {/* Beat Chapter Title Bar */}
        <div
          className="absolute left-[56px] top-[34px] right-[56px] flex items-center justify-between gap-6 border-b-[3px] border-[#18181B]/15 pb-3"
          style={{
            clipPath: titleClip,
            opacity: headerProgress > 0.02 ? 1 : 0,
          }}
        >
          <div className="flex items-center gap-4 min-w-0">
            <span className="inline-flex items-center justify-center rounded-full border-[3px] border-[#18181B] bg-[#ff4c00] px-4 py-1 font-mono text-[22px] font-black text-[#0f0e10] shrink-0">
              {String(beatNumber).padStart(2, "0")}
            </span>
            <h3
              dir="auto"
              className="truncate text-[46px] font-bold leading-tight text-[#18181B]"
              style={{
                fontFamily: titleIsRtl
                  ? "var(--font-marhey), var(--font-mona-sans), sans-serif"
                  : "var(--font-caveat), var(--font-mona-sans), cursive",
              }}
            >
              {title}
            </h3>
          </div>

          <span className="shrink-0 rounded-full border-2 border-[#18181B]/30 bg-[#fbf7f0] px-4 py-1 font-mono text-[20px] font-bold text-[#18181B]/75">
            Source p.{sourcePage}
          </span>
        </div>

        {/* Handwritten Callout Labels */}
        {labels.map((lbl, idx) => {
          const slotSize = 1 / Math.max(1, labels.length);
          const localProgress = Math.max(
            0,
            Math.min(1, (labelsProgress - idx * slotSize) / slotSize)
          );
          if (localProgress <= 0.01) return null;

          const isRtl = ARABIC_REGEX.test(lbl.text);
          const style = getToneStyles(lbl.tone);
          const clipPath = isRtl
            ? `inset(0 0 0 ${Math.round((1 - localProgress) * 100)}%)`
            : `inset(0 ${Math.round((1 - localProgress) * 100)}% 0 0)`;

          return (
            <div
              key={lbl.id}
              dir="auto"
              style={{
                left: `${lbl.x}%`,
                top: `${lbl.y}%`,
                transform: "translateY(-50%)",
                clipPath,
                backgroundColor: style.pillBg,
                borderLeft: isRtl ? undefined : `6px solid ${style.color}`,
                borderRight: isRtl ? `6px solid ${style.color}` : undefined,
              }}
              className="absolute max-w-[490px] rounded-xl px-5 py-3 shadow-xs"
            >
              <div
                className="font-mono text-[16px] font-black tracking-wider uppercase opacity-75 mb-0.5"
                style={{ color: style.color }}
              >
                {style.badgeText}
              </div>
              <div
                className="text-[40px] font-bold leading-[1.28]"
                style={{
                  color: style.color,
                  fontFamily: isRtl
                    ? "var(--font-marhey), var(--font-mona-sans), sans-serif"
                    : "var(--font-caveat), var(--font-mona-sans), cursive",
                  textDecoration: "underline",
                  textDecorationColor: style.underline,
                  textUnderlineOffset: "7px",
                  textDecorationThickness: "3px",
                }}
              >
                {lbl.text}
              </div>
            </div>
          );
        })}
      </div>
    </foreignObject>
  );
}
