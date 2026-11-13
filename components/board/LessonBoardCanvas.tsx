"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { BoardStrokeIcon } from "@/lib/board/icons";
import {
  BoardLayout,
  LayoutNodeSlot,
  Rect,
  shouldUseCompactLod,
} from "@/lib/board/layout";
import { BoardTimelineState, linkKey } from "@/lib/board/timeline";
import {
  LessonBoardData,
  LessonLinkKind,
  LessonNode,
  LessonTone,
} from "@/types/lesson-board";
import { PenHand } from "@/components/whiteboard/PenHand";

interface LessonBoardCanvasProps {
  lesson: LessonBoardData;
  layout: BoardLayout;
  timeline: BoardTimelineState;
  isOverview: boolean;
  isPlaying: boolean;
  onNavigateToPage?: (page: number) => void;
  onSelectSection?: (index: number) => void;
}

const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

function getToneColors(tone: LessonTone): {
  ink: string;
  wash: string;
  softBorder: string;
} {
  if (tone === "pathology") {
    return {
      ink: "#DC2626",
      wash: "#FEF2F2",
      softBorder: "rgba(220, 38, 38, 0.32)",
    };
  }
  if (tone === "normal") {
    return {
      ink: "#2563EB",
      wash: "#EFF6FF",
      softBorder: "rgba(37, 99, 235, 0.32)",
    };
  }
  return {
    ink: "#18181B",
    wash: "#FFFFFF",
    softBorder: "rgba(24, 24, 27, 0.24)",
  };
}

function getLinkStroke(kind: LessonLinkKind): {
  color: string;
  dasharray?: string;
} {
  if (kind === "causes") return { color: "#DC2626" };
  if (kind === "treats") return { color: "#2563EB" };
  if (kind === "contrasts") return { color: "#64748B", dasharray: "10 7" };
  return { color: "#18181B" };
}

function getNodeRadius(kind: LessonNode["kind"]): number {
  if (kind === "sign" || kind === "treatment") return 26;
  if (kind === "pearl") return 18;
  return 14;
}

function formatViewBox(vb: Rect): string {
  return `${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.width.toFixed(1)} ${vb.height.toFixed(1)}`;
}

