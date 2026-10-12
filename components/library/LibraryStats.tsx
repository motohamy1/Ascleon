"use client";

import React from "react";
import { BookOpen, Layers, Clock, Bookmark, CheckCircle2 } from "lucide-react";
import { IBook } from "@/types";
import { getBookReadingTime } from "@/lib/utils";

interface LibraryStatsProps {
  books: IBook[];
}

export default function LibraryStats({ books }: LibraryStatsProps) {
  const totalBooks = books.length;

  const topicsSet = new Set(
    books.map((b) => b.topic?.trim() || "General").filter(Boolean),
  );
  const totalTopics = Math.max(1, topicsSet.size);

  const totalMinutes = books.reduce(
    (sum, b) => sum + getBookReadingTime(b),
    0,
  );
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  const timeFormatted =
    hours > 0
      ? `${hours}h ${remainingMinutes > 0 ? `${remainingMinutes}m` : ""}`
      : `${totalMinutes}m`;

  const inProgress = books.filter(
    (b) => b.readingStatus === "in_progress",
  ).length;

  const completed = books.filter((b) => b.readingStatus === "read").length;

  return (
    <div className="w-full bg-[#F5EFE6] border border-[#E6DAC8] rounded-2xl px-5 py-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 text-xs sm:text-sm text-[#4A453E]">
        {/* Title Badge */}
        <div className="flex items-center gap-2 font-serif font-bold text-[#212A3B] text-base">
          <BookOpen className="w-4 h-4 text-[#8B3A2B]" />
          <span>Your Library</span>
        </div>

        {/* Dynamic Metric Badges */}
        <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-5 gap-y-1.5 font-medium">
          <span className="flex items-center gap-1.5">
            <strong className="text-[#212A3B] font-semibold">{totalBooks}</strong>
            <span className="text-[#736B63]">{totalBooks === 1 ? "book" : "books & papers"}</span>
          </span>

          <span className="text-[#D0C4B4] hidden sm:inline">•</span>

          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#736B63]" />
            <strong className="text-[#212A3B] font-semibold">{totalTopics}</strong>
            <span className="text-[#736B63]">topics</span>
          </span>

          <span className="text-[#D0C4B4] hidden sm:inline">•</span>

          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#736B63]" />
            <strong className="text-[#212A3B] font-semibold">{timeFormatted}</strong>
            <span className="text-[#736B63]">of reading</span>
          </span>

          <span className="text-[#D0C4B4] hidden sm:inline">•</span>

          <span className="flex items-center gap-1.5">
            <Bookmark className="w-3.5 h-3.5 text-[#A04000]" />
            <strong className="text-[#212A3B] font-semibold">{inProgress}</strong>
            <span className="text-[#736B63]">in progress</span>
          </span>

          {completed > 0 && (
            <>
              <span className="text-[#D0C4B4] hidden sm:inline">•</span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#2E7D32]" />
                <strong className="text-[#212A3B] font-semibold">{completed}</strong>
                <span className="text-[#736B63]">read</span>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
