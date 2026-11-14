"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Sparkles,
  Volume2,
  Loader2,
  AlertCircle,
  BookOpen,
  Layers,
  Highlighter,
  Hash,
  RefreshCw,
} from "lucide-react";
import { IBook } from "@/types";
import { StudyScope } from "@/components/reader/StudyScopeBar";
import { StudyLanguage } from "@/lib/language";
import {
  WhiteboardPacing,
  WhiteboardScopeType,
  WhiteboardVideoData,
} from "@/types/whiteboard-video";
import { getBoardLimits, LessonBoardData } from "@/types/lesson-board";
import {
  DEFAULT_WHITEBOARD_VOICE,
  WHITEBOARD_NARRATOR_VOICES,
} from "@/lib/whiteboard/voices";
import { LessonBoardPlayer } from "@/components/board/LessonBoardPlayer";
import { WhiteboardPlayer } from "./WhiteboardPlayer";
import { cn } from "@/lib/utils";

interface WhiteboardVideoStudioProps {
  book: IBook;
  currentPageNumber: number;
  activePageLiveText: string;
  selectedText?: string;
  studyLanguage: StudyLanguage;
  onStudyLanguageChange: (lang: StudyLanguage) => void;
  studyScope: StudyScope;
  onStudyScopeChange: (scope: StudyScope) => void;
  onNavigateToPage?: (page: number) => void;
  onWhiteboardExpandChange?: (expanded: boolean) => void;
  selectionTriggerSeq?: number;
  className?: string;
}

const VOICE_PREF_KEY = "ascleon_whiteboard_voice_id";
const USE_LESSON_BOARD_V2 =
  process.env.NEXT_PUBLIC_WHITEBOARD_V2 !== "false";

function estimateDurationPreview(
  scopeType: WhiteboardScopeType,
  wordCount: number,
  pageSpan: number,
  pacing: WhiteboardPacing
): string {
  if (USE_LESSON_BOARD_V2) {
    const limits = getBoardLimits(scopeType, wordCount, pacing);
    const minSec = limits.minSections * 18;
    const maxSec = limits.maxSections * 26;
    const fmt = (s: number) =>
      s < 60 ? `${s}s` : `${(s / 60).toFixed(1).replace(/\.0$/, "")}m`;
    return `${limits.minSections}–${limits.maxSections} sections · ~${fmt(minSec)}–${fmt(maxSec)}`;
  }

  let minB = 4;
  let maxB = 7;
  if (scopeType === "selection") {
    if (wordCount < 180) {
      minB = 2;
      maxB = 3;
    } else if (wordCount < 550) {
      minB = 3;
      maxB = 5;
    }
  } else if (scopeType === "page" || pageSpan <= 1) {
    minB = wordCount < 220 ? 3 : 4;
    maxB = wordCount < 220 ? 4 : 7;
  } else if (pageSpan <= 4) {
    minB = 6;
    maxB = 10;
  } else {
    minB = 8;
    maxB = 14;
  }

  if (pacing === "concise") {
    minB = Math.max(2, minB - 1);
    maxB = Math.max(minB + 1, Math.ceil((minB + maxB) * 0.65));
  } else if (pacing === "deep") {
    minB = Math.min(12, minB + 1);
    maxB = Math.min(14, maxB + 2);
  }

  const minSec = minB * 12;
  const maxSec = maxB * 16;
  const fmt = (s: number) =>
    s < 60 ? `${s}s` : `${(s / 60).toFixed(1).replace(/\.0$/, "")}m`;
  return `${minB}–${maxB} scenes · ~${fmt(minSec)}–${fmt(maxSec)}`;
}

interface BlueprintTopicItem {
  id: string;
  title: string;
  startPage: number;
  endPage: number;
  summary?: string;
}

