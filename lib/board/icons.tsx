"use client";

import React, { useLayoutEffect, useRef } from "react";
import {
  Activity,
  AlertTriangle,
  Bone,
  BookOpen,
  Brain,
  CheckCircle2,
  CircleDot,
  Dna,
  Droplet,
  Eye,
  Flame,
  FlaskConical,
  GitBranch,
  HeartPulse,
  LucideIcon,
  Microscope,
  Pill,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Thermometer,
  Wind,
  Zap,
} from "lucide-react";
import { LessonIconId } from "@/types/lesson-board";

export const LESSON_ICON_COMPONENTS: Record<LessonIconId, LucideIcon> = {
  "heart-pulse": HeartPulse,
  brain: Brain,
  bone: Bone,
  pill: Pill,
  syringe: Syringe,
  droplet: Droplet,
  microscope: Microscope,
  activity: Activity,
  stethoscope: Stethoscope,
  thermometer: Thermometer,
  dna: Dna,
  wind: Wind,
  eye: Eye,
  "shield-check": ShieldCheck,
  "alert-triangle": AlertTriangle,
  zap: Zap,
  flame: Flame,
  "flask-conical": FlaskConical,
  "git-branch": GitBranch,
  "check-circle": CheckCircle2,
  "circle-dot": CircleDot,
  "book-open": BookOpen,
};

interface BoardIconProps {
  iconId?: LessonIconId;
  color: string;
  size?: number;
  /** 0..1 progressive stroke reveal */
  progress?: number;
}

/**
 * Renders a stroke-animated clinical icon inside an SVG coordinate frame.
 * Sets normalized pathLength=100 on all inner SVG geometry elements so every stroke
 * draws smoothly from 0% to 100% regardless of icon complexity.
 */
export function BoardStrokeIcon({
  iconId = "circle-dot",
  color,
  size = 38,
  progress = 1,
}: BoardIconProps) {
  const Icon = LESSON_ICON_COMPONENTS[iconId] || CircleDot;
  const gRef = useRef<SVGGElement | null>(null);
  const clamped = Math.max(0, Math.min(1, progress));
  const dashOffset = ((1 - clamped) * 100).toFixed(1);

  useLayoutEffect(() => {
    const root = gRef.current;
    if (!root) return;
    const primitives = root.querySelectorAll(
      "path, circle, rect, line, polyline, polygon"
    );
    primitives.forEach((el) => {
      el.setAttribute("pathLength", "100");
    });
  }, [iconId]);

  return (
    <g
      ref={gRef}
      opacity={clamped > 0.02 ? 1 : 0}
      style={{
        strokeDasharray: "100",
        strokeDashoffset: dashOffset,
      }}
    >
      <Icon width={size} height={size} color={color} strokeWidth={2.2} />
    </g>
  );
}
