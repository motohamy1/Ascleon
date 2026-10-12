"use client";

import React from "react";
import { Library, LayoutGrid, Star, Clock, BookmarkCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = "shelf" | "grid";
export type FilterType = "all" | "favorites" | "reading_now" | "quick_reads" | string;

interface ViewControlsProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  topics: { name: string; count: number }[];
  totalCount: number;
  favoritesCount: number;
  inProgressCount: number;
  quickReadsCount: number;
}

export default function ViewControls({
  viewMode,
  onViewModeChange,
  activeFilter,
  onFilterChange,
  topics,
  totalCount,
  favoritesCount,
  inProgressCount,
  quickReadsCount,
}: ViewControlsProps) {
  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Top bar: View toggle and desktop keyboard hint */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* View Toggle */}
        <div className="inline-flex items-center p-1 bg-[#EFE8DD] rounded-xl border border-[#E0D5C3]">
          <button
            type="button"
            onClick={() => onViewModeChange("shelf")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer",
              viewMode === "shelf"
                ? "bg-[#212A3B] text-white shadow-sm"
                : "text-[#5A544C] hover:text-[#212A3B] hover:bg-[#E5DCCF]",
            )}
          >
            <Library className="w-3.5 h-3.5" />
            <span>Shelf</span>
          </button>

          <button
            type="button"
            onClick={() => onViewModeChange("grid")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer",
              viewMode === "grid"
                ? "bg-[#212A3B] text-white shadow-sm"
                : "text-[#5A544C] hover:text-[#212A3B] hover:bg-[#E5DCCF]",
            )}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Grid</span>
          </button>
        </div>

        {/* Keyboard navigation hint (visible in shelf mode) */}
        {viewMode === "shelf" && (
          <div className="hidden md:flex items-center gap-2 text-xs text-[#7A7267] italic font-serif">
            <Sparkles className="w-3 h-3 text-[#A04000]" />
            <span>Click a spine to take it off the shelf. Arrow keys navigate.</span>
          </div>
        )}
      </div>

      {/* Filter Pills scrollable bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {/* All */}
        <button
          type="button"
          onClick={() => onFilterChange("all")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border",
            activeFilter === "all"
              ? "bg-[#212A3B] text-white border-[#212A3B]"
              : "bg-white text-[#524B43] border-[#E2D7C5] hover:bg-[#F8F4EE]",
          )}
        >
          <span>All</span>
          <span className="opacity-70 text-[10px]">({totalCount})</span>
        </button>

        {/* Favourites */}
        {favoritesCount > 0 && (
          <button
            type="button"
            onClick={() => onFilterChange("favorites")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border",
              activeFilter === "favorites"
                ? "bg-[#A04000] text-white border-[#A04000]"
                : "bg-white text-[#524B43] border-[#E2D7C5] hover:bg-[#F8F4EE]",
            )}
          >
            <Star className="w-3 h-3 fill-current" />
            <span>Favourites</span>
            <span className="opacity-70 text-[10px]">({favoritesCount})</span>
          </button>
        )}

        {/* Reading now */}
        {inProgressCount > 0 && (
          <button
            type="button"
            onClick={() => onFilterChange("reading_now")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border",
              activeFilter === "reading_now"
                ? "bg-[#1E3B2C] text-white border-[#1E3B2C]"
                : "bg-white text-[#524B43] border-[#E2D7C5] hover:bg-[#F8F4EE]",
            )}
          >
            <BookmarkCheck className="w-3 h-3" />
            <span>Reading now</span>
            <span className="opacity-70 text-[10px]">({inProgressCount})</span>
          </button>
        )}

        {/* Quick reads */}
        {quickReadsCount > 0 && (
          <button
            type="button"
            onClick={() => onFilterChange("quick_reads")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border",
              activeFilter === "quick_reads"
                ? "bg-[#29434E] text-white border-[#29434E]"
                : "bg-white text-[#524B43] border-[#E2D7C5] hover:bg-[#F8F4EE]",
            )}
          >
            <Clock className="w-3 h-3" />
            <span>Under 15 min</span>
            <span className="opacity-70 text-[10px]">({quickReadsCount})</span>
          </button>
        )}

        {/* Dynamic Topics */}
        {topics.map((topic) => (
          <button
            key={topic.name}
            type="button"
            onClick={() => onFilterChange(topic.name)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border",
              activeFilter === topic.name
                ? "bg-[#212A3B] text-white border-[#212A3B]"
                : "bg-white text-[#524B43] border-[#E2D7C5] hover:bg-[#F8F4EE]",
            )}
          >
            <span>{topic.name}</span>
            <span className="opacity-70 text-[10px]">({topic.count})</span>
          </button>
        ))}
      </div>
    </div>
  );
}
