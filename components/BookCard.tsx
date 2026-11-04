import { BookCardProps } from "@/types";
import Image from "next/image";
import Link from "next/link";
import React from "react";
import { Star, Clock, Trash2 } from "lucide-react";

const CATEGORY_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  textbook: { label: "TEXTBOOK", bg: "bg-[#663820]/10", text: "text-[#663820]" },
  lecture_notes: { label: "LECTURE", bg: "bg-[#2e6f68]/10", text: "text-[#2e6f68]" },
  clinical_sheet: { label: "CLINICAL", bg: "bg-[#ff4c00]/10", text: "text-[#ff4c00]" },
  guideline_paper: { label: "GUIDELINE", bg: "bg-[#a1156e]/10", text: "text-[#a1156e]" },
  exam_review: { label: "EXAM RECALL", bg: "bg-[#3d485e]/10", text: "text-[#3d485e]" },
};

const BookCard = ({
  title,
  author,
  coverURL,
  slug,
  topic,
  readingTimeMinutes,
  isFavorite,
  sourceCategory,
  onDelete,
}: BookCardProps) => {
  const catBadge = sourceCategory ? CATEGORY_LABELS[sourceCategory] : null;

  return (
    <div className="group block relative">
      <Link href={`/books/${slug}`} className="block">
        <article className="book-card relative transition-transform duration-200 group-hover:-translate-y-1">
          {/* Favorite badge */}
          {isFavorite && (
            <div className="absolute top-2 right-2 z-10 p-1 bg-white/80 backdrop-blur-xs rounded-full shadow-xs">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
            </div>
          )}

          <div className="book-card-3d">
            <div className="book-card-cover-wrapper">
              <Image
                src={coverURL}
                alt={title}
                width={200}
                height={300}
                className="book-card-cover"
                priority
              />
            </div>
          </div>

          <div className="book-card-meta mt-2">
            <div className="flex items-center justify-between gap-1 text-[11px] mb-0.5">
              <div className="flex items-center gap-1.5 text-[#8C7A68] truncate">
                <span>{topic || "General"}</span>
                {readingTimeMinutes && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {readingTimeMinutes}m
                    </span>
                  </>
                )}
              </div>
              {catBadge && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${catBadge.bg} ${catBadge.text} shrink-0 tracking-wider`}>
                  {catBadge.label}
                </span>
              )}
            </div>
            <h3 className="book-card-title text-base font-semibold text-[#212A3B] truncate">
              {title}
            </h3>
            <p className="book-card-author text-xs text-[#5A544C] truncate">
              {author}
            </p>
          </div>
        </article>
      </Link>

      {/* Remove button on hover */}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-2 left-2 z-20 p-1.5 bg-white/90 hover:bg-rose-50 text-gray-400 hover:text-rose-600 rounded-full shadow-xs opacity-0 group-hover:opacity-100 transition-all cursor-pointer border border-gray-200"
          title="Remove from library"
          aria-label="Remove book"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export default BookCard;
