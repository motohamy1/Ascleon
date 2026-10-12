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
        <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-[#E3DAC9] shadow-lg text-center flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-700">
              <LogIn className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold font-serif text-[#212A3B]">
              Sign in for Voice Discussion
            </h2>
            <p className="text-xs text-[#5D554D] leading-relaxed">
              Living voice conversations with {book.title} require an active account to manage your personalized voice sessions.
            </p>
            <div className="flex items-center gap-3 mt-2 w-full">
              <button
                type="button"
                onClick={() => setMode("read")}
                className="flex-1 px-4 py-2.5 rounded-xl border border-black/15 text-xs font-semibold hover:bg-black/5 cursor-pointer"
              >
                Back to Reader
              </button>
              <SignInButton mode="modal">
                <button className="flex-1 px-4 py-2.5 rounded-xl bg-[#212A3B] text-white text-xs font-semibold hover:bg-[#323E53] cursor-pointer">
                  Sign In
                </button>
              </SignInButton>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="relative min-h-screen bg-[#FAFAF8] pt-8 pb-20">
        <div className="max-w-4xl mx-auto px-4 mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMode("read")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-[#DDD1C0] hover:bg-[#F5EFE6] text-[#212A3B] text-xs font-medium shadow-xs transition-colors cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-[#8B3A2B]" />
            <span>Switch to Living Reader</span>
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
