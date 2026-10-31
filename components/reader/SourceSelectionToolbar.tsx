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
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ScannedPinItem {
  id: string;
  sectionIndex: number;
  pageNumber: number;
  text: string;
  type: "selection" | "full-page-scan";
  extractedPearls?: string[];
  timestamp: string;
}

interface SourceSelectionToolbarProps {
  selectedText: string;
  position: { x: number; y: number } | null;
  onMorphSelection: () => void;
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
      className="animate-in fade-in zoom-in-95 absolute z-50 flex flex-col gap-1.5 rounded-2xl border-2 border-[color:var(--ink)] bg-[#16151a] p-2 text-[color:var(--cream)] shadow-2xl duration-150"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-1.5 pb-1 text-[10px]">
        <span className="flex items-center gap-1 font-bold text-[color:var(--orange)]">
          <ScanSearch className="size-3" />
          <span>Target Selection ({selectedText.split(/\s+/).length} words)</span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded p-0.5 text-[color:var(--cream)]/60 hover:bg-white/10 hover:text-[color:var(--cream)]"
            title="Copy selection"
          >
            {copied ? <Check className="size-3 text-[#43a08f]" /> : <Copy className="size-3" />}
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            className="rounded p-0.5 text-[color:var(--cream)]/60 hover:bg-white/10 hover:text-[color:var(--cream)]"
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

        {/* 2. Ask AI Mentor */}
        <button
          type="button"
          onClick={() => onAskAI()}
          className="flex cursor-pointer items-center gap-1 rounded-xl border border-white/15 bg-white/[0.07] px-2.5 py-1.5 text-[11px] font-bold text-[color:var(--cream)] transition-colors hover:border-[color:var(--orange)] hover:bg-[color:var(--orange)]/15"
        >
          <MessageSquare className="size-3 text-[#7fd8c9]" />
          <span>Explain</span>
        </button>

        {/* 3. Sinai Oral Viva */}
        <button
          type="button"
          onClick={onVoiceViva}
          className="flex cursor-pointer items-center gap-1 rounded-xl border border-white/15 bg-white/[0.07] px-2.5 py-1.5 text-[11px] font-bold text-[color:var(--cream)] transition-colors hover:border-[#43a08f] hover:bg-[#43a08f]/20"
        >
          <Mic className="size-3 text-[color:var(--magenta)]" />
          <span>Viva</span>
        </button>

        {/* 4. Test in QBank */}
        <button
          type="button"
          onClick={onQuizSelection}
          className="flex cursor-pointer items-center gap-1 rounded-xl border border-white/15 bg-white/[0.07] px-2.5 py-1.5 text-[11px] font-bold text-[color:var(--cream)] transition-colors hover:border-[color:var(--orange)] hover:bg-white/15"
        >
          <HelpCircle className="size-3 text-amber-400" />
          <span>QBank</span>
        </button>

        {/* 5. Pin / Scan to Scratchpad */}
        <button
          type="button"
          onClick={onPinToBoard}
          className="flex cursor-pointer items-center gap-1 rounded-xl border border-[#43a08f]/40 bg-[#43a08f]/15 px-2.5 py-1.5 text-[11px] font-bold text-[#7fd8c9] transition-colors hover:bg-[#43a08f]/30"
          title="Extract & Pin to Study Vault"
        >
          <BookmarkPlus className="size-3" />
          <span>Pin to Vault</span>
        </button>
      </div>
    </div>
  );
}
