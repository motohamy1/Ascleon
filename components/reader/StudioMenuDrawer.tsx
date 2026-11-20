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
  { id: "whiteboard", label: "Living Board", subtitle: "2D Board + 3D Lab", icon: Tv },
  { id: "quiz", label: "Qbanks", subtitle: "Board practice", icon: HelpCircle },
  { id: "summary", label: "Summary", subtitle: "Pearls & mnemonics", icon: FileText },
];

export const GLASS_BUTTON_BASE =
  "backdrop-blur-md bg-[var(--study-glass)] border border-[var(--study-pill-border)]/45 text-[var(--study-text-soft)] shadow-[var(--study-glass-shadow)] transition-all duration-150 hover:bg-[var(--study-glass-hover)] hover:border-[var(--study-panel-border)] hover:text-[var(--study-text)] active:scale-[0.98] cursor-pointer";

export const GLASS_BUTTON_ACTIVE =
  "backdrop-blur-md bg-[var(--study-active-bg)] border border-[var(--study-active-border)] text-[var(--study-active-text)] shadow-[var(--study-active-shadow)] hover:brightness-105 cursor-pointer";

export const GLASS_BUTTON_VOICE_ACTIVE =
  "backdrop-blur-md bg-[var(--study-voice-bg)] border border-[var(--study-voice-border)] text-[var(--study-voice-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_0_20px_rgba(67,160,143,0.24)] hover:brightness-105 cursor-pointer";

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
          "absolute inset-0 z-30 bg-black/30 backdrop-blur-[2px] transition-opacity duration-200",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      />

      {/* Horizontal Slide-Over Drawer (Right Edge -> Slides Left) */}
      <aside
        ref={drawerRef}
        aria-label="Studio tools and settings menu"
        aria-hidden={!isOpen}
        className={cn(
          "absolute inset-y-0 right-0 z-40 flex w-[300px] sm:w-[332px] max-w-[90%] flex-col border-l-2 border-[var(--study-panel-border)] bg-[var(--study-surface-solid)] text-[var(--study-text)] backdrop-blur-xl transition-all duration-200 ease-out",
          isOpen ? "translate-x-0 opacity-100 visible shadow-[var(--study-shadow-lg)]" : "translate-x-full opacity-0 invisible pointer-events-none"
        )}
      >
        {/* Drawer Header */}
        <div className="flex h-13 shrink-0 items-center justify-between border-b border-[var(--study-border)] px-4 pt-1">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-lg bg-[color:var(--orange)]/20 border border-[color:var(--orange)]/50 text-[color:var(--orange)]">
              <Menu className="size-3.5" />
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-black tracking-wide text-[var(--study-text)]">
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
        <div className="study-scrollbar flex-1 overflow-y-auto overscroll-y-contain p-3.5 flex flex-col gap-4">
          {/* 1. DYNAMIC CONTEXT SECTION: Adapts to Selection & Current Feature */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--study-text-muted)]">
                {hasSelectionContext ? "Active Selection" : "Context Actions"}
              </span>
              <span className="rounded-full bg-[var(--study-surface-muted)] border border-[var(--study-border)] px-2 py-0.5 text-[9.5px] font-bold text-[color:var(--orange)]">
                {STUDIO_MODES.find((m) => m.id === activeIntent)?.label || "Studio"}
              </span>
            </div>

            {hasSelectionContext && (
              <div className="rounded-2xl border border-[color:var(--orange)]/40 bg-[color:var(--orange)]/[0.09] backdrop-blur-md p-2.5 flex flex-col gap-2">
                {selectedText && (
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] text-[var(--study-text)] line-clamp-2 leading-snug">
                      <span className="font-bold text-[color:var(--orange)]">Text: </span>
                      &ldquo;{selectedText}&rdquo;
                    </p>
                    <button
                      type="button"
                      onClick={onClearSelection}
                      className="shrink-0 rounded-full p-1 text-[var(--study-text-muted)] hover:bg-[var(--study-glass-hover)] hover:text-[var(--study-text)] cursor-pointer"
                      title="Clear text selection"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                )}

                {snippedDiagram && (
                  <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--study-amber-text)]">
                    <span className="flex items-center gap-1 font-bold">
                      <Crop className="size-3" />
                      Diagram locked (Page {snippedDiagram.pageNumber})
                    </span>
                    <button
                      type="button"
                      onClick={onClearDiagram}
                      className="shrink-0 rounded-full p-1 text-[var(--study-amber-text)]/70 hover:bg-[var(--study-glass-hover)] hover:text-[var(--study-text)] cursor-pointer"
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
                      onClick={() => {
                        onWhiteboardSelection();
                        onClose();
                      }}
                      title="Create Living Board from selected text"
                      className={cn(
                        GLASS_BUTTON_BASE,
                        "flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-bold"
                      )}
                    >
                      <Tv className="size-3 text-[color:var(--orange)]" />
                      <span>Living Board</span>
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
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--study-text-muted)]">
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
                        "opacity-55 cursor-not-allowed active:scale-100"
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <Icon
                        className={cn(
                          "size-4",
                          isActive
                            ? "text-current"
                            : mode.id === "voice"
                            ? "text-[var(--study-teal-text)]"
                            : "text-[color:var(--orange)]"
                        )}
                      />
                      {mode.soon ? (
                        <span className="rounded-full border border-[var(--study-border)] bg-[var(--study-surface-muted)] px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wider text-[var(--study-text-soft)]">
                          Soon
                        </span>
                      ) : isActive ? (
                        <span className="size-1.5 rounded-full bg-current" />
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
          <section className="flex flex-col gap-2.5 rounded-2xl border border-[var(--study-border)] bg-[var(--study-surface-muted)] backdrop-blur-md p-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--study-text-muted)]">
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
              <div className="flex items-center gap-1.5 rounded-xl border border-[var(--study-border)] bg-[var(--study-surface-solid)] p-2">
                <span className="text-[10px] text-[var(--study-text-muted)]">P.</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages || 999}
                  value={rangeStart}
                  onChange={(e) => setRangeStart(parseInt(e.target.value, 10) || 1)}
                  className="w-12 rounded-lg border border-[var(--study-border-strong)] bg-[var(--study-surface-muted)] px-1.5 py-1 text-center font-mono text-[11px] font-bold text-[var(--study-text)] outline-none focus:border-[color:var(--orange)]"
                />
                <span className="text-[10px] text-[var(--study-text-muted)]">to</span>
                <input
                  type="number"
                  min={rangeStart}
                  max={totalPages || 999}
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(parseInt(e.target.value, 10) || rangeStart)}
                  className="w-12 rounded-lg border border-[var(--study-border-strong)] bg-[var(--study-surface-muted)] px-1.5 py-1 text-center font-mono text-[11px] font-bold text-[var(--study-text)] outline-none focus:border-[color:var(--orange)]"
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
                  "w-full rounded-xl px-2.5 py-1.5 text-[11px] font-bold outline-none bg-[var(--study-surface-solid)] text-[var(--study-text)]"
                )}
              >
                <option value="" disabled className="bg-[var(--study-surface-solid)] text-[var(--study-text)]">
                  ✦ Pick Book Topic ({topics.length})
                </option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id} className="bg-[var(--study-surface-solid)] text-[var(--study-text)]">
                    {t.title} (P.{t.startPage}–{t.endPage})
                  </option>
                ))}
              </select>
            )}

            {/* Universal Language Switch (Glass Pills) */}
            <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-[var(--study-border)]">
              <span className="flex items-center gap-1 text-[10.5px] font-bold text-[var(--study-text-muted)]">
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
          <section className="flex flex-col gap-2.5 rounded-2xl border border-[var(--study-border)] bg-[var(--study-surface-muted)] backdrop-blur-md p-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--study-text-muted)]">
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
                <span className="w-10 text-center font-mono text-[10.5px] font-bold text-[var(--study-text)]">
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

            {/* Canvas Theme & RAG Status */}
            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[var(--study-border)]">
              <div className="flex items-center gap-1.5">
                <span className="text-[10.5px] font-bold text-[var(--study-text-muted)]">Canvas</span>
                <div className="flex items-center rounded-full border border-[var(--study-border)] bg-[var(--study-surface-solid)] p-0.5">
                  <button
                    type="button"
                    onClick={() => onThemeChange("paper")}
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold transition-all cursor-pointer",
                      theme === "paper"
                        ? "bg-[#0f0e10] text-white shadow-xs"
                        : "text-[var(--study-text-muted)] hover:text-[var(--study-text)]"
                    )}
                    title="White dotted canvas"
                  >
                    <span className="size-2.5 rounded-full border border-black/25 bg-white" />
                    <span>White</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onThemeChange("ink")}
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold transition-all cursor-pointer",
                      theme === "ink"
                        ? "bg-[color:var(--orange)] text-[#0f0e10] shadow-xs"
                        : "text-[var(--study-text-muted)] hover:text-[var(--study-text)]"
                    )}
                    title="Black dotted canvas"
                  >
                    <span className="size-2.5 rounded-full border border-white/40 bg-[#08080a]" />
                    <span>Black</span>
                  </button>
                </div>
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
