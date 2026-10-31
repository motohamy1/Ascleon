"use client";

import React, { useState } from "react";
import { IBook, IBookSegmentData } from "@/types";
import LivingReader from "./LivingReader";
import VapiControls from "@/components/VapiControls";
import { BookOpen, LogIn } from "lucide-react";
import { SignInButton } from "@clerk/nextjs";

interface BookExperienceProps {
  book: IBook;
  segments: IBookSegmentData[];
  initialMode?: "read" | "voice";
  isAuthenticated?: boolean;
}

export default function BookExperience({
  book,
  segments,
  initialMode = "read",
  isAuthenticated = false,
}: BookExperienceProps) {
  const [mode, setMode] = useState<"read" | "voice">(initialMode);

  if (mode === "voice") {
    if (!isAuthenticated) {
      return (
        <div className="acid-bg flex min-h-screen items-center justify-center px-4 py-[104px]">
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-[22px] border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-8 text-center shadow-chip">
            <div className="flex size-12 items-center justify-center rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)]">
              <LogIn className="size-6" />
            </div>
            <h2 className="display text-2xl text-[color:var(--ink)]">
              Sign in to talk
            </h2>
            <p className="text-xs leading-relaxed text-[color:var(--ink)]/70">
              Voice discussions with {book.title} need an active account to
              manage your personalized voice sessions.
            </p>
            <div className="mt-2 flex w-full items-center gap-3">
              <button
                type="button"
                onClick={() => setMode("read")}
                className="flex-1 cursor-pointer rounded-full border-2 border-[color:var(--ink)]/25 px-4 py-2.5 text-xs font-bold text-[color:var(--ink)] transition-colors hover:bg-[color:var(--ink)]/5"
              >
                Back to reader
              </button>
              <SignInButton mode="modal">
                <button className="flex-1 cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-4 py-2.5 text-xs font-bold text-[color:var(--ink)] shadow-chip transition-transform hover:-translate-y-0.5">
                  Sign in
                </button>
              </SignInButton>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="acid-bg relative min-h-screen pb-20 pt-[104px]">
        <div className="mx-auto mb-4 flex max-w-4xl items-center justify-between px-4">
          <button
            type="button"
            onClick={() => setMode("read")}
            className="flex cursor-pointer items-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--cream)] px-3 py-1.5 text-xs font-bold text-[color:var(--ink)] shadow-chip transition-colors hover:bg-[color:var(--cream-deep)]"
          >
            <BookOpen className="size-4 text-[color:var(--magenta)]" />
            <span>Switch to living reader</span>
          </button>
        </div>

        <VapiControls book={book} />
      </div>
    );
  }

  return (
    <LivingReader
      book={book}
      initialSegments={segments}
      onSwitchToVoice={() => setMode("voice")}
    />
  );
}
