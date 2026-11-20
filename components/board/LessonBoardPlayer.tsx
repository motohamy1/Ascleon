"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Box,
  Captions,
  Columns2,
  Download,
  Eraser,
  Highlighter,
  LayoutGrid,
  Loader2,
  Maximize2,
  MessageCircleQuestion,
  Minimize2,
  MoreHorizontal,
  Pause,
  PenTool,
  Play,
  Redo2,
  RefreshCw,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  Volume2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { layoutLessonBoard } from "@/lib/board/layout";
import { layoutBoardOps } from "@/lib/board/ops-layout";
import { resolveGuaranteedLabScene } from "@/lib/board/math-presets";
import { computeBoardTimeline } from "@/lib/board/timeline";
import { synthesizeChallengeFromSection } from "@/lib/board/validate";
import { useLessonAudioEngine } from "@/hooks/useLessonAudioEngine";
import { WHITEBOARD_NARRATOR_VOICES } from "@/lib/whiteboard/voices";
import { LessonBoardData } from "@/types/lesson-board";
import { LessonBoardCanvas } from "./LessonBoardCanvas";
import {
  HandwrittenBoardSurface,
  HandwrittenBoardSurfaceHandle,
  InkTool,
} from "./HandwrittenBoardSurface";
import { LabScene3D, LabScene3DHandle } from "./lab/LabScene3D";
import { BoardChallengePanel } from "./BoardChallengePanel";

interface LessonBoardPlayerProps {
  lesson: LessonBoardData;
  isCinema: boolean;
  isSwitchingVoice: boolean;
  isGeneratingAudio: boolean;
  onToggleCinema: () => void;
  onRetrySectionAudio: (sectionIndex: number) => void;
  onChangeVoice: (voiceId: string) => void;
  onChangeScope?: () => void;
  onRegenerateLesson?: () => void;
  onNavigateToPage?: (page: number) => void;
  className?: string;
}

type StudioMode = "guided" | "explore" | "challenge";
type StageSplit = "split" | "2d" | "3d";

const SPEEDS = [0.75, 1, 1.25, 1.5];
const INK_COLORS = [
  { hex: "#18181B", label: "Black Ink" },
  { hex: "#1D4ED8", label: "Blue Ink" },
  { hex: "#DC2626", label: "Red Ink" },
  { hex: "#F59E0B", label: "Amber" },
];

