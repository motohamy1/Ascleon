"use client";

import React, { useEffect, useRef, useMemo } from "react";
import { IBook, SourceCategoryType } from "@/types";
import BookSpine from "./BookSpine";

interface BookshelfProps {
  books: IBook[];
  selectedBook: IBook | null;
  onSelectBook: (book: IBook | null) => void;
  activeFilter?: string;
}

interface ShelfBay {
  category: SourceCategoryType | "general";
  title: string;
  subTitle: string;
  books: IBook[];
}

const CATEGORY_META: Record<
  SourceCategoryType | "general",
  { title: string; subTitle: string }
> = {
  textbook: {
    title: "REFERENCE TEXTBOOKS",
    subTitle: "COMPREHENSIVE TREATISES & CLINICAL REFERENCES",
  },
  lecture_notes: {
    title: "LECTURES & HANDOUTS",
    subTitle: "FACULTY SLIDES & UNIVERSITY SYLLABI",
  },
  clinical_sheet: {
    title: "CLINICAL SHEETS & PROTOCOLS",
    subTitle: "BEDSIDE ALGORITHMS & POCKET GUIDES",
  },
  guideline_paper: {
    title: "GUIDELINES & EVIDENCE",
    subTitle: "CONSENSUS PAPERS & CLINICAL TRIALS",
  },
  exam_review: {
    title: "HIGH-YIELD & EXAM RECALL",
    subTitle: "RAPID REVISION & BOARD PREPARATION",
  },
  general: {
    title: "GENERAL MEDICAL LIBRARY",
    subTitle: "CURATED VOLUMES & CLINICAL TEXTS",
  },
};

