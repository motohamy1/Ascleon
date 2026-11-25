"use client";

import React from "react";
import {
  Sparkles,
  MessageSquare,
  Mic,
  HelpCircle,
  BookmarkPlus,
  ScanSearch,
  X,
  Copy,
  Check,
  Tv,
} from "lucide-react";

export interface ScannedPinItem {
  id: string;
  sectionIndex: number;
  pageNumber: number;
  text: string;
  type: "selection" | "full-page-scan" | "diagram-snip";
  extractedPearls?: string[];
  imageUrl?: string;
  timestamp: string;
}

interface SourceSelectionToolbarProps {
  selectedText: string;
  position: { x: number; y: number } | null;
  onMorphSelection: () => void;
  onWhiteboardSelection?: () => void;
  whiteboardAllowed?: boolean;
  onAskAI: (promptPrefix?: string) => void;
  onVoiceViva: () => void;
  onQuizSelection: () => void;
  onPinToBoard: () => void;
  onClearSelection: () => void;
}

export function SourceSelectionToolbar({
  selectedText,
  position,
  onMorphSelection,
  onWhiteboardSelection,
  whiteboardAllowed = false,
  onAskAI,
  onVoiceViva,
  onQuizSelection,
  onPinToBoard,
  onClearSelection,
}: SourceSelectionToolbarProps) {
  const [copied, setCopied] = React.useState(false);

  if (!selectedText || !position) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      style={{
        left: `${Math.max(16, Math.min(position.x, 420))}px`,
        top: `${Math.max(12, position.y - 56)}px`,
      }}
      className="animate-in fade-in zoom-in-95 absolute z-50 flex flex-col gap-1.5 rounded-2xl border border-[var(--study-border-strong)] bg-[var(--study-surface-solid)] backdrop-blur-xl p-2 text-[var(--study-text)] shadow-[var(--study-shadow-lg)] duration-150"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--study-border)] px-1.5 pb-1 text-[10px]">
        <span className="flex items-center gap-1 font-bold text-[color:var(--orange)]">
          <ScanSearch className="size-3" />
          <span>Target Selection ({selectedText.split(/\s+/).length} words)</span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded p-0.5 text-[var(--study-text-muted)] hover:bg-[var(--study-glass-hover)] hover:text-[var(--study-text)] cursor-pointer"
            title="Copy selection"
          >
            {copied ? <Check className="size-3 text-[var(--study-teal-text)]" /> : <Copy className="size-3" />}
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            className="rounded p-0.5 text-[var(--study-text-muted)] hover:bg-[var(--study-glass-hover)] hover:text-[var(--study-text)] cursor-pointer"
            title="Clear selection"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {/* 1. Morph This Passage */}
        <button
          type="button"
          onClick={onMorphSelection}
          className="flex cursor-pointer items-center gap-1 rounded-xl border border-[color:var(--ink)] bg-[color:var(--orange)] px-2.5 py-1.5 text-[11px] font-black text-[color:var(--ink)] shadow-sm transition-transform hover:-translate-y-0.5"
        >
          <Sparkles className="size-3" />
          <span>Morph Passage</span>
        </button>

        {onWhiteboardSelection && (
          <button
            type="button"
            disabled={!whiteboardAllowed}
            onClick={() => {
              if (!whiteboardAllowed) return;
              onWhiteboardSelection();
            }}
            title={whiteboardAllowed ? "Explain on Living Board" : "Whiteboard — Coming Soon"}
            className={
              whiteboardAllowed
                ? "flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--study-border-strong)] bg-[var(--study-surface-muted)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--study-text)] hover:bg-[var(--study-glass-hover)] transition-colors"
                : "flex cursor-not-allowed items-center gap-1 rounded-xl border border-[var(--study-border)] bg-[var(--study-surface-muted)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--study-text-muted)] opacity-75"
            }
          >
            <Tv className="size-3" />
            <span>Living Board</span>
            {!whiteboardAllowed && (
              <span className="rounded-full border border-[var(--study-border)] bg-[var(--study-glass)] px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wider text-[var(--study-text-soft)]">
                Soon
              </span>
            )}
          </button>
        )}

        {/* 2. Ask AI Mentor */}
        <button
          type="button"
          onClick={() => onAskAI()}
          className="flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--study-border)] bg-[var(--study-glass)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--study-text)] transition-colors hover:border-[color:var(--orange)] hover:bg-[color:var(--orange)]/15"
        >
          <MessageSquare className="size-3 text-[var(--study-teal-text)]" />
          <span>Explain</span>
        </button>

        {/* 3. Ascleon Oral Viva */}
        <button
          type="button"
          onClick={onVoiceViva}
          className="flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--study-border)] bg-[var(--study-glass)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--study-text)] transition-colors hover:border-[var(--study-teal-border)] hover:bg-[var(--study-teal-bg)]"
        >
          <Mic className="size-3 text-[color:var(--magenta)]" />
          <span>Viva</span>
        </button>

        {/* 4. Test in QBank */}
        <button
          type="button"
          onClick={onQuizSelection}
          className="flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--study-border)] bg-[var(--study-glass)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--study-text)] transition-colors hover:border-[color:var(--orange)] hover:bg-[var(--study-glass-hover)]"
        >
          <HelpCircle className="size-3 text-[var(--study-amber-text)]" />
          <span>QBank</span>
        </button>

        {/* 5. Pin / Scan to Scratchpad */}
        <button
          type="button"
          onClick={onPinToBoard}
          className="flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--study-teal-border)] bg-[var(--study-teal-bg)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--study-teal-text)] transition-colors hover:brightness-105"
          title="Extract & Pin to Study Vault"
        >
          <BookmarkPlus className="size-3" />
          <span>Pin to Vault</span>
        </button>
      </div>
    </div>
  );
}
