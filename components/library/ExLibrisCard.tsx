"use client";

import React, { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { IBook, ReadingStatus, SourceCategoryType } from "@/types";
import {
  getBookReadingTime,
  getBookYear,
  cn,
} from "@/lib/utils";
import {
  BookOpen,
  Star,
  X,
  Clock,
  Calendar,
  Layers,
  Trash2,
  FolderPlus,
  Edit3,
  Check,
  Compass,
} from "lucide-react";
import {
  toggleBookFavorite,
  updateBookReadingStatus,
  deleteBook,
  updateBookShelfPlacement,
} from "@/lib/actions/book.actions";
import {
  classifyBookForShelf,
  CANONICAL_SPECIALTIES,
  FORMAT_META,
} from "@/lib/library/shelf-classifier";
import { toast } from "sonner";

interface ExLibrisCardProps {
  book: IBook;
  onClose: () => void;
  index: number;
  onDeleted?: (bookId: string) => void;
  onUpdated?: (updatedBook: IBook) => void;
}

export default function ExLibrisCard({
  book,
  onClose,
  index,
  onDeleted,
  onUpdated,
}: ExLibrisCardProps) {
  const [isPending, startTransition] = useTransition();
  const [isFavorite, setIsFavorite] = React.useState(Boolean(book.isFavorite));
  const [readingStatus, setReadingStatus] = React.useState<ReadingStatus>(
    book.readingStatus || "not_started",
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Shelf Placement State
  const initialCoords = useMemo(() => classifyBookForShelf(book), [book]);
  const [isEditingPlacement, setIsEditingPlacement] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<SourceCategoryType>(
    (book.sourceCategory as SourceCategoryType) || initialCoords.sourceCategory,
  );
  const [customSectionInput, setCustomSectionInput] = useState<string>(
    book.customSection || "",
  );
  const [selectedTopic, setSelectedTopic] = useState<string>(
    book.topic || initialCoords.displaySpecialty,
  );
  const [isSavingPlacement, setIsSavingPlacement] = useState(false);

  const [savedProgress, setSavedProgress] = React.useState<{
    lastStudiedPage: number;
    totalPages: number;
    progressPercent: number;
  } | null>(null);

  React.useEffect(() => {
    try {
      const localStr =
        localStorage.getItem(`ascleon_progress_${book.slug}`) ||
        localStorage.getItem(`ascleon_progress_${book._id}`);
      if (localStr) {
        const parsed = JSON.parse(localStr);
        if (parsed.lastStudiedPage && parsed.lastStudiedPage > 1) {
          setSavedProgress({
            lastStudiedPage: parsed.lastStudiedPage,
            totalPages: parsed.totalPages || 1,
            progressPercent: parsed.progressPercent || 0,
          });
        }
      }
    } catch { }
  }, [book.slug, book._id]);

  const readingTime = getBookReadingTime(book);
  const year = getBookYear(book);
  const topic = book.topic || "General";
  const catalogNumber = String(index + 1).padStart(3, "0");

  const shelvedDate = useMemo(() => {
    if (!book.createdAt) return "Recently";
    try {
      return new Date(book.createdAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "Recently";
    }
  }, [book.createdAt]);

  const handleToggleFavorite = () => {
    startTransition(async () => {
      const result = await toggleBookFavorite(book._id);
      if (result.success) {
        setIsFavorite(Boolean(result.isFavorite));
        toast.success(
          result.isFavorite ? "Added to favourites" : "Removed from favourites",
        );
      } else {
        toast.error("Failed to update favourite");
      }
    });
  };

  const handleStatusChange = (status: ReadingStatus) => {
    setReadingStatus(status);
    startTransition(async () => {
      const result = await updateBookReadingStatus(book._id, status);
      if (result.success) {
        toast.success(`Reading status: ${status.replace("_", " ")}`);
      } else {
        toast.error("Failed to update reading status");
      }
    });
  };

  const handleDeleteBook = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteBook(book._id);
      if (result.success) {
        toast.success(`"${book.title}" removed from library`);
        onDeleted?.(book._id);
        onClose();
      } else {
        toast.error(result.error || "Failed to remove book");
      }
    } catch {
      toast.error("Failed to remove book");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleSaveShelfPlacement = async () => {
    setIsSavingPlacement(true);
    try {
      const trimmedCustom = customSectionInput.trim() || null;
      const res = await updateBookShelfPlacement(book._id, {
        sourceCategory: selectedFormat,
        topic: selectedTopic.trim() || undefined,
        customSection: trimmedCustom,
      });

      if (res.success && res.data) {
        toast.success("Shelf placement updated");
        onUpdated?.(res.data as IBook);
        setIsEditingPlacement(false);
      } else {
        toast.error(res.error || "Failed to update placement");
      }
    } catch {
      toast.error("Error updating shelf placement");
    } finally {
      setIsSavingPlacement(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ex-libris-title"
      className="w-full max-w-xl mx-auto bg-[#FDFBF7] border-2 border-[#D8C7B0] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] p-6 sm:p-8 relative font-serif text-[#2B261F] animate-in fade-in zoom-in-95 duration-200"
    >
      {/* Top action buttons */}
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setShowDeleteConfirm((prev) => !prev)}
          aria-label="Remove book from library"
          title="Remove from library"
          className="text-[#8C7A68] hover:text-rose-600 p-1.5 rounded-full hover:bg-rose-50 transition-colors cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close book card"
          className="text-[#8C7A68] hover:text-[#212A3B] p-1.5 rounded-full hover:bg-[#EFE8DD] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Delete Confirmation Banner */}
      {showDeleteConfirm && (
        <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-3 text-xs font-sans text-rose-900 animate-in fade-in duration-150">
          <div className="flex items-center gap-2 min-w-0">
            <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-semibold truncate">
              Remove &ldquo;{book.title}&rdquo; from library?
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setShowDeleteConfirm(false)}
              className="px-2.5 py-1 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-medium transition-colors cursor-pointer text-[11px]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDeleteBook}
              className="px-2.5 py-1 rounded-md bg-rose-600 text-white hover:bg-rose-700 font-bold transition-colors cursor-pointer text-[11px] flex items-center gap-1"
            >
              {isDeleting ? "Removing..." : "Remove"}
            </button>
          </div>
        </div>
      )}

      {/* Ex Libris Header Stamp */}
      <div className="flex flex-col items-center border-b border-[#D8C7B0] pb-4 mb-6 text-center">
        <span className="text-[11px] font-sans font-bold tracking-[0.25em] text-[#8C3A2B] uppercase">
          ✦ EX LIBRIS ✦
        </span>
        <h4 className="text-xs uppercase tracking-wider text-[#6B5E50] mt-1 font-sans">
          An Ascleon Companion
        </h4>
        <div className="flex items-center gap-2 text-[11px] text-[#8C7A68] font-sans mt-1.5">
          <span>No. {catalogNumber}</span>
          <span>•</span>
          <span>Shelved {shelvedDate}</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col sm:flex-row gap-6 items-start">
        {/* Book Cover / Thumbnail if present */}
        {book.coverURL && (
          <div className="flex-shrink-0 w-28 sm:w-32 rounded-lg overflow-hidden border border-[#D8C7B0] shadow-md mx-auto sm:mx-0">
            <Image
              src={book.coverURL}
              alt={book.title}
              width={140}
              height={200}
              className="w-full h-auto object-cover"
            />
          </div>
        )}

        {/* Book Details */}
        <div className="flex-1 flex flex-col gap-2.5 text-center sm:text-left">
          {/* Metadata pill row */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-xs font-sans text-[#736353]">
            <span className="inline-flex items-center gap-1 bg-[#EFE8DD] px-2.5 py-0.5 rounded-full font-medium text-[#4A3F35]">
              <Layers className="w-3 h-3 text-[#8B3A2B]" />
              {initialCoords.displaySpecialty}
            </span>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-2xs"
              style={{
                backgroundColor: `${initialCoords.formatMeta.accentColor}20`,
                color: initialCoords.formatMeta.accentColor,
              }}
            >
              {initialCoords.displayFormat}
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {year}
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {readingTime} min read
            </span>
          </div>

          {/* Title & Author */}
          <h3
            id="ex-libris-title"
            className="text-xl sm:text-2xl font-bold font-serif text-[#1C160F] leading-tight"
          >
            {book.title}
          </h3>
          <p className="text-sm font-sans text-[#6B5E50] font-medium">
            by <span className="text-[#1C160F]">{book.author}</span>
          </p>

          {/* Summary / Hook Quote */}
          <p className="text-xs sm:text-sm text-[#4E443B] italic leading-relaxed pt-1 line-clamp-3">
            {book.summary ||
              book.persona ||
              `A remarkable work exploring ${topic.toLowerCase()}. Engage in direct dialogue with the concepts and explore ideas in real-time.`}
          </p>
        </div>
      </div>

      {/* Shelf Bay & Placement Configuration Section */}
      <div className="mt-5 p-3.5 bg-[#F4EDE2] border border-[#D8C7B0] rounded-xl font-sans">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#8C3A2B]" />
            <span className="text-xs font-bold text-[#3B2F25] uppercase tracking-wider">
              Shelf Section Placement
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsEditingPlacement((prev) => !prev)}
            className="text-xs text-[#8C3A2B] font-semibold flex items-center gap-1 hover:underline cursor-pointer"
          >
            <Edit3 className="w-3 h-3" />
            <span>{isEditingPlacement ? "Close Editor" : "Change Section"}</span>
          </button>
        </div>

        {!isEditingPlacement ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#5C4D3E]">
            <span>Current Bay:</span>
            <span className="font-semibold text-[#1C160F] bg-white/70 px-2 py-0.5 rounded border border-[#D8C7B0]">
              {book.customSection ? `✦ Section: ${book.customSection}` : initialCoords.displaySpecialty}
            </span>
            <span>•</span>
            <span className="font-medium text-[#7C5A35]">
              Format: {initialCoords.displayFormat}
            </span>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3 pt-2 border-t border-[#D8C7B0]/60 animate-in fade-in duration-150">
            {/* 1. Source Format Picker */}
            <div>
              <label className="block text-[11px] font-bold text-[#5C4D3E] mb-1">
                Source Format:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
                {(
                  [
                    { id: "textbook", label: "Textbook" },
                    { id: "lecture_notes", label: "Lecture / Notes" },
                    { id: "clinical_sheet", label: "Clinical Sheet" },
                    { id: "guideline_paper", label: "Guideline" },
                    { id: "exam_review", label: "Exam Review" },
                  ] as const
                ).map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => setSelectedFormat(fmt.id)}
                    className={cn(
                      "px-2 py-1 rounded-md text-[11px] border font-medium transition-all text-left truncate cursor-pointer",
                      selectedFormat === fmt.id
                        ? "bg-[#212A3B] text-white border-[#212A3B] shadow-xs"
                        : "bg-white text-[#5C4D3E] border-[#D8C7B0] hover:bg-[#EFE8DD]",
                    )}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Custom Section Placement */}
            <div>
              <label className="block text-[11px] font-bold text-[#5C4D3E] mb-1">
                Custom Shelf Section (creates dedicated wooden divider bay):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customSectionInput}
                  onChange={(e) => setCustomSectionInput(e.target.value)}
                  placeholder="e.g. Cardiology Lectures, MRCP Part 1, Ward Rotations..."
                  className="flex-1 px-2.5 py-1.5 rounded-md bg-white border border-[#D8C7B0] text-xs text-[#1C160F] placeholder-[#8C7A68] focus:outline-hidden focus:border-[#8C3A2B]"
                />
                {customSectionInput && (
                  <button
                    type="button"
                    onClick={() => setCustomSectionInput("")}
                    className="text-[10px] text-gray-500 hover:text-black underline cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="text-[10px] text-[#7C6C5C] mt-1 italic">
                Leave blank to automatically group by Specialty ({initialCoords.specialtyMeta.badge}).
              </p>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                disabled={isSavingPlacement}
                onClick={handleSaveShelfPlacement}
                className="px-3 py-1 rounded-md bg-[#8C3A2B] hover:bg-[#722F23] text-white text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-3 h-3" />
                <span>{isSavingPlacement ? "Updating..." : "Save Placement"}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reading Status Selector */}
      <div className="mt-5 pt-4 border-t border-[#E8DCCB] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-sans font-medium text-[#6B5E50]">
          <span>Reading status:</span>
          <div className="inline-flex rounded-lg border border-[#D8C7B0] p-0.5 bg-[#EFE8DD]">
            {(
              [
                { id: "not_started", label: "Not started" },
                { id: "in_progress", label: "In progress" },
                { id: "read", label: "Completed" },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                disabled={isPending}
                onClick={() => handleStatusChange(st.id)}
                className={cn(
                  "px-2.5 py-1 text-[11px] rounded-md transition-all font-medium cursor-pointer",
                  readingStatus === st.id
                    ? "bg-[#212A3B] text-white shadow-xs"
                    : "text-[#6B5E50] hover:text-[#212A3B]",
                )}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Favorite Button */}
          <button
            type="button"
            disabled={isPending || isDeleting}
            onClick={handleToggleFavorite}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-sans font-medium transition-colors cursor-pointer",
              isFavorite
                ? "bg-[#A04000]/10 border-[#A04000] text-[#A04000]"
                : "border-[#D8C7B0] text-[#6B5E50] hover:bg-[#EFE8DD]",
            )}
          >
            <Star className={cn("w-3.5 h-3.5", isFavorite && "fill-current")} />
            <span>{isFavorite ? "Favorited" : "Favorite"}</span>
          </button>

          {/* Remove Button */}
          <button
            type="button"
            disabled={isPending || isDeleting}
            onClick={() => setShowDeleteConfirm((prev) => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D8C7B0] text-[#6B5E50] hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 text-xs font-sans font-medium transition-colors cursor-pointer"
            title="Remove from library"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove</span>
          </button>
        </div>
      </div>

      {/* Action Button */}
      <div className="mt-5 pt-2 font-sans">
        {savedProgress && savedProgress.lastStudiedPage > 1 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-[#6B5E50] font-medium">
              <span>Continue from Page {savedProgress.lastStudiedPage} of {savedProgress.totalPages}</span>
              <span className="font-bold text-[#A04000]">{savedProgress.progressPercent}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E8DCCB]">
              <div
                className="h-full bg-[#A04000] transition-all duration-500 ease-out"
                style={{ width: `${savedProgress.progressPercent}%` }}
              />
            </div>
            <Link
              href={`/books/${book.slug}`}
              className="mt-1 flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-[color:var(--ink)] bg-[color:var(--ink)] px-5 py-3 text-center text-sm font-bold text-[color:var(--cream)] shadow-chip transition-all hover:bg-[#232029] active:scale-[0.99]"
            >
              <BookOpen className="h-4 w-4" />
              <span>Resume Studying (p. {savedProgress.lastStudiedPage})</span>
            </Link>
          </div>
        ) : (
          <Link
            href={`/books/${book.slug}`}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-[color:var(--ink)] bg-[color:var(--ink)] px-5 py-3 text-center text-sm font-bold text-[color:var(--cream)] shadow-chip transition-all hover:bg-[#232029] active:scale-[0.99]"
          >
            <BookOpen className="h-4 w-4" />
            <span>Open Study Space</span>
          </Link>
        )}
      </div>
    </div>
  );
}
