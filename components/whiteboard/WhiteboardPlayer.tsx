"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Play, RefreshCw, Sparkles, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { WhiteboardBeat, WhiteboardVideoData } from "@/types/whiteboard-video";
import { CameraRig } from "./CameraRig";
import { ActivePenTip, SketchLayer } from "./SketchLayer";
import { getLabelPenTip, HandwrittenText } from "./HandwrittenText";
import { PenHand } from "./PenHand";
import { PlayerControls } from "./PlayerControls";

interface WhiteboardPlayerProps {
  video: WhiteboardVideoData;
  isCinema: boolean;
  isSwitchingVoice: boolean;
  isGeneratingMore: boolean;
  onToggleCinema: () => void;
  onRetryBeat: (beatIndex: number) => void;
  onChangeVoice: (voiceId: string) => void;
  onChangeScope?: () => void;
  onRegenerateVideo?: () => void;
  className?: string;
}

const SPEEDS = [0.75, 1, 1.25, 1.5];

export function WhiteboardPlayer({
  video,
  isCinema,
  isSwitchingVoice,
  isGeneratingMore,
  onToggleCinema,
  onRetryBeat,
  onChangeVoice,
  onChangeScope,
  onRegenerateVideo,
  className,
}: WhiteboardPlayerProps) {
  const [activeBeatIndex, setActiveBeatIndex] = useState(0);
  const [beatProgress, setBeatProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wantAutoPlay, setWantAutoPlay] = useState(true);
  const [isOverview, setIsOverview] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showCaptions, setShowCaptions] = useState(true);
  const [penTip, setPenTip] = useState<ActivePenTip | null>(null);
  const [blobUrlMap, setBlobUrlMap] = useState<Record<string, string>>({});

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadedBeatUrlRef = useRef<string | null>(null);
  const blobCacheRef = useRef<Map<string, string>>(new Map());
  const rafRef = useRef<number | null>(null);

  const voiceTrack = video.voiceTracks?.[video.activeVoiceId];
  const activeBeat: WhiteboardBeat | undefined = video.beats[activeBeatIndex];
  const activeAudioBeat = voiceTrack?.beats?.[activeBeatIndex];

  const isBeatPlayable = useCallback(
    (idx: number) => {
      const b = video.beats[idx];
      const a = voiceTrack?.beats?.[idx];
      return Boolean(b && b.vectorStatus === "ready" && b.vectorData && a?.status === "ready" && a?.audioUrl);
    },
    [video.beats, voiceTrack]
  );

  const activeAudioSrc = activeAudioBeat?.audioUrl
    ? blobUrlMap[activeAudioBeat.audioUrl] || null
    : null;

  const isWaitingForNextBeat =
    !isPlaying &&
    wantAutoPlay &&
    !isOverview &&
    (!isBeatPlayable(activeBeatIndex) || !activeAudioSrc) &&
    activeBeat?.vectorStatus !== "failed" &&
    activeAudioBeat?.status !== "failed";

  // Priority preload: fetch active beat's WAV first (avoiding competing downloads), then prefetch upcoming scenes
  useEffect(() => {
    const beats = voiceTrack?.beats || [];
    let cancelled = false;

    const orderIndices: number[] = [];
    if (activeBeatIndex < beats.length) orderIndices.push(activeBeatIndex);
    for (let i = activeBeatIndex + 1; i < beats.length; i++) orderIndices.push(i);
    for (let i = 0; i < activeBeatIndex; i++) orderIndices.push(i);

    const urls = orderIndices
      .map((i) => beats[i]?.audioUrl)
      .filter((u): u is string => Boolean(u && !blobCacheRef.current.has(u)));

    (async () => {
      for (const url of urls) {
        if (cancelled) return;
        if (blobCacheRef.current.has(url)) continue;
        try {
          const res = await fetch(url);
          if (!res.ok || cancelled) continue;
          const blob = await res.blob();
          if (cancelled) return;
          if (!blobCacheRef.current.has(url)) {
            const objUrl = URL.createObjectURL(blob);
            blobCacheRef.current.set(url, objUrl);
            setBlobUrlMap((prev) => ({ ...prev, [url]: objUrl }));
          }
        } catch {
          // Non-fatal; fallback to remote URL on demand
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [voiceTrack, activeBeatIndex]);

  // Revoke object URLs on unmount
  useEffect(() => {
    const cache = blobCacheRef.current;
    return () => {
      cache.forEach((objUrl) => URL.revokeObjectURL(objUrl));
      cache.clear();
    };
  }, []);

  // Load & play audio cleanly once the active beat's local blob URL is ready
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    const remoteUrl = activeAudioBeat?.audioUrl;
    if (!remoteUrl || activeAudioBeat?.status !== "ready" || activeBeat?.vectorStatus !== "ready") {
      audioEl.pause();
      loadedBeatUrlRef.current = null;
      return;
    }

    const srcToUse = blobUrlMap[remoteUrl];
    if (!srcToUse) return;

    if (loadedBeatUrlRef.current !== srcToUse) {
      loadedBeatUrlRef.current = srcToUse;
      audioEl.src = srcToUse;
      audioEl.playbackRate = playbackSpeed;
      audioEl.currentTime = 0;

      if (wantAutoPlay && !isOverview) {
        audioEl
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {
            setWantAutoPlay(false);
            setIsPlaying(false);
          });
      }
    }
  }, [
    activeBeatIndex,
    activeBeat?.vectorStatus,
    activeAudioBeat?.audioUrl,
    activeAudioBeat?.status,
    blobUrlMap,
    playbackSpeed,
    wantAutoPlay,
    isOverview,
  ]);

  // Keep playbackRate in sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Master audio-clock animation loop
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = () => {
      const audio = audioRef.current;
      if (audio) {
        const durMs =
          (Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration * 1000
            : activeAudioBeat?.audioDurationMs) || 12000;
        const p = Math.max(0, Math.min(1, (audio.currentTime * 1000) / durMs));
        setBeatProgress(p);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, activeAudioBeat?.audioDurationMs]);

  const handleAudioEnded = useCallback(() => {
    setBeatProgress(1);
    const nextIdx = activeBeatIndex + 1;

    if (nextIdx < video.beats.length) {
      setActiveBeatIndex(nextIdx);
      setBeatProgress(0);
      loadedBeatUrlRef.current = null;
      setWantAutoPlay(true);
      if (!isBeatPlayable(nextIdx)) {
        setIsPlaying(false);
      }
    } else {
      setWantAutoPlay(false);
      setIsPlaying(false);
      setIsOverview(true);
    }
  }, [activeBeatIndex, video.beats.length, isBeatPlayable]);

  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isOverview) {
      setIsOverview(false);
      setActiveBeatIndex(0);
      setBeatProgress(0);
      loadedBeatUrlRef.current = null;
      setWantAutoPlay(true);
      return;
    }

    if (!isBeatPlayable(activeBeatIndex)) {
      setWantAutoPlay(true);
      return;
    }

    if (isPlaying) {
      setWantAutoPlay(false);
      audio.pause();
      setIsPlaying(false);
    } else {
      setWantAutoPlay(true);
      const blobSrc = activeAudioBeat?.audioUrl
        ? blobCacheRef.current.get(activeAudioBeat.audioUrl)
        : undefined;
      if (!blobSrc) {
        audio.load();
        return;
      }
      if (audio.src !== blobSrc) {
        loadedBeatUrlRef.current = blobSrc;
        audio.src = blobSrc;
        audio.currentTime = 0;
      }
      audio.playbackRate = playbackSpeed;
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  }, [isOverview, isBeatPlayable, activeBeatIndex, activeAudioBeat, isPlaying, playbackSpeed]);

  const handleRestart = useCallback(() => {
    setIsOverview(false);
    setActiveBeatIndex(0);
    setBeatProgress(0);
    loadedBeatUrlRef.current = null;
    setWantAutoPlay(true);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    const url = voiceTrack?.beats?.[0]?.audioUrl;
    const blobSrc = url ? blobCacheRef.current.get(url) : undefined;
    if (isBeatPlayable(0) && audio && blobSrc) {
      loadedBeatUrlRef.current = blobSrc;
      audio.src = blobSrc;
      audio.playbackRate = playbackSpeed;
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  }, [isBeatPlayable, voiceTrack, playbackSpeed]);

  const handleSelectBeat = useCallback(
    (idx: number) => {
      setIsOverview(false);
      setActiveBeatIndex(idx);
      setBeatProgress(0);
      loadedBeatUrlRef.current = null;
      setWantAutoPlay(true);

      const audio = audioRef.current;
      if (audio) audio.pause();

      if (!isBeatPlayable(idx)) {
        setIsPlaying(false);
      }
    },
    [isBeatPlayable]
  );

  const handlePenUpdate = useCallback((nextTip: ActivePenTip | null) => {
    setPenTip((prev) => {
      if (!prev && !nextTip) return prev;
      if (
        prev &&
        nextTip &&
        Math.abs(prev.x - nextTip.x) < 0.25 &&
        Math.abs(prev.y - nextTip.y) < 0.25 &&
        prev.color === nextTip.color &&
        prev.active === nextTip.active
      ) {
        return prev;
      }
      return nextTip;
    });
  }, []);

  // Phase mapping inside active beat:
  // [0.00..0.08] header title, [0.05..0.78] sketch strokes, [0.72..0.94] handwritten labels
  const headerProgress = Math.min(1, Math.max(0, beatProgress / 0.08));
  const sketchProgress = Math.min(1, Math.max(0, (beatProgress - 0.05) / 0.73));
  const labelsProgress = Math.min(1, Math.max(0, (beatProgress - 0.72) / 0.22));

  const labelPenTip = useMemo(() => {
    if (!activeBeat || labelsProgress <= 0.005 || labelsProgress >= 0.995) return null;
    return getLabelPenTip(activeBeat.labels, labelsProgress);
  }, [activeBeat, labelsProgress]);

  const effectivePenTip = useMemo(() => {
    if (!isPlaying || isOverview) return null;
    if (sketchProgress > 0.001 && sketchProgress < 0.999 && penTip?.active) {
      return penTip;
    }
    if (labelPenTip) {
      return { x: labelPenTip.x, y: labelPenTip.y, color: labelPenTip.color, active: true };
    }
    return null;
  }, [isPlaying, isOverview, sketchProgress, penTip, labelPenTip]);

  // Compute total & elapsed time across ready beats
  const { totalDurationMs, elapsedMs } = useMemo(() => {
    const audioBeats = voiceTrack?.beats || [];
    let total = 0;
    let elapsed = 0;
    for (let i = 0; i < video.beats.length; i++) {
      const dur = audioBeats[i]?.audioDurationMs || 12000;
      total += dur;
      if (i < activeBeatIndex) {
        elapsed += dur;
      } else if (i === activeBeatIndex) {
        elapsed += dur * beatProgress;
      }
    }
    return { totalDurationMs: total, elapsedMs: elapsed };
  }, [voiceTrack, video.beats.length, activeBeatIndex, beatProgress]);

  const readyCount = video.beats.filter((_, i) => isBeatPlayable(i)).length;

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-[color:var(--ink-soft)] text-[color:var(--ink)] overflow-hidden",
        isCinema && "fixed inset-0 z-50 p-3 sm:p-5 bg-black/95 backdrop-blur-md",
        className
      )}
    >
      {/* Hidden Master Audio Element */}
      <audio ref={audioRef} preload="auto" onEnded={handleAudioEnded} className="hidden" />

      {/* Top Video Title + Generation Progress Ribbon */}
      <div className="flex items-center justify-between gap-2 border-b-2 border-[color:var(--ink)] bg-[color:var(--ink-soft)] px-3 py-2 text-[color:var(--cream)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-full border border-[color:var(--ink)] bg-[color:var(--orange)] px-2 py-0.5 font-mono text-[9px] font-black uppercase text-[color:var(--ink)] shrink-0">
            WHITEBOARD VIDEO
          </span>
          <span dir="auto" className="truncate font-sans text-xs font-black text-[color:var(--cream)]">
            {video.title}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isGeneratingMore && (
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[9.5px] font-bold text-[color:var(--mint)]">
              Building {readyCount}/{video.beats.length} scenes…
            </span>
          )}
          {onRegenerateVideo && (
            <button
              type="button"
              onClick={onRegenerateVideo}
              title="Regenerate full video"
              className="cursor-pointer flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 font-mono text-[9.5px] font-bold text-[color:var(--cream)] hover:bg-white/20"
            >
              <RefreshCw className="size-2.5" />
              <span className="hidden sm:inline">Regenerate</span>
            </button>
          )}
        </div>
      </div>

      {/* Whiteboard Camera Stage */}
      <div className="relative flex-1 min-h-[260px] bg-[#FCFBF8] overflow-hidden">
        <CameraRig
          beats={video.beats}
          activeBeatIndex={activeBeatIndex}
          activeBeatProgress={beatProgress}
          isOverview={isOverview}
        >
          {video.beats.map((beat, idx) => {
            if (!isOverview && idx !== activeBeatIndex) {
              return null;
            }
            const isActive = idx === activeBeatIndex && !isOverview;
            const showPosterPreview =
              isActive && !isPlaying && beatProgress <= 0.002 && isBeatPlayable(idx);
            const isPast = idx < activeBeatIndex || isOverview || showPosterPreview;
            const slotProgress = isPast ? 1 : isActive ? sketchProgress : 0;
            const slotHeaderProgress = isPast ? 1 : isActive ? headerProgress : 0;
            const slotLabelsProgress = isPast ? 1 : isActive ? labelsProgress : 0;
            const audioBeat = voiceTrack?.beats?.[idx];
            const hasFailure = beat.vectorStatus === "failed" || audioBeat?.status === "failed";

            return (
              <g
                key={beat.index}
                transform={`translate(${beat.boardSlot.x}, ${beat.boardSlot.y})`}
              >
                {/* Clean card frame border on virtual board */}
                <rect
                  x="16"
                  y="16"
                  width="1888"
                  height="1048"
                  rx="28"
                  fill="#FFFFFF"
                  stroke={isActive ? "#18181B" : "#CBD5E1"}
                  strokeWidth={isActive ? "5" : "3"}
                />

                {/* Handwritten Beat Header + Labels */}
                <HandwrittenText
                  beatNumber={idx + 1}
                  title={beat.title}
                  sourcePage={beat.sourcePage}
                  labels={beat.labels}
                  headerProgress={slotHeaderProgress}
                  labelsProgress={slotLabelsProgress}
                />

                {/* Traced 3-Color Vector Sketch */}
                {beat.vectorStatus === "ready" && beat.vectorData ? (
                  <SketchLayer
                    vectorData={beat.vectorData}
                    frameRect={{ x: 56, y: 138, width: 1200, height: 896 }}
                    progress={slotProgress}
                    onPenUpdate={isActive ? handlePenUpdate : undefined}
                  />
                ) : hasFailure ? (
                  <foreignObject x="80" y="220" width="1160" height="720">
                    <div className="flex flex-col items-center justify-center h-full rounded-3xl border-4 border-dashed border-red-300 bg-red-50/70 p-10 text-center">
                      <AlertTriangle className="size-16 text-red-600 mb-4" />
                      <div className="font-sans text-[36px] font-black text-red-900">
                        Scene {idx + 1} failed to render
                      </div>
                      <p className="mt-2 font-sans text-[24px] text-red-700 max-w-[780px]">
                        {beat.vectorError || audioBeat?.error || "Generation error"}
                      </p>
                      <button
                        type="button"
                        onClick={() => onRetryBeat(idx)}
                        className="mt-6 cursor-pointer rounded-full border-4 border-[#0f0e10] bg-[#ff4c00] px-8 py-3 font-sans text-[26px] font-black uppercase text-[#0f0e10]"
                      >
                        Retry Scene {idx + 1}
                      </button>
                    </div>
                  </foreignObject>
                ) : (
                  <foreignObject x="80" y="220" width="1160" height="720">
                    <div className="flex flex-col items-center justify-center h-full rounded-3xl border-4 border-dashed border-slate-300 bg-slate-50/80 p-10 text-center">
                      <Sparkles className="size-14 text-[#ff4c00] animate-pulse mb-4" />
                      <div className="font-sans text-[34px] font-black text-[#18181B]">
                        Illustrating Scene {idx + 1}…
                      </div>
                      <p className="mt-2 font-sans text-[22px] text-slate-600 max-w-[760px]">
                        Drawing marker lines & preparing voice-over from Page {beat.sourcePage}
                      </p>
                    </div>
                  </foreignObject>
                )}

                {/* Marker Hand anchored inside the active beat slot */}
                {isActive && effectivePenTip && (
                  <PenHand
                    x={effectivePenTip.x}
                    y={effectivePenTip.y}
                    visible={effectivePenTip.active}
                    isWriting={isPlaying}
                    color={effectivePenTip.color}
                  />
                )}
              </g>
            );
          })}
        </CameraRig>

        {!isPlaying && !isOverview && beatProgress <= 0.002 && isBeatPlayable(activeBeatIndex) && (
          <button
            type="button"
            onClick={handleTogglePlay}
            className="cursor-pointer absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-3.5 py-1.5 font-mono text-[10px] font-black uppercase text-[color:var(--ink)] shadow-[2px_2px_0px_#0f0e10] transition-transform hover:scale-105"
          >
            <Play className="size-3 fill-current" />
            <span>Play Scene {activeBeatIndex + 1}</span>
          </button>
        )}
      </div>

      {/* Dedicated Non-Occluding Grounded Caption + Source Citation Bar */}
      {showCaptions && activeBeat && !isOverview && (
        <div className="border-t-2 border-[color:var(--ink)] bg-[#141318] px-3 py-2 text-[#fbf7f0]">
          <div dir="auto" className="ascleon-bidi text-xs sm:text-[13px] font-semibold leading-snug text-center max-w-4xl mx-auto">
            {activeBeat.narration}
          </div>
          <div className="mt-1 flex items-center justify-center gap-1.5 font-mono text-[9.5px] text-[color:var(--cream)]/75">
            <BookOpen className="size-3 text-[color:var(--orange)] shrink-0" />
            <span className="truncate max-w-xl">
              Page {activeBeat.sourcePage} · &ldquo;{activeBeat.sourceQuote}&rdquo;
            </span>
          </div>
        </div>
      )}

      {/* Bottom Video Transport & Voice Switcher */}
      <PlayerControls
        beats={video.beats}
        voiceTrack={voiceTrack}
        activeBeatIndex={activeBeatIndex}
        isPlaying={isPlaying}
        isWaitingForNextBeat={isWaitingForNextBeat}
        isOverview={isOverview}
        playbackSpeed={playbackSpeed}
        showCaptions={showCaptions}
        isCinema={isCinema}
        activeVoiceId={video.activeVoiceId}
        isSwitchingVoice={isSwitchingVoice}
        elapsedMs={elapsedMs}
        totalDurationMs={totalDurationMs}
        onTogglePlay={handleTogglePlay}
        onRestart={handleRestart}
        onSelectBeat={handleSelectBeat}
        onCycleSpeed={() => {
          const idx = SPEEDS.indexOf(playbackSpeed);
          setPlaybackSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
        }}
        onToggleCaptions={() => setShowCaptions((prev) => !prev)}
        onToggleOverview={() => {
          setIsOverview((prev) => {
            const next = !prev;
            if (next && audioRef.current) {
              audioRef.current.pause();
              setIsPlaying(false);
            }
            return next;
          });
        }}
        onToggleCinema={onToggleCinema}
        onChangeVoice={onChangeVoice}
        onChangeScope={onChangeScope}
      />
    </div>
  );
}
