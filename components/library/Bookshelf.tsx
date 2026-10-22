"use client";

import React, { useEffect, useRef } from "react";
import { IBook } from "@/types";
import BookSpine from "./BookSpine";

interface BookshelfProps {
  books: IBook[];
  selectedBook: IBook | null;
  onSelectBook: (book: IBook | null) => void;
}

export default function Bookshelf({
  books,
  selectedBook,
  onSelectBook,
}: BookshelfProps) {
  const shelfRef = useRef<HTMLDivElement>(null);

  // Arrow key navigation between book spines
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
          const nextIndex = currentIndex < books.length - 1 ? currentIndex + 1 : 0;
          onSelectBook(books[nextIndex]);
        } else if (e.key === "ArrowLeft") {
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : books.length - 1;
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
    <div className="w-full flex flex-col items-center select-none pt-4 pb-2">
      {/* Scrollable Books Spine Row */}
      <div
        ref={shelfRef}
        onWheel={handleWheel}
        className="w-full overflow-x-auto pb-0 px-4 sm:px-8 scrollbar-thin scrollbar-thumb-[#4A3525]/30 scroll-smooth"
      >
        <div className="min-w-fit flex items-end justify-center sm:justify-start gap-1 sm:gap-1.5 px-6 pt-28 pb-0">
          {books.map((book, index) => (
            <BookSpine
              key={book._id}
              book={book}
              index={index}
              totalBooks={books.length}
              isSelected={selectedBook?._id === book._id}
              onSelect={(b) =>
                onSelectBook(selectedBook?._id === b._id ? null : b)
              }
            />
          ))}
        </div>

        {/* The Realistic Wooden Bookshelf Ledge */}
        <div className="w-full min-w-fit flex flex-col shadow-2xl">
          {/* Top shelf edge with authentic wood highlight and bevel */}
          <div className="h-3.5 w-full bg-gradient-to-r from-[#4E3725] via-[#63442E] to-[#4E3725] border-t border-[#7D563B] shadow-[0_2px_4px_rgba(0,0,0,0.35)]" />
          {/* Shelf face with rich dark mahogany / walnut finish */}
          <div className="h-7 w-full bg-gradient-to-b from-[#342217] via-[#2A1B12] to-[#1C110A] shadow-[0_14px_28px_rgba(0,0,0,0.35)] flex items-center justify-center relative">
            <div className="w-full h-[1px] bg-white/10" />
            <div className="absolute bottom-0 inset-x-0 h-[1.5px] bg-black/40" />
          </div>
        </div>
      </div>
    </div>
  );
}
