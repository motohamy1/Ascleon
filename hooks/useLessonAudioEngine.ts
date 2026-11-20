"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LessonVoiceSectionTrack } from "@/types/lesson-board";

interface UseLessonAudioEngineOptions {
  sections: LessonVoiceSectionTrack[];
  playbackSpeed: number;
  isOverview: boolean;
  onReachEnd: () => void;
}

export interface LessonAudioEngineState {
  activeSectionIndex: number;
  sectionElapsedMs: number;
  isPlaying: boolean;
  isBuffering: boolean;
  isVirtualClock: boolean;
  decodedReadyCount: number;
  togglePlay: () => void;
  restart: () => void;
  selectSection: (index: number) => void;
  pause: () => void;
}

function getSectionDurationMs(sec?: LessonVoiceSectionTrack): number {
  if (!sec) return 10_000;
  if (sec.audioDurationMs && sec.audioDurationMs > 500) return sec.audioDurationMs;
  if (sec.cues && sec.cues.length > 0) {
    const last = sec.cues[sec.cues.length - 1];
    if (last.endMs > 500) return last.endMs;
  }
  return 10_000;
}

/**
 * Gapless Web Audio API engine for LessonBoard sections with a resilient
 * virtual reading-cadence clock fallback so playback NEVER hangs or freezes
 * if TTS audio is still generating or failed due to rate limits.
 */