export function LessonBoardCanvas({
  lesson,
  layout,
  timeline,
  isOverview,
  isPlaying,
  onNavigateToPage,
  onSelectSection,
}: LessonBoardCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(900);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w && w > 0) setContainerWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const targetViewBox = useMemo<Rect>(() => {
    if (isOverview) return layout.overviewViewBox;
    return (
      layout.sectionViewBoxes[timeline.activeSectionIndex] ||
      layout.overviewViewBox
    );
  }, [isOverview, layout, timeline.activeSectionIndex]);

  const isCompactLod = useMemo(
    () => isOverview && shouldUseCompactLod(targetViewBox.width, containerWidth),
    [isOverview, targetViewBox.width, containerWidth]
  );

  const titleIsRtl = ARABIC_REGEX.test(lesson.title);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#FCFBF8] overflow-hidden select-none"
    >
      {/* Subtle dry-erase dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage: "radial-gradient(#cbd5e1 1.2px, transparent 1.2px)",
          backgroundSize: "24px 24px",
        }}
      />

      <svg
        viewBox={formatViewBox(targetViewBox)}
        preserveAspectRatio="xMidYMid meet"
        className="relative z-10 w-full h-full transition-all duration-700 ease-out"
      >
        {/* World Board Header (visible in Overview or top row) */}
        <g>
          <rect
            x={layout.headerRect.x}
            y={layout.headerRect.y}
            width={layout.headerRect.width}
            height={layout.headerRect.height}
            rx={22}
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth={3}
          />
          <foreignObject
            x={layout.headerRect.x + 28}
            y={layout.headerRect.y + 12}
            width={layout.headerRect.width - 56}
            height={layout.headerRect.height - 24}
          >
            <div className="flex items-center justify-between gap-6 h-full">
              <div className="min-w-0 flex-1">
                <h2
                  dir="auto"
                  className="truncate text-[34px] font-black text-[#18181B] leading-tight"
                  style={{
                    fontFamily: titleIsRtl
                      ? "var(--font-marhey), var(--font-mona-sans), sans-serif"
                      : "var(--font-mona-sans), sans-serif",
                  }}
                >
                  {lesson.title}
                </h2>
                <p
                  dir="auto"
                  className="truncate text-[20px] font-medium text-slate-600 mt-0.5"
                >
                  {lesson.objective}
                </p>
              </div>

              {/* Minimal 3-ink legend */}
              <div className="shrink-0 flex items-center gap-4 rounded-full border-2 border-slate-200 bg-[#FCFBF8] px-4 py-2 font-mono text-[15px] font-bold text-[#18181B]">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-[#2563EB]" />
                  Normal / Tx
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-[#18181B]" />
                  Key
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-[#DC2626]" />
                  Pathology
                </span>
              </div>
            </div>
          </foreignObject>
        </g>

        {/* S-Route Section Connectors */}
        {layout.routeConnectors.map((conn) => {
          const key = `${conn.fromSectionId}->${conn.toSectionId}`;
          const p = timeline.connectorProgress[key] ?? 0;
          const visible = isOverview || p > 0.05;
          return (
            <g key={key} opacity={visible ? 1 : 0.22}>
              <path
                d={conn.pathD}
                fill="none"
                stroke={visible ? "#ff4c00" : "#CBD5E1"}
                strokeWidth={visible ? 7 : 4}
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={visible ? "100" : "10 10"}
                strokeDashoffset={visible ? (1 - p) * 100 : 0}
              />
              {visible && p >= 0.85 && (
                <polygon points={conn.arrowHeadPoints} fill="#ff4c00" />
              )}
            </g>
          );
        })}

        {/* Section Frames */}
        {lesson.sections.map((sec, sIdx) => {
          const frame = layout.sections[sIdx];
          if (!frame) return null;
          const secP = timeline.sectionProgress[sec.id] ?? 0;
          const isActiveSec = !isOverview && sIdx === timeline.activeSectionIndex;
          const isPastSec = !isOverview && sIdx < timeline.activeSectionIndex;
          const isUpcomingSec = !isOverview && sIdx > timeline.activeSectionIndex;
          const secTitleRtl = ARABIC_REGEX.test(sec.title);
          const frameOpacity = isUpcomingSec ? 0.22 : isPastSec ? 0.72 : 1;

          return (
            <g
              key={sec.id}
              opacity={frameOpacity}
              onClick={() => onSelectSection?.(sIdx)}
              style={{ cursor: onSelectSection ? "pointer" : "default" }}
            >
              {/* Frame Backdrop */}
              <rect
                x={frame.rect.x}
                y={frame.rect.y}
                width={frame.rect.width}
                height={frame.rect.height}
                rx={24}
                fill="#FFFFFF"
              />

              {/* Animated Marker Frame Border */}
              <rect
                x={frame.rect.x}
                y={frame.rect.y}
                width={frame.rect.width}
                height={frame.rect.height}
                rx={24}
                fill="none"
                stroke={isActiveSec ? "#18181B" : "#94A3B8"}
                strokeWidth={isActiveSec ? 4.5 : 3}
                pathLength={100}
                strokeDasharray={100}
                strokeDashoffset={(1 - Math.min(1, Math.max(0.15, secP))) * 100}
              />

              {/* Section Header Bar */}
              <foreignObject
                x={frame.headerRect.x}
                y={frame.headerRect.y}
                width={frame.headerRect.width}
                height={frame.headerRect.height}
              >
                <div className="flex items-center justify-between gap-4 border-b-2 border-slate-200 pb-2.5 h-full">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="inline-flex items-center justify-center rounded-full border-2 border-[#18181B] px-3.5 py-0.5 font-mono text-[18px] font-black shrink-0"
                      style={{
                        backgroundColor: isActiveSec ? "#ff4c00" : "#f6d7a1",
                        color: "#0f0e10",
                      }}
                    >
                      {String(sIdx + 1).padStart(2, "0")}
                    </span>
                    <h3
                      dir="auto"
                      className="truncate text-[32px] font-bold text-[#18181B] leading-none"
                      style={{
                        fontFamily: secTitleRtl
                          ? "var(--font-marhey), var(--font-mona-sans), sans-serif"
                          : "var(--font-caveat), var(--font-mona-sans), cursive",
                      }}
                    >
                      {sec.title}
                    </h3>
                  </div>

                  {!isCompactLod && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 font-mono text-[14px] font-bold uppercase tracking-wider text-slate-600">
                      {sec.kind}
                    </span>
                  )}
                </div>
              </foreignObject>
            </g>
          );
        })}

        {/* Relationship Links (drawn behind nodes slightly or cleanly in gutters) */}
        {layout.links.map((link) => {
          const k = linkKey(link);
          const p = timeline.linkProgress[k] ?? 0;
          if (p <= 0.02) return null;
          const style = getLinkStroke(link.kind);
          const isActiveLink =
            !isOverview &&
            (link.to === timeline.activeNodeId ||
              link.from === timeline.activeNodeId);

          return (
            <g key={k} opacity={isActiveLink || isOverview ? 0.95 : 0.68}>
              <path
                d={link.pathD}
                fill="none"
                stroke={style.color}
                strokeWidth={isActiveLink ? 4.5 : 3.5}
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={style.dasharray || "100"}
                strokeDashoffset={style.dasharray ? 0 : (1 - p) * 100}
              />
              {p >= 0.8 && (
                <polygon points={link.arrowHeadPoints} fill={style.color} />
              )}
              {link.label && !isCompactLod && p >= 0.7 && (
                <foreignObject
                  x={link.labelPoint.x - 65}
                  y={link.labelPoint.y - 16}
                  width={130}
                  height={32}
                >
                  <div className="flex justify-center">
                    <span
                      className="truncate rounded-full border bg-white px-2.5 py-0.5 font-mono text-[13px] font-bold shadow-2xs"
                      style={{ color: style.color, borderColor: style.color }}
                    >
                      {link.label}
                    </span>
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}

        {/* Linked Clinical Nodes */}
        {lesson.sections.map((sec, sIdx) =>
          sec.nodes.map((node) => {
            const slot: LayoutNodeSlot | undefined = layout.nodes[node.id];
            if (!slot) return null;

            const nProg = timeline.nodeProgress[node.id] ?? 0;
            const nEmph = timeline.nodeEmphasis[node.id] ?? 0;
            const isUpcomingSec =
              !isOverview && sIdx > timeline.activeSectionIndex;

            if (nProg <= 0.01 && !isUpcomingSec) {
              // Subtle faint dashed placeholder in active section before node is spoken
              return (
                <rect
                  key={node.id}
                  x={slot.rect.x}
                  y={slot.rect.y}
                  width={slot.rect.width}
                  height={slot.rect.height}
                  rx={getNodeRadius(node.kind)}
                  fill="#F8FAFC"
                  stroke="#E2E8F0"
                  strokeWidth={2}
                  strokeDasharray="8 8"
                  opacity={0.5}
                />
              );
            }

            if (isUpcomingSec) return null;

            const tone = getToneColors(node.tone);
            const isActiveNode = !isOverview && timeline.activeNodeId === node.id;
            const radius = getNodeRadius(node.kind);
            const borderProg = Math.min(1, nProg / 0.6);
            const contentOpacity = Math.max(0, Math.min(1, (nProg - 0.12) / 0.45));
            const iconProg = Math.max(0, Math.min(1, (nProg - 0.15) / 0.65));
            const isRtl = ARABIC_REGEX.test(node.text);

            return (
              <g key={node.id}>
                {/* Active Node Focus Halo */}
                {isActiveNode && (
                  <rect
                    x={slot.rect.x - 6}
                    y={slot.rect.y - 6}
                    width={slot.rect.width + 12}
                    height={slot.rect.height + 12}
                    rx={radius + 5}
                    fill="none"
                    stroke="#ff4c00"
                    strokeWidth={3}
                    opacity={0.45}
                  />
                )}

                {/* Node Card Fill */}
                <rect
                  x={slot.rect.x}
                  y={slot.rect.y}
                  width={slot.rect.width}
                  height={slot.rect.height}
                  rx={radius}
                  fill={node.kind === "pearl" ? "#FFFBEB" : tone.wash}
                  opacity={contentOpacity}
                />

                {/* Animated Node Perimeter Stroke */}
                <rect
                  x={slot.rect.x}
                  y={slot.rect.y}
                  width={slot.rect.width}
                  height={slot.rect.height}
                  rx={radius}
                  fill="none"
                  stroke={isActiveNode ? tone.ink : tone.softBorder}
                  strokeWidth={isActiveNode ? 4 : 3}
                  pathLength={100}
                  strokeDasharray={node.kind === "test" ? "100" : "100"}
                  strokeDashoffset={(1 - borderProg) * 100}
                />

                {/* Left/Right Tone Accent Strip */}
                <rect
                  x={isRtl ? slot.rect.x + slot.rect.width - 10 : slot.rect.x + 2}
                  y={slot.rect.y + 18}
                  width={8}
                  height={slot.rect.height - 36}
                  rx={4}
                  fill={tone.ink}
                  opacity={contentOpacity}
                />

                {/* Stroke-Animated Clinical Icon */}
                <g
                  transform={`translate(${slot.rect.x + 24}, ${slot.rect.y + (isCompactLod ? 60 : 28)})`}
                >
                  <BoardStrokeIcon
                    iconId={node.icon}
                    color={tone.ink}
                    size={isCompactLod ? 44 : 40}
                    progress={iconProg}
                  />
                </g>

                {/* Node Content + Clickable Page Chip */}
                <foreignObject
                  x={slot.rect.x + 74}
                  y={slot.rect.y + 16}
                  width={slot.rect.width - 94}
                  height={slot.rect.height - 32}
                >
                  <div
                    className="flex flex-col justify-between h-full"
                    style={{ opacity: contentOpacity }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div
                        dir="auto"
                        className={
                          isCompactLod
                            ? "font-sans text-[28px] font-black leading-[1.18] text-[#18181B] line-clamp-3"
                            : "font-sans text-[23px] font-extrabold leading-[1.22] text-[#18181B] line-clamp-2"
                        }
                      >
                        {node.text}
                      </div>

                      {node.trend && node.trend !== "none" && !isCompactLod && (
                        <span
                          className="shrink-0 inline-flex items-center justify-center rounded-lg p-1 border"
                          style={{
                            color: tone.ink,
                            borderColor: tone.softBorder,
                            backgroundColor: "#FFFFFF",
                          }}
                        >
                          {node.trend === "up" ? (
                            <ArrowUp className="w-5 h-5 stroke-[3]" />
                          ) : (
                            <ArrowDown className="w-5 h-5 stroke-[3]" />
                          )}
                        </span>
                      )}
                    </div>

                    {!isCompactLod && (
                      <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                        <span
                          dir="auto"
                          className="truncate font-sans text-[16px] font-semibold text-slate-600"
                        >
                          {node.detail || ""}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigateToPage?.(node.source.page);
                          }}
                          title={`Jump to Page ${node.source.page}: "${node.source.quote}"`}
                          className="shrink-0 cursor-pointer rounded-full border border-slate-300 bg-white/90 px-2.5 py-0.5 font-mono text-[14px] font-black text-slate-700 hover:border-[#ff4c00] hover:text-[#ff4c00] transition-colors"
                        >
                          p.{node.source.page}
                        </button>
                      </div>
                    )}
                  </div>
                </foreignObject>

                {/* Teacher Emphasis Underline Stroke */}
                {nEmph > 0.02 && !isCompactLod && (
                  <path
                    d={`M ${slot.rect.x + 76} ${slot.rect.y + slot.rect.height - 22} Q ${slot.rect.x + slot.rect.width * 0.55} ${slot.rect.y + slot.rect.height - 16} ${slot.rect.x + slot.rect.width - 28} ${slot.rect.y + slot.rect.height - 23}`}
                    fill="none"
                    stroke={tone.ink}
                    strokeWidth={4.5}
                    strokeLinecap="round"
                    pathLength={100}
                    strokeDasharray={100}
                    strokeDashoffset={(1 - nEmph) * 100}
                    opacity={0.75}
                  />
                )}
              </g>
            );
          })
        )}

        {/* Active Marker Pen Hand following live draw target */}
        {!isOverview && timeline.penTarget && (
          <PenHand
            x={timeline.penTarget.x}
            y={timeline.penTarget.y}
            visible={timeline.penTarget.active}
            isWriting={isPlaying}
            color={timeline.penTarget.color}
          />
        )}
      </svg>
    </div>
  );
}
