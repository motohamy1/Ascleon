"use client";

import React, { useState, useMemo } from "react";
import { IBook } from "@/types";
import LibraryStats from "./LibraryStats";
import ViewControls, { ViewMode, FilterType } from "./ViewControls";
import Bookshelf from "./Bookshelf";
import ExLibrisCard from "./ExLibrisCard";
import BookCard from "@/components/BookCard";
import { getBookReadingTime } from "@/lib/utils";
import { BookDashed } from "lucide-react";

interface PersonalLibraryProps {
  initialBooks: IBook[];
}

export default function PersonalLibrary({
  initialBooks,
}: PersonalLibraryProps) {
  const [books, setBooks] = useState<IBook[]>(initialBooks);
  const [viewMode, setViewMode] = useState<ViewMode>("shelf");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [selectedBook, setSelectedBook] = useState<IBook | null>(null);

  React.useEffect(() => {
    setBooks(initialBooks);
  }, [initialBooks]);

  const handleBookDeleted = (deletedId: string) => {
    setBooks((prev) => prev.filter((b) => b._id !== deletedId));
    setSelectedBook(null);
  };

  const handleBookUpdated = (updatedBook: IBook) => {
    setBooks((prev) =>
      prev.map((b) => (b._id === updatedBook._id ? ({ ...b, ...updatedBook } as IBook) : b)),
    );
    setSelectedBook((prev) =>
      prev && prev._id === updatedBook._id ? ({ ...prev, ...updatedBook } as IBook) : prev,
    );
  };

  // Compute unique topics with count
  const topics = useMemo(() => {
    const map = new Map<string, number>();
    books.forEach((b) => {
      const topic = b.topic?.trim() || "General";
      map.set(topic, (map.get(topic) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [books]);

  // Counts for filters
  const favoritesCount = useMemo(
    () => books.filter((b) => b.isFavorite).length,
    [books],
  );

  const inProgressCount = useMemo(
    () => books.filter((b) => b.readingStatus === "in_progress").length,
    [books],
  );

  const quickReadsCount = useMemo(
    () => books.filter((b) => getBookReadingTime(b) <= 15).length,
    [books],
  );

  // Compute category counts for the 5 type-safe categories
  const categoryCounts = useMemo(() => {
    const counts = {
      textbook: 0,
      lecture_notes: 0,
      clinical_sheet: 0,
      guideline_paper: 0,
      exam_review: 0,
    };
    books.forEach((b) => {
      const cat = (b.sourceCategory as keyof typeof counts) || "textbook";
      if (counts[cat] !== undefined) {
        counts[cat]++;
      } else {
        counts.textbook++;
      }
    });
    return counts;
  }, [books]);

  // Filter books based on active filter
  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      if (activeFilter === "all") return true;
      if (activeFilter === "favorites") return Boolean(book.isFavorite);
      if (activeFilter === "reading_now")
        return book.readingStatus === "in_progress";
      if (activeFilter === "quick_reads")
        return getBookReadingTime(book) <= 15;

      // Type-safe source category filters
      if (activeFilter === "cat_textbook")
        return (book.sourceCategory || "textbook") === "textbook";
      if (activeFilter === "cat_lecture_notes")
        return book.sourceCategory === "lecture_notes";
      if (activeFilter === "cat_clinical_sheet")
        return book.sourceCategory === "clinical_sheet";
      if (activeFilter === "cat_guideline_paper")
        return book.sourceCategory === "guideline_paper";
      if (activeFilter === "cat_exam_review")
        return book.sourceCategory === "exam_review";

      return (book.topic?.trim() || "General") === activeFilter;
    });
  }, [books, activeFilter]);

  const selectedIndex = useMemo(() => {
    if (!selectedBook) return 0;
    return books.findIndex((b) => b._id === selectedBook._id);
  }, [books, selectedBook]);

  return (
    <div className="w-full flex flex-col gap-6">
      {/* 1. Library Statistics Ribbon */}
      <LibraryStats books={books} />

      {/* 2. View Mode Switcher and Filter Pills */}
      <ViewControls
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        topics={topics}
        totalCount={books.length}
        favoritesCount={favoritesCount}
        inProgressCount={inProgressCount}
        quickReadsCount={quickReadsCount}
        categoryCounts={categoryCounts}
      />

      {/* 3. Main Views: Shelf or Grid */}
      {filteredBooks.length > 0 ? (
        viewMode === "shelf" ? (
          <div className="relative w-full bg-[#EBE2D4]/50 border border-[#DDD1C0] rounded-3xl p-2 sm:p-6 shadow-inner">
            <Bookshelf
              books={filteredBooks}
              selectedBook={selectedBook}
              onSelectBook={setSelectedBook}
              onBookUpdated={handleBookUpdated}
            />
          </div>
        ) : (
          <div className="library-books-grid pt-2">
            {filteredBooks.map((book) => (
              <BookCard
                key={book._id}
                title={book.title}
                author={book.author}
                coverURL={book.coverURL}
                slug={book.slug}
                topic={book.topic}
                readingStatus={book.readingStatus}
                readingTimeMinutes={book.readingTimeMinutes}
                isFavorite={book.isFavorite}
                color={book.color}
                sourceCategory={book.sourceCategory}
                onDelete={() => setSelectedBook(book)}
              />
            ))}
          </div>
        )
      ) : (
        <div className="w-full bg-white/70 border border-dashed border-[#D5C7B5] rounded-2xl py-16 px-4 text-center flex flex-col items-center justify-center gap-3">
          <BookDashed className="w-10 h-10 text-[#8C7A68]" />
          <p className="text-base font-medium text-[#4A433A]">
            {books.length === 0
              ? "Your personal library is empty. Upload your first book using the upload button above!"
              : "No books found matching this filter"}
          </p>
          {books.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className="text-xs text-[#8B3A2B] font-semibold underline underline-offset-4 cursor-pointer hover:opacity-80"
            >
              Reset to all books
            </button>
          )}
        </div>
      )}

      {/* 4. Ex Libris Card Modal Backdrop */}
      {selectedBook && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setSelectedBook(null)}
        >
          <div
            className="w-full max-w-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <ExLibrisCard
              book={selectedBook}
              index={selectedIndex}
              onClose={() => setSelectedBook(null)}
              onDeleted={handleBookDeleted}
              onUpdated={handleBookUpdated}
            />
          </div>
        </div>
      )}
    </div>
  );
}