export function WhiteboardVideoStudio({
  book,
  currentPageNumber,
  activePageLiveText,
  selectedText,
  studyLanguage,
  onStudyLanguageChange,
  studyScope,
  onStudyScopeChange,
  onNavigateToPage,
  onWhiteboardExpandChange,
  selectionTriggerSeq = 0,
  className,
}: WhiteboardVideoStudioProps) {
  const blueprintTopics = useMemo<BlueprintTopicItem[]>(() => {
    const bp = book.blueprint as
      | { topicMap?: { topics?: BlueprintTopicItem[] } }
      | undefined;
    return bp?.topicMap?.topics || [];
  }, [book.blueprint]);

  const matchedTopic = useMemo(() => {
    return (
      blueprintTopics.find(
        (t) =>
          currentPageNumber >= t.startPage && currentPageNumber <= t.endPage
      ) || null
    );
  }, [blueprintTopics, currentPageNumber]);

  const totalBookPages = Number(
    book.totalPages || book.totalSegments || currentPageNumber || 1
  );

  const [scopeType, setScopeType] = useState<WhiteboardScopeType>(() =>
    selectedText
      ? "selection"
      : studyScope?.type || (matchedTopic ? "topic" : "page")
  );
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [rangeStart, setRangeStart] = useState<number>(
    studyScope?.startPage || currentPageNumber
  );
  const [rangeEnd, setRangeEnd] = useState<number>(
    studyScope?.endPage || Math.min(totalBookPages, currentPageNumber + 2)
  );
  const [pacing, setPacing] = useState<WhiteboardPacing>("auto");
  const [selectedVoice, setSelectedVoice] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(VOICE_PREF_KEY);
        if (saved && WHITEBOARD_NARRATOR_VOICES.some((v) => v.id === saved)) {
          return saved;
        }
      } catch {}
    }
    return DEFAULT_WHITEBOARD_VOICE;
  });

  const [lesson, setLesson] = useState<LessonBoardData | null>(null);
  const [video, setVideo] = useState<WhiteboardVideoData | null>(null);
  const [isConfiguring, setIsConfiguring] = useState(true);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);
  const [isSwitchingVoice, setIsSwitchingVoice] = useState(false);
  const [isCinema, setIsCinema] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(
    null
  );
  const [prevTriggerSeq, setPrevTriggerSeq] = useState(selectionTriggerSeq);

  if (selectionTriggerSeq !== prevTriggerSeq) {
    setPrevTriggerSeq(selectionTriggerSeq);
    if (selectionTriggerSeq > 0 && selectedText) {
      setScopeType("selection");
      setIsConfiguring(true);
    }
  }

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);

  // Sync cinema/expand state up to LivingReader
  useEffect(() => {
    onWhiteboardExpandChange?.(isCinema || !isConfiguring);
  }, [isCinema, isConfiguring, onWhiteboardExpandChange]);

  // Cleanup active generation on unmount
  useEffect(() => {
    return () => {
      generationAbortRef.current?.abort();
      previewAudioRef.current?.pause();
    };
  }, []);

  const activeTopic = useMemo(() => {
    if (selectedTopicId) {
      const found = blueprintTopics.find((t) => t.id === selectedTopicId);
      if (found) return found;
    }
    if (matchedTopic) return matchedTopic;
    const firstLine = (activePageLiveText || "")
      .split("\n")[0]
      ?.replace(/^#+\s*/, "")
      .trim();
    const cleanBookTopic =
      book.topic && book.topic.trim().toLowerCase() !== "general" ? book.topic : "";
    return {
      id: `page-topic-${currentPageNumber}`,
      title:
        firstLine && firstLine.length > 4 && firstLine.length < 72
          ? firstLine
          : cleanBookTopic || book.title || `Page ${currentPageNumber}`,
      startPage: currentPageNumber,
      endPage: Math.min(totalBookPages, currentPageNumber + 2),
      summary: `Covers Pages ${currentPageNumber}–${Math.min(
        totalBookPages,
        currentPageNumber + 2
      )}.`,
    };
  }, [
    selectedTopicId,
    blueprintTopics,
    matchedTopic,
    activePageLiveText,
    currentPageNumber,
    totalBookPages,
    book.topic,
    book.title,
  ]);

  const effectiveScope = useMemo(() => {
    if (scopeType === "selection" && selectedText) {
      return {
        type: "selection" as const,
        startPage: currentPageNumber,
        endPage: currentPageNumber,
        topicTitle: `Selection: ${selectedText.slice(0, 40)}…`,
        selectedText,
      };
    }
    if (scopeType === "topic") {
      return {
        type: "topic" as const,
        startPage: activeTopic.startPage,
        endPage: activeTopic.endPage,
        topicTitle: activeTopic.title,
        topicId: activeTopic.id,
      };
    }
    if (scopeType === "range") {
      const s = Math.max(1, Math.min(rangeStart, totalBookPages));
      const e = Math.max(s, Math.min(rangeEnd, totalBookPages));
      return {
        type: "range" as const,
        startPage: s,
        endPage: e,
        topicTitle: `Pages ${s}–${e}`,
      };
    }
    return {
      type: "page" as const,
      startPage: currentPageNumber,
      endPage: currentPageNumber,
      topicTitle: `Page ${currentPageNumber}`,
    };
  }, [
    scopeType,
    selectedText,
    currentPageNumber,
    activeTopic,
    rangeStart,
    rangeEnd,
    totalBookPages,
  ]);

  const dynamicEstimateText = useMemo(() => {
    const words =
      scopeType === "selection" && selectedText
        ? selectedText.split(/\s+/).filter(Boolean).length
        : Math.max(
            150,
            (activePageLiveText || "").split(/\s+/).filter(Boolean).length
          ) * Math.max(1, effectiveScope.endPage - effectiveScope.startPage + 1);
    const span = effectiveScope.endPage - effectiveScope.startPage + 1;
    return estimateDurationPreview(scopeType, words, span, pacing);
  }, [scopeType, selectedText, activePageLiveText, effectiveScope, pacing]);

  const handlePreviewVoice = useCallback(
    async (voiceId: string) => {
      setPreviewingVoiceId(voiceId);
      try {
        previewAudioRef.current?.pause();
        const res = await fetch("/api/whiteboard/voices/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceId, language: studyLanguage }),
        });
        const data = await res.json();
        if (!res.ok || !data.audioUrl) {
          throw new Error(data.error || "Voice preview unavailable");
        }
        const audio = new Audio(data.audioUrl);
        previewAudioRef.current = audio;
        audio.onended = () => setPreviewingVoiceId(null);
        await audio.play();
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Failed to play voice preview"
        );
        setPreviewingVoiceId(null);
      }
    },
    [studyLanguage]
  );

  // =========================================================================
  // LESSON BOARD V2 PIPELINE (sections + deterministic route + pinned TTS)
  // =========================================================================
  const synthesizeLessonSection = useCallback(
    async (
      lessonId: string,
      sectionIndex: number,
      voiceId: string,
      signal: AbortSignal,
      forceAudio = false
    ) => {
      const res = await fetch(
        `/api/whiteboard/lessons/${lessonId}/sections/${sectionIndex}/audio`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({ voiceId, forceAudio }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.lesson) {
        throw new Error(
          data.error || `Failed recording section ${sectionIndex + 1}`
        );
      }
      const nextLesson = data.lesson as LessonBoardData;
      setLesson(nextLesson);
      return {
        lesson: nextLesson,
        rePinned: Boolean(data.rePinned),
      };
    },
    []
  );

  const runLessonAudioQueue = useCallback(
    async (
      initialLesson: LessonBoardData,
      voiceId: string,
      signal: AbortSignal
    ) => {
      let currentLesson = initialLesson;
      const getPending = (l: LessonBoardData) => {
        const track = l.voiceTracks?.[voiceId];
        return l.sections
          .map((_, i) => i)
          .filter(
            (i) =>
              track?.sections?.[i]?.status !== "ready" ||
              !track?.sections?.[i]?.audioUrl
          );
      };

      let pending = getPending(currentLesson);
      if (pending.length === 0) {
        setIsConfiguring(false);
        setIsGeneratingMore(false);
        return;
      }

      setIsGeneratingMore(true);

      // Section 0 runs first to lock the single pinned TTS model for the whole lesson
      if (pending.includes(0)) {
        const res0 = await synthesizeLessonSection(
          currentLesson.id,
          0,
          voiceId,
          signal
        );
        currentLesson = res0.lesson;
      }

      // Open the board immediately once Section 0 is ready
      setIsConfiguring(false);

      // Process remaining sections sequentially/bounded and handle model re-pinning cleanly
      let guard = 0;
      while (!signal.aborted && guard < 3) {
        guard++;
        pending = getPending(currentLesson);
        if (pending.length === 0) break;

        let sawRepin = false;
        for (const idx of pending) {
          if (signal.aborted) break;
          try {
            const res = await synthesizeLessonSection(
              currentLesson.id,
              idx,
              voiceId,
              signal
            );
            currentLesson = res.lesson;
            if (res.rePinned) {
              sawRepin = true;
              break;
            }
          } catch (err) {
            if (!signal.aborted) {
              console.warn(
                `[LessonBoard] Section ${idx} audio error:`,
                err
              );
            }
          }
        }

        if (!sawRepin) break;
      }

      if (!signal.aborted) {
        setIsGeneratingMore(false);
      }
    },
    [synthesizeLessonSection]
  );

  const startLessonGeneration = useCallback(
    async (forceRefresh = false) => {
      generationAbortRef.current?.abort();
      const controller = new AbortController();
      generationAbortRef.current = controller;

      setErrorMsg(null);
      setIsPlanning(true);
      try {
        localStorage.setItem(VOICE_PREF_KEY, selectedVoice);
      } catch {}

      if (effectiveScope.type !== "selection") {
        onStudyScopeChange({
          type: effectiveScope.type,
          startPage: effectiveScope.startPage,
          endPage: effectiveScope.endPage,
          topicTitle: effectiveScope.topicTitle,
          topicId:
            "topicId" in effectiveScope ? effectiveScope.topicId : undefined,
        });
      }

      try {
        const res = await fetch("/api/whiteboard/lessons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            bookId: String(book._id || book.slug || "default-book"),
            bookTitle: book.title,
            language: studyLanguage,
            pacing,
            voiceId: selectedVoice,
            forceRefresh,
            fallbackPageText: activePageLiveText,
            scope: effectiveScope,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.lesson) {
          throw new Error(data.error || "Failed to plan whiteboard lesson");
        }

        const plannedLesson = data.lesson as LessonBoardData;
        setLesson(plannedLesson);
        setIsPlanning(false);

        await runLessonAudioQueue(
          plannedLesson,
          selectedVoice,
          controller.signal
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        setIsPlanning(false);
        setIsGeneratingMore(false);
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Could not generate whiteboard lesson."
        );
      }
    },
    [
      selectedVoice,
      effectiveScope,
      onStudyScopeChange,
      book._id,
      book.slug,
      book.title,
      studyLanguage,
      pacing,
      activePageLiveText,
      runLessonAudioQueue,
    ]
  );

  const handleRetryLessonSection = useCallback(
    async (sectionIndex: number) => {
      if (!lesson) return;
      const controller = new AbortController();
      try {
        await synthesizeLessonSection(
          lesson.id,
          sectionIndex,
          lesson.activeVoiceId,
          controller.signal,
          true
        );
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Failed to retry section audio"
        );
      }
    },
    [lesson, synthesizeLessonSection]
  );

  const handleSwitchLessonVoice = useCallback(
    async (nextVoiceId: string) => {
      if (!lesson || nextVoiceId === lesson.activeVoiceId) return;
      setSelectedVoice(nextVoiceId);
      try {
        localStorage.setItem(VOICE_PREF_KEY, nextVoiceId);
      } catch {}

      generationAbortRef.current?.abort();
      const controller = new AbortController();
      generationAbortRef.current = controller;

      setIsSwitchingVoice(true);
      try {
        const res = await fetch(`/api/whiteboard/lessons/${lesson.id}/voice`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ voiceId: nextVoiceId }),
        });
        const data = await res.json();
        if (!res.ok || !data.lesson) {
          throw new Error(data.error || "Failed to switch voice");
        }
        const switched = data.lesson as LessonBoardData;
        setLesson(switched);
        await runLessonAudioQueue(switched, nextVoiceId, controller.signal);
      } catch (err) {
        if (!controller.signal.aborted) {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : "Failed to switch narrator voice"
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSwitchingVoice(false);
        }
      }
    },
    [lesson, runLessonAudioQueue]
  );

  // =========================================================================
  // LEGACY V1 BEAT PLAYER PIPELINE (retained behind NEXT_PUBLIC_WHITEBOARD_V2=false)
  // =========================================================================
  const renderBeat = useCallback(
    async (
      videoId: string,
      beatIndex: number,
      voiceId: string,
      signal: AbortSignal,
      options?: { forceVector?: boolean; forceAudio?: boolean }
    ) => {
      const res = await fetch(
        `/api/whiteboard/videos/${videoId}/beats/${beatIndex}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            voiceId,
            forceVector: Boolean(options?.forceVector),
            forceAudio: Boolean(options?.forceAudio),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.video) {
        throw new Error(
          data.error || `Failed generating scene ${beatIndex + 1}`
        );
      }
      setVideo(data.video as WhiteboardVideoData);
      return data.video as WhiteboardVideoData;
    },
    []
  );

  const runBeatQueue = useCallback(
    async (
      initialVideo: WhiteboardVideoData,
      voiceId: string,
      signal: AbortSignal
    ) => {
      const track = initialVideo.voiceTracks?.[voiceId];
      const pendingIndices = initialVideo.beats
        .map((b, i) => ({
          i,
          needsVector: b.vectorStatus !== "ready" || !b.vectorData,
          needsAudio:
            track?.beats?.[i]?.status !== "ready" ||
            !track?.beats?.[i]?.audioUrl,
        }))
        .filter((x) => x.needsVector || x.needsAudio)
        .map((x) => x.i);

      if (pendingIndices.length === 0) {
        setIsConfiguring(false);
        setIsGeneratingMore(false);
        return;
      }

      setIsGeneratingMore(true);

      if (pendingIndices.includes(0)) {
        await renderBeat(initialVideo.id, 0, voiceId, signal);
        setIsConfiguring(false);
      } else {
        setIsConfiguring(false);
      }

      const remaining = pendingIndices.filter((i) => i !== 0);
      let cursor = 0;
      const concurrency = 2;

      const worker = async () => {
        while (cursor < remaining.length && !signal.aborted) {
          const nextIdx = remaining[cursor++];
          try {
            await renderBeat(initialVideo.id, nextIdx, voiceId, signal);
          } catch (err) {
            if (!signal.aborted) {
              console.warn(
                `[WhiteboardVideoStudio] Beat ${nextIdx} error:`,
                err
              );
            }
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(concurrency, remaining.length) }, () =>
          worker()
        )
      );

      if (!signal.aborted) {
        setIsGeneratingMore(false);
      }
    },
    [renderBeat]
  );

  const startLegacyGeneration = useCallback(
    async (forceRefresh = false) => {
      generationAbortRef.current?.abort();
      const controller = new AbortController();
      generationAbortRef.current = controller;

      setErrorMsg(null);
      setIsPlanning(true);
      try {
        localStorage.setItem(VOICE_PREF_KEY, selectedVoice);
      } catch {}

      if (effectiveScope.type !== "selection") {
        onStudyScopeChange({
          type: effectiveScope.type,
          startPage: effectiveScope.startPage,
          endPage: effectiveScope.endPage,
          topicTitle: effectiveScope.topicTitle,
          topicId:
            "topicId" in effectiveScope ? effectiveScope.topicId : undefined,
        });
      }

      try {
        const res = await fetch("/api/whiteboard/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            bookId: String(book._id || book.slug || "default-book"),
            bookTitle: book.title,
            language: studyLanguage,
            pacing,
            voiceId: selectedVoice,
            forceRefresh,
            fallbackPageText: activePageLiveText,
            scope: effectiveScope,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.video) {
          throw new Error(data.error || "Failed to plan whiteboard video");
        }

        const plannedVideo = data.video as WhiteboardVideoData;
        setVideo(plannedVideo);
        setIsPlanning(false);

        await runBeatQueue(plannedVideo, selectedVoice, controller.signal);
      } catch (err) {
        if (controller.signal.aborted) return;
        setIsPlanning(false);
        setIsGeneratingMore(false);
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Could not generate whiteboard video."
        );
      }
    },
    [
      selectedVoice,
      effectiveScope,
      onStudyScopeChange,
      book._id,
      book.slug,
      book.title,
      studyLanguage,
      pacing,
      activePageLiveText,
      runBeatQueue,
    ]
  );

  const handleRetryBeat = useCallback(
    async (beatIndex: number) => {
      if (!video) return;
      const controller = new AbortController();
      try {
        const targetBeat = video.beats[beatIndex];
        const targetAudio =
          video.voiceTracks?.[video.activeVoiceId]?.beats?.[beatIndex];
        await renderBeat(
          video.id,
          beatIndex,
          video.activeVoiceId,
          controller.signal,
          {
            forceVector: targetBeat?.vectorStatus === "failed",
            forceAudio: targetAudio?.status === "failed",
          }
        );
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Failed to retry scene"
        );
      }
    },
    [video, renderBeat]
  );

  const handleSwitchVoiceOnPlayer = useCallback(
    async (nextVoiceId: string) => {
      if (!video || nextVoiceId === video.activeVoiceId) return;
      setSelectedVoice(nextVoiceId);
      try {
        localStorage.setItem(VOICE_PREF_KEY, nextVoiceId);
      } catch {}

      generationAbortRef.current?.abort();
      const controller = new AbortController();
      generationAbortRef.current = controller;

      setIsSwitchingVoice(true);
      try {
        const res = await fetch(`/api/whiteboard/videos/${video.id}/voice`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ voiceId: nextVoiceId }),
        });
        const data = await res.json();
        if (!res.ok || !data.video) {
          throw new Error(data.error || "Failed to switch voice");
        }
        const switchedVideo = data.video as WhiteboardVideoData;
        setVideo(switchedVideo);
        await runBeatQueue(switchedVideo, nextVoiceId, controller.signal);
      } catch (err) {
        if (!controller.signal.aborted) {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : "Failed to switch narrator voice"
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSwitchingVoice(false);
        }
      }
    },
    [video, runBeatQueue]
  );

  const startGeneration = USE_LESSON_BOARD_V2
    ? startLessonGeneration
    : startLegacyGeneration;

  if (!isConfiguring && USE_LESSON_BOARD_V2 && lesson) {
    return (
      <LessonBoardPlayer
        key={lesson.id}
        lesson={lesson}
        isCinema={isCinema}
        isSwitchingVoice={isSwitchingVoice}
        isGeneratingAudio={isGeneratingMore}
        onToggleCinema={() => setIsCinema((prev) => !prev)}
        onRetrySectionAudio={handleRetryLessonSection}
        onChangeVoice={handleSwitchLessonVoice}
        onChangeScope={() => setIsConfiguring(true)}
        onRegenerateLesson={() => startLessonGeneration(true)}
        onNavigateToPage={onNavigateToPage}
        className={cn("h-full rounded-[18px]", className)}
      />
    );
  }

  if (!isConfiguring && !USE_LESSON_BOARD_V2 && video) {
    return (
      <WhiteboardPlayer
        key={video.id}
        video={video}
        isCinema={isCinema}
        isSwitchingVoice={isSwitchingVoice}
        isGeneratingMore={isGeneratingMore}
        onToggleCinema={() => setIsCinema((prev) => !prev)}
        onRetryBeat={handleRetryBeat}
        onChangeVoice={handleSwitchVoiceOnPlayer}
        onChangeScope={() => setIsConfiguring(true)}
        onRegenerateVideo={() => startLegacyGeneration(true)}
        className={cn("h-full rounded-[18px]", className)}
      />
    );
  }

  const canResumeLesson =
    USE_LESSON_BOARD_V2 &&
    lesson &&
    lesson.voiceTracks?.[lesson.activeVoiceId]?.sections?.[0]?.status ===
      "ready";
  const canResumeLegacy =
    !USE_LESSON_BOARD_V2 &&
    video &&
    video.beats?.[0]?.vectorStatus === "ready";

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-[color:var(--ink-soft)] text-[color:var(--ink)] overflow-y-auto overflow-x-hidden p-3 sm:p-5",
        className
      )}
    >
      <div className="mx-auto w-full min-w-0 max-w-xl my-auto rounded-[22px] border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-4 sm:p-6 shadow-[4px_4px_0px_#0f0e10] flex flex-col gap-4 overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-[color:var(--ink)]/15">
          <div>
            <div className="font-mono text-[9.5px] font-black uppercase tracking-wider text-[color:var(--ink)]/70">
              ASCLEON WHITEBOARD LESSON
            </div>
            <h2 className="font-sans text-sm sm:text-base font-black text-[color:var(--ink)]">
              Build Connected Whiteboard Lesson
            </h2>
          </div>

          <div className="flex items-center gap-1 rounded-full border border-[color:var(--ink)] bg-[color:var(--panel)] p-0.5">
            {(["en", "ar", "mixed"] as StudyLanguage[]).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => onStudyLanguageChange(lang)}
                className={cn(
                  "cursor-pointer px-2.5 py-0.5 rounded-full font-mono text-[9.5px] font-black uppercase transition-all",
                  studyLanguage === lang
                    ? "bg-[color:var(--orange)] text-[color:var(--ink)]"
                    : "text-[color:var(--ink)]/60 hover:text-[color:var(--ink)]"
                )}
              >
                {lang === "en" ? "EN" : lang === "ar" ? "عربي" : "MIX"}
              </button>
            ))}
          </div>
        </div>

        {/* 1. Source Scope */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-black uppercase tracking-wider text-[color:var(--ink)]/80">
              1. Source Scope
            </span>
            <span className="rounded-full border border-[color:var(--ink)]/30 bg-[color:var(--panel)] px-2 py-0.5 font-mono text-[9.5px] font-bold text-[color:var(--ink)]">
              {dynamicEstimateText}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {selectedText && (
              <button
                type="button"
                onClick={() => setScopeType("selection")}
                className={cn(
                  "cursor-pointer text-left rounded-[14px] border-2 p-2.5 transition-all",
                  scopeType === "selection"
                    ? "border-[color:var(--ink)] bg-[color:var(--orange)]/20 shadow-chip"
                    : "border-[color:var(--ink)]/25 bg-[color:var(--panel)] hover:border-[color:var(--ink)]"
                )}
              >
                <div className="flex items-center gap-1.5 font-sans text-xs font-black">
                  <Highlighter className="size-3.5 text-[color:var(--orange)]" />
                  <span>Highlighted Passage</span>
                </div>
                <p className="mt-1 text-[11px] text-[color:var(--ink)]/75 line-clamp-1 italic">
                  &ldquo;{selectedText}&rdquo;
                </p>
              </button>
            )}

            <button
              type="button"
              onClick={() => setScopeType("topic")}
              className={cn(
                "cursor-pointer text-left rounded-[14px] border-2 p-2.5 transition-all",
                scopeType === "topic"
                  ? "border-[color:var(--ink)] bg-[color:var(--orange)]/20 shadow-chip"
                  : "border-[color:var(--ink)]/25 bg-[color:var(--panel)] hover:border-[color:var(--ink)]"
              )}
            >
              <div className="flex items-center justify-between gap-1 font-sans text-xs font-black">
                <span className="flex items-center gap-1.5 truncate">
                  <Layers className="size-3.5 text-[color:var(--orange)] shrink-0" />
                  <span className="truncate">Topic: {activeTopic.title}</span>
                </span>
                <span className="font-mono text-[9px] shrink-0">
                  p.{activeTopic.startPage}–{activeTopic.endPage}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[color:var(--ink)]/75 line-clamp-1">
                Pages {activeTopic.startPage}–{activeTopic.endPage}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setScopeType("page")}
              className={cn(
                "cursor-pointer text-left rounded-[14px] border-2 p-2.5 transition-all",
                scopeType === "page"
                  ? "border-[color:var(--ink)] bg-[color:var(--orange)]/20 shadow-chip"
                  : "border-[color:var(--ink)]/25 bg-[color:var(--panel)] hover:border-[color:var(--ink)]"
              )}
            >
              <div className="flex items-center gap-1.5 font-sans text-xs font-black">
                <BookOpen className="size-3.5 text-[color:var(--orange)]" />
                <span>Active Page (p.{currentPageNumber})</span>
              </div>
              <p className="mt-1 text-[11px] text-[color:var(--ink)]/75">
                Focus strictly on Page {currentPageNumber}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setScopeType("range")}
              className={cn(
                "cursor-pointer text-left rounded-[14px] border-2 p-2.5 transition-all",
                scopeType === "range"
                  ? "border-[color:var(--ink)] bg-[color:var(--orange)]/20 shadow-chip"
                  : "border-[color:var(--ink)]/25 bg-[color:var(--panel)] hover:border-[color:var(--ink)]"
              )}
            >
              <div className="flex items-center gap-1.5 font-sans text-xs font-black">
                <Hash className="size-3.5 text-[color:var(--orange)]" />
                <span>Custom Page Range</span>
              </div>
              <p className="mt-1 text-[11px] text-[color:var(--ink)]/75">
                Pages {rangeStart} to {rangeEnd}
              </p>
            </button>
          </div>

          {scopeType === "range" && (
            <div className="flex items-center gap-2 rounded-[12px] border border-[color:var(--ink)]/30 bg-[color:var(--panel)] px-3 py-2 text-xs">
              <span className="font-mono text-[10px] font-bold">From Page</span>
              <input
                type="number"
                min={1}
                max={totalBookPages}
                value={rangeStart}
                onChange={(e) =>
                  setRangeStart(Math.max(1, Number(e.target.value) || 1))
                }
                className="w-16 rounded border border-[color:var(--ink)]/40 bg-white px-2 py-0.5 font-mono text-xs font-bold"
              />
              <span className="font-mono text-[10px] font-bold">to</span>
              <input
                type="number"
                min={rangeStart}
                max={totalBookPages}
                value={rangeEnd}
                onChange={(e) =>
                  setRangeEnd(
                    Math.max(
                      rangeStart,
                      Math.min(
                        totalBookPages,
                        Number(e.target.value) || rangeStart
                      )
                    )
                  )
                }
                className="w-16 rounded border border-[color:var(--ink)]/40 bg-white px-2 py-0.5 font-mono text-xs font-bold"
              />
            </div>
          )}

          {scopeType === "topic" && blueprintTopics.length > 1 && (
            <select
              value={activeTopic.id}
              onChange={(e) => {
                const chosen = blueprintTopics.find(
                  (t) => t.id === e.target.value
                );
                if (chosen) {
                  setSelectedTopicId(chosen.id);
                  onNavigateToPage?.(chosen.startPage);
                }
              }}
              className="w-full cursor-pointer rounded-[12px] border border-[color:var(--ink)]/30 bg-[color:var(--panel)] px-3 py-1.5 font-sans text-xs font-bold"
            >
              {blueprintTopics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} (pp. {t.startPage}–{t.endPage})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 2. Voice & Depth */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
          <div className="space-y-1.5 min-w-0">
            <span className="block font-mono text-[10px] font-black uppercase tracking-wider text-[color:var(--ink)]/80">
              2. Lesson Depth
            </span>
            <div className="grid grid-cols-3 gap-1 rounded-[12px] border border-[color:var(--ink)]/30 bg-[color:var(--panel)] p-1">
              {(
                [
                  { id: "auto", label: "Auto" },
                  { id: "concise", label: "Concise" },
                  { id: "deep", label: "Deep" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPacing(opt.id)}
                  className={cn(
                    "cursor-pointer rounded-lg py-1 font-mono text-[10px] font-black uppercase transition-colors",
                    pacing === opt.id
                      ? "bg-[color:var(--orange)] text-[color:var(--ink)]"
                      : "text-[color:var(--ink)]/65 hover:text-[color:var(--ink)]"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 min-w-0">
            <span className="block font-mono text-[10px] font-black uppercase tracking-wider text-[color:var(--ink)]/80">
              3. Tutor Voice
            </span>
            <div className="flex min-w-0 items-center gap-1.5">
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="min-w-0 w-full flex-1 truncate cursor-pointer rounded-[12px] border border-[color:var(--ink)]/40 bg-[color:var(--panel)] px-2.5 py-1.5 font-sans text-xs font-bold"
              >
                {WHITEBOARD_NARRATOR_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.tone}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handlePreviewVoice(selectedVoice)}
                disabled={previewingVoiceId === selectedVoice}
                title="Listen to tutor voice sample"
                className="shrink-0 cursor-pointer flex items-center justify-center rounded-[12px] border border-[color:var(--ink)] bg-[color:var(--panel)] px-2.5 py-1.5 hover:bg-[color:var(--orange)] disabled:opacity-50"
              >
                {previewingVoiceId === selectedVoice ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Volume2 className="size-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Status / Error Banner */}
        {errorMsg && (
          <div className="flex items-center gap-2 rounded-[14px] border-2 border-red-600 bg-red-50 px-3 py-2 text-xs font-bold text-red-900">
            <AlertCircle className="size-4 shrink-0 text-red-600" />
            <span className="flex-1">{errorMsg}</span>
            <button
              type="button"
              onClick={() => startGeneration(false)}
              className="cursor-pointer rounded-full border border-red-700 bg-white px-2.5 py-0.5 font-mono text-[10px] font-black uppercase"
            >
              Retry
            </button>
          </div>
        )}

        {/* Planning / Recording Progress */}
        {(isPlanning || isGeneratingMore) && (
          <div className="flex items-center gap-2.5 rounded-[14px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] px-3 py-2.5 text-xs font-bold">
            <Loader2 className="size-4 animate-spin text-[color:var(--orange)] shrink-0" />
            <span>
              {isPlanning
                ? "Writing grounded lesson outline & connecting clinical pathway…"
                : USE_LESSON_BOARD_V2
                ? `Recording section 1 of ${lesson?.sections.length || "…"} (playback starts as soon as Section 1 is ready)…`
                : `Drawing & narrating Scene 1 of ${video?.beats.length || "…"}…`}
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2 border-t-2 border-[color:var(--ink)]/15">
          {(canResumeLesson || canResumeLegacy) && (
            <button
              type="button"
              onClick={() => setIsConfiguring(false)}
              className="cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--panel)] px-3.5 py-2 font-mono text-[10px] font-black uppercase hover:bg-[color:var(--cream)]"
            >
              Resume Lesson
            </button>
          )}
          <button
            type="button"
            disabled={isPlanning || isGeneratingMore}
            onClick={() => startGeneration(false)}
            className="flex-1 cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-5 py-2.5 font-sans text-xs font-black uppercase text-[color:var(--ink)] shadow-chip hover:scale-[1.01] transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isPlanning ? (
              <>
                <Sparkles className="size-4 animate-pulse" />
                <span>Planning Lesson Map…</span>
              </>
            ) : isGeneratingMore ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Preparing Section 1…</span>
              </>
            ) : (
              <>
                <Play className="size-4 stroke-[2.5] fill-current" />
                <span>Generate Whiteboard Lesson</span>
              </>
            )}
          </button>
          {(lesson || video) && (
            <button
              type="button"
              disabled={isPlanning || isGeneratingMore}
              onClick={() => startGeneration(true)}
              title="Force regenerate fresh lesson"
              className="cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-2.5 hover:bg-[color:var(--orange)] disabled:opacity-50"
            >
              <RefreshCw className="size-4 stroke-[2.5]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
