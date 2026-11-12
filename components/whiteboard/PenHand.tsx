"use client";

import React from "react";
import { WhiteboardInkColor } from "@/types/whiteboard-video";

interface PenHandProps {
  /** World X inside the 1920x1080 beat frame */
  x: number;
  /** World Y inside the 1920x1080 beat frame */
  y: number;
  visible: boolean;
  isWriting: boolean;
  color: WhiteboardInkColor;
}

/**
 * Dry-erase marker hand rendered inside the 1920x1080 beat SVG/board coordinate space.
 * The marker nib tip is strictly anchored at (0, 0) so translate(x, y) places the tip
 * directly onto the live SVG path point.
 */
export function PenHand({ x, y, visible, isWriting, color }: PenHandProps) {
  if (!visible) return null;

  const wobbleRotate = isWriting ? Math.sin(x * 0.14 + y * 0.14) * 3.5 : 0;

  return (
    <g
      transform={`translate(${x.toFixed(1)}, ${y.toFixed(1)}) rotate(${wobbleRotate.toFixed(2)})`}
      style={{ pointerEvents: "none", transition: isWriting ? "none" : "opacity 180ms ease" }}
    >
      {/* Subtle contact shadow on whiteboard surface */}
      <ellipse cx="18" cy="12" rx="18" ry="6" fill="rgba(15, 14, 16, 0.14)" />

      {/* Marker nib tip directly at (0,0) */}
      <polygon points="0,0 14,-8 18,-2 4,6" fill={color} stroke="#0f0e10" strokeWidth="1.5" />
      {/* Metallic nib collar */}
      <polygon points="14,-8 28,-19 36,-9 18,-2" fill="#e2e8f0" stroke="#334155" strokeWidth="2" />
      {/* Marker barrel */}
      <polygon points="28,-19 102,-82 118,-62 36,-9" fill="#f8fafc" stroke="#1e293b" strokeWidth="3" />
      {/* Color-coded band & end cap matching active ink */}
      <polygon points="44,-33 58,-45 70,-30 56,-18" fill={color} />
      <polygon points="94,-75 110,-89 126,-69 110,-55" fill={color} stroke="#0f0e10" strokeWidth="2.5" />

      {/* Fingers & thumb gripping the barrel */}
      <path
        d="M 48 -4 C 36 -18, 52 -38, 70 -30 C 86 -24, 90 -8, 78 6 C 68 18, 54 8, 48 -4 Z"
        fill="#fed7aa"
        stroke="#9a3412"
        strokeWidth="3"
      />
      <path
        d="M 32 -12 C 24 -24, 42 -42, 58 -34 C 66 -28, 56 -12, 42 -10 Z"
        fill="#ffedd5"
        stroke="#9a3412"
        strokeWidth="2.5"
      />
      <path
        d="M 62 4 C 78 -14, 110 -46, 134 -56 L 166 10 C 138 24, 96 26, 62 4 Z"
        fill="#fdba74"
        stroke="#9a3412"
        strokeWidth="3"
      />
      {/* Sleeve cuff */}
      <path
        d="M 122 -52 L 182 -88 L 222 -14 L 154 22 Z"
        fill="#1e293b"
        stroke="#0f0e10"
        strokeWidth="3"
      />
    </g>
  );
}
