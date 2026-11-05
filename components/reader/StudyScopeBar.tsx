"use client";

import React, { useState } from "react";
import { BookOpen, Layers, Bookmark, ChevronRight, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { TopicRange } from "@/lib/ai/schemas/decision-models";

export type StudyScopeType = "page" | "range" | "topic";

export interface StudyScope {
  type: StudyScopeType;
  startPage: number;
  endPage: number;
  topicTitle?: string;
  topicId?: string;
}

interface StudyScopeBarProps {
  currentPage: number;
  totalPages: number;
  topics?: TopicRange[];
  currentScope: StudyScope;
  onScopeChange: (newScope: StudyScope) => void;
  onNavigateToPage?: (page: number) => void;
}

export default function StudyScopeBar({
  currentPage,
  totalPages,
  topics = [],
  currentScope,
  onScopeChange,
  onNavigateToPage,
}: StudyScopeBarProps) {
  const [rangeStart, setRangeStart] = useState<number>(currentScope.startPage || currentPage);
  const [rangeEnd, setRangeEnd] = useState<number>(currentScope.endPage || Math.min(currentPage + 4, totalPages || 10));
  const [isEditingRange, setIsEditingRange] = useState(false);

  const handleSelectSinglePage = () => {
    setIsEditingRange(false);
    onScopeChange({
      type: "page",
      startPage: currentPage,
      endPage: currentPage,
    });
  };

  const handleApplyRange = () => {
    const validStart = Math.max(1, Math.min(rangeStart, totalPages || 999));
    const validEnd = Math.max(validStart, Math.min(rangeEnd, totalPages || 999));
    setIsEditingRange(false);
    onScopeChange({
      type: "range",
      startPage: validStart,
      endPage: validEnd,
      topicTitle: `Pages ${validStart}–${validEnd}`,
    });
  };

  const handleSelectTopic = (topic: TopicRange) => {
    setIsEditingRange(false);
    onScopeChange({
      type: "topic",
      startPage: topic.startPage,
      endPage: topic.endPage,
      topicTitle: topic.title,
      topicId: topic.id,
    });
    if (onNavigateToPage && topic.startPage !== currentPage) {
      onNavigateToPage(topic.startPage);
    }
  };

  return (
    <div className="w-full bg-[#fbf7f0] border-b border-[#0f0e10]/15 sm:border-b-2 sm:border-[#0f0e10] px-2 sm:px-3 py-1 sm:py-1.5 flex items-center justify-between gap-1.5 sm:gap-2 text-xs min-h-[36px] sm:min-h-[38px] shrink-0 overflow-x-auto touch-pan-x overscroll-x-contain no-scrollbar">
      {/* Scope Mode Pills */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <span className="text-[10px] font-black uppercase tracking-wider text-[#0f0e10]/60 mr-0.5 hidden md:inline whitespace-nowrap">
          Study Scope:
        </span>

        {/* 1. Single Page Button */}
        <button
          type="button"
          onClick={handleSelectSinglePage}
          className={cn(
            "cursor-pointer px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full font-bold flex items-center gap-1 transition-all border text-[10.5px] sm:text-xs whitespace-nowrap shrink-0",
            currentScope.type === "page"
              ? "bg-[#0f0e10] text-[#f6d7a1] border-[#0f0e10] shadow-xs"
              : "bg-white text-[#0f0e10] border-[#0f0e10]/20 hover:border-[#0f0e10]"
          )}
        >
          <BookOpen className="size-2.5 sm:size-3 text-[#ff4c00]" />
          <span>Active Page ({currentPage})</span>
        </button>

        {/* 2. Page Range Button */}
        <button
          type="button"
          onClick={() => {
            if (currentScope.type !== "range") {
              setIsEditingRange(true);
            } else {
              setIsEditingRange(!isEditingRange);
            }
          }}
          className={cn(
            "cursor-pointer px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full font-bold flex items-center gap-1 transition-all border text-[10.5px] sm:text-xs whitespace-nowrap shrink-0",
            currentScope.type === "range"
              ? "bg-[#663820] text-white border-[#663820] shadow-xs"
              : "bg-white text-[#0f0e10] border-[#0f0e10]/20 hover:border-[#0f0e10]"
          )}
        >
          <Hash className="size-2.5 sm:size-3 text-[#f6d7a1]" />
          <span>
            {currentScope.type === "range"
              ? `Range: P.${currentScope.startPage}–${currentScope.endPage}`
              : "Page Range..."}
          </span>
        </button>

        {/* Range Editor Popover */}
        {isEditingRange && (
          <div className="flex items-center gap-1 bg-white border border-[#0f0e10] rounded-lg px-1.5 py-0.5 shadow-sm shrink-0">
            <span className="text-[9px] text-[#0f0e10]/70">P.</span>
            <input
              type="number"
              min={1}
              max={totalPages || 999}
              value={rangeStart}
              onChange={(e) => setRangeStart(parseInt(e.target.value) || 1)}
              className="w-10 px-1 py-0.5 text-[11px] border border-gray-300 rounded font-bold"
            />
            <span className="text-[9px] text-[#0f0e10]/70">to</span>
            <input
              type="number"
              min={rangeStart}
              max={totalPages || 999}
              value={rangeEnd}
              onChange={(e) => setRangeEnd(parseInt(e.target.value) || rangeStart)}
              className="w-10 px-1 py-0.5 text-[11px] border border-gray-300 rounded font-bold"
            />
            <button
              type="button"
              onClick={handleApplyRange}
              className="bg-[#ff4c00] text-[#0f0e10] font-black px-1.5 py-0.5 rounded text-[9.5px] cursor-pointer"
            >
              Set
            </button>
          </div>
        )}

        {/* 3. Topics Dropdown (if topics detected) */}
        {topics.length > 0 && (
          <div className="relative inline-block shrink-0">
            <select
              value={currentScope.type === "topic" ? currentScope.topicId || "" : ""}
              onChange={(e) => {
                const selected = topics.find((t) => t.id === e.target.value);
                if (selected) {
                  handleSelectTopic(selected);
                }
              }}
              className={cn(
                "cursor-pointer px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full font-bold flex items-center gap-1 transition-all border outline-none text-[10.5px] sm:text-xs max-w-[150px] sm:max-w-[220px] truncate",
                currentScope.type === "topic"
                  ? "bg-[#ff4c00] text-[#0f0e10] border-[#0f0e10] font-black"
                  : "bg-white text-[#0f0e10] border-[#0f0e10]/20 hover:border-[#0f0e10]"
              )}
            >
              <option value="" disabled>
                ✦ Select Complete Topic ({topics.length} detected)
              </option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} (P.{t.startPage}–{t.endPage})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Active Scope Summary Banner */}
      <div className="hidden lg:flex items-center gap-1.5 text-[10.5px] font-bold text-[#0f0e10]/80 whitespace-nowrap shrink-0">
        <span className="inline-block size-1.5 sm:size-2 rounded-full bg-[#ff4c00]" />
        <span>
          {currentScope.type === "page" && `Studying Page ${currentPage} exclusively`}
          {currentScope.type === "range" && `Studying Multi-Page Range (P.${currentScope.startPage}–${currentScope.endPage})`}
          {currentScope.type === "topic" && `Studying Complete Topic: "${currentScope.topicTitle}" (P.${currentScope.startPage}–${currentScope.endPage})`}
        </span>
      </div>
    </div>
  );
}
