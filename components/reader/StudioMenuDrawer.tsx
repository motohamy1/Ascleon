"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Menu,
  X,
  MessageSquare,
  Sparkles,
  Tv,
  Mic,
  HelpCircle,
  FileText,
  BookOpen,
  Hash,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RefreshCw,
  Globe,
  BookmarkPlus,
  Crop,
  Maximize2,
  Minimize2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StudyLanguage, STUDY_LANGUAGES } from "@/lib/language";
import { StudyScope } from "@/components/reader/StudyScopeBar";
import { RagDigestionBadge } from "@/components/reader/RagDigestionBadge";
import { TopicRange } from "@/lib/ai/schemas/decision-models";

export type StudioIntent = "morph" | "chat" | "whiteboard" | "voice" | "summary" | "quiz";

interface StudioMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  toggleButtonRef?: React.RefObject<HTMLButtonElement | null>;
  activeIntent: StudioIntent;
  onSelectIntent: (intent: StudioIntent) => void;
  // Selection & diagram context
  selectedText: string;
  snippedDiagram: { url: string; pageNumber: number } | null;
  onMorphSelection: () => void;
  onWhiteboardSelection: () => void;
  onAskAISelection: () => void;
  onPinSelection: () => void;
  onClearSelection: () => void;
  onClearDiagram: () => void;
  // Dynamic mode-specific state & actions
  isAiLoading: boolean;
  showDeepReferences: boolean;
  referencesCount: number;
  onToggleDeepReferences: () => void;
  onRunExecutiveSummary: () => void;
  isMorphLoading: boolean;
  morphActiveTopic: string | null;
  hasMorphArtifact: boolean;
  onReMorph: () => void;
  onResetMorph: () => void;
  isWhiteboardExpanded: boolean;
  onToggleWhiteboardExpand: () => void;
  isQBankLoading: boolean;
  qbankCurrentIndex: number;
  qbankTotalCount: number;
  onGenerateNewQBank: () => void;
  isSummaryLoading: boolean;
  onRefreshSummary: () => void;
  // Scope & language
  currentPage: number;
  totalPages: number;
  topics?: TopicRange[];
  studyScope: StudyScope;
  onScopeChange: (scope: StudyScope) => void;
  onNavigateToPage: (page: number) => void;
  studyLanguage: StudyLanguage;
  onLanguageChange: (lang: StudyLanguage) => void;
  // Reader view & session
  zoomLevel: number;
  fitMode: "normal" | "fit-width" | "fit-page";
  theme: "paper" | "ink";
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  onThemeChange: (theme: "paper" | "ink") => void;
  bookId?: string;
  ingestionStatus?: string;
  ingestionProgress?: number;
  onOpenStartNew: () => void;
}

const STUDIO_MODES: Array<{
  id: StudioIntent;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  soon?: boolean;
}> = [
  { id: "voice", label: "Ascleon Voice", subtitle: "Live oral mentor", icon: Mic },
  { id: "chat", label: "AI Chat", subtitle: "Grounded Q&A", icon: MessageSquare },
  { id: "morph", label: "Morph", subtitle: "Interactive map", icon: Sparkles },
  { id: "whiteboard", label: "Whiteboard", subtitle: "Visual lesson", icon: Tv, soon: true },
  { id: "quiz", label: "Qbanks", subtitle: "Board practice", icon: HelpCircle },
  { id: "summary", label: "Summary", subtitle: "Pearls & mnemonics", icon: FileText },
];

export const GLASS_BUTTON_BASE =
  "backdrop-blur-md bg-white/[0.06] border border-white/15 text-[color:var(--cream)]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_6px_18px_rgba(0,0,0,0.28)] transition-all duration-150 hover:bg-white/[0.13] hover:border-white/30 hover:text-white active:scale-[0.98] cursor-pointer";

export const GLASS_BUTTON_ACTIVE =
  "backdrop-blur-md bg-[color:var(--orange)]/25 border border-[color:var(--orange)]/80 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_0_20px_rgba(255,76,0,0.28)] hover:bg-[color:var(--orange)]/35 cursor-pointer";

