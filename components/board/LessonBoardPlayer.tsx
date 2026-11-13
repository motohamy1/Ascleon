"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Captions,
  LayoutGrid,
  Loader2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Volume2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { layoutLessonBoard } from "@/lib/board/layout";
import { computeBoardTimeline } from "@/lib/board/timeline";
import { useLessonAudioEngine } from "@/hooks/useLessonAudioEngine";
import { WHITEBOARD_NARRATOR_VOICES } from "@/lib/whiteboard/voices";
import { LessonBoardData } from "@/types/lesson-board";
import { LessonBoardCanvas } from "./LessonBoardCanvas";

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

const SPEEDS = [0.75, 1, 1.25, 1.5];

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
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  // Captions strictly OFF by default; never render text below the whiteboard
  const [showCaptions, setShowCaptions] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

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

  const layout = useMemo(
    () => layoutLessonBoard(lesson.sections, lesson.links),
    [lesson.sections, lesson.links]
  );

  const timeline = useMemo(
    () =>
      computeBoardTimeline({
        lesson,
        layout,
        voiceTrack,
        activeSectionIndex: engine.activeSectionIndex,
        sectionElapsedMs: engine.sectionElapsedMs,
        isPlaying: engine.isPlaying,
        isOverview,
      }),
    [
      lesson,
      layout,
      voiceTrack,
      engine.activeSectionIndex,
      engine.sectionElapsedMs,
      engine.isPlaying,
      isOverview,
    ]
  );

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
  const activeSecTrack = sectionTracks[engine.activeSectionIndex];
  const activeSecFailed = activeSecTrack?.status === "failed";

  const sourceList = useMemo(() => {
    const list: Array<{ page: number; quote: string; nodeText: string }> = [];
    for (const sec of lesson.sections) {
      for (const n of sec.nodes) {
        list.push({
          page: n.source.page,
          quote: n.source.quote,
          nodeText: n.text,
        });
      }
    }
    return list;
  }, [lesson.sections]);

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-[color:var(--ink-soft)] text-[color:var(--ink)] overflow-hidden",
        isCinema && "fixed inset-0 z-50 p-3 sm:p-5 bg-black/95 backdrop-blur-md",
        className
      )}
    >
      {/* Slim Top Bar */}
      <div className="relative flex items-center justify-between gap-2 border-b-2 border-[color:var(--ink)] bg-[color:var(--ink-soft)] px-3 py-2 text-[color:var(--cream)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-full border border-[color:var(--ink)] bg-[color:var(--orange)] px-2 py-0.5 font-mono text-[9px] font-black uppercase text-[color:var(--ink)] shrink-0">
            LESSON BOARD
          </span>
          <span
            dir="auto"
            className="truncate font-sans text-xs font-black text-[color:var(--cream)]"
          >
            {lesson.title}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isGeneratingAudio && (
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[9.5px] font-bold text-[color:var(--mint)]">
              Recording {readyCount}/{lesson.sections.length}…
            </span>
          )}

          {lesson.droppedFacts.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSources(true)}
              title={`${lesson.droppedFacts.length} unverified point(s) skipped`}
              className="cursor-pointer flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-500/15 px-2 py-0.5 font-mono text-[9px] font-bold text-amber-200"
            >
              <AlertTriangle className="size-2.5" />
              <span>{lesson.droppedFacts.length} skipped</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowSources((prev) => !prev)}
            title="Verified book sources"
            className={cn(
              "cursor-pointer flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[9.5px] font-bold transition-colors",
              showSources
                ? "border-[color:var(--orange)] bg-[color:var(--orange)] text-[color:var(--ink)]"
                : "border-white/20 bg-white/10 text-[color:var(--cream)] hover:bg-white/20"
            )}
          >
            <BookOpen className="size-2.5" />
            <span>Sources ({sourceList.length})</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreMenu((prev) => !prev)}
              title="Voice & lesson options"
              className="cursor-pointer rounded-full border border-white/20 bg-white/10 p-1 text-[color:var(--cream)] hover:bg-white/20"
            >
              <MoreHorizontal className="size-3.5" />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-8 z-40 w-60 rounded-2xl border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-2.5 text-[color:var(--ink)] shadow-lg flex flex-col gap-2">
                <div className="space-y-1">
                  <span className="block font-mono text-[9px] font-black uppercase text-[color:var(--ink)]/65">
                    Narrator Voice
                  </span>
                  <div className="flex items-center gap-1.5 rounded-xl border border-[color:var(--ink)]/30 bg-white px-2 py-1">
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
                      className="w-full cursor-pointer bg-transparent font-sans text-xs font-bold focus:outline-none"
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
                    className="cursor-pointer flex items-center gap-2 rounded-xl border border-[color:var(--ink)]/20 bg-white px-2.5 py-1.5 font-mono text-[10px] font-black uppercase hover:bg-[color:var(--cream)]"
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
                    className="cursor-pointer flex items-center gap-2 rounded-xl border border-[color:var(--ink)]/20 bg-white px-2.5 py-1.5 font-mono text-[10px] font-black uppercase hover:bg-[color:var(--orange)]"
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
            className="cursor-pointer rounded-full border border-white/20 bg-white/10 p-1 text-[color:var(--cream)] hover:bg-[color:var(--orange)] hover:text-[color:var(--ink)]"
          >
            {isCinema ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Main Whiteboard Stage — NOTHING rendered below this stage except the slim transport */}
      <div className="relative flex-1 min-h-[260px] bg-[#FCFBF8] overflow-hidden">
        <LessonBoardCanvas
          lesson={lesson}
          layout={layout}
          timeline={timeline}
          isOverview={isOverview}
          isPlaying={engine.isPlaying}
          onNavigateToPage={onNavigateToPage}
          onSelectSection={(idx) => {
            setIsOverview(false);
            engine.selectSection(idx);
          }}
        />

        {/* Active Section Failed Retry Banner (overlay inside stage) */}
        {activeSecFailed && !isOverview && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border-2 border-red-600 bg-red-50 px-3.5 py-1.5 text-xs font-bold text-red-900 shadow-sm">
            <AlertTriangle className="size-3.5 text-red-600" />
            <span>
              Section {engine.activeSectionIndex + 1} audio failed.
            </span>
            <button
              type="button"
              onClick={() => onRetrySectionAudio(engine.activeSectionIndex)}
              className="cursor-pointer rounded-full border border-red-700 bg-white px-2.5 py-0.5 font-mono text-[10px] font-black uppercase hover:bg-red-100"
            >
              Retry
            </button>
          </div>
        )}

        {/* Optional 1-Line Floating Caption Overlay (OFF by default, INSIDE board) */}
        {showCaptions && !isOverview && timeline.activeCue && (
          <div className="pointer-events-none absolute inset-x-4 bottom-3 z-20 flex justify-center">
            <div
              dir="auto"
              className="ascleon-bidi max-w-2xl truncate rounded-full border border-[color:var(--ink)]/25 bg-[#141318]/88 px-4 py-1.5 text-xs font-semibold text-[#fbf7f0] shadow-sm backdrop-blur-xs"
            >
              {timeline.activeCue.text}
            </div>
          </div>
        )}

        {/* Collapsible Sources & Verification Drawer inside stage */}
        {showSources && (
          <div className="absolute inset-y-0 right-0 z-30 w-full max-w-sm border-l-2 border-[color:var(--ink)] bg-[color:var(--panel)] text-[color:var(--ink)] shadow-xl flex flex-col">
            <div className="flex items-center justify-between border-b-2 border-[color:var(--ink)]/15 px-3.5 py-2.5">
              <span className="font-mono text-[10px] font-black uppercase tracking-wider">
                Verified Book Citations
              </span>
              <button
                type="button"
                onClick={() => setShowSources(false)}
                className="cursor-pointer rounded-full p-1 hover:bg-black/5"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {lesson.droppedFacts.length > 0 && (
                <div className="rounded-xl border border-amber-400 bg-amber-50 p-2.5 text-[11px] text-amber-950">
                  <div className="font-mono text-[9.5px] font-black uppercase mb-1">
                    Skipped ({lesson.droppedFacts.length} unverified in book)
                  </div>
                  <ul className="space-y-1 list-disc pl-4">
                    {lesson.droppedFacts.map((df, i) => (
                      <li key={i}>
                        <span className="font-semibold">{df.text}</span> —{" "}
                        {df.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {sourceList.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-[color:var(--ink)]/20 bg-white p-2.5 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span dir="auto" className="font-bold text-[color:var(--ink)]">
                      {item.nodeText}
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigateToPage?.(item.page)}
                      className="cursor-pointer shrink-0 rounded-full border border-[color:var(--ink)]/30 bg-[color:var(--cream)] px-2 py-0.5 font-mono text-[10px] font-black hover:bg-[color:var(--orange)]"
                    >
                      p.{item.page}
                    </button>
                  </div>
                  <p dir="auto" className="text-[11px] italic text-slate-600">
                    &ldquo;{item.quote}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Slim Bottom Transport Bar */}
      <div className="flex flex-col gap-1.5 border-t-2 border-[color:var(--ink)] bg-[color:var(--panel)] px-3 py-2">
        {/* Section Markers */}
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
                    ? "border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)] shadow-xs"
                    : isFailed
                    ? "border-red-500 bg-red-50 text-red-700"
                    : isReady
                    ? "border-[color:var(--ink)]/30 bg-[color:var(--cream)]/70 text-[color:var(--ink)] hover:border-[color:var(--ink)]"
                    : "border-[color:var(--ink)]/20 bg-white/60 text-[color:var(--ink)]/50"
                )}
              >
                <span>{String(idx + 1).padStart(2, "0")}</span>
                {!isReady && !isFailed && (
                  <Loader2 className="size-2.5 animate-spin" />
                )}
                {isFailed && <AlertTriangle className="size-2.5 text-red-600" />}
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
                  engine.restart();
                } else {
                  engine.togglePlay();
                }
              }}
              disabled={engine.isBuffering}
              className="cursor-pointer flex items-center gap-1.5 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-3 py-1 font-mono text-[11px] font-black uppercase text-[color:var(--ink)] shadow-chip hover:scale-[1.02] transition-transform disabled:opacity-60"
            >
              {engine.isBuffering ? (
                <>
                  <Loader2 className="size-3.5 animate-spin stroke-[2.5]" />
                  <span>Preparing</span>
                </>
              ) : engine.isPlaying ? (
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
                engine.restart();
              }}
              title="Restart lesson"
              className="cursor-pointer rounded-full border border-[color:var(--ink)]/30 bg-white p-1.5 text-[color:var(--ink)] hover:bg-[color:var(--cream)]"
            >
              <RotateCcw className="size-3.5 stroke-[2.5]" />
            </button>

            <span className="font-mono text-[10.5px] font-bold text-[color:var(--ink)]/75 ml-1">
              {formatMs(elapsedMs)} / {formatMs(totalDurationMs)}
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
              className="cursor-pointer rounded-full border border-[color:var(--ink)]/30 bg-white px-2 py-1 font-mono text-[10px] font-black text-[color:var(--ink)] hover:bg-[color:var(--cream)]"
            >
              {playbackSpeed}x
            </button>

            <button
              type="button"
              onClick={() => setShowCaptions((prev) => !prev)}
              title="Toggle 1-line overlay captions"
              className={cn(
                "cursor-pointer rounded-full border p-1.5 transition-colors",
                showCaptions
                  ? "border-[color:var(--ink)] bg-[color:var(--mint)] text-[color:var(--ink)]"
                  : "border-[color:var(--ink)]/30 bg-white text-[color:var(--ink)]/60"
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
              title="Full lesson map"
              className={cn(
                "cursor-pointer rounded-full border px-2.5 py-1 font-mono text-[10px] font-black uppercase flex items-center gap-1 transition-colors",
                isOverview
                  ? "border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)]"
                  : "border-[color:var(--ink)]/30 bg-white text-[color:var(--ink)] hover:bg-[color:var(--cream)]"
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