function formatMs(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function LessonBoardPlayer({
  lesson,
  isCinema,
  isSwitchingVoice,
  isGeneratingAudio,
  onToggleCinema,
  onRetrySectionAudio,
  onChangeVoice,
  onChangeScope,
  onRegenerateLesson,
  onNavigateToPage,
  className,
}: LessonBoardPlayerProps) {
  const [isOverview, setIsOverview] = useState(false);
  const [mode, setMode] = useState<StudioMode>("guided");
  const [stageSplit, setStageSplit] = useState<StageSplit>("split");
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showCaptions, setShowCaptions] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Student Freehand Ink State (Explore Mode)
  const [inkTool, setInkTool] = useState<InkTool>("none");
  const [inkColor, setInkColor] = useState<string>("#1D4ED8");
  const [inkHistory, setInkHistory] = useState({ canUndo: false, canRedo: false, count: 0 });

  // Ask-at-this-step Sticky Note Q&A
  const [showAskBox, setShowAskBox] = useState(false);
  const [askInput, setAskInput] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [stickyAnswer, setStickyAnswer] = useState<{
    question: string;
    answer: string;
    structTag?: string;
  } | null>(null);

  const boardSurfaceRef = useRef<HandwrittenBoardSurfaceHandle | null>(null);
  const lab3DRef = useRef<LabScene3DHandle | null>(null);

  const voiceTrack = lesson.voiceTracks?.[lesson.activeVoiceId];
  const sectionTracks = useMemo(
    () => voiceTrack?.sections || [],
    [voiceTrack?.sections]
  );

  const handleReachEnd = useCallback(() => {
    setIsOverview(true);
  }, []);

  const engine = useLessonAudioEngine({
    sections: sectionTracks,
    playbackSpeed,
    isOverview,
    onReachEnd: handleReachEnd,
  });

  // Macro S-route layout (used when Full Map overview is active)
  const macroLayout = useMemo(
    () => layoutLessonBoard(lesson.sections, lesson.links),
    [lesson.sections, lesson.links]
  );

  const timeline = useMemo(
    () =>
      computeBoardTimeline({
        lesson,
        layout: macroLayout,
        voiceTrack,
        activeSectionIndex: engine.activeSectionIndex,
        sectionElapsedMs: engine.sectionElapsedMs,
        isPlaying: engine.isPlaying,
        isOverview,
      }),
    [
      lesson,
      macroLayout,
      voiceTrack,
      engine.activeSectionIndex,
      engine.sectionElapsedMs,
      engine.isPlaying,
      isOverview,
    ]
  );

  const activeSection =
    lesson.sections[engine.activeSectionIndex] || lesson.sections[0];
  const activeSecTrack = sectionTracks[engine.activeSectionIndex];
  const activeSecDurationMs = Math.max(
    1000,
    activeSecTrack?.audioDurationMs ||
      (activeSecTrack?.cues?.length
        ? activeSecTrack.cues[activeSecTrack.cues.length - 1].endMs
        : 10_000)
  );
  const sectionFraction = isOverview
    ? 1
    : Math.max(0, Math.min(1, engine.sectionElapsedMs / activeSecDurationMs));

  const isPosterFull =
    mode !== "guided" || (!engine.isPlaying && engine.sectionElapsedMs <= 60);

  // Pure 1000x625 handwritten ops layout for the active section
  const activeOpsLayout = useMemo(() => {
    if (!activeSection) {
      return layoutBoardOps({
        lessonId: lesson.id,
        section: {
          id: "empty",
          title: lesson.title,
          kind: "concept",
          nodes: [],
          script: [],
        },
        sectionIndex: 0,
        links: [],
        rtl: lesson.language === "ar",
      });
    }
    return layoutBoardOps({
      lessonId: lesson.id,
      section: activeSection,
      sectionIndex: engine.activeSectionIndex,
      links: lesson.links,
      rtl: lesson.language === "ar",
    });
  }, [lesson.id, lesson.title, lesson.language, lesson.links, activeSection, engine.activeSectionIndex]);

  // Guaranteed 4-tier 3D / Interactive Lab descriptor (never blank!)
  const activeLabScene = useMemo(() => {
    if (!activeSection) return null;
    return resolveGuaranteedLabScene(activeSection, lesson.title);
  }, [activeSection, lesson.title]);

  const activeChallenge = useMemo(() => {
    if (!activeSection) return null;
    return synthesizeChallengeFromSection(
      activeSection,
      activeLabScene || undefined
    );
  }, [activeSection, activeLabScene]);

  const { totalDurationMs, elapsedMs } = useMemo(() => {
    let total = 0;
    let elapsed = 0;
    for (let i = 0; i < lesson.sections.length; i++) {
      const dur = sectionTracks[i]?.audioDurationMs || 10_000;
      total += dur;
      if (isOverview) {
        elapsed += dur;
      } else if (i < engine.activeSectionIndex) {
        elapsed += dur;
      } else if (i === engine.activeSectionIndex) {
        elapsed += Math.min(dur, engine.sectionElapsedMs);
      }
    }
    return { totalDurationMs: total, elapsedMs: elapsed };
  }, [
    lesson.sections.length,
    sectionTracks,
    isOverview,
    engine.activeSectionIndex,
    engine.sectionElapsedMs,
  ]);

  const readyCount = sectionTracks.filter((s) => s.status === "ready").length;
  const activeSecFailed = activeSecTrack?.status === "failed";

  const sourceList = useMemo(() => {
    const list: Array<{ page: number; quote: string; nodeText: string; inferred?: boolean }> = [];
    for (const sec of lesson.sections) {
      for (const n of sec.nodes) {
        list.push({
          page: n.source.page,
          quote: n.source.quote,
          nodeText: n.text,
          inferred: n.source.inferred,
        });
      }
    }
    return list;
  }, [lesson.sections]);

  const handleModeSwitch = (nextMode: StudioMode) => {
    setIsOverview(false);
    setMode(nextMode);
    if (nextMode !== "guided") {
      engine.pause();
    }
    if (nextMode !== "explore") {
      setInkTool("none");
    }
  };

  const handleAskStepSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = askInput.trim();
    if (!q || !activeSection) return;
    engine.pause();
    setAskLoading(true);
    try {
      const contextText = activeSection.nodes
        .map((n) => `${n.text}${n.detail ? ` (${n.detail})` : ""}: "${n.source.quote}"`)
        .join("\n");
      const res = await fetch("/api/reader-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: lesson.bookId,
          bookTitle: lesson.bookTitle,
          query: q,
          currentPageNumber: activeSection.nodes[0]?.source.page || 1,
          currentSegmentContent: `Section "${activeSection.title}":\n${contextText}`,
          language: lesson.language,
        }),
      });
      const data = await res.json();
      const reply =
        data?.answer ||
        `In "${activeSection.title}": ${activeSection.nodes.map((n) => n.text).join(" → ")}.`;
      setStickyAnswer({ question: q, answer: reply });
      setAskInput("");
      setShowAskBox(false);
    } catch {
      setStickyAnswer({
        question: q,
        answer: `Core takeaway for "${activeSection.title}": ${activeSection.nodes
          .map((n) => n.text)
          .join(" → ")}.`,
      });
      setShowAskBox(false);
    } finally {
      setAskLoading(false);
    }
  };

  const handleExportStudySheet = async () => {
    const boardCanvas = boardSurfaceRef.current?.exportToCanvas(1600);
    const snap3dUrl = lab3DRef.current?.captureSnapshotDataUrl();

    if (!boardCanvas) {
      toast.info("Switch to 2D or Split view to export the study sheet.");
      return;
    }

    try {
      const out = document.createElement("canvas");
      const pad = 32;
      const bw = boardCanvas.width;
      const bh = boardCanvas.height;

      if (snap3dUrl) {
        const img3d = new Image();
        await new Promise<void>((resolve) => {
          img3d.onload = () => resolve();
          img3d.onerror = () => resolve();
          img3d.src = snap3dUrl;
        });

        const hasImg = img3d.width > 0 && img3d.height > 0;
        if (hasImg) {
          const rightW = Math.round(bw * 0.65);
          out.width = bw + rightW + pad * 3;
          out.height = bh + pad * 2 + 52;
          const ctx = out.getContext("2d");
          if (!ctx) return;
          ctx.fillStyle = "#F8F4E9";
          ctx.fillRect(0, 0, out.width, out.height);
          ctx.fillStyle = "#18181B";
          ctx.font = "bold 24px sans-serif";
          ctx.fillText(
            `${lesson.title} — ${activeSection?.title || ""}`,
            pad,
            38
          );
          ctx.drawImage(boardCanvas, pad, pad + 36, bw, bh);
          ctx.drawImage(img3d, bw + pad * 2, pad + 36, rightW, bh);
        } else {
          out.width = bw + pad * 2;
          out.height = bh + pad * 2;
          out.getContext("2d")?.drawImage(boardCanvas, pad, pad);
        }
      } else {
        out.width = bw + pad * 2;
        out.height = bh + pad * 2;
        const ctx = out.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#F8F4E9";
          ctx.fillRect(0, 0, out.width, out.height);
          ctx.drawImage(boardCanvas, pad, pad);
        }
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        out.toBlob((b) => resolve(b), "image/png")
      );
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ascleon-board-step-${engine.activeSectionIndex + 1}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Study sheet PNG exported!");
    } catch {
      toast.error("Could not export PNG study sheet.");
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-transparent text-[var(--study-text)] overflow-hidden rounded-[18px] border-[1.5px] border-[var(--study-panel-border)]",
        isCinema && "study-dotted-canvas fixed inset-0 z-50 rounded-none border-0 p-3 sm:p-5",
        className
      )}
    >
      {/* Top Living Board Header */}
      <div className="relative flex flex-wrap items-center justify-between gap-2 border-b-[1.5px] border-[var(--study-pill-border)]/35 bg-[var(--study-surface)] backdrop-blur-xl px-3 py-2 text-[var(--study-text)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-full border border-[var(--study-panel-border)] bg-[color:var(--orange)] px-2 py-0.5 font-mono text-[9px] font-black uppercase text-[#0f0e10] shrink-0">
            LIVING BOARD 2D+3D
          </span>
          <span
            dir="auto"
            className="truncate font-sans text-xs font-black text-[var(--study-text)] max-w-[180px] sm:max-w-[260px]"
          >
            {lesson.title}
          </span>
        </div>

        {/* Mode Switcher: Guided | Explore | Challenge */}
        <div className="flex items-center gap-0.5 rounded-full border-[1.5px] border-[var(--study-pill-border)] bg-[var(--study-surface-muted)] p-0.5">
          {(
            [
              { id: "guided", label: "Guided" },
              { id: "explore", label: "Explore" },
              { id: "challenge", label: "Challenge" },
            ] as Array<{ id: StudioMode; label: string }>
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => handleModeSwitch(m.id)}
              className={cn(
                "cursor-pointer rounded-full px-2.5 py-0.5 font-mono text-[9.5px] font-black uppercase transition-all",
                mode === m.id && !isOverview
                  ? "bg-[color:var(--orange)] text-[#0f0e10]"
                  : "text-[var(--study-text-muted)] hover:text-[var(--study-text)]"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isGeneratingAudio && (
            <span className="hidden md:inline rounded-full border border-[var(--study-teal-border)] bg-[var(--study-teal-bg)] px-2 py-0.5 font-mono text-[9px] font-bold text-[var(--study-teal-text)]">
              Audio {readyCount}/{lesson.sections.length}
            </span>
          )}

          {/* Stage Split Toggle */}
          {mode !== "challenge" && !isOverview && (
            <div className="flex items-center rounded-full border-[1.5px] border-[var(--study-pill-border)] bg-[var(--study-surface-muted)] p-0.5">
              <button
                type="button"
                onClick={() => setStageSplit("split")}
                title="Split 2D Whiteboard + 3D Lab"
                className={cn(
                  "cursor-pointer rounded-full p-1 transition-colors",
                  stageSplit === "split"
                    ? "bg-[color:var(--orange)] text-[#0f0e10]"
                    : "text-[var(--study-text-muted)] hover:text-[var(--study-text)]"
                )}
              >
                <Columns2 className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => setStageSplit("2d")}
                title="2D Handwritten Board Only"
                className={cn(
                  "cursor-pointer rounded-full px-1.5 py-0.5 font-mono text-[9px] font-black",
                  stageSplit === "2d"
                    ? "bg-[color:var(--orange)] text-[#0f0e10]"
                    : "text-[var(--study-text-muted)] hover:text-[var(--study-text)]"
                )}
              >
                2D
              </button>
              <button
                type="button"
                onClick={() => setStageSplit("3d")}
                title="3D Interactive Lab Only"
                className={cn(
                  "cursor-pointer rounded-full px-1.5 py-0.5 font-mono text-[9px] font-black",
                  stageSplit === "3d"
                    ? "bg-[color:var(--orange)] text-[#0f0e10]"
                    : "text-[var(--study-text-muted)] hover:text-[var(--study-text)]"
                )}
              >
                3D
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              engine.pause();
              setShowAskBox((prev) => !prev);
            }}
            title="Ask Mentor about this step"
            className={cn(
              "cursor-pointer flex items-center gap-1 rounded-full border-[1.5px] px-2 py-0.5 font-mono text-[9.5px] font-bold transition-colors",
              showAskBox
                ? "border-[var(--study-panel-border)] bg-[color:var(--orange)] text-[#0f0e10]"
                : "border-[var(--study-pill-border)] bg-[var(--study-surface-muted)] text-[var(--study-text)] hover:bg-[var(--study-glass-hover)]"
            )}
          >
            <MessageCircleQuestion className="size-3" />
            <span className="hidden sm:inline">Ask Step</span>
          </button>

          <button
            type="button"
            onClick={handleExportStudySheet}
            title="Export Study Sheet PNG (2D + 3D)"
            className="cursor-pointer rounded-full border-[1.5px] border-[var(--study-pill-border)] bg-[var(--study-surface-muted)] p-1 text-[var(--study-text)] hover:bg-[var(--study-glass-hover)]"
          >
            <Download className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setShowSources((prev) => !prev)}
            title="Verified book sources"
            className={cn(
              "cursor-pointer flex items-center gap-1 rounded-full border-[1.5px] px-2 py-0.5 font-mono text-[9.5px] font-bold transition-colors",
              showSources
                ? "border-[var(--study-panel-border)] bg-[color:var(--orange)] text-[#0f0e10]"
                : "border-[var(--study-pill-border)] bg-[var(--study-surface-muted)] text-[var(--study-text)] hover:bg-[var(--study-glass-hover)]"
            )}
          >
            <BookOpen className="size-2.5" />
            <span className="hidden sm:inline">{sourceList.length}</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreMenu((prev) => !prev)}
              title="Voice & lesson options"
              className="cursor-pointer rounded-full border-[1.5px] border-[var(--study-pill-border)] bg-[var(--study-surface-muted)] p-1 text-[var(--study-text)] hover:bg-[var(--study-glass-hover)]"
            >
              <MoreHorizontal className="size-3.5" />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-8 z-40 w-60 rounded-2xl border-2 border-[var(--study-panel-border)] bg-[var(--study-surface-solid)] p-2.5 text-[var(--study-text)] shadow-[var(--study-shadow-lg)] flex flex-col gap-2">
                <div className="space-y-1">
                  <span className="block font-mono text-[9px] font-black uppercase text-[var(--study-text-muted)]">
                    Narrator Voice
                  </span>
                  <div className="flex items-center gap-1.5 rounded-xl border border-[var(--study-border-strong)] bg-[var(--study-surface-muted)] px-2 py-1 focus-within:border-[#ff4c00] focus-within:ring-2 focus-within:ring-[#ff4c00]/25">
                    {isSwitchingVoice ? (
                      <Loader2 className="size-3.5 animate-spin text-[color:var(--orange)] shrink-0" />
                    ) : (
                      <Volume2 className="size-3.5 text-[color:var(--orange)] shrink-0" />
                    )}
                    <select
                      value={lesson.activeVoiceId}
                      disabled={isSwitchingVoice}
                      onChange={(e) => {
                        setShowMoreMenu(false);
                        onChangeVoice(e.target.value);
                      }}
                      className="w-full cursor-pointer bg-transparent font-sans text-xs font-bold text-[var(--study-text)] focus:outline-none focus-visible:!outline-none focus-visible:!shadow-none"
                    >
                      {WHITEBOARD_NARRATOR_VOICES.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} · {v.tone}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {onChangeScope && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      engine.pause();
                      onChangeScope();
                    }}
                    className="cursor-pointer flex items-center gap-2 rounded-xl border border-[var(--study-border)] bg-[var(--study-surface-muted)] text-[var(--study-text)] px-2.5 py-1.5 font-mono text-[10px] font-black uppercase hover:bg-[var(--study-glass-hover)]"
                  >
                    <SlidersHorizontal className="size-3" />
                    <span>Change Scope</span>
                  </button>
                )}

                {onRegenerateLesson && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      engine.pause();
                      onRegenerateLesson();
                    }}
                    className="cursor-pointer flex items-center gap-2 rounded-xl border border-[var(--study-border)] bg-[var(--study-surface-muted)] text-[var(--study-text)] px-2.5 py-1.5 font-mono text-[10px] font-black uppercase hover:bg-[color:var(--orange)] hover:text-[#0f0e10]"
                  >
                    <RefreshCw className="size-3" />
                    <span>Regenerate Lesson</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onToggleCinema}
            title={isCinema ? "Exit fullscreen" : "Theater mode"}
            className="cursor-pointer rounded-full border-[1.5px] border-[var(--study-pill-border)] bg-[var(--study-surface-muted)] p-1 text-[var(--study-text)] hover:bg-[color:var(--orange)] hover:text-[#0f0e10]"
          >
            {isCinema ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Explore Mode Freehand Student Ink Toolbar */}
      {mode === "explore" && !isOverview && stageSplit !== "3d" && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--study-border)] bg-[var(--study-surface)] backdrop-blur-md px-3 py-1.5 text-xs text-[var(--study-text)]">
          <div className="flex items-center gap-1">
            <span className="font-mono text-[9.5px] font-black uppercase text-[var(--study-text-muted)] mr-1">
              Annotate:
            </span>
            <button
              type="button"
              onClick={() => setInkTool((t) => (t === "pen" ? "none" : "pen"))}
              className={cn(
                "cursor-pointer flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold",
                inkTool === "pen"
                  ? "border-[var(--study-panel-border)] bg-[#ff4c00] text-[#0f0e10]"
                  : "border-[var(--study-border-strong)] bg-[var(--study-surface-muted)] text-[var(--study-text)]"
              )}
            >
              <PenTool className="size-3" />
              <span>Pen</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setInkTool((t) => (t === "highlighter" ? "none" : "highlighter"))
              }
              className={cn(
                "cursor-pointer flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold",
                inkTool === "highlighter"
                  ? "border-[#18181B] bg-[#FEF08A] text-[#18181B]"
                  : "border-[var(--study-border-strong)] bg-[var(--study-surface-muted)] text-[var(--study-text)]"
              )}
            >
              <Highlighter className="size-3" />
              <span>Highlight</span>
            </button>
            <button
              type="button"
              onClick={() => setInkTool((t) => (t === "eraser" ? "none" : "eraser"))}
              className={cn(
                "cursor-pointer flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold",
                inkTool === "eraser"
                  ? "border-[var(--study-panel-border)] bg-[var(--study-text)] text-[var(--study-surface-solid)]"
                  : "border-[var(--study-border-strong)] bg-[var(--study-surface-muted)] text-[var(--study-text)]"
              )}
            >
              <Eraser className="size-3" />
              <span>Eraser</span>
            </button>

            <div className="flex items-center gap-1 ml-1.5">
              {INK_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  title={c.label}
                  onClick={() => {
                    setInkColor(c.hex);
                    if (inkTool === "none" || inkTool === "eraser") setInkTool("pen");
                  }}
                  className={cn(
                    "size-4 rounded-full border-2 cursor-pointer transition-transform",
                    inkColor === c.hex ? "border-[var(--study-panel-border)] scale-125" : "border-[var(--study-border)]"
                  )}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!inkHistory.canUndo}
              onClick={() => boardSurfaceRef.current?.undoInk()}
              title="Undo stroke"
              className="cursor-pointer rounded-full border border-[var(--study-border-strong)] bg-[var(--study-surface-muted)] text-[var(--study-text)] p-1 disabled:opacity-35"
            >
              <Undo2 className="size-3" />
            </button>
            <button
              type="button"
              disabled={!inkHistory.canRedo}
              onClick={() => boardSurfaceRef.current?.redoInk()}
              title="Redo stroke"
              className="cursor-pointer rounded-full border border-[var(--study-border-strong)] bg-[var(--study-surface-muted)] text-[var(--study-text)] p-1 disabled:opacity-35"
            >
              <Redo2 className="size-3" />
            </button>
            <button
              type="button"
              disabled={inkHistory.count === 0}
              onClick={() => boardSurfaceRef.current?.clearInk()}
              title="Clear all ink"
              className="cursor-pointer rounded-full border border-[var(--study-border-strong)] bg-[var(--study-surface-muted)] p-1 text-red-500 disabled:opacity-35"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        </div>
      )}

      {/* Main Living Stage */}
      <div className="study-dotted-canvas relative flex-1 min-h-[260px] p-2 sm:p-3 overflow-hidden">
        {isOverview ? (
          <div className="size-full rounded-[14px] overflow-hidden border-2 border-[var(--study-panel-border)]">
            <LessonBoardCanvas
              lesson={lesson}
              layout={macroLayout}
              timeline={timeline}
              isOverview={true}
              isPlaying={false}
              onNavigateToPage={onNavigateToPage}
              onSelectSection={(idx) => {
                setIsOverview(false);
                setMode("guided");
                engine.selectSection(idx);
              }}
            />
          </div>
        ) : mode === "challenge" && activeChallenge && activeSection ? (
          <div
            className={cn(
              "grid size-full gap-2.5",
              isCinema ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
            )}
          >
            <BoardChallengePanel
              challenge={activeChallenge}
              sectionTitle={activeSection.title}
            />
            {isCinema && activeLabScene && (
              <LabScene3D
                ref={lab3DRef}
                scene={activeLabScene}
                section={activeSection}
                links={lesson.links}
                activeNodeId={timeline.activeNodeId}
                timelineFraction={sectionFraction}
                language={lesson.language}
                onNavigateToPage={onNavigateToPage}
              />
            )}
          </div>
        ) : (
          <div
            className={cn(
              "grid size-full gap-2.5",
              stageSplit === "split"
                ? isCinema
                  ? "grid-cols-1 lg:grid-cols-[1.25fr_1fr]"
                  : "grid-cols-1 grid-rows-[1fr_1fr] xl:grid-cols-[1.2fr_1fr] xl:grid-rows-1"
                : "grid-cols-1"
            )}
          >
            {stageSplit !== "3d" && (
              <div className="flex items-center justify-center min-h-0 min-w-0">
                <HandwrittenBoardSurface
                  ref={boardSurfaceRef}
                  layout={activeOpsLayout}
                  fraction={sectionFraction}
                  isPlaying={engine.isPlaying}
                  isPosterFull={isPosterFull}
                  activeNodeId={timeline.activeNodeId}
                  inkTool={mode === "explore" ? inkTool : "none"}
                  inkColor={inkColor}
                  onNavigateToPage={onNavigateToPage}
                  onInkHistoryChange={setInkHistory}
                />
              </div>
            )}

            {stageSplit !== "2d" && activeLabScene && activeSection && (
              <div className="min-h-0 min-w-0">
                <LabScene3D
                  ref={lab3DRef}
                  scene={activeLabScene}
                  section={activeSection}
                  links={lesson.links}
                  activeNodeId={timeline.activeNodeId}
                  timelineFraction={sectionFraction}
                  language={lesson.language}
                  onNavigateToPage={onNavigateToPage}
                />
              </div>
            )}
          </div>
        )}

        {/* Active Section Failed Audio Notice (never blocks playback thanks to Virtual Clock!) */}
        {activeSecFailed && !isOverview && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-[var(--study-amber-border)] bg-[var(--study-amber-bg)] backdrop-blur-md px-3 py-1 text-[10.5px] font-bold text-[var(--study-amber-text)] shadow-sm">
            <AlertTriangle className="size-3" />
            <span>Silent clock active (audio retrying).</span>
            <button
              type="button"
              onClick={() => onRetrySectionAudio(engine.activeSectionIndex)}
              className="cursor-pointer rounded-full border border-[var(--study-amber-border)] bg-[var(--study-surface-solid)] text-[var(--study-text)] px-2 py-0.5 font-mono text-[9.5px] font-black uppercase"
            >
              Retry Audio
            </button>
          </div>
        )}

        {/* Floating 1-Line Caption Overlay */}
        {showCaptions && !isOverview && timeline.activeCue && (
          <div className="pointer-events-none absolute inset-x-4 bottom-3 z-20 flex justify-center">
            <div
              dir="auto"
              className="ascleon-bidi max-w-2xl truncate rounded-full border-[1.5px] border-[var(--study-pill-border)] bg-[var(--study-surface)] px-4 py-1.5 text-xs font-semibold text-[var(--study-text)] shadow-[var(--study-shadow)] backdrop-blur-md"
            >
              {timeline.activeCue.text}
            </div>
          </div>
        )}

        {/* Sticky-Note Mentor Answer Overlay */}
        {stickyAnswer && (
          <div className="absolute bottom-3 right-3 z-30 w-80 max-w-[90%] rounded-2xl border-2 border-[var(--study-panel-border)] bg-[var(--study-surface-solid)] p-3 text-[var(--study-text)] shadow-[var(--study-shadow-lg)]">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="flex items-center gap-1 font-mono text-[9.5px] font-black uppercase text-[#ff4c00]">
                <Sparkles className="size-3" />
                <span>Mentor Sticky Note</span>
              </span>
              <button
                type="button"
                onClick={() => setStickyAnswer(null)}
                className="cursor-pointer rounded-full p-0.5 hover:bg-[var(--study-glass-hover)]"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div dir="auto" className="text-[11px] font-black text-[var(--study-text)] mb-1">
              Q: {stickyAnswer.question}
            </div>
            <div
              dir="auto"
              className="max-h-36 overflow-y-auto text-[11.5px] leading-relaxed text-[var(--study-text-soft)]"
            >
              {stickyAnswer.answer}
            </div>
          </div>
        )}

        {/* Ask Step Prompt Input */}
        {showAskBox && (
          <form
            onSubmit={handleAskStepSubmit}
            className="absolute top-3 right-3 z-30 flex items-center gap-1.5 rounded-full border-2 border-[var(--study-panel-border)] bg-[var(--study-surface-solid)] p-1 pl-3.5 shadow-[var(--study-shadow-lg)] w-72 max-w-[92%] focus-within:border-[#ff4c00] focus-within:ring-2 focus-within:ring-[#ff4c00]/30 transition-colors"
          >
            <input
              type="text"
              value={askInput}
              onChange={(e) => setAskInput(e.target.value)}
              placeholder={`Ask about "${activeSection?.title || "this step"}"…`}
              className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-[var(--study-text)] placeholder:text-[var(--study-text-muted)] focus:outline-none focus-visible:!outline-none focus-visible:!shadow-none"
            />
            <button
              type="submit"
              disabled={askLoading || !askInput.trim()}
              className="cursor-pointer rounded-full bg-[#ff4c00] p-1.5 text-[#0f0e10] disabled:opacity-45"
            >
              {askLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
            </button>
          </form>
        )}

        {/* Collapsible Sources & Citations Drawer */}
        {showSources && (
          <div className="absolute inset-y-0 right-0 z-30 w-full max-w-sm border-l-2 border-[var(--study-panel-border)] bg-[var(--study-surface-solid)] text-[var(--study-text)] shadow-[var(--study-shadow-lg)] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--study-border)] px-3.5 py-2.5">
              <span className="font-mono text-[10px] font-black uppercase tracking-wider">
                Book Grounding & 3D Lab Info
              </span>
              <button
                type="button"
                onClick={() => setShowSources(false)}
                className="cursor-pointer rounded-full p-1 hover:bg-[var(--study-glass-hover)]"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {activeLabScene && (
                <div className="rounded-xl border border-[var(--study-teal-border)] bg-[var(--study-teal-bg)] p-2.5 text-[11px] text-[var(--study-teal-text)]">
                  <div className="flex items-center gap-1 font-mono text-[9.5px] font-black uppercase">
                    <Box className="size-3" />
                    <span>Active Lab Tier: {activeLabScene.tier}</span>
                  </div>
                  <div className="font-semibold mt-0.5 text-[var(--study-text)]">{activeLabScene.title}</div>
                </div>
              )}

              {sourceList.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-[var(--study-border)] bg-[var(--study-surface-muted)] p-2.5 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span dir="auto" className="font-bold text-[var(--study-text)]">
                      {item.nodeText}
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigateToPage?.(item.page)}
                      className="cursor-pointer shrink-0 rounded-full border border-[var(--study-pill-border)] bg-[var(--study-surface-solid)] px-2 py-0.5 font-mono text-[10px] font-black text-[var(--study-text)] hover:bg-[color:var(--orange)] hover:text-[#0f0e10]"
                    >
                      p.{item.page}
                    </button>
                  </div>
                  <p dir="auto" className="text-[11px] italic text-[var(--study-text-soft)]">
                    &ldquo;{item.quote}&rdquo;
                  </p>
                  {item.inferred && (
                    <span className="inline-block rounded bg-[var(--study-amber-bg)] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[var(--study-amber-text)]">
                      Synthesized from page context
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Slim Bottom Transport Bar */}
      <div className="flex flex-col gap-1.5 border-t-[1.5px] border-[var(--study-pill-border)]/35 bg-[var(--study-surface)] backdrop-blur-xl px-3 py-2 text-[var(--study-text)]">
        {/* Section Step Markers */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {lesson.sections.map((sec, idx) => {
            const secAudio = sectionTracks[idx];
            const isReady = secAudio?.status === "ready";
            const isFailed = secAudio?.status === "failed";
            const isActive = idx === engine.activeSectionIndex && !isOverview;

            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => {
                  setIsOverview(false);
                  engine.selectSection(idx);
                }}
                className={cn(
                  "cursor-pointer shrink-0 flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-black transition-all",
                  isActive
                    ? "border-[var(--study-panel-border)] bg-[color:var(--orange)] text-[#0f0e10] shadow-xs"
                    : isFailed
                    ? "border-[var(--study-amber-border)] bg-[var(--study-amber-bg)] text-[var(--study-amber-text)]"
                    : isReady
                    ? "border-[var(--study-pill-border)] bg-[var(--study-surface-muted)] text-[var(--study-text)] hover:border-[var(--study-panel-border)]"
                    : "border-[var(--study-border)] bg-[var(--study-surface-muted)] text-[var(--study-text-muted)]"
                )}
              >
                <span>{String(idx + 1).padStart(2, "0")}</span>
                {!isReady && !isFailed && (
                  <Loader2 className="size-2.5 animate-spin" />
                )}
                <span
                  dir="auto"
                  className="max-w-[130px] truncate hidden sm:inline font-sans font-bold"
                >
                  {sec.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* Transport Controls */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (isOverview) {
                  setIsOverview(false);
                  setMode("guided");
                  engine.restart();
                } else {
                  setMode("guided");
                  engine.togglePlay();
                }
              }}
              className="cursor-pointer flex items-center gap-1.5 rounded-full border-2 border-[var(--study-panel-border)] bg-[color:var(--orange)] px-3 py-1 font-mono text-[11px] font-black uppercase text-[#0f0e10] shadow-[var(--study-active-shadow)] hover:scale-[1.02] transition-transform"
            >
              {engine.isPlaying ? (
                <>
                  <Pause className="size-3.5 stroke-[2.5]" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="size-3.5 stroke-[2.5] fill-current" />
                  <span>{isOverview ? "Replay" : "Play"}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOverview(false);
                setMode("guided");
                engine.restart();
              }}
              title="Restart lesson"
              className="cursor-pointer rounded-full border-[1.5px] border-[var(--study-pill-border)] bg-[var(--study-surface-muted)] p-1.5 text-[var(--study-text)] hover:bg-[var(--study-glass-hover)]"
            >
              <RotateCcw className="size-3.5 stroke-[2.5]" />
            </button>

            <span className="font-mono text-[10.5px] font-bold text-[var(--study-text-muted)] ml-1">
              {formatMs(elapsedMs)} / {formatMs(totalDurationMs)}
              {engine.isVirtualClock && engine.isPlaying ? " (Visual)" : ""}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const idx = SPEEDS.indexOf(playbackSpeed);
                setPlaybackSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
              }}
              title="Playback speed"
              className="cursor-pointer rounded-full border-[1.5px] border-[var(--study-pill-border)] bg-[var(--study-surface-muted)] px-2 py-1 font-mono text-[10px] font-black text-[var(--study-text)] hover:bg-[var(--study-glass-hover)]"
            >
              {playbackSpeed}x
            </button>

            <button
              type="button"
              onClick={() => setShowCaptions((prev) => !prev)}
              title="Toggle 1-line overlay captions"
              className={cn(
                "cursor-pointer rounded-full border-[1.5px] p-1.5 transition-colors",
                showCaptions
                  ? "border-[var(--study-panel-border)] bg-[color:var(--mint)] text-[#0f0e10]"
                  : "border-[var(--study-pill-border)] bg-[var(--study-surface-muted)] text-[var(--study-text-muted)] hover:text-[var(--study-text)]"
              )}
            >
              <Captions className="size-3.5 stroke-[2.5]" />
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOverview((prev) => {
                  const next = !prev;
                  if (next) engine.pause();
                  return next;
                });
              }}
              title="Full lesson macro map"
              className={cn(
                "cursor-pointer rounded-full border-[1.5px] px-2.5 py-1 font-mono text-[10px] font-black uppercase flex items-center gap-1 transition-colors",
                isOverview
                  ? "border-[var(--study-panel-border)] bg-[color:var(--orange)] text-[#0f0e10]"
                  : "border-[var(--study-pill-border)] bg-[var(--study-surface-muted)] text-[var(--study-text)] hover:bg-[var(--study-glass-hover)]"
              )}
            >
              <LayoutGrid className="size-3 stroke-[2.5]" />
              <span className="hidden sm:inline">Full Map</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
