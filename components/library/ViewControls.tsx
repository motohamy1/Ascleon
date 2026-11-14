"use client";

import React from "react";
import {
  Library,
  LayoutGrid,
  Star,
  Clock,
  BookmarkCheck,
  Sparkles,
  BookMarked,
  GraduationCap,
  FileText,
  FileCheck2,
  Award,
  Folder,
  FolderPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = "shelf" | "grid";
export type FilterType =
  | "all"
  | "favorites"
  | "reading_now"
  | "quick_reads"
  | "cat_textbook"
  | "cat_lecture_notes"
  | "cat_clinical_sheet"
  | "cat_guideline_paper"
  | "cat_exam_review"
  | string;

export interface CategoryCount {
  textbook: number;
  lecture_notes: number;
  clinical_sheet: number;
  guideline_paper: number;
  exam_review: number;
}

interface ViewControlsProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  topics: { name: string; count: number }[];
  customCategories?: { name: string; count: number }[];
  onOpenNewCategory?: () => void;
  totalCount: number;
  favoritesCount: number;
  inProgressCount: number;
  quickReadsCount: number;
  categoryCounts?: CategoryCount;
}

export default function ViewControls({
  viewMode,
  onViewModeChange,
  activeFilter,
  onFilterChange,
  topics,
  customCategories = [],
  onOpenNewCategory,
  totalCount,
  favoritesCount,
  inProgressCount,
  quickReadsCount,
  categoryCounts = {
    textbook: 0,
    lecture_notes: 0,
    clinical_sheet: 0,
    guideline_paper: 0,
    exam_review: 0,
  },
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

        {/* Right: Keyboard hint + New Category action */}
        <div className="flex items-center gap-3">
          {viewMode === "shelf" && (
            <div className="hidden md:flex items-center gap-2 text-xs text-[#7A7267] italic font-serif">
              <Sparkles className="w-3 h-3 text-[#ff4c00]" />
              <span>Structured into architectural wooden bays by Source Type. Arrow keys navigate.</span>
            </div>
          )}
          {onOpenNewCategory && (
            <button
              type="button"
              onClick={onOpenNewCategory}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#212A3B] text-white hover:bg-[#2f3b52] transition-colors cursor-pointer shadow-xs"
              title="Create a custom category to organize your books and lectures"
            >
              <FolderPlus className="w-3.5 h-3.5 text-[#ff4c00]" />
              <span>+ New Category</span>
            </button>
          )}
        </div>
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
          <span>All Sources</span>
          <span className="opacity-70 text-[10px]">({totalCount})</span>
        </button>

        {/* Category: Textbooks */}
        {categoryCounts.textbook > 0 && (
          <button
            type="button"
            onClick={() => onFilterChange("cat_textbook")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border",
              activeFilter === "cat_textbook"
                ? "bg-[#663820] text-white border-[#663820]"
                : "bg-white text-[#524B43] border-[#E2D7C5] hover:bg-[#F8F4EE]",
            )}
          >
            <BookMarked className="w-3 h-3 text-[#d4a853]" />
            <span>Textbooks</span>
            <span className="opacity-70 text-[10px]">({categoryCounts.textbook})</span>
          </button>
        )}

        {/* Category: Lectures & Notes */}
        {categoryCounts.lecture_notes > 0 && (
          <button
            type="button"
            onClick={() => onFilterChange("cat_lecture_notes")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border",
              activeFilter === "cat_lecture_notes"
                ? "bg-[#2e6f68] text-white border-[#2e6f68]"
                : "bg-white text-[#524B43] border-[#E2D7C5] hover:bg-[#F8F4EE]",
            )}
          >
            <GraduationCap className="w-3 h-3 text-[#7fd8c9]" />
            <span>Lectures & Notes</span>
            <span className="opacity-70 text-[10px]">({categoryCounts.lecture_notes})</span>
          </button>
        )}

        {/* Category: Clinical Sheets */}
        {categoryCounts.clinical_sheet > 0 && (
          <button
            type="button"
            onClick={() => onFilterChange("cat_clinical_sheet")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border",
              activeFilter === "cat_clinical_sheet"
                ? "bg-[#ff4c00] text-white border-[#ff4c00]"
                : "bg-white text-[#524B43] border-[#E2D7C5] hover:bg-[#F8F4EE]",
            )}
          >
            <FileText className="w-3 h-3" />
            <span>Clinical Sheets</span>
            <span className="opacity-70 text-[10px]">({categoryCounts.clinical_sheet})</span>
          </button>
        )}

        {/* Category: Guidelines & Papers */}
        {categoryCounts.guideline_paper > 0 && (
          <button
            type="button"
            onClick={() => onFilterChange("cat_guideline_paper")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border",
              activeFilter === "cat_guideline_paper"
                ? "bg-[#a1156e] text-white border-[#a1156e]"
                : "bg-white text-[#524B43] border-[#E2D7C5] hover:bg-[#F8F4EE]",
            )}
          >
            <FileCheck2 className="w-3 h-3 text-[#f6d7a1]" />
            <span>Guidelines</span>
            <span className="opacity-70 text-[10px]">({categoryCounts.guideline_paper})</span>
          </button>
        )}

        {/* Category: Exam Review */}
        {categoryCounts.exam_review > 0 && (
          <button
            type="button"
            onClick={() => onFilterChange("cat_exam_review")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border",
              activeFilter === "cat_exam_review"
                ? "bg-[#3d485e] text-white border-[#3d485e]"
                : "bg-white text-[#524B43] border-[#E2D7C5] hover:bg-[#F8F4EE]",
            )}
          >
            <Award className="w-3 h-3 text-[#d4a853]" />
            <span>Exam Review</span>
            <span className="opacity-70 text-[10px]">({categoryCounts.exam_review})</span>
          </button>
        )}

        {/* Favourites */}
        {favoritesCount > 0 && (
          <button
            type="button"
            onClick={() => onFilterChange("favorites")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border",
              activeFilter === "favorites"
                ? "bg-[#d4a853] text-[#212A3B] font-bold border-[#d4a853]"
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

        {/* User-Created Custom Categories */}
        {customCategories.map((cat) => {
          const filterKey = `custom_${cat.name}`;
          return (
            <button
              key={filterKey}
              type="button"
              onClick={() => onFilterChange(filterKey)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer border",
                activeFilter === filterKey
                  ? "bg-[#533017] text-[#f5ebd7] border-[#533017]"
                  : "bg-[#FAF4EB] text-[#533017] border-[#D8CBB8] hover:bg-[#EFE8DD]",
              )}
            >
              <Folder className="w-3 h-3 text-[#d4af37]" />
              <span>{cat.name}</span>
              <span className="opacity-70 text-[10px]">({cat.count})</span>
            </button>
          );
        })}

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