export function useLessonAudioEngine({
  sections,
  playbackSpeed,
  isOverview,
  onReachEnd,
}: UseLessonAudioEngineOptions): LessonAudioEngineState {
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [sectionElapsedMs, setSectionElapsedMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVirtualClock, setIsVirtualClock] = useState(false);
  const [wantAutoPlay, setWantAutoPlay] = useState(true);
  const [decodedReadyCount, setDecodedReadyCount] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const fetchingRef = useRef<Set<string>>(new Set());
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const sectionStartCtxTimeRef = useRef<number>(0);
  const offsetAtStartSecRef = useRef<number>(0);
  const virtualLastTickMsRef = useRef<number>(0);
  const virtualElapsedMsRef = useRef<number>(0);
  const isVirtualClockRef = useRef<boolean>(false);
  const activeIndexRef = useRef<number>(0);
  const speedRef = useRef<number>(playbackSpeed);
  const isPlayingRef = useRef<boolean>(false);
  const rafRef = useRef<number | null>(null);
  const sectionsRef = useRef(sections);
  const onReachEndRef = useRef(onReachEnd);

  sectionsRef.current = sections;
  onReachEndRef.current = onReachEnd;
  speedRef.current = playbackSpeed;

  const ensureContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        ctxRef.current = new AudioCtx();
      }
    }
    if (ctxRef.current && ctxRef.current.state === "suspended") {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  }, []);

  const stopCurrentSource = useCallback(() => {
    const src = activeSourceRef.current;
    if (src) {
      src.onended = null;
      try {
        src.stop();
      } catch {}
      try {
        src.disconnect();
      } catch {}
      activeSourceRef.current = null;
    }
  }, []);

  // Pre-fetch & decode ready section WAVs in priority order starting from activeSectionIndex
  useEffect(() => {
    let cancelled = false;
    const order: number[] = [];
    for (let i = activeSectionIndex; i < sections.length; i++) order.push(i);
    for (let i = 0; i < activeSectionIndex; i++) order.push(i);

    const urls = order
      .map((i) => sections[i]?.audioUrl)
      .filter(
        (u): u is string =>
          Boolean(u && !buffersRef.current.has(u) && !fetchingRef.current.has(u))
      );

    if (urls.length === 0) return;

    (async () => {
      const ctx = ensureContext();
      if (!ctx) return;

      for (const url of urls) {
        if (cancelled) return;
        if (buffersRef.current.has(url) || fetchingRef.current.has(url)) continue;
        fetchingRef.current.add(url);
        try {
          const resp = await fetch(url);
          if (!resp.ok || cancelled) continue;
          const arrayBuf = await resp.arrayBuffer();
          if (cancelled) continue;
          const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
          if (cancelled) continue;
          buffersRef.current.set(url, decoded);
          setDecodedReadyCount(buffersRef.current.size);
        } catch {
          // Non-fatal: virtual clock handles playback smoothly
        } finally {
          fetchingRef.current.delete(url);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sections, activeSectionIndex, ensureContext]);

  const startSectionPlayback = useCallback(
    (index: number, startOffsetSec = 0) => {
      const sec = sectionsRef.current[index];
      if (!sec) {
        stopCurrentSource();
        isPlayingRef.current = false;
        isVirtualClockRef.current = false;
        setIsPlaying(false);
        setIsVirtualClock(false);
        return false;
      }

      const url = sec.audioUrl;
      const buf = url ? buffersRef.current.get(url) : undefined;
      const ctx = ensureContext();

      stopCurrentSource();

      // Path A: Decoded real WAV audio available
      if (sec.status === "ready" && buf && ctx) {
        const safeOffset = Math.max(0, Math.min(buf.duration - 0.05, startOffsetSec));
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = speedRef.current;
        src.connect(ctx.destination);

        const when = ctx.currentTime;
        sectionStartCtxTimeRef.current = when;
        offsetAtStartSecRef.current = safeOffset;
        activeIndexRef.current = index;
        activeSourceRef.current = src;
        isVirtualClockRef.current = false;
        isPlayingRef.current = true;
        setActiveSectionIndex(index);
        setSectionElapsedMs(Math.round(safeOffset * 1000));
        setIsVirtualClock(false);
        setIsPlaying(true);

        src.onended = () => {
          if (activeSourceRef.current !== src) return;
          activeSourceRef.current = null;
          const nextIdx = index + 1;
          if (nextIdx < sectionsRef.current.length) {
            activeIndexRef.current = nextIdx;
            setActiveSectionIndex(nextIdx);
            setSectionElapsedMs(0);
            offsetAtStartSecRef.current = 0;
            virtualElapsedMsRef.current = 0;
            startSectionPlayback(nextIdx, 0);
          } else {
            isPlayingRef.current = false;
            isVirtualClockRef.current = false;
            setIsPlaying(false);
            setIsVirtualClock(false);
            setWantAutoPlay(false);
            setSectionElapsedMs(Math.round(buf.duration * 1000));
            onReachEndRef.current();
          }
        };

        src.start(when, safeOffset);
        return true;
      }

      // Path B: Resilient Virtual Clock when audio failed or is still generating
      if (sec.status === "failed" || !url) {
        activeIndexRef.current = index;
        virtualElapsedMsRef.current = Math.round(startOffsetSec * 1000);
        virtualLastTickMsRef.current = performance.now();
        isVirtualClockRef.current = true;
        isPlayingRef.current = true;
        setActiveSectionIndex(index);
        setSectionElapsedMs(virtualElapsedMsRef.current);
        setIsVirtualClock(true);
        setIsPlaying(true);
        return true;
      }

      // Audio URL exists and is still decoding; wait briefly or fall back after timeout
      isPlayingRef.current = false;
      setIsPlaying(false);
      return false;
    },
    [ensureContext, stopCurrentSource]
  );

  // Auto-start active section when its decoded AudioBuffer arrives (or switch from virtual clock)
  useEffect(() => {
    if (!wantAutoPlay || isOverview) return;
    const sec = sections[activeSectionIndex];
    const url = sec?.audioUrl;
    if (
      sec?.status === "ready" &&
      url &&
      buffersRef.current.has(url) &&
      (!isPlayingRef.current || isVirtualClockRef.current)
    ) {
      const resumeSec = isVirtualClockRef.current
        ? virtualElapsedMsRef.current / 1000
        : offsetAtStartSecRef.current;
      startSectionPlayback(activeSectionIndex, resumeSec);
    } else if (
      sec?.status === "failed" &&
      !isPlayingRef.current
    ) {
      startSectionPlayback(activeSectionIndex, offsetAtStartSecRef.current);
    }
  }, [
    wantAutoPlay,
    isOverview,
    activeSectionIndex,
    sections,
    decodedReadyCount,
    startSectionPlayback,
  ]);

  // Keep live playbackRate updated without stopping playback
  useEffect(() => {
    const src = activeSourceRef.current;
    const ctx = ctxRef.current;
    if (src && ctx && isPlayingRef.current && !isVirtualClockRef.current) {
      const elapsedSec =
        offsetAtStartSecRef.current +
        (ctx.currentTime - sectionStartCtxTimeRef.current) * src.playbackRate.value;
      offsetAtStartSecRef.current = elapsedSec;
      sectionStartCtxTimeRef.current = ctx.currentTime;
      src.playbackRate.value = playbackSpeed;
    }
  }, [playbackSpeed]);

  // 60fps master clock loop (AudioContext clock OR Virtual Reading Clock)
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = (now: number) => {
      if (isVirtualClockRef.current && isPlayingRef.current) {
        const dt = Math.max(0, Math.min(100, now - virtualLastTickMsRef.current));
        virtualLastTickMsRef.current = now;
        const sec = sectionsRef.current[activeIndexRef.current];
        const totalMs = getSectionDurationMs(sec);
        virtualElapsedMsRef.current += dt * speedRef.current;

        if (virtualElapsedMsRef.current >= totalMs) {
          const nextIdx = activeIndexRef.current + 1;
          if (nextIdx < sectionsRef.current.length) {
            activeIndexRef.current = nextIdx;
            virtualElapsedMsRef.current = 0;
            offsetAtStartSecRef.current = 0;
            setActiveSectionIndex(nextIdx);
            setSectionElapsedMs(0);
            startSectionPlayback(nextIdx, 0);
          } else {
            isPlayingRef.current = false;
            isVirtualClockRef.current = false;
            setIsPlaying(false);
            setIsVirtualClock(false);
            setWantAutoPlay(false);
            setSectionElapsedMs(totalMs);
            onReachEndRef.current();
            return;
          }
        } else {
          setSectionElapsedMs(Math.round(virtualElapsedMsRef.current));
        }
      } else {
        const ctx = ctxRef.current;
        const src = activeSourceRef.current;
        if (ctx && src && isPlayingRef.current) {
          const elapsedSec =
            offsetAtStartSecRef.current +
            (ctx.currentTime - sectionStartCtxTimeRef.current) * speedRef.current;
          const durMs = (src.buffer?.duration || 10) * 1000;
          setSectionElapsedMs(Math.max(0, Math.min(durMs, Math.round(elapsedSec * 1000))));
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    virtualLastTickMsRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, startSectionPlayback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCurrentSource();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
    };
  }, [stopCurrentSource]);

  const pause = useCallback(() => {
    setWantAutoPlay(false);
    if (isVirtualClockRef.current && isPlayingRef.current) {
      offsetAtStartSecRef.current = virtualElapsedMsRef.current / 1000;
      setSectionElapsedMs(Math.round(virtualElapsedMsRef.current));
    } else if (ctxRef.current && isPlayingRef.current) {
      const elapsedSec =
        offsetAtStartSecRef.current +
        (ctxRef.current.currentTime - sectionStartCtxTimeRef.current) * speedRef.current;
      offsetAtStartSecRef.current = Math.max(0, elapsedSec);
      setSectionElapsedMs(Math.round(offsetAtStartSecRef.current * 1000));
    }
    stopCurrentSource();
    isPlayingRef.current = false;
    isVirtualClockRef.current = false;
    setIsPlaying(false);
    setIsVirtualClock(false);
  }, [stopCurrentSource]);

  const togglePlay = useCallback(() => {
    ensureContext();
    if (isPlayingRef.current) {
      pause();
      return;
    }
    setWantAutoPlay(true);
    const started = startSectionPlayback(
      activeIndexRef.current,
      offsetAtStartSecRef.current
    );
    if (!started) {
      // Fallback immediately to virtual clock if user pressed Play while audio is pending
      activeIndexRef.current = activeSectionIndex;
      virtualElapsedMsRef.current = Math.round(offsetAtStartSecRef.current * 1000);
      virtualLastTickMsRef.current = performance.now();
      isVirtualClockRef.current = true;
      isPlayingRef.current = true;
      setIsVirtualClock(true);
      setIsPlaying(true);
    }
  }, [ensureContext, pause, startSectionPlayback, activeSectionIndex]);

  const restart = useCallback(() => {
    ensureContext();
    stopCurrentSource();
    isPlayingRef.current = false;
    isVirtualClockRef.current = false;
    setIsPlaying(false);
    setIsVirtualClock(false);
    activeIndexRef.current = 0;
    offsetAtStartSecRef.current = 0;
    virtualElapsedMsRef.current = 0;
    setActiveSectionIndex(0);
    setSectionElapsedMs(0);
    setWantAutoPlay(true);
    startSectionPlayback(0, 0);
  }, [ensureContext, stopCurrentSource, startSectionPlayback]);

  const selectSection = useCallback(
    (index: number) => {
      ensureContext();
      stopCurrentSource();
      isPlayingRef.current = false;
      isVirtualClockRef.current = false;
      setIsPlaying(false);
      setIsVirtualClock(false);
      activeIndexRef.current = index;
      offsetAtStartSecRef.current = 0;
      virtualElapsedMsRef.current = 0;
      setActiveSectionIndex(index);
      setSectionElapsedMs(0);
      setWantAutoPlay(true);
      startSectionPlayback(index, 0);
    },
    [ensureContext, stopCurrentSource, startSectionPlayback]
  );

  const activeSec = sections[activeSectionIndex];
  const activeReady =
    activeSec?.status === "ready" &&
    Boolean(activeSec.audioUrl && buffersRef.current.has(activeSec.audioUrl));
  const isBuffering =
    !isPlaying &&
    wantAutoPlay &&
    !isOverview &&
    !activeReady &&
    activeSec?.status === "generating";

  return {
    activeSectionIndex,
    sectionElapsedMs,
    isPlaying,
    isBuffering,
    isVirtualClock,
    decodedReadyCount,
    togglePlay,
    restart,
    selectSection,
    pause,
  };
}
