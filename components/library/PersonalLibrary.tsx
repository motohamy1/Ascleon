"use client";

import React, { useState, useMemo } from "react";
import { IBook } from "@/types";
import LibraryStats from "./LibraryStats";
import ViewControls, { ViewMode, FilterType } from "./ViewControls";
import Bookshelf from "./Bookshelf";
import ExLibrisCard from "./ExLibrisCard";
import BookCard from "@/components/BookCard";
import { getBookReadingTime } from "@/lib/utils";
import { updateBookShelfPlacement } from "@/lib/actions/book.actions";
import { classifyBookForShelf } from "@/lib/library/shelf-classifier";
import { BookDashed, FolderPlus, Check, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";

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
  const [isNewCategoryModalOpen, setIsNewCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedBookIdsForCategory, setSelectedBookIdsForCategory] = useState<string[]>([]);
  const [isSavingCategory, setIsSavingCategory] = useState(false);

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

  // Compute user-created custom categories with counts
  const customCategories = useMemo(() => {
    const map = new Map<string, number>();
    books.forEach((b) => {
      const cat = b.customSection?.trim();
      if (cat) {
        map.set(cat, (map.get(cat) || 0) + 1);
      }
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [books]);

  // Compute unique topics with count (exclude generic "General")
  const topics = useMemo(() => {
    const map = new Map<string, number>();
    books.forEach((b) => {
      const topic = b.topic?.trim();
      if (topic && topic.toLowerCase() !== "general") {
        map.set(topic, (map.get(topic) || 0) + 1);
      }
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

      if (activeFilter.startsWith("custom_")) {
        const targetCategory = activeFilter.slice("custom_".length);
        return (book.customSection?.trim() || "") === targetCategory;
      }

      return (book.topic?.trim() || "General") === activeFilter;
    });
  }, [books, activeFilter]);

  const handleOpenNewCategory = () => {
    setSelectedBookIdsForCategory(selectedBook ? [selectedBook._id] : []);
    setNewCategoryName("");
    setIsNewCategoryModalOpen(true);
  };

  const handleCreateCustomCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      toast.error("Please enter a category name");
      return;
    }
    if (selectedBookIdsForCategory.length === 0) {
      toast.error("Please select at least one book or lecture for this category");
      return;
    }

    setIsSavingCategory(true);
    try {
      for (const bookId of selectedBookIdsForCategory) {
        const res = await updateBookShelfPlacement(bookId, { customSection: trimmed });
        if (res.success && res.data) {
          handleBookUpdated(res.data as IBook);
        }
      }
      toast.success(`Saved category "${trimmed}" with ${selectedBookIdsForCategory.length} item(s)`);
      setIsNewCategoryModalOpen(false);
      setNewCategoryName("");
      setSelectedBookIdsForCategory([]);
    } catch {
      toast.error("Failed to create custom category");
    } finally {
      setIsSavingCategory(false);
    }
  };

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
        customCategories={customCategories}
        onOpenNewCategory={handleOpenNewCategory}
        totalCount={books.length}
        favoritesCount={favoritesCount}
        inProgressCount={inProgressCount}
        quickReadsCount={quickReadsCount}
        categoryCounts={categoryCounts}
      />

      {/* 3. Main Views: Shelf or Grid */}
      {filteredBooks.length > 0 ? (
        viewMode === "shelf" ? (
          <div className="relative w-full p-1 sm:p-2">
            <Bookshelf
              books={filteredBooks}
              selectedBook={selectedBook}
              onSelectBook={setSelectedBook}
              onBookUpdated={handleBookUpdated}
              onOpenNewCategory={handleOpenNewCategory}
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
      {/* 5. Create Custom Category Modal */}
      {isNewCategoryModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsNewCategoryModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[#FAF4EB] border-2 border-[#D8CBB8] rounded-2xl shadow-2xl p-6 text-[#2c1c06] relative animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsNewCategoryModalOpen(false)}
              className="absolute top-4 right-4 text-[#7A7267] hover:text-[#2c1c06] p-1 rounded-full hover:bg-black/5 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4 border-b border-[#E2D7C5] pb-3">
              <FolderPlus className="w-5 h-5 text-[#ff4c00]" />
              <h3
                style={{ fontFamily: "'IBM Plex Serif', Georgia, serif" }}
                className="text-base font-bold tracking-wide text-[#212A3B]"
              >
                Create Custom Category
              </h3>
            </div>

            <form onSubmit={handleCreateCustomCategory} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#524B43] mb-1.5">
                  Category Name
                </label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Cardiology Lectures, MRCP Part 1, Surgery..."
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#D8CBB8] text-sm text-[#212A3B] placeholder-[#9B8E7E] focus:outline-hidden focus:border-[#ff4c00] transition-colors"
                  autoFocus
                />
                {customCategories.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {customCategories.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => setNewCategoryName(c.name)}
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#EFE8DD] text-[#533017] border border-[#D8CBB8] hover:bg-[#E5DCCF] cursor-pointer"
                      >
                        + {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#524B43] mb-1.5">
                  Select Books &amp; Lectures ({selectedBookIdsForCategory.length} selected)
                </label>
                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                  {books.map((b) => {
                    const isChecked = selectedBookIdsForCategory.includes(b._id);
                    const coords = classifyBookForShelf(b);
                    return (
                      <div
                        key={b._id}
                        onClick={() =>
                          setSelectedBookIdsForCategory((prev) =>
                            prev.includes(b._id)
                              ? prev.filter((id) => id !== b._id)
                              : [...prev, b._id],
                          )
                        }
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          isChecked
                            ? "bg-[#212A3B]/5 border-[#ff4c00] text-[#212A3B]"
                            : "bg-white border-[#E2D7C5] text-[#524B43] hover:bg-[#F8F4EE]"
                        }`}
                      >
                        <div className="flex flex-col min-w-0 mr-2">
                          <span className="font-semibold truncate">{b.title}</span>
                          <span className="text-[10px] text-[#7A7267] flex items-center gap-1">
                            <span>{coords.displaySpecialty}</span>
                            <span>•</span>
                            <span>{coords.displayFormat}</span>
                          </span>
                        </div>
                        <div
                          className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                            isChecked
                              ? "bg-[#ff4c00] border-[#ff4c00] text-white"
                              : "border-[#C4B7A6]"
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2D7C5] mt-1">
                <button
                  type="button"
                  onClick={() => setIsNewCategoryModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl border border-[#D8CBB8] text-xs font-medium text-[#524B43] hover:bg-black/5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCategory}
                  className="px-4 py-1.5 rounded-xl bg-[#ff4c00] text-white text-xs font-bold hover:brightness-110 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isSavingCategory ? "Saving..." : "Save Category"}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
