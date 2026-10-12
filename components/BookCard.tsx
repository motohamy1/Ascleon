import { BookCardProps } from "@/types";
import Image from "next/image";
import Link from "next/link";
import React from "react";
import { Star, Clock } from "lucide-react";

const BookCard = ({
  title,
  author,
  coverURL,
  slug,
  topic,
  readingTimeMinutes,
  isFavorite,
}: BookCardProps) => {
  return (
    <Link href={`/books/${slug}`} className="group block">
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
          {topic && (
            <div className="flex items-center gap-1.5 text-[11px] text-[#8C7A68] mb-0.5">
              <span>{topic}</span>
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
          )}
          <h3 className="book-card-title text-base font-semibold text-[#212A3B] truncate">
            {title}
          </h3>
          <p className="book-card-author text-xs text-[#5A544C] truncate">
            {author}
          </p>
        </div>
      </article>
    </Link>
  );
};

export default BookCard;
