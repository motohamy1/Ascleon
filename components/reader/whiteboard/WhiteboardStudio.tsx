"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { IBook } from "@/types";
import { StudyScope } from "../StudyScopeBar";
import { StudyLanguage } from "@/lib/language";
import { WhiteboardDeck, WhiteboardChoreographEvent } from "@/types/whiteboard";
import { compilePageToWhiteboardDeck } from "./page-sketch-compiler";
import { WhiteboardMentorStage } from "./WhiteboardMentorStage";
import { useLiveVoice } from "@/hooks/useLiveVoice";
import { ReferenceResource } from "@/types/knowledge";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Play,
  Layers,
  BookOpen,
  FileText,
  CheckCircle2,
  RefreshCw,
  Tv,
  ArrowRight,
  Bookmark,
  ChevronDown,
  Info,
  Sliders,
  Maximize2,
  RotateCcw,
} from "lucide-react";

interface WhiteboardStudioProps {
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
  authoritativeReferences?: ReferenceResource[];
  className?: string;
}

export function WhiteboardStudio({
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
  authoritativeReferences = [],
  className,
}: WhiteboardStudioProps) {
  // 1. TOPIC MAP & BLUEPRINT HEURISTIC RECOGNITION
  const allBlueprintTopics = useMemo(() => {
    return ((book.blueprint as any)?.topicMap?.topics || []) as Array<{
      id: string;
      title: string;
      startPage: number;
      endPage: number;
      summary?: string;
      keyConcepts?: string[];
    }>;
  }, [book.blueprint]);

  // Find topic from blueprint covering active page
  const recognizedTopic = useMemo(() => {
    if (allBlueprintTopics.length > 0) {
      const match = allBlueprintTopics.find(
        (t) => currentPageNumber >= t.startPage && currentPageNumber <= t.endPage
      );
      if (match) return match;
    }
    return null;
  }, [allBlueprintTopics, currentPageNumber]);

  // Fallback topic title synthesized from page content or book topic
  const fallbackTopic = useMemo(() => {
    const rawText = (activePageLiveText || "").trim();
    // Look for first title-like line or heading
    const firstLine = rawText.split("\n")[0]?.replace(/^#+\s*/, "").trim();
    const candidateTitle =
      firstLine && firstLine.length > 5 && firstLine.length < 80
        ? firstLine
        : book.topic || book.title || `Clinical Review (Page ${currentPageNumber})`;

    return {
      id: `topic-derived-${currentPageNumber}`,
      title: candidateTitle,
      startPage: Math.max(1, currentPageNumber - 1),
      endPage: Math.min((book.totalPages as number) || currentPageNumber + 3, currentPageNumber + 3),
      summary: `High-yield pathophysiological and clinical principles covering pages ${Math.max(1, currentPageNumber - 1)} to ${Math.min((book.totalPages as number) || currentPageNumber + 3, currentPageNumber + 3)}.`,
    };
  }, [activePageLiveText, book.topic, book.title, book.totalPages, currentPageNumber]);

  // Current effective topic
  const activeTopic = recognizedTopic || fallbackTopic;

  // Selected Scope Mode: "topic" is DEFAULT as requested by user!
  const [scopeMode, setScopeMode] = useState<"topic" | "page" | "selection">("topic");
  const [customTopicTitle, setCustomTopicTitle] = useState<string>(activeTopic.title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  // Keep title updated when topic changes (unless user actively customized it)
  useEffect(() => {
    if (!isEditingTitle) {
      setCustomTopicTitle(activeTopic.title);
    }
  }, [activeTopic.title, isEditingTitle]);

  // State: Whiteboard Deck & Player
  const [whiteboardDeck, setWhiteboardDeck] = useState<WhiteboardDeck | null>(null);
  const [isDeckLoading, setIsDeckLoading] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState<boolean>(true); // Show confirmation card by default until approved
  const [isCinema, setIsCinema] = useState(false);

  // Notify parent of cinema/expansion
  useEffect(() => {
    if (onWhiteboardExpandChange) {
      onWhiteboardExpandChange(isCinema);
    }
  }, [isCinema, onWhiteboardExpandChange]);

  // Calculate the effective study scope object
  const computedScope = useMemo<StudyScope>(() => {
    if (scopeMode === "topic") {
      return {
        type: "topic",
        startPage: activeTopic.startPage,
        endPage: activeTopic.endPage,
        topicTitle: customTopicTitle || activeTopic.title,
        topicId: activeTopic.id,
      };
    } else if (scopeMode === "page") {
      return {
        type: "page",
        startPage: currentPageNumber,
        endPage: currentPageNumber,
        topicTitle: `Page ${currentPageNumber}`,
      };
    } else {
      return {
        type: "page",
        startPage: currentPageNumber,
        endPage: currentPageNumber,
        topicTitle: selectedText ? `Passage: ${selectedText.slice(0, 30)}...` : `Page ${currentPageNumber}`,
      };
    }
  }, [scopeMode, activeTopic, customTopicTitle, currentPageNumber, selectedText]);

  // 2. LIVE VOICE INTEGRATION (Gemini Live)
  const {
    status: voiceStatus,
    isConnected: isVoiceConnected,
    isMuted,
    toggleMute,
    connect: connectVoice,
    disconnect: disconnectVoice,
    currentOutputTranscript,
    activeChoreography,
    activeWidgetControl,
    sendWhiteboardInteraction,
  } = useLiveVoice({
    bookTitle: book.title,
    pageNumber: currentPageNumber,
    pageText: activePageLiveText,
    selectedText: scopeMode === "selection" ? selectedText : undefined,
    authoritativeReferences,
    language: studyLanguage,
    voiceName: "Aoede",
    bargeInMode: "shield",
    mode: "whiteboard",
  });

  // 3. GENERATE WHITEBOARD DECK (Multi-Page / Whole Topic Grounding)
  const handleGenerateDeck = useCallback(
    async (forceRefresh = false) => {
      // 1. Instant Client-Side Compilation (<50ms) so canvas starts drawing immediately
      const instantDeck = compilePageToWhiteboardDeck({
        bookTitle: book.title,
        pageNumber: currentPageNumber,
        pageText: activePageLiveText,
        selectedText: scopeMode === "selection" ? selectedText : undefined,
        customFocus: customTopicTitle || activeTopic.title,
        language: studyLanguage,
      });

      // Override deck topic title and book title
      instantDeck.topicTitle = customTopicTitle || activeTopic.title;
      setWhiteboardDeck(instantDeck);
      setIsConfiguring(false);
      setIsDeckLoading(true);

      // Update parent living reader scope
      onStudyScopeChange(computedScope);

      // 2. Full Server-Side Multi-Page RAG Synthesis
      try {
        const bookId = String(book._id || "");
        const res = await fetch("/api/voice/whiteboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookId,
            bookTitle: book.title,
            pageNumber: currentPageNumber,
            pageText: activePageLiveText,
            selectedText: scopeMode === "selection" ? selectedText : undefined,
            language: studyLanguage,
            studyScope: computedScope,
            customFocus: customTopicTitle || activeTopic.title,
            forceRefresh,
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.deck && Array.isArray(data.deck.scenes) && data.deck.scenes.length > 0) {
          setWhiteboardDeck(data.deck);
        }
      } catch (err) {
        console.warn("[WhiteboardStudio] Server synthesis warning, continuing with instant compiled deck:", err);
      } finally {
        setIsDeckLoading(false);
      }
    },
    [
      book._id,
      book.title,
      currentPageNumber,
      activePageLiveText,
      scopeMode,
      selectedText,
      customTopicTitle,
      activeTopic.title,
      studyLanguage,
      computedScope,
      onStudyScopeChange,
    ]
  );

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-[color:var(--ink-soft)] text-[color:var(--ink)] overflow-hidden select-none",
        isCinema && "fixed inset-0 z-50 p-4 bg-black/95 backdrop-blur-md",
        className
      )}
    >
      {/* A. CONFIGURATION & TOPIC APPROVAL CARD */}
      {isConfiguring ? (
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 flex flex-col items-center justify-center">
          <div className="w-full max-w-xl rounded-[22px] border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-4 sm:p-6 shadow-[4px_4px_0px_#0f0e10] flex flex-col gap-4">
            {/* Header Badge */}
            <div className="flex items-center justify-between pb-3 border-b-2 border-[color:var(--ink)]/15">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] shadow-xs">
                  <Tv className="size-4 stroke-[2.5]" />
                </div>
                <div>
                  <div className="font-mono text-[9px] font-black uppercase tracking-wider text-[color:var(--ink)]/70">
                    ASCLEON WHITEBOARD STUDIO
                  </div>
                  <div className="font-sans text-sm font-black text-[color:var(--ink)]">
                    Topic Recognition & Illustration Scope
                  </div>
                </div>
              </div>

              {/* Language Switcher */}
              <div className="flex items-center gap-1 bg-[color:var(--panel)] border border-[color:var(--ink)] rounded-full p-0.5">
                {(["en", "ar", "mixed"] as StudyLanguage[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => onStudyLanguageChange(lang)}
                    className={cn(
                      "cursor-pointer px-2 py-0.5 rounded-full font-mono text-[9px] font-black uppercase transition-all",
                      studyLanguage === lang
                        ? "bg-[color:var(--orange)] text-[color:var(--ink)] shadow-xs"
                        : "text-[color:var(--ink)]/60 hover:text-[color:var(--ink)]"
                    )}
                  >
                    {lang === "en" ? "EN" : lang === "ar" ? "عربي" : "MIX"}
                  </button>
                ))}
              </div>
            </div>

            {/* AI Detected Topic Hero Card */}
            <div className="rounded-[16px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-3 sm:p-4 shadow-chip">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5 font-mono text-[9.5px] font-black uppercase tracking-wider text-[color:var(--orange)]">
                  <Sparkles className="size-3.5" />
                  <span>AI Recognized Topic for Page {currentPageNumber}</span>
                </div>
                <span className="rounded-full border border-[color:var(--ink)] bg-[color:var(--mint)] px-2 py-0.2 font-mono text-[9px] font-black uppercase text-[color:var(--ink)]">
                  Pages {activeTopic.startPage}–{activeTopic.endPage}
                </span>
              </div>

              {/* Editable Topic Title */}
              <div className="mt-1">
                <input
                  type="text"
                  value={customTopicTitle}
                  onChange={(e) => {
                    setCustomTopicTitle(e.target.value);
                    setIsEditingTitle(true);
                  }}
                  className="w-full font-sans text-base sm:text-lg font-black text-[color:var(--ink)] bg-transparent border-b border-[color:var(--ink)]/30 focus:border-[color:var(--orange)] focus:outline-none transition-all pb-1"
                  placeholder="Enter or edit topic title..."
                />
              </div>

              {activeTopic.summary && (
                <p className="mt-2 text-xs text-[color:var(--ink)]/80 leading-relaxed font-medium">
                  {activeTopic.summary}
                </p>
              )}
            </div>

            {/* Scope Selection Options (Default: Whole Topic) */}
            <div className="space-y-2">
              <label className="font-mono text-[10px] font-black uppercase tracking-wider text-[color:var(--ink)]/80">
                Choose Illustration Scope:
              </label>

              {/* Option 1: Whole Topic (RECOMMENDED & DEFAULT) */}
              <div
                onClick={() => setScopeMode("topic")}
                className={cn(
                  "cursor-pointer rounded-[14px] border-2 p-3 transition-all flex items-start gap-3",
                  scopeMode === "topic"
                    ? "border-[color:var(--ink)] bg-[color:var(--orange)]/15 shadow-chip scale-[1.01]"
                    : "border-[color:var(--ink)]/30 bg-[color:var(--panel)] hover:border-[color:var(--ink)]"
                )}
              >
                <div className="mt-0.5">
                  <input
                    type="radio"
                    name="scopeMode"
                    checked={scopeMode === "topic"}
                    onChange={() => setScopeMode("topic")}
                    className="accent-[color:var(--orange)] size-4 cursor-pointer"
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-sans text-xs font-black text-[color:var(--ink)]">
                      Whole Topic (Recommended)
                    </span>
                    <span className="rounded-full bg-[color:var(--orange)] px-2 py-0.2 font-mono text-[8px] font-black uppercase text-[color:var(--ink)] border border-[color:var(--ink)]">
                      DEFAULT · COMPLETE CHAPTER
                    </span>
                  </div>
                  <p className="mt-0.5 font-sans text-[11px] text-[color:var(--ink)]/80 leading-snug">
                    Synthesizes textbook pages {activeTopic.startPage} to {activeTopic.endPage} into a complete 3–4 scene VideoScribe whiteboard covering pathophysiology, clinical signs, and management.
                  </p>
                </div>
              </div>

              {/* Option 2: Active Page Only */}
              <div
                onClick={() => setScopeMode("page")}
                className={cn(
                  "cursor-pointer rounded-[14px] border-2 p-3 transition-all flex items-start gap-3",
                  scopeMode === "page"
                    ? "border-[color:var(--ink)] bg-[color:var(--orange)]/15 shadow-chip scale-[1.01]"
                    : "border-[color:var(--ink)]/30 bg-[color:var(--panel)] hover:border-[color:var(--ink)]"
                )}
              >
                <div className="mt-0.5">
                  <input
                    type="radio"
                    name="scopeMode"
                    checked={scopeMode === "page"}
                    onChange={() => setScopeMode("page")}
                    className="accent-[color:var(--orange)] size-4 cursor-pointer"
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-sans text-xs font-black text-[color:var(--ink)]">
                      Active Page Only (Page {currentPageNumber})
                    </span>
                  </div>
                  <p className="mt-0.5 font-sans text-[11px] text-[color:var(--ink)]/80 leading-snug">
                    Focuses illustration solely on the specific text and diagrams on Page {currentPageNumber}.
                  </p>
                </div>
              </div>

              {/* Option 3: Selected Text (if active) */}
              {selectedText && (
                <div
                  onClick={() => setScopeMode("selection")}
                  className={cn(
                    "cursor-pointer rounded-[14px] border-2 p-3 transition-all flex items-start gap-3",
                    scopeMode === "selection"
                      ? "border-[color:var(--ink)] bg-[color:var(--orange)]/15 shadow-chip scale-[1.01]"
                      : "border-[color:var(--ink)]/30 bg-[color:var(--panel)] hover:border-[color:var(--ink)]"
                  )}
                >
                  <div className="mt-0.5">
                    <input
                      type="radio"
                      name="scopeMode"
                      checked={scopeMode === "selection"}
                      onChange={() => setScopeMode("selection")}
                      className="accent-[color:var(--orange)] size-4 cursor-pointer"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-sans text-xs font-black text-[color:var(--ink)]">
                        Highlighted Text Passage
                      </span>
                      <span className="rounded-full bg-[color:var(--cream)] px-1.5 py-0.2 font-mono text-[8px] font-black uppercase text-[color:var(--ink)] border border-[color:var(--ink)]">
                        {selectedText.split(/\s+/).length} Words
                      </span>
                    </div>
                    <p className="mt-0.5 font-sans text-[11px] text-[color:var(--ink)]/80 leading-snug italic truncate max-w-sm">
                      "{selectedText.slice(0, 90)}..."
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Other Topics Picker (Accordion / Dropdown) */}
            {allBlueprintTopics.length > 1 && (
              <details className="rounded-[14px] border border-[color:var(--ink)]/30 bg-[color:var(--panel)]/50 p-2.5 text-xs">
                <summary className="font-mono text-[9.5px] font-black uppercase tracking-wider text-[color:var(--ink)]/80 cursor-pointer select-none">
                  Switch to Another Topic from Blueprint ({allBlueprintTopics.length} Topics Available)
                </summary>
                <div className="mt-2 space-y-1 max-h-36 overflow-y-auto pt-1">
                  {allBlueprintTopics.map((top) => (
                    <button
                      key={top.id}
                      type="button"
                      onClick={() => {
                        setCustomTopicTitle(top.title);
                        setScopeMode("topic");
                        if (onNavigateToPage && top.startPage !== currentPageNumber) {
                          onNavigateToPage(top.startPage);
                        }
                      }}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-between border",
                        top.id === activeTopic.id
                          ? "bg-[color:var(--orange)] text-[color:var(--ink)] border-[color:var(--ink)] font-black"
                          : "bg-transparent text-[color:var(--ink)]/80 border-transparent hover:bg-black/5"
                      )}
                    >
                      <span className="truncate max-w-[280px]">{top.title}</span>
                      <span className="font-mono text-[9px] opacity-80 shrink-0">
                        pp. {top.startPage}–{top.endPage}
                      </span>
                    </button>
                  ))}
                </div>
              </details>
            )}

            {/* Primary Action Button: Approve & Generate */}
            <div className="mt-2 pt-2 border-t-2 border-[color:var(--ink)]/15 flex items-center justify-between gap-3">
              {whiteboardDeck && (
                <button
                  type="button"
                  onClick={() => setIsConfiguring(false)}
                  className="cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--cream)] px-3 py-2 font-mono text-[10px] font-black uppercase text-[color:var(--ink)] shadow-chip hover:bg-[color:var(--orange)]"
                >
                  Cancel & Resume Video
                </button>
              )}

              <button
                type="button"
                disabled={isDeckLoading}
                onClick={() => handleGenerateDeck(true)}
                className="flex-1 cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-5 py-2.5 font-sans text-xs font-black uppercase text-[color:var(--ink)] shadow-chip hover:scale-[1.02] active:translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {isDeckLoading ? (
                  <>
                    <RefreshCw className="size-4 animate-spin stroke-[2.5]" />
                    <span>Synthesizing VideoScribe Whiteboard...</span>
                  </>
                ) : (
                  <>
                    <Play className="size-4 stroke-[2.5] fill-current" />
                    <span>Generate & Play Whiteboard Video</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* B. ACTIVE VIDEOSCRIBE WHITEBOARD PLAYER STAGE */
        whiteboardDeck && (
          <WhiteboardMentorStage
            deck={whiteboardDeck}
            activeChoreography={activeChoreography}
            activeWidgetControl={activeWidgetControl}
            currentMentorSubtitle={currentOutputTranscript}
            isVoiceConnected={isVoiceConnected}
            voiceStatus={voiceStatus}
            onConnectVoice={connectVoice}
            onDisconnectVoice={disconnectVoice}
            isMuted={isMuted}
            onToggleMute={toggleMute}
            onStudentInteraction={sendWhiteboardInteraction}
            onRefreshDeck={() => handleGenerateDeck(true)}
            isDeckLoading={isDeckLoading}
            isCinema={isCinema}
            onToggleCinema={() => setIsCinema(!isCinema)}
            onChangeScopeOrTopic={() => setIsConfiguring(true)}
            className="h-full rounded-[18px]"
          />
        )
      )}
    </div>
  );
}
export default WhiteboardStudio;