export const GLASS_BUTTON_VOICE_ACTIVE =
  "backdrop-blur-md bg-[#43a08f]/30 border border-[#7fd8c9]/80 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_0_20px_rgba(67,160,143,0.3)] hover:bg-[#43a08f]/40 cursor-pointer";

export function StudioMenuDrawer({
  isOpen,
  onClose,
  toggleButtonRef,
  activeIntent,
  onSelectIntent,
  selectedText,
  snippedDiagram,
  onMorphSelection,
  onWhiteboardSelection,
  onAskAISelection,
  onPinSelection,
  onClearSelection,
  onClearDiagram,
  isAiLoading,
  showDeepReferences,
  referencesCount,
  onToggleDeepReferences,
  onRunExecutiveSummary,
  isMorphLoading,
  morphActiveTopic,
  hasMorphArtifact,
  onReMorph,
  onResetMorph,
  isWhiteboardExpanded,
  onToggleWhiteboardExpand,
  isQBankLoading,
  qbankCurrentIndex,
  qbankTotalCount,
  onGenerateNewQBank,
  isSummaryLoading,
  onRefreshSummary,
  currentPage,
  totalPages,
  topics = [],
  studyScope,
  onScopeChange,
  onNavigateToPage,
  studyLanguage,
  onLanguageChange,
  zoomLevel,
  fitMode,
  theme,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onFitPage,
  onThemeChange,
  bookId,
  ingestionStatus,
  ingestionProgress,
  onOpenStartNew,
}: StudioMenuDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [isEditingRange, setIsEditingRange] = useState(false);
  const [rangeStart, setRangeStart] = useState<number>(studyScope.startPage || currentPage);
  const [rangeEnd, setRangeEnd] = useState<number>(
    studyScope.endPage || Math.min(currentPage + 4, totalPages || 10)
  );

  // Close when clicking/tapping anywhere outside the drawer (including the left PDF pane) or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (drawerRef.current?.contains(target)) return;
      if (toggleButtonRef?.current?.contains(target)) return;
      onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, toggleButtonRef]);

  const handleApplyRange = () => {
    const validStart = Math.max(1, Math.min(rangeStart || 1, totalPages || 999));
    const validEnd = Math.max(validStart, Math.min(rangeEnd || validStart, totalPages || 999));
    setIsEditingRange(false);
    onScopeChange({
      type: "range",
      startPage: validStart,
      endPage: validEnd,
      topicTitle: `Pages ${validStart}–${validEnd}`,
    });
  };

  const hasSelectionContext = Boolean(selectedText || snippedDiagram);

  return (
    <>
      {/* Subtle frosted backdrop inside the right studio panel */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "absolute inset-0 z-30 bg-black/45 backdrop-blur-[2px] transition-opacity duration-200",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      />

      {/* Horizontal Slide-Over Drawer (Right Edge -> Slides Left) */}
      <aside
        ref={drawerRef}
        aria-label="Studio tools and settings menu"
        aria-hidden={!isOpen}
        className={cn(
          "absolute inset-y-0 right-0 z-40 flex w-[300px] sm:w-[332px] max-w-[90%] flex-col border-l border-white/15 bg-[#121116]/88 backdrop-blur-xl shadow-[-16px_0_48px_rgba(0,0,0,0.65)] transition-transform duration-200 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        )}
      >
        {/* Drawer Header */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 px-3.5">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-lg bg-[color:var(--orange)]/20 border border-[color:var(--orange)]/50 text-[color:var(--orange)]">
              <Menu className="size-3.5" />
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-black tracking-wide text-[color:var(--cream)]">
                Study Controls
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(GLASS_BUTTON_BASE, "flex size-7 items-center justify-center rounded-full")}
            title="Minimize menu (Esc)"
            aria-label="Close studio menu"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="custom-scrollbar-dark flex-1 overflow-y-auto overscroll-y-contain p-3.5 flex flex-col gap-4">
          {/* 1. DYNAMIC CONTEXT SECTION: Adapts to Selection & Current Feature */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-[color:var(--cream)]/55">
                {hasSelectionContext ? "Active Selection" : "Context Actions"}
              </span>
              <span className="rounded-full bg-white/[0.06] border border-white/10 px-2 py-0.5 text-[9.5px] font-bold text-[color:var(--orange)]">
                {STUDIO_MODES.find((m) => m.id === activeIntent)?.label || "Studio"}
              </span>
            </div>

            {hasSelectionContext && (
              <div className="rounded-2xl border border-[color:var(--orange)]/40 bg-[color:var(--orange)]/[0.09] backdrop-blur-md p-2.5 flex flex-col gap-2">
                {selectedText && (
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] text-[color:var(--cream)]/90 line-clamp-2 leading-snug">
                      <span className="font-bold text-[color:var(--orange)]">Text: </span>
                      &ldquo;{selectedText}&rdquo;
                    </p>
                    <button
                      type="button"
                      onClick={onClearSelection}
                      className="shrink-0 rounded-full p-1 text-[color:var(--cream)]/60 hover:bg-white/10 hover:text-white cursor-pointer"
                      title="Clear text selection"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                )}

                {snippedDiagram && (
                  <div className="flex items-center justify-between gap-2 text-[11px] text-amber-200">
                    <span className="flex items-center gap-1 font-bold">
                      <Crop className="size-3 text-amber-400" />
                      Diagram locked (Page {snippedDiagram.pageNumber})
                    </span>
                    <button
                      type="button"
                      onClick={onClearDiagram}
                      className="shrink-0 rounded-full p-1 text-amber-200/70 hover:bg-white/10 hover:text-white cursor-pointer"
                      title="Clear diagram"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                )}

                {selectedText && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onMorphSelection();
                        onClose();
                      }}
                      className={cn(
                        GLASS_BUTTON_ACTIVE,
                        "flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-bold"
                      )}
                    >
                      <Sparkles className="size-3" />
                      <span>Morph Now</span>
                    </button>
                    <button
                      type="button"
                      disabled
                      title="Whiteboard — Coming Soon"
                      className={cn(
                        GLASS_BUTTON_BASE,
                        "flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-bold opacity-55 cursor-not-allowed hover:bg-white/[0.06] hover:border-white/15 hover:text-[color:var(--cream)]/90 active:scale-100"
                      )}
                    >
                      <Tv className="size-3 text-[color:var(--orange)]" />
                      <span>Whiteboard</span>
                      <span className="rounded-full border border-white/20 bg-white/10 px-1.5 py-0.2 text-[8.5px] font-black uppercase tracking-wider text-[color:var(--cream)]/85">
                        Soon
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onAskAISelection();
                        onClose();
                      }}
                      className={cn(
                        GLASS_BUTTON_BASE,
                        "flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-bold"
                      )}
                    >
                      <MessageSquare className="size-3 text-[#7fd8c9]" />
                      <span>Ask AI</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onPinSelection();
                        onClose();
                      }}
                      className={cn(
                        GLASS_BUTTON_BASE,
                        "flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-bold"
                      )}
                    >
                      <BookmarkPlus className="size-3 text-amber-300" />
                      <span>Pin Note</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Dynamic tools tailored to where the user currently is */}
            <div className="grid grid-cols-2 gap-1.5">
              {activeIntent === "chat" && (
                <>
                  <button
                    type="button"
                    disabled={isAiLoading}
                    onClick={() => {
                      onRunExecutiveSummary();
                      onClose();
                    }}
                    className={cn(
                      GLASS_BUTTON_BASE,
                      "flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-bold disabled:opacity-40"
                    )}
                  >
                    <FileText className="size-3.5 shrink-0 text-[color:var(--orange)]" />
                    <span className="truncate">Exec Summary</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleDeepReferences();
                      onClose();
                    }}
                    className={cn(
                      showDeepReferences ? GLASS_BUTTON_ACTIVE : GLASS_BUTTON_BASE,
                      "flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-bold"
                    )}
                  >
                    <BookOpen className="size-3.5 shrink-0 text-[#7fd8c9]" />
                    <span className="truncate">Refs ({referencesCount})</span>
                  </button>
                </>
              )}

              {activeIntent === "morph" && (
                <>
                  <button
                    type="button"
                    disabled={isMorphLoading}
                    onClick={() => {
                      onReMorph();
                      onClose();
                    }}
                    className={cn(
                      GLASS_BUTTON_BASE,
                      "flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-bold disabled:opacity-40"
                    )}
                  >
                    <RefreshCw className={cn("size-3.5 shrink-0 text-[color:var(--orange)]", isMorphLoading && "animate-spin")} />
                    <span className="truncate">Re-morph AI</span>
                  </button>
                  <button
                    type="button"
                    disabled={!hasMorphArtifact && !morphActiveTopic}
                    onClick={() => {
                      onResetMorph();
                      onClose();
                    }}
                    className={cn(
                      GLASS_BUTTON_BASE,
                      "flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-bold disabled:opacity-40"
                    )}
                  >
                    <RotateCcw className="size-3.5 shrink-0 text-[#7fd8c9]" />
                    <span className="truncate">Reset View</span>
                  </button>
                </>
              )}

              {activeIntent === "whiteboard" && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleWhiteboardExpand();
                      onClose();
                    }}
                    className={cn(
                      isWhiteboardExpanded ? GLASS_BUTTON_ACTIVE : GLASS_BUTTON_BASE,
                      "flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-bold col-span-2"
                    )}
                  >
                    {isWhiteboardExpanded ? (
                      <Minimize2 className="size-3.5 shrink-0" />
                    ) : (
                      <Maximize2 className="size-3.5 shrink-0 text-[color:var(--orange)]" />
                    )}
                    <span>{isWhiteboardExpanded ? "Restore Split Width" : "Expand Whiteboard Pane"}</span>
                  </button>
                </>
              )}

              {activeIntent === "voice" && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectIntent("morph");
                    onClose();
                  }}
                  className={cn(
                    GLASS_BUTTON_BASE,
                    "flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-bold col-span-2"
                  )}
                >
                  <Sparkles className="size-3.5 shrink-0 text-[color:var(--orange)]" />
                  <span>Switch to Morph Visuals</span>
                </button>
              )}

              {activeIntent === "quiz" && (
                <button
                  type="button"
                  disabled={isQBankLoading}
                  onClick={() => {
                    onGenerateNewQBank();
                    onClose();
                  }}
                  className={cn(
                    GLASS_BUTTON_BASE,
                    "flex items-center justify-between gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-bold col-span-2 disabled:opacity-40"
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className={cn("size-3.5 shrink-0 text-[color:var(--orange)]", isQBankLoading && "animate-spin")} />
                    <span>{isQBankLoading ? "Generating Questions..." : "Generate New Questions"}</span>
                  </span>
                  {qbankTotalCount > 0 && (
                    <span className="font-mono text-[10px] opacity-75">
                      {qbankCurrentIndex + 1}/{qbankTotalCount}
                    </span>
                  )}
                </button>
              )}

              {activeIntent === "summary" && (
                <button
                  type="button"
                  disabled={isSummaryLoading}
                  onClick={() => {
                    onRefreshSummary();
                    onClose();
                  }}
                  className={cn(
                    GLASS_BUTTON_BASE,
                    "flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-bold col-span-2 disabled:opacity-40"
                  )}
                >
                  <RefreshCw className={cn("size-3.5 shrink-0 text-[color:var(--orange)]", isSummaryLoading && "animate-spin")} />
                  <span>{isSummaryLoading ? "Synthesizing..." : "Re-Synthesize Page Summary"}</span>
                </button>
              )}
            </div>
          </section>

          {/* 2. STUDIO FEATURES (GLASSMORPHISM MODE GRID) */}
          <section className="flex flex-col gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[color:var(--cream)]/55">
              AI Studio Features
            </span>
            <div className="grid grid-cols-2 gap-2">
              {STUDIO_MODES.map((mode) => {
                const Icon = mode.icon;
                const isActive = activeIntent === mode.id;
                const activeClass =
                  mode.id === "voice" ? GLASS_BUTTON_VOICE_ACTIVE : GLASS_BUTTON_ACTIVE;

                return (
                  <button
                    key={mode.id}
                    type="button"
                    disabled={mode.soon}
                    title={mode.soon ? `${mode.label} — Coming Soon` : mode.subtitle}
                    onClick={() => {
                      if (mode.soon) return;
                      onSelectIntent(mode.id);
                      onClose();
                    }}
                    className={cn(
                      isActive ? activeClass : GLASS_BUTTON_BASE,
                      "flex flex-col items-start gap-1 rounded-2xl p-2.5 text-left",
                      mode.soon &&
                        "opacity-55 cursor-not-allowed hover:bg-white/[0.06] hover:border-white/15 hover:text-[color:var(--cream)]/90 active:scale-100"
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <Icon
                        className={cn(
                          "size-4",
                          isActive
                            ? "text-white"
                            : mode.id === "voice"
                            ? "text-[#7fd8c9]"
                            : "text-[color:var(--orange)]"
                        )}
                      />
                      {mode.soon ? (
                        <span className="rounded-full border border-white/20 bg-white/10 px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wider text-[color:var(--cream)]/90">
                          Soon
                        </span>
                      ) : isActive ? (
                        <span className="size-1.5 rounded-full bg-white shadow-[0_0_8px_#fff]" />
                      ) : null}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-extrabold leading-tight">{mode.label}</span>
                      </div>
                      <span className="text-[10px] opacity-65 leading-tight">{mode.subtitle}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 3. STUDY SCOPE & LANGUAGE (Stays open while adjusting) */}
          <section className="flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-[color:var(--cream)]/55">
              Scope &amp; Language
            </span>

            {/* Study Scope Selector */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setIsEditingRange(false);
                  onScopeChange({
                    type: "page",
                    startPage: currentPage,
                    endPage: currentPage,
                  });
                }}
                className={cn(
                  studyScope.type === "page" ? GLASS_BUTTON_ACTIVE : GLASS_BUTTON_BASE,
                  "flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold"
                )}
              >
                <BookOpen className="size-3" />
                <span>Page {currentPage}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!isEditingRange) {
                    setRangeStart(studyScope.startPage || currentPage);
                    setRangeEnd(
                      studyScope.endPage || Math.min(currentPage + 4, totalPages || 10)
                    );
                  }
                  setIsEditingRange((prev) => !prev);
                }}
                className={cn(
                  studyScope.type === "range" ? GLASS_BUTTON_ACTIVE : GLASS_BUTTON_BASE,
                  "flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold"
                )}
              >
                <Hash className="size-3" />
                <span>
                  {studyScope.type === "range"
                    ? `P.${studyScope.startPage}–${studyScope.endPage}`
                    : "Page Range"}
                </span>
              </button>
            </div>

            {isEditingRange && (
              <div className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/40 p-2">
                <span className="text-[10px] text-white/60">P.</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages || 999}
                  value={rangeStart}
                  onChange={(e) => setRangeStart(parseInt(e.target.value, 10) || 1)}
                  className="w-12 rounded-lg border border-white/20 bg-white/10 px-1.5 py-1 text-center font-mono text-[11px] font-bold text-white outline-none focus:border-[color:var(--orange)]"
                />
                <span className="text-[10px] text-white/60">to</span>
                <input
                  type="number"
                  min={rangeStart}
                  max={totalPages || 999}
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(parseInt(e.target.value, 10) || rangeStart)}
                  className="w-12 rounded-lg border border-white/20 bg-white/10 px-1.5 py-1 text-center font-mono text-[11px] font-bold text-white outline-none focus:border-[color:var(--orange)]"
                />
                <button
                  type="button"
                  onClick={handleApplyRange}
                  className={cn(
                    GLASS_BUTTON_ACTIVE,
                    "ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10.5px] font-black"
                  )}
                >
                  <Check className="size-3" />
                  <span>Set</span>
                </button>
              </div>
            )}

            {topics.length > 0 && (
              <select
                value={studyScope.type === "topic" ? studyScope.topicId || "" : ""}
                onChange={(e) => {
                  const selected = topics.find((t) => t.id === e.target.value);
                  if (selected) {
                    setIsEditingRange(false);
                    onScopeChange({
                      type: "topic",
                      startPage: selected.startPage,
                      endPage: selected.endPage,
                      topicTitle: selected.title,
                      topicId: selected.id,
                    });
                    if (selected.startPage !== currentPage) {
                      onNavigateToPage(selected.startPage);
                    }
                  }
                }}
                className={cn(
                  studyScope.type === "topic" ? GLASS_BUTTON_ACTIVE : GLASS_BUTTON_BASE,
                  "w-full rounded-xl px-2.5 py-1.5 text-[11px] font-bold outline-none bg-[#1a1820]"
                )}
              >
                <option value="" disabled className="bg-[#18161d] text-white">
                  ✦ Pick Book Topic ({topics.length})
                </option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id} className="bg-[#18161d] text-white">
                    {t.title} (P.{t.startPage}–{t.endPage})
                  </option>
                ))}
              </select>
            )}

            {/* Universal Language Switch (Glass Pills) */}
            <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-white/10">
              <span className="flex items-center gap-1 text-[10.5px] font-bold text-[color:var(--cream)]/70">
                <Globe className="size-3 text-[color:var(--orange)]" />
                <span>Language</span>
              </span>
              <div className="flex items-center gap-1">
                {STUDY_LANGUAGES.map((lang) => {
                  const isSelected = studyLanguage === lang.id;
                  return (
                    <button
                      key={lang.id}
                      type="button"
                      onClick={() => onLanguageChange(lang.id)}
                      className={cn(
                        isSelected ? GLASS_BUTTON_ACTIVE : GLASS_BUTTON_BASE,
                        "rounded-full px-2.5 py-1 text-[10px] font-black"
                      )}
                      title={`${lang.label}: ${lang.sublabel}`}
                    >
                      {lang.id === "mixed" ? "Mix" : lang.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 4. READER VIEW & SESSION SETTINGS */}
          <section className="flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-[color:var(--cream)]/55">
              Reader View &amp; Session
            </span>

            {/* Zoom & Fit Controls */}
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onZoomOut}
                  className={cn(GLASS_BUTTON_BASE, "flex size-7 items-center justify-center rounded-full")}
                  title="Zoom Out"
                >
                  <ZoomOut className="size-3.5" />
                </button>
                <span className="w-10 text-center font-mono text-[10.5px] font-bold text-[color:var(--cream)]">
                  {fitMode === "normal" ? `${zoomLevel}%` : "Auto"}
                </span>
                <button
                  type="button"
                  onClick={onZoomIn}
                  className={cn(GLASS_BUTTON_BASE, "flex size-7 items-center justify-center rounded-full")}
                  title="Zoom In"
                >
                  <ZoomIn className="size-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onFitWidth}
                  className={cn(
                    fitMode === "fit-width" ? GLASS_BUTTON_ACTIVE : GLASS_BUTTON_BASE,
                    "rounded-full px-2 py-1 text-[10px] font-bold"
                  )}
                >
                  Width
                </button>
                <button
                  type="button"
                  onClick={onFitPage}
                  className={cn(
                    fitMode === "fit-page" ? GLASS_BUTTON_ACTIVE : GLASS_BUTTON_BASE,
                    "rounded-full px-2 py-1 text-[10px] font-bold"
                  )}
                >
                  Page
                </button>
              </div>
            </div>

            {/* Theme & RAG Status */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
              <div className="flex items-center gap-1.5">
                <span className="text-[10.5px] font-bold text-[color:var(--cream)]/70">Theme</span>
                {(["paper", "ink"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onThemeChange(t)}
                    className={cn(
                      "size-5 rounded-full border transition-transform cursor-pointer",
                      t === "paper" ? "bg-[#fbf7f0] border-white/40" : "bg-[#0f0e10] border-white/30",
                      theme === t && "scale-110 ring-2 ring-[color:var(--orange)]"
                    )}
                    title={`Set reader theme to ${t}`}
                  />
                ))}
              </div>

              {bookId && (
                <RagDigestionBadge
                  bookId={bookId}
                  initialStatus={ingestionStatus || "completed"}
                  initialProgress={ingestionProgress ?? 100}
                />
              )}
            </div>

            {/* Start New Session */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenStartNew();
              }}
              className={cn(
                GLASS_BUTTON_BASE,
                "mt-0.5 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-bold"
              )}
            >
              <RotateCcw className="size-3.5 text-[color:var(--orange)]" />
              <span>Start New Study Session</span>
            </button>
          </section>
        </div>
      </aside>
    </>
  );
}