export default function Bookshelf({
  books,
  selectedBook,
  onSelectBook,
}: BookshelfProps) {
  const shelfRef = useRef<HTMLDivElement>(null);

  // Group books into bays by their type-safe source category
  const bays: ShelfBay[] = useMemo(() => {
    if (books.length === 0) return [];

    const categoryOrder: (SourceCategoryType | "general")[] = [
      "textbook",
      "lecture_notes",
      "clinical_sheet",
      "guideline_paper",
      "exam_review",
    ];

    const map = new Map<SourceCategoryType | "general", IBook[]>();

    books.forEach((book) => {
      const cat = (book.sourceCategory as SourceCategoryType) || "textbook";
      if (!map.has(cat)) {
        map.set(cat, []);
      }
      map.get(cat)!.push(book);
    });

    const result: ShelfBay[] = [];

    // Push bays in canonical academic order
    categoryOrder.forEach((cat) => {
      const catBooks = map.get(cat);
      if (catBooks && catBooks.length > 0) {
        result.push({
          category: cat,
          title: CATEGORY_META[cat]?.title || "ACADEMIC SHELF",
          subTitle: CATEGORY_META[cat]?.subTitle || "CURATED VOLUMES",
          books: catBooks,
        });
      }
    });

    // Any books that didn't match the standard 5 categories
    for (const [cat, catBooks] of map.entries()) {
      if (!categoryOrder.includes(cat) && catBooks.length > 0) {
        result.push({
          category: "general",
          title: CATEGORY_META.general.title,
          subTitle: CATEGORY_META.general.subTitle,
          books: catBooks,
        });
      }
    }

    // If only 1 bay exists or no category distinctions, return single bay
    return result.length > 0
      ? result
      : [
          {
            category: "general",
            title: CATEGORY_META.general.title,
            subTitle: CATEGORY_META.general.subTitle,
            books,
          },
        ];
  }, [books]);

  // Arrow key navigation between book spines across bays
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (books.length === 0) return;

      if (e.key === "Escape") {
        onSelectBook(null);
        return;
      }

      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const currentIndex = selectedBook
          ? books.findIndex((b) => b._id === selectedBook._id)
          : -1;

        if (e.key === "ArrowRight") {
          const nextIndex =
            currentIndex < books.length - 1 ? currentIndex + 1 : 0;
          onSelectBook(books[nextIndex]);
        } else if (e.key === "ArrowLeft") {
          const prevIndex =
            currentIndex > 0 ? currentIndex - 1 : books.length - 1;
          onSelectBook(books[prevIndex]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [books, selectedBook, onSelectBook]);

  // Support horizontal wheel scrolling when hovering over shelf
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (shelfRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      shelfRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <div className="w-full flex flex-col items-center select-none pt-2 pb-2">
      {/* Scrollable Books Spine Row with Architectural Wood Dividers */}
      <div
        ref={shelfRef}
        onWheel={handleWheel}
        className="w-full overflow-x-auto pb-0 px-2 sm:px-4 scrollbar-thin scrollbar-thumb-[#4A3525]/40 scroll-smooth"
      >
        <div className="min-w-fit flex items-end justify-center sm:justify-start pt-24 pb-0 relative">
          {bays.map((bay, bayIdx) => (
            <React.Fragment key={`bay-${bay.category}-${bayIdx}`}>
              {/* Vertical Carved Wooden Partition Wall Pillar (separates bays) */}
              {bayIdx > 0 && (
                <div className="relative self-stretch flex flex-col items-center justify-between mx-3 sm:mx-5 w-7 sm:w-9 shrink-0 select-none z-10">
                  {/* Ornate Wooden Capital / Pillar Head */}
                  <div className="w-full h-4 bg-gradient-to-b from-[#25150b] via-[#3a2012] to-[#25150b] rounded-t-sm border-t border-[#5e381f] shadow-md flex items-center justify-center">
                    <div className="w-4/5 h-[1.5px] bg-[#6d4123]/80" />
                  </div>

                  {/* Vertical Fluted Pillar Shaft */}
                  <div className="w-full flex-1 bg-gradient-to-r from-[#201108] via-[#3b2112] via-[#482917] to-[#1a0e07] shadow-[inset_-3px_0_6px_rgba(0,0,0,0.7),inset_3px_0_6px_rgba(255,255,255,0.08)] flex justify-around px-1 py-4">
                    {/* Fluting grooves in wood */}
                    <div className="w-[2px] h-full bg-black/40 shadow-[1px_0_1px_rgba(255,255,255,0.06)]" />
                    <div className="w-[2px] h-full bg-black/45 shadow-[1px_0_1px_rgba(255,255,255,0.06)]" />
                    <div className="w-[2px] h-full bg-black/40 shadow-[1px_0_1px_rgba(255,255,255,0.06)]" />
                  </div>

                  {/* Ornate Wooden Base Plinth */}
                  <div className="w-full h-5 bg-gradient-to-t from-[#1b0d06] via-[#311b0e] to-[#25140b] rounded-b-sm border-b border-black/80 shadow-inner flex items-center justify-center">
                    <div className="w-4/5 h-[1.5px] bg-[#6d4123]/60" />
                  </div>
                </div>
              )}

              {/* Bay Book Shelf Section */}
              <div className="flex flex-col items-center">
                {/* Book Spines in this bay */}
                <div className="flex items-end gap-1 sm:gap-1.5 px-3">
                  {bay.books.map((book, bIndex) => {
                    const globalIdx = books.findIndex((b) => b._id === book._id);
                    return (
                      <BookSpine
                        key={book._id}
                        book={book}
                        index={globalIdx >= 0 ? globalIdx : bIndex}
                        totalBooks={books.length}
                        isSelected={selectedBook?._id === book._id}
                        onSelect={(b) =>
                          onSelectBook(selectedBook?._id === b._id ? null : b)
                        }
                      />
                    );
                  })}
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* The Realistic Solid Mahogany Bookshelf Ledge & Engraved Brass Plaques */}
        <div className="w-full min-w-fit flex flex-col shadow-2xl mt-0">
          {/* Top shelf edge with authentic beveled wood grain highlight */}
          <div className="h-4 w-full bg-gradient-to-r from-[#3c2517] via-[#593922] via-[#6a4428] to-[#3c2517] border-t-2 border-[#835634] shadow-[0_3px_6px_rgba(0,0,0,0.45)]" />

          {/* Front Wooden Face with Engraved Brass Category Nameplates */}
          <div className="w-full bg-gradient-to-b from-[#2c1a0f] via-[#22140b] to-[#150c07] shadow-[0_16px_32px_rgba(0,0,0,0.55)] py-2.5 px-6 flex items-center justify-around gap-8 border-b-2 border-black/80 relative">
            <div className="absolute top-0 inset-x-0 h-[1px] bg-white/10" />

            {bays.map((bay, bIdx) => (
              <div
                key={`plaque-${bay.category}-${bIdx}`}
                className="flex items-center justify-center min-w-[200px] sm:min-w-[260px] max-w-[340px]"
              >
                {/* Engraved Vintage Brass Nameplate Plaque */}
                <div className="relative px-4 py-1.5 rounded-[4px] bg-gradient-to-r from-[#9e7a2b] via-[#d6ad55] via-[#ffdf88] to-[#9e7a2b] border border-[#765415] shadow-[0_3px_8px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.7)] flex items-center justify-between gap-3 group">
                  {/* Left Brass Screw */}
                  <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[#6a4c18] to-[#2d1f08] border border-[#caa14d]/70 shadow-inner flex items-center justify-center shrink-0">
                    <div className="w-1.5 h-[0.75px] bg-[#d6ad55] rotate-45" />
                  </div>

                  {/* Engraved Text */}
                  <div className="flex flex-col items-center text-center px-1">
                    <span
                      style={{ fontFamily: "'IBM Plex Serif', Georgia, serif" }}
                      className="text-[10px] sm:text-[11.5px] font-black uppercase tracking-[0.16em] text-[#2c1c06] drop-shadow-[0_1px_0_rgba(255,255,255,0.4)] whitespace-nowrap"
                    >
                      ✦ {bay.title} ✦
                    </span>
                    <span className="text-[8px] font-medium tracking-[0.08em] text-[#543b12] drop-shadow-[0_0.5px_0_rgba(255,255,255,0.3)] hidden sm:inline whitespace-nowrap">
                      {bay.subTitle}
                    </span>
                  </div>

                  {/* Right Brass Screw */}
                  <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[#6a4c18] to-[#2d1f08] border border-[#caa14d]/70 shadow-inner flex items-center justify-center shrink-0">
                    <div className="w-1.5 h-[0.75px] bg-[#d6ad55] -rotate-45" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
