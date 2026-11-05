"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { IBook, SourceCategoryType } from "@/types";
import BookSpine from "./BookSpine";
import {
  ShelfGroupingMode,
  ShelfBay,
  buildCoordinateShelfBays,
  CANONICAL_SPECIALTIES,
  FORMAT_META,
  classifyBookForShelf,
} from "@/lib/library/shelf-classifier";
import { updateBookShelfPlacement } from "@/lib/actions/book.actions";
import { toast } from "sonner";
import {
  FolderPlus,
  Sparkles,
  Layers,
  BookOpen,
  Check,
  X,
  Compass,
  ArrowRight,
} from "lucide-react";

interface BookshelfProps {
  books: IBook[];
  selectedBook: IBook | null;
  onSelectBook: (book: IBook | null) => void;
  onBookUpdated?: (updatedBook: IBook) => void;
  activeFilter?: string;
}

// 3D Fluted Carved Wooden Partition Wall Pillar Component
function WoodenPartitionPillar({ isBookend = false }: { isBookend?: boolean }) {
  return (
    <div
      className={`relative self-stretch flex flex-col items-center justify-between shrink-0 select-none z-10 ${
        isBookend ? "w-6 sm:w-8 mx-1" : "w-7 sm:w-9 mx-2 sm:mx-4"
      }`}
      aria-hidden="true"
    >
      {/* Ornate Wooden Capital / Pillar Head */}
      <div className="w-full h-5 bg-gradient-to-b from-[#25150b] via-[#3a2012] to-[#25150b] rounded-t-sm border-t border-[#5e381f] shadow-md flex items-center justify-center">
        <div className="w-4/5 h-[1.5px] bg-[#d4af37]/70" />
      </div>

      {/* Top Brass Collar Ring */}
      <div className="w-[92%] h-1 bg-gradient-to-r from-[#9e7a2b] via-[#e5c158] to-[#9e7a2b] border-y border-[#765415]/80 shadow-xs" />

      {/* Vertical Fluted Pillar Shaft with Deep Mahogany Wood Grain */}
      <div className="w-full flex-1 bg-gradient-to-r from-[#1c0f07] via-[#381f11] via-[#4a2b18] to-[#160c06] shadow-[inset_-3px_0_7px_rgba(0,0,0,0.8),inset_3px_0_7px_rgba(255,255,255,0.08)] flex justify-around px-1 py-3">
        {/* Fluting grooves in wood */}
        <div className="w-[2px] h-full bg-black/50 shadow-[1px_0_1px_rgba(255,255,255,0.05)]" />
        <div className="w-[2.5px] h-full bg-black/60 shadow-[1px_0_1px_rgba(255,255,255,0.07)]" />
        <div className="w-[2px] h-full bg-black/50 shadow-[1px_0_1px_rgba(255,255,255,0.05)]" />
      </div>

      {/* Bottom Brass Collar Ring */}
      <div className="w-[92%] h-1 bg-gradient-to-r from-[#9e7a2b] via-[#e5c158] to-[#9e7a2b] border-y border-[#765415]/80 shadow-xs" />

      {/* Ornate Wooden Base Plinth */}
      <div className="w-full h-6 bg-gradient-to-t from-[#160b05] via-[#2d180c] to-[#201008] rounded-b-sm border-b border-black/80 shadow-inner flex items-center justify-center">
        <div className="w-4/5 h-[1.5px] bg-[#6d4123]/80" />
      </div>
    </div>
  );
}

