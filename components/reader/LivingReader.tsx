"use client";

import React, { useState, useMemo, useEffect } from "react";
import { IBook, IBookSegmentData } from "@/types";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Mic,
  Bookmark,
  Sparkles,
  BookOpen,
} from "lucide-react";
import LivingAIBar from "./LivingAIBar";
import { cn } from "@/lib/utils";

interface LivingReaderProps {
  book: IBook;
  initialSegments: IBookSegmentData[];
  onSwitchToVoice: () => void;
}

type ThemeMode = "cream" | "parchment" | "dark";
type FontSizeMode = "sm" | "base" | "lg";

export default function LivingReader({
  book,
  initialSegments,
  onSwitchToVoice,
}: LivingReaderProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [theme, setTheme] = useState<ThemeMode>("cream");
  const [fontSize, setFontSize] = useState<FontSizeMode>("base");

  // Fallback segments if database had none (e.g. sample books)
  const segments = useMemo(() => {
    if (initialSegments && initialSegments.length > 0) {
      return initialSegments;
    }
    // Generate structured editorial segments from book metadata
    return [
      {
        _id: "preview-1",
        bookId: book._id,
        clerkId: "system",
        segmentIndex: 0,
        pageNumber: 1,
        wordCount: 320,
        content: `Prologue: Foundations & Context\n\n${
          book.summary ||
          "Understanding the deep architecture of knowledge requires stepping back from the immediate pressures of daily tasks."
        }\n\nWhen we examine the fundamental principles that govern this domain, we notice that mastery is rarely an accident of raw talent. Rather, it is the deliberate aggregation of marginal insights, disciplined practice, and the clarity to discern signal from noise. In this book, ${
          book.author
        } constructs a systematic bridge between theory and practice, illuminating how subtle habits and foundational axioms compound over time into extraordinary results.`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        _id: "preview-2",
        bookId: book._id,
        clerkId: "system",
        segmentIndex: 1,
        pageNumber: 2,
        wordCount: 280,
        content: `Chapter I: The Core Mechanism\n\nEvery discipline possesses an inner engine—a governing dynamic that dictates whether an endeavor will flourish or stagnate. In "${
          book.title
        }", the dialogue centers on eliminating friction, cultivating deep clarity, and establishing feedback loops that expose reality quickly.\n\nAs you proceed through each concept, test the assertions against your own experience. The goal is not passive absorption, but active intellectual engagement. Use the living companion below to question the premises, challenge the deductions, and distill the essence into your personal mental models.`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        _id: "preview-3",
        bookId: book._id,
        clerkId: "system",
        segmentIndex: 2,
        pageNumber: 3,
        wordCount: 310,
        content: `Chapter II: Synthesis & Application\n\nTo bridge the gap between understanding and execution, we must integrate these principles into daily routines. Insight without implementation remains mere entertainment.\n\nTake time after reading each passage to articulate what you have learned in your own words. When you discuss the concepts out loud—whether with peers or through the interactive voice persona—the nuances solidify into enduring cognitive tools.`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ] as IBookSegmentData[];
  }, [initialSegments, book]);

  const currentSegment = segments[currentIdx] || segments[0];
  const progressPercent = Math.round(
    ((currentIdx + 1) / (segments.length || 1)) * 100,
  );

  // Keyboard navigation for previous/next segments
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid intercepting if typing in input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === "ArrowRight") {
        if (currentIdx < segments.length - 1) {
          setCurrentIdx((prev) => prev + 1);
        }
      } else if (e.key === "ArrowLeft") {
        if (currentIdx > 0) {
          setCurrentIdx((prev) => prev - 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIdx, segments.length]);

  // Color themes
  const themeStyles = {
    cream: "bg-[#FDFBF7] text-[#241D17]",
    parchment: "bg-[#F5EFE6] text-[#2C2219]",
    dark: "bg-[#181512] text-[#EBE0D2]",
  };

  const fontSizes = {
    sm: "text-base leading-relaxed",
    base: "text-lg sm:text-xl leading-loose",
    lg: "text-xl sm:text-2xl leading-loose",
  };

  return (
    <div
      className={cn(
        "min-h-screen w-full transition-colors duration-200 pb-36 font-serif",
        themeStyles[theme],
      )}
    >
      {/* 1. Header Toolbar */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-inherit/90 border-b border-black/10 px-4 sm:px-8 py-3.5 flex items-center justify-between font-sans">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-1.5 rounded-lg hover:bg-black/5 text-[#5A4F44] hover:text-[#1F1710] transition-colors"
            title="Back to library"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex flex-col">
            <h1 className="text-sm sm:text-base font-serif font-bold text-inherit truncate max-w-xs sm:max-w-md">
              {book.title}
            </h1>
            <span className="text-[11px] text-[#8C7A68] truncate">
              {book.author} • Section {currentIdx + 1} of {segments.length}
            </span>
          </div>
        </div>

        {/* Right Header Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Theme switcher */}
          <div className="hidden sm:flex items-center gap-1 bg-black/5 p-0.5 rounded-lg text-xs">
            {(["cream", "parchment", "dark"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={cn(
                  "px-2 py-0.5 rounded-md capitalize text-[11px] transition-all cursor-pointer",
                  theme === t
                    ? "bg-white shadow-xs text-[#212A3B] font-semibold"
                    : "text-[#6B5E50] hover:text-black",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Font Size */}
          <div className="flex items-center gap-0.5 bg-black/5 p-0.5 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setFontSize("sm")}
              className={cn(
                "px-2 py-0.5 rounded-md text-xs cursor-pointer",
                fontSize === "sm" ? "bg-white text-black font-bold" : "text-[#736556]",
              )}
            >
              A-
            </button>
            <button
              type="button"
              onClick={() => setFontSize("base")}
              className={cn(
                "px-2 py-0.5 rounded-md text-xs cursor-pointer",
                fontSize === "base" ? "bg-white text-black font-bold" : "text-[#736556]",
              )}
            >
              A
            </button>
            <button
              type="button"
              onClick={() => setFontSize("lg")}
              className={cn(
                "px-2 py-0.5 rounded-md text-xs cursor-pointer",
                fontSize === "lg" ? "bg-white text-black font-bold" : "text-[#736556]",
              )}
            >
              A+
            </button>
          </div>

          {/* Switch to Voice Discussion Button */}
          <button
            type="button"
            onClick={onSwitchToVoice}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#8B3A2B] hover:bg-[#A34433] text-white text-xs font-medium shadow-xs transition-colors cursor-pointer"
          >
            <Mic className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Voice Discussion</span>
          </button>
        </div>
      </header>

      {/* Progress Strip */}
      <div className="w-full bg-black/5 h-1">
        <div
          className="bg-[#8B3A2B] h-1 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* 2. Editorial Reading Container */}
      <main className="max-w-2xl sm:max-w-3xl mx-auto px-6 sm:px-12 pt-12 flex flex-col gap-8">
        {/* Chapter / Section header badge */}
        <div className="flex items-center justify-between border-b border-black/10 pb-4 font-sans text-xs text-[#8C7A68]">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#8B3A2B]" />
            <span className="font-semibold uppercase tracking-widest text-[11px]">
              Section {currentIdx + 1}
            </span>
            {currentSegment.pageNumber && (
              <span>• Page {currentSegment.pageNumber}</span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[11px]">
            <Bookmark className="w-3.5 h-3.5" />
            <span>{progressPercent}% completed</span>
          </div>
        </div>

        {/* Sinai Key Concept Callout */}
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 font-sans text-xs sm:text-sm flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
            <Sparkles className="w-4 h-4" />
            <span>Sinai Living Core Focus</span>
          </div>
          <p className="text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
            {book.topic ? `Investigating core themes in ${book.topic}. ` : ""}
            Read actively and use the interactive prompt bar below at any time to test understanding, extract summaries, or challenge arguments.
          </p>
        </div>

        {/* The Text Content */}
        <article
          className={cn(
            "prose prose-neutral max-w-none font-serif tracking-normal leading-relaxed whitespace-pre-line select-text",
            fontSizes[fontSize],
          )}
        >
          {currentSegment.content}
        </article>

        {/* Section Navigation Buttons */}
        <div className="flex items-center justify-between pt-10 border-t border-black/10 font-sans">
          <button
            type="button"
            disabled={currentIdx === 0}
            onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-black/15 disabled:opacity-30 hover:bg-black/5 transition-all text-xs sm:text-sm font-medium cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous Section</span>
          </button>

          <span className="text-xs text-[#8C7A68]">
            {currentIdx + 1} of {segments.length}
          </span>

          <button
            type="button"
            disabled={currentIdx === segments.length - 1}
            onClick={() =>
              setCurrentIdx((prev) => Math.min(segments.length - 1, prev + 1))
            }
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#212A3B] hover:bg-[#323E53] text-white disabled:opacity-30 transition-all text-xs sm:text-sm font-medium cursor-pointer disabled:cursor-not-allowed"
          >
            <span>Next Section</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </main>

      {/* 3. Floating Living AI Query Bar (Gloss / Sinai style) */}
      <LivingAIBar
        bookId={book._id}
        bookTitle={book.title}
        currentSegmentContent={currentSegment.content}
        onOpenVoiceMode={onSwitchToVoice}
      />
    </div>
  );
}
