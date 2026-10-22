"use client";

import React, { useMemo } from "react";
import { IBook } from "@/types";
import { getBookSpinePalette, getBookReadingTime, cn } from "@/lib/utils";
import { Star, Clock, BookOpen } from "lucide-react";

interface BookSpineProps {
  book: IBook;
  isSelected: boolean;
  onSelect: (book: IBook) => void;
  index: number;
  totalBooks?: number;
}

export default function BookSpine({
  book,
  isSelected,
  onSelect,
  index,
  totalBooks,
}: BookSpineProps) {
  const palette = useMemo(
    () => getBookSpinePalette(book.title, book.color),
    [book.title, book.color],
  );

  const readingTime = useMemo(() => getBookReadingTime(book), [book]);

  // Subtle height and width variety for realistic library shelf feel
  const dimensions = useMemo(() => {
    const hash = book.title.length + index * 7;
    const height = 270 + (hash % 5) * 10; // 270px - 310px
    const width = 48 + (hash % 3) * 6; // 48px - 60px
    return { height, width };
  }, [book.title, index]);

  const isFirst = index === 0;
  const isLast = Boolean(
    totalBooks && totalBooks > 3 && index === totalBooks - 1,
  );

  // Position card over the books to avoid being clipped by container edges:
  // - First book at the start of the row aligns left-0 to extend over the shelf
  // - Last book in a full shelf aligns right-0 to extend inward
  // - Middle books remain centered directly above the spine
  const horizontalPosition = isFirst
    ? "left-0"
    : isLast
      ? "right-0"
      : "left-1/2 -translate-x-1/2";

  return (
    <div
      className={cn(
        "relative group flex flex-col items-center",
        isSelected ? "z-30" : "hover:z-40 focus-within:z-40",
      )}
    >
      {/* Floating Hover Tooltip Card (Appears directly above book spine on hover) */}
      <div
        className={cn(
          "absolute -top-24 z-30 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none",
          "w-48 bg-[#212A3B] text-[#FAF7F2] rounded-xl p-2.5 shadow-xl border border-[#3E4A61]/50",
          "flex flex-col gap-1 items-start text-left transform -translate-y-1 group-hover:translate-y-0",
          horizontalPosition,
        )}
      >
        <div className="w-full flex items-center justify-between text-[10px] text-[#C4B5A5] font-mono">
          <span className="truncate max-w-[100px]">{book.topic || "General"}</span>
          <span className="flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />
            {readingTime}m
          </span>
        </div>
        <p className="font-serif font-bold text-xs leading-tight line-clamp-2 text-white">
          {book.title}
        </p>
        <p className="text-[10px] text-[#E0D7CC] truncate w-full">
          by {book.author}
        </p>
        <div className="w-full pt-1 mt-0.5 border-t border-white/10 flex items-center justify-between text-[9px] text-amber-300 font-sans font-medium">
          <span className="flex items-center gap-1">
            <BookOpen className="w-2.5 h-2.5" />
            Click to inspect
          </span>
          {book.isFavorite && <Star className="w-2.5 h-2.5 fill-amber-300" />}
        </div>
      </div>

      {/* 3D Vertical Leather / Cloth Spine */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(book)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(book);
          }
        }}
        aria-label={`Inspect book ${book.title} by ${book.author}`}
        style={{
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
          backgroundColor: palette.bg,
          borderColor: palette.border,
        }}
        className={cn(
          "relative flex flex-col justify-between items-center rounded-t-[5px] cursor-pointer select-none",
          "border-t border-r border-l transition-all duration-300 ease-out origin-bottom",
          "shadow-[inset_2px_0_4px_rgba(255,255,255,0.14),inset_-2px_0_4px_rgba(0,0,0,0.4),0_6px_14px_rgba(0,0,0,0.2)]",
          "hover:-translate-y-7 hover:scale-[1.02] hover:shadow-[0_18px_32px_rgba(0,0,0,0.4)]",
          isSelected &&
            "-translate-y-10 scale-[1.03] shadow-[0_24px_40px_rgba(0,0,0,0.5)] ring-2 ring-amber-400 ring-offset-2 ring-offset-[#2C241E]",
        )}
      >
        {/* Top Foil Band / Headband */}
        <div className="w-full flex flex-col items-center pt-2.5">
          <div
            className="w-[82%] h-[1.5px] opacity-45 mb-1"
            style={{ backgroundColor: palette.accent }}
          />
          <div
            className="w-[82%] h-[1.5px] opacity-45"
            style={{ backgroundColor: palette.accent }}
          />

          {/* Favorite Star indicator if favorited */}
          {book.isFavorite && (
            <div className="mt-1.5">
              <Star className="w-3 h-3 fill-amber-300 text-amber-300 drop-shadow-sm" />
            </div>
          )}
        </div>

        {/* Vertical Spine Title (Classic Foil Look) */}
        <div className="flex-1 flex items-center justify-center py-3 overflow-hidden px-1">
          <span
            className="font-serif font-semibold tracking-wider text-[11px] sm:text-xs leading-none uppercase truncate max-h-[190px]"
            style={{
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              color: palette.text,
              textShadow: "0 1px 2px rgba(0,0,0,0.5)",
            }}
          >
            {book.title}
          </span>
        </div>

        {/* Author on Spine & Bottom Tailband */}
        <div className="w-full flex flex-col items-center pb-2.5">
          <span
            className="font-sans text-[9px] tracking-tight uppercase truncate max-w-[85%] text-center opacity-85 mb-1 font-medium"
            style={{ color: palette.accent }}
          >
            {book.author.split(" ")[0]}
          </span>
          <div
            className="w-[82%] h-[1.5px] opacity-45 mb-1"
            style={{ backgroundColor: palette.accent }}
          />
          <div
            className="w-[82%] h-[1.5px] opacity-45"
            style={{ backgroundColor: palette.accent }}
          />
        </div>

        {/* Subtle Spine Texture Highlight */}
        <div className="absolute inset-y-0 left-0 w-[4px] bg-gradient-to-r from-white/20 to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-[5px] bg-gradient-to-l from-black/40 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}