export default function Bookshelf({
  books,
  selectedBook,
  onSelectBook,
  onBookUpdated,
}: BookshelfProps) {
  const shelfRef = useRef<HTMLDivElement>(null);
  const [groupingMode, setGroupingMode] = useState<ShelfGroupingMode>("smart");
  const [isNewSectionModalOpen, setIsNewSectionModalOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [selectedBookIdsForSection, setSelectedBookIdsForSection] = useState<string[]>([]);
  const [isSubmittingSection, setIsSubmittingSection] = useState(false);

  // Build coordinate-locked shelf bays using the type-safe decision model
  const bays: ShelfBay[] = useMemo(() => {
    return buildCoordinateShelfBays(books, groupingMode);
  }, [books, groupingMode]);

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

  const handleCreateCustomSection = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newSectionName.trim();
    if (!trimmed) {
      toast.error("Please enter a section name");
      return;
    }
    if (selectedBookIdsForSection.length === 0) {
      toast.error("Please select at least one study source to place in this section");
      return;
    }

    setIsSubmittingSection(true);
    try {
      for (const bookId of selectedBookIdsForSection) {
        const res = await updateBookShelfPlacement(bookId, { customSection: trimmed });
        if (res.success && res.data && onBookUpdated) {
          onBookUpdated(res.data as IBook);
        }
      }
      toast.success(`Created section "${trimmed}" with ${selectedBookIdsForSection.length} volume(s)`);
      setIsNewSectionModalOpen(false);
      setNewSectionName("");
      setSelectedBookIdsForSection([]);
    } catch {
      toast.error("Failed to assign custom section");
    } finally {
      setIsSubmittingSection(false);
    }
  };

  const toggleBookSelectionForSection = (bookId: string) => {
    setSelectedBookIdsForSection((prev) =>
      prev.includes(bookId) ? prev.filter((id) => id !== bookId) : [...prev, bookId],
    );
  };

  return (
    <div className="w-full flex flex-col items-center select-none pt-1 pb-2">
      {/* Upper Architectural Mahogany Cornice & Grouping Switcher */}
      <div className="w-full bg-gradient-to-r from-[#2a170c] via-[#3d2314] to-[#2a170c] rounded-t-2xl border-t border-x border-[#613b20] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
        {/* Left: Classical Library Emblem */}
        <div className="flex items-center gap-2 text-[#e3c79b]">
          <Compass className="w-4 h-4 text-[#d4af37]" />
          <span
            style={{ fontFamily: "'IBM Plex Serif', Georgia, serif" }}
            className="text-xs sm:text-sm font-bold tracking-wider uppercase text-[#f3dfbd]"
          >
            Ascleon Grand Archives
          </span>
          <span className="text-[10px] text-[#a89078] hidden md:inline font-mono">
            • {books.length} Volume{books.length === 1 ? "" : "s"} across {bays.length} Bay{bays.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Right: Grouping Selector & New Section Action */}
        <div className="flex items-center gap-2">
          {/* Mode Switcher Tabs */}
          <div className="inline-flex rounded-lg bg-[#1c0f07]/80 p-0.5 border border-[#52331b]">
            <button
              type="button"
              onClick={() => setGroupingMode("smart")}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                groupingMode === "smart"
                  ? "bg-gradient-to-r from-[#d4af37] to-[#aa8323] text-[#221204] font-bold shadow-xs"
                  : "text-[#c2ab90] hover:text-[#f3dfbd]"
              }`}
              title="Automatic smart bays by Specialty & Source Type"
            >
              <Sparkles className="w-3 h-3" />
              <span>Smart Bays</span>
            </button>
            <button
              type="button"
              onClick={() => setGroupingMode("specialty")}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                groupingMode === "specialty"
                  ? "bg-gradient-to-r from-[#d4af37] to-[#aa8323] text-[#221204] font-bold shadow-xs"
                  : "text-[#c2ab90] hover:text-[#f3dfbd]"
              }`}
              title="Partition shelf bays strictly by Medical Specialty"
            >
              <Layers className="w-3 h-3" />
              <span>By Specialty</span>
            </button>
            <button
              type="button"
              onClick={() => setGroupingMode("format")}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                groupingMode === "format"
                  ? "bg-gradient-to-r from-[#d4af37] to-[#aa8323] text-[#221204] font-bold shadow-xs"
                  : "text-[#c2ab90] hover:text-[#f3dfbd]"
              }`}
              title="Partition shelf bays by format (Textbooks, Lectures, Clinical Sheets)"
            >
              <BookOpen className="w-3 h-3" />
              <span>By Source Type</span>
            </button>
          </div>

          {/* New Section Button */}
          <button
            type="button"
            onClick={() => {
              setSelectedBookIdsForSection(selectedBook ? [selectedBook._id] : []);
              setIsNewSectionModalOpen(true);
            }}
            className="px-2.5 py-1 text-[11px] font-semibold text-[#f5ebd7] bg-[#533017] hover:bg-[#6c401f] border border-[#834f27] rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
            title="Create a custom shelf section and put books in it"
          >
            <FolderPlus className="w-3.5 h-3.5 text-[#d4af37]" />
            <span className="hidden sm:inline">+ New Section</span>
          </button>
        </div>
      </div>

      {/* Scrollable Books Spine Row with Coordinate-Locked Architectural Wood Dividers & Plaques */}
      <div
        ref={shelfRef}
        onWheel={handleWheel}
        className="w-full overflow-x-auto pb-0 px-1 sm:px-2 scrollbar-thin scrollbar-thumb-[#4A3525]/40 scroll-smooth bg-[#1f1007]/40 rounded-b-2xl border-x border-b border-[#52331b]"
      >
        <div className="min-w-fit flex items-stretch justify-start sm:justify-start pt-14 pb-0 relative">
          {/* Leftmost Outer Framing Bookend Pillar */}
          <WoodenPartitionPillar isBookend />

          {bays.map((bay, bayIdx) => (
            <React.Fragment key={`bay-fragment-${bay.key}-${bayIdx}`}>
              {/* Divider Pillar Between Internal Bays */}
              {bayIdx > 0 && <WoodenPartitionPillar />}

              {/* Coordinate-Locked Bay Column: Header Tag + Spines + Ledge Plaque */}
              <div className="flex flex-col items-center justify-between min-w-[240px] px-2 sm:px-4 flex-1">
                {/* Upper Recessed Bay Title Ribbon */}
                <div className="w-full flex items-center justify-between mb-3 px-2 py-1 rounded-md bg-[#170c05]/60 border border-[#3f2412]/80 text-[#d8c2a7]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: bay.accentColor }}
                    />
                    <span
                      style={{ fontFamily: "'IBM Plex Serif', Georgia, serif" }}
                      className="text-[11px] font-bold uppercase tracking-wider text-[#f3dfbd] truncate"
                    >
                      {bay.title}
                    </span>
                  </div>
                  <span
                    className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shadow-2xs shrink-0 font-mono"
                    style={{
                      backgroundColor: `${bay.accentColor}25`,
                      color: bay.accentColor,
                    }}
                  >
                    {bay.badgeLabel} • {bay.books.length} vol
                  </span>
                </div>

                {/* Spines Row inside this specific bay */}
                <div className="flex-1 w-full flex items-end justify-center sm:justify-start gap-1 sm:gap-1.5 pb-0 min-h-[310px]">
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

                {/* The Coordinate-Locked Mahogany Ledge & Engraved Brass Plaque Directly Under This Bay */}
                <div className="w-full flex flex-col mt-0 pt-0">
                  {/* Top beveled edge */}
                  <div className="h-4 w-full bg-gradient-to-r from-[#3c2517] via-[#593922] via-[#6a4428] to-[#3c2517] border-t-2 border-[#835634] shadow-[0_3px_6px_rgba(0,0,0,0.45)]" />

                  {/* Front Face with Bay Brass Plaque */}
                  <div className="w-full bg-gradient-to-b from-[#2c1a0f] via-[#22140b] to-[#150c07] shadow-[0_16px_32px_rgba(0,0,0,0.55)] py-2.5 px-3 flex items-center justify-center border-b-2 border-black/80 relative">
                    <div className="absolute top-0 inset-x-0 h-[1px] bg-white/10" />

                    {/* Engraved Vintage Brass Nameplate Plaque */}
                    <div className="relative px-3.5 py-1.5 rounded-[4px] bg-gradient-to-r from-[#9e7a2b] via-[#d6ad55] via-[#ffdf88] to-[#9e7a2b] border border-[#765415] shadow-[0_3px_8px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.7)] flex items-center justify-between gap-2.5 max-w-[94%]">
                      {/* Left Brass Screw */}
                      <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[#6a4c18] to-[#2d1f08] border border-[#caa14d]/70 shadow-inner flex items-center justify-center shrink-0">
                        <div className="w-1.5 h-[0.75px] bg-[#d6ad55] rotate-45" />
                      </div>

                      {/* Engraved Text */}
                      <div className="flex flex-col items-center text-center px-1 min-w-0">
                        <span
                          style={{ fontFamily: "'IBM Plex Serif', Georgia, serif" }}
                          className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.14em] text-[#2c1c06] drop-shadow-[0_1px_0_rgba(255,255,255,0.4)] truncate max-w-[210px] sm:max-w-[280px]"
                        >
                          ✦ {bay.title} ✦
                        </span>
                        <span className="text-[8px] font-medium tracking-[0.06em] text-[#543b12] drop-shadow-[0_0.5px_0_rgba(255,255,255,0.3)] truncate max-w-[220px]">
                          {bay.subTitle}
                        </span>
                      </div>

                      {/* Right Brass Screw */}
                      <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[#6a4c18] to-[#2d1f08] border border-[#caa14d]/70 shadow-inner flex items-center justify-center shrink-0">
                        <div className="w-1.5 h-[0.75px] bg-[#d6ad55] -rotate-45" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </React.Fragment>
          ))}

          {/* Rightmost Outer Framing Bookend Pillar */}
          <WoodenPartitionPillar isBookend />
        </div>
      </div>

      {/* Modal: Create New Custom Section & Reassign Books */}
      {isNewSectionModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsNewSectionModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[#25160d] border-2 border-[#7c4d29] rounded-2xl shadow-2xl p-6 text-[#f5ebd7] relative animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setIsNewSectionModalOpen(false)}
              className="absolute top-4 right-4 text-[#a89078] hover:text-[#f3dfbd] p-1 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-2.5 mb-4 border-b border-[#52331b] pb-3">
              <FolderPlus className="w-5 h-5 text-[#d4af37]" />
              <h3
                style={{ fontFamily: "'IBM Plex Serif', Georgia, serif" }}
                className="text-base font-bold tracking-wide text-[#f3dfbd]"
              >
                Create Custom Shelf Bay
              </h3>
            </div>

            <form onSubmit={handleCreateCustomSection} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#d4af37] mb-1.5">
                  Section Name:
                </label>
                <input
                  type="text"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  placeholder="e.g. Cardiology Lectures, MRCP Part 1, Ward Rotations..."
                  className="w-full px-3 py-2 rounded-lg bg-[#150c06] border border-[#6b4222] text-sm text-[#f5ebd7] placeholder-[#8c745e] focus:outline-hidden focus:border-[#d4af37] transition-colors"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#d4af37] mb-1.5">
                  Select Books & Lectures to Put Here ({selectedBookIdsForSection.length} selected):
                </label>
                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-[#4A3525]">
                  {books.map((b) => {
                    const isChecked = selectedBookIdsForSection.includes(b._id);
                    const coords = classifyBookForShelf(b);
                    return (
                      <div
                        key={b._id}
                        onClick={() => toggleBookSelectionForSection(b._id)}
                        className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                          isChecked
                            ? "bg-[#52331b]/60 border-[#d4af37] text-white"
                            : "bg-[#180d07] border-[#442714] text-[#cfbeaa] hover:bg-[#25150c]"
                        }`}
                      >
                        <div className="flex flex-col min-w-0 mr-2">
                          <span className="font-semibold truncate">{b.title}</span>
                          <span className="text-[10px] text-[#a89078] flex items-center gap-1">
                            <span>{coords.displaySpecialty}</span>
                            <span>•</span>
                            <span>{coords.displayFormat}</span>
                          </span>
                        </div>
                        <div
                          className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                            isChecked
                              ? "bg-[#d4af37] border-[#d4af37] text-black"
                              : "border-[#6b4222]"
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#52331b] mt-1">
                <button
                  type="button"
                  onClick={() => setIsNewSectionModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-[#6b4222] text-xs font-medium text-[#c4af96] hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSection}
                  className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-[#d4af37] to-[#aa8323] text-[#221204] text-xs font-bold hover:brightness-110 transition-all flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isSubmittingSection ? "Saving Bay..." : "Place on Shelf"}
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
