"use client";

import React, { useMemo, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { IBook, ReadingStatus } from "@/types";
import {
  getBookReadingTime,
  getBookYear,
  cn,
} from "@/lib/utils";
import {
  BookOpen,
  Mic,
  Star,
  X,
  Clock,
  Calendar,
  Layers,
} from "lucide-react";
import {
  toggleBookFavorite,
  updateBookReadingStatus,
} from "@/lib/actions/book.actions";
import { toast } from "sonner";

interface ExLibrisCardProps {
  book: IBook;
  onClose: () => void;
  index: number;
}

export default function ExLibrisCard({
  book,
  onClose,
  index,
}: ExLibrisCardProps) {
  const [isPending, startTransition] = useTransition();
  const [isFavorite, setIsFavorite] = React.useState(Boolean(book.isFavorite));
  const [readingStatus, setReadingStatus] = React.useState<ReadingStatus>(
    book.readingStatus || "not_started",
  );

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ex-libris-title"
      className="w-full max-w-xl mx-auto bg-[#FDFBF7] border-2 border-[#D8C7B0] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] p-6 sm:p-8 relative font-serif text-[#2B261F] animate-in fade-in zoom-in-95 duration-200"
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close book card"
        className="absolute top-4 right-4 text-[#8C7A68] hover:text-[#212A3B] p-1.5 rounded-full hover:bg-[#EFE8DD] transition-colors cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Ex Libris Header Stamp */}
      <div className="flex flex-col items-center border-b border-[#D8C7B0] pb-4 mb-6 text-center">
        <span className="text-[11px] font-sans font-bold tracking-[0.25em] text-[#8C3A2B] uppercase">
          ✦ EX LIBRIS ✦
        </span>
        <h4 className="text-xs uppercase tracking-wider text-[#6B5E50] mt-1 font-sans">
          A Bookify Companion
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
              {topic}
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

      {/* Reading Status Selector */}
      <div className="mt-6 pt-4 border-t border-[#E8DCCB] flex flex-wrap items-center justify-between gap-3">
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

        {/* Favorite Button */}
        <button
          type="button"
          disabled={isPending}
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
      </div>

      {/* Action Buttons */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 font-sans">
        <Link
          href={`/books/${book.slug}`}
          className="flex items-center justify-center gap-2 bg-[#212A3B] hover:bg-[#323E53] text-white font-medium py-2.5 px-4 rounded-xl text-sm transition-all shadow-sm text-center"
        >
          <BookOpen className="w-4 h-4" />
          <span>Read & Study</span>
        </Link>

        <Link
          href={`/books/${book.slug}#voice`}
          className="flex items-center justify-center gap-2 bg-[#8B3A2B] hover:bg-[#A34433] text-white font-medium py-2.5 px-4 rounded-xl text-sm transition-all shadow-sm text-center"
        >
          <Mic className="w-4 h-4" />
          <span>Voice Discussion</span>
        </Link>
      </div>
    </div>
  );
}
