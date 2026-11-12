"use client";

import React from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Captions,
  LayoutGrid,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  Volume2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VoiceTrack, WhiteboardBeat } from "@/types/whiteboard-video";
import { WHITEBOARD_NARRATOR_VOICES } from "@/lib/whiteboard/voices";

interface PlayerControlsProps {
  beats: WhiteboardBeat[];
  voiceTrack?: VoiceTrack;
  activeBeatIndex: number;
  isPlaying: boolean;
  isWaitingForNextBeat: boolean;
  isOverview: boolean;
  playbackSpeed: number;
  showCaptions: boolean;
  isCinema: boolean;
  activeVoiceId: string;
  isSwitchingVoice: boolean;
  elapsedMs: number;
  totalDurationMs: number;
  onTogglePlay: () => void;
  onRestart: () => void;
  onSelectBeat: (index: number) => void;
  onCycleSpeed: () => void;
  onToggleCaptions: () => void;
  onToggleOverview: () => void;
  onToggleCinema: () => void;
  onChangeVoice: (voiceId: string) => void;
  onChangeScope?: () => void;
}

function formatMs(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PlayerControls({
  beats,
  voiceTrack,
  activeBeatIndex,
  isPlaying,
  isWaitingForNextBeat,
  isOverview,
  playbackSpeed,
  showCaptions,
  isCinema,
  activeVoiceId,
  isSwitchingVoice,
  elapsedMs,
  totalDurationMs,
  onTogglePlay,
  onRestart,
  onSelectBeat,
  onCycleSpeed,
  onToggleCaptions,
  onToggleOverview,
  onToggleCinema,
  onChangeVoice,
  onChangeScope,
}: PlayerControlsProps) {
  return (
    <div className="flex flex-col gap-2 border-t-2 border-[color:var(--ink)] bg-[color:var(--panel)] px-3 py-2">
      {/* Beat Chapter Scrubber Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {beats.map((beat, idx) => {
          const audioBeat = voiceTrack?.beats?.[idx];
          const isReady = beat.vectorStatus === "ready" && audioBeat?.status === "ready";
          const isFailed = beat.vectorStatus === "failed" || audioBeat?.status === "failed";
          const isActive = idx === activeBeatIndex && !isOverview;

          return (
            <button
              key={beat.index}
              type="button"
              onClick={() => onSelectBeat(idx)}
              title={`${idx + 1}. ${beat.title} (p.${beat.sourcePage})`}
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
              <span>{idx + 1}</span>
              {!isReady && !isFailed && <Loader2 className="size-2.5 animate-spin" />}
              {isFailed && <AlertTriangle className="size-2.5 text-red-600" />}
              <span className="max-w-[110px] truncate hidden sm:inline font-sans font-bold">
                {beat.title}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Transport + View Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={isWaitingForNextBeat}
            className="cursor-pointer flex items-center gap-1.5 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-3 py-1 font-mono text-[11px] font-black uppercase text-[color:var(--ink)] shadow-chip hover:scale-[1.03] transition-transform disabled:opacity-60"
          >
            {isWaitingForNextBeat ? (
              <>
                <Loader2 className="size-3.5 animate-spin stroke-[2.5]" />
                <span>Buffering</span>
              </>
            ) : isPlaying ? (
              <>
                <Pause className="size-3.5 stroke-[2.5]" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="size-3.5 stroke-[2.5] fill-current" />
                <span>Play</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onRestart}
            title="Restart video"
            className="cursor-pointer rounded-full border border-[color:var(--ink)]/30 bg-white p-1.5 text-[color:var(--ink)] hover:bg-[color:var(--cream)]"
          >
            <RotateCcw className="size-3.5 stroke-[2.5]" />
          </button>

          <span className="font-mono text-[10.5px] font-bold text-[color:var(--ink)]/75 ml-1">
            {formatMs(elapsedMs)} / {formatMs(totalDurationMs)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Narrator Voice Switcher (reuses sketches) */}
          <label className="flex items-center gap-1 rounded-full border border-[color:var(--ink)]/30 bg-white px-2 py-0.5 text-[10px] font-mono font-bold text-[color:var(--ink)]">
            {isSwitchingVoice ? (
              <Loader2 className="size-3 animate-spin text-[color:var(--orange)]" />
            ) : (
              <Volume2 className="size-3 text-[color:var(--orange)]" />
            )}
            <select
              value={activeVoiceId}
              onChange={(e) => onChangeVoice(e.target.value)}
              disabled={isSwitchingVoice}
              title="Switch narrator voice (keeps sketches cached)"
              className="cursor-pointer bg-transparent font-mono text-[10px] font-black focus:outline-none"
            >
              {WHITEBOARD_NARRATOR_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.gender})
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={onCycleSpeed}
            title="Playback speed"
            className="cursor-pointer rounded-full border border-[color:var(--ink)]/30 bg-white px-2 py-1 font-mono text-[10px] font-black text-[color:var(--ink)] hover:bg-[color:var(--cream)]"
          >
            {playbackSpeed}x
          </button>

          <button
            type="button"
            onClick={onToggleCaptions}
            title="Toggle captions"
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
            onClick={onToggleOverview}
            title="Full board summary view"
            className={cn(
              "cursor-pointer rounded-full border px-2 py-1 font-mono text-[10px] font-black uppercase flex items-center gap-1 transition-colors",
              isOverview
                ? "border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)]"
                : "border-[color:var(--ink)]/30 bg-white text-[color:var(--ink)] hover:bg-[color:var(--cream)]"
            )}
          >
            <LayoutGrid className="size-3 stroke-[2.5]" />
            <span className="hidden md:inline">Board</span>
          </button>

          {onChangeScope && (
            <button
              type="button"
              onClick={onChangeScope}
              title="Change topic or scope"
              className="cursor-pointer rounded-full border border-[color:var(--ink)]/30 bg-white px-2 py-1 font-mono text-[10px] font-black uppercase flex items-center gap-1 text-[color:var(--ink)] hover:bg-[color:var(--cream)]"
            >
              <SlidersHorizontal className="size-3 stroke-[2.5]" />
              <span className="hidden md:inline">Scope</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleCinema}
            title={isCinema ? "Exit fullscreen" : "Theater mode"}
            className="cursor-pointer rounded-full border border-[color:var(--ink)] bg-[color:var(--cream)] p-1.5 text-[color:var(--ink)] hover:bg-[color:var(--orange)]"
          >
            {isCinema ? <Minimize2 className="size-3.5 stroke-[2.5]" /> : <Maximize2 className="size-3.5 stroke-[2.5]" />}
          </button>
        </div>
      </div>
    </div>
  );
}
