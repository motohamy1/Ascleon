"use client";

import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Volume2, Sparkles, HelpCircle, Activity, X, RotateCcw, MessageSquare, Award } from "lucide-react";
import { CallStatus } from "@/hooks/useVapi";
import { cn } from "@/lib/utils";

interface SinaiVoiceStudioProps {
  status: CallStatus;
  isActive: boolean;
  currentMessage: string;
  currentUserMessage: string;
  messages: Array<{ role: string; content: string }>;
  duration: number;
  maxDurationSeconds?: number;
  bookTitle: string;
  currentSectionNumber: number;
  selectedText?: string;
  onStart: (customPrompt?: string) => void;
  onStop: () => void;
  onClose?: () => void;
  isFloating?: boolean;
}

export function SinaiVoiceStudio({
  status,
  isActive,
  currentMessage,
  currentUserMessage,
  messages,
  duration,
  maxDurationSeconds = 900,
  bookTitle,
  currentSectionNumber,
  selectedText,
  onStart,
  onStop,
  onClose,
  isFloating = false,
}: SinaiVoiceStudioProps) {
  const [selectedVivaMode, setSelectedVivaMode] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentMessage, currentUserMessage]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusBadge = () => {
    switch (status) {
      case "connecting":
        return { label: "Connecting WebRTC...", color: "bg-amber-400 text-black animate-pulse" };
      case "listening":
        return { label: "Listening to You...", color: "bg-[#43a08f] text-black font-bold animate-pulse" };
      case "thinking":
        return { label: "Reasoning via Braunwald & Oxford...", color: "bg-[color:var(--orange)] text-black font-bold animate-pulse" };
      case "speaking":
        return { label: "Oral Preceptor Speaking...", color: "bg-[color:var(--magenta)] text-white font-bold animate-pulse" };
      default:
        return { label: "Ready to Converse", color: "bg-white/10 text-[color:var(--cream)]/70" };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-[24px] border-2 border-[color:var(--ink)] bg-gradient-to-b from-[#1c1a20] to-[#111013] text-[color:var(--cream)] shadow-frame transition-all duration-300",
        isFloating ? "w-full max-w-lg p-5" : "h-full w-full p-4"
      )}
    >
      {/* HEADER BAR */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-[color:var(--orange)] to-[color:var(--magenta)] text-[color:var(--ink)]">
            <Activity className="size-4 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-black tracking-tight text-[color:var(--cream)]">
              Sinai &amp; PhysioTalk Oral Preceptor
            </span>
            <span className="text-[10px] text-[color:var(--cream)]/60">
              Section {currentSectionNumber} • Grounded Viva Mode
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-bold text-[color:var(--orange)]">
            {formatDuration(duration)} / {formatDuration(maxDurationSeconds)}
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-[color:var(--cream)]/60 hover:bg-white/10 hover:text-[color:var(--cream)]"
              title="Close Voice Studio"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* CENTER: SINAI DYNAMIC PULSING ORB & AUDIO EQUALIZER */}
      <div className="my-4 flex flex-col items-center justify-center gap-3">
        <div className="relative flex size-28 items-center justify-center">
          {/* Animated Background Glow Rings */}
          {isActive && (
            <>
              <div
                className={cn(
                  "absolute inset-0 rounded-full opacity-35 blur-xl transition-all duration-700",
                  status === "speaking" && "bg-[color:var(--magenta)] scale-125 animate-pulse",
                  status === "listening" && "bg-[#43a08f] scale-115 animate-ping",
                  status === "thinking" && "bg-[color:var(--orange)] scale-120 animate-spin"
                )}
              />
              <div className="absolute inset-2 rounded-full border-2 border-dashed border-white/25 animate-spin" />
            </>
          )}

          {/* Central Conversational Orb */}
          <button
            type="button"
            onClick={isActive ? onStop : () => onStart()}
            disabled={status === "connecting"}
            className={cn(
              "relative z-10 flex size-20 cursor-pointer items-center justify-center rounded-full border-2 border-[color:var(--ink)] transition-all shadow-chip active:scale-95",
              isActive
                ? status === "speaking"
                  ? "bg-gradient-to-tr from-[color:var(--magenta)] to-[color:var(--orange)] text-[color:var(--ink)] scale-105"
                  : status === "listening"
                  ? "bg-gradient-to-tr from-[#43a08f] to-[color:var(--cream)] text-[color:var(--ink)] scale-105"
                  : "bg-[color:var(--orange)] text-[color:var(--ink)]"
                : "bg-gradient-to-tr from-[#2a2730] to-[#1e1c22] text-[color:var(--cream)]/80 hover:text-[color:var(--orange)] hover:scale-105"
            )}
            title={isActive ? "Tap to end voice session" : "Tap to start voice conversation"}
          >
            {isActive ? (
              <Mic className="size-8 animate-bounce text-[color:var(--ink)]" />
            ) : (
              <MicOff className="size-7" />
            )}
          </button>
        </div>

        {/* Live Status Badge */}
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-3 py-0.5 text-[10.5px] uppercase tracking-wider", statusBadge.color)}>
            {statusBadge.label}
          </span>
        </div>

        {/* Soundwave Bars (Active when speaking or listening) */}
        {isActive && (
          <div className="flex items-center gap-1.5 h-6">
            {[40, 75, 95, 60, 85, 100, 70, 50, 80, 45].map((height, i) => (
              <div
                key={i}
                style={{
                  height: status === "speaking" || status === "listening" ? `${Math.max(15, Math.round(height * Math.random()))}%` : "20%",
                  transition: "height 0.12s ease-in-out",
                }}
                className={cn(
                  "w-1 rounded-full",
                  status === "speaking"
                    ? "bg-gradient-to-t from-[color:var(--magenta)] to-[color:var(--orange)]"
                    : status === "listening"
                    ? "bg-[#43a08f]"
                    : "bg-white/20"
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* STREAMING CLOSED CAPTIONS / REAL-TIME SUBTITLES */}
      <div
        ref={scrollRef}
        className="custom-scrollbar-dark flex-1 overflow-y-auto rounded-[16px] border border-white/10 bg-black/50 p-3.5 text-xs"
      >
        {messages.length === 0 && !currentMessage && !currentUserMessage && (
          <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-center text-[color:var(--cream)]/50">
            <MessageSquare className="size-5 opacity-40" />
            <p className="text-[11px]">
              Tap the orb to start live Socratic discussion on Section {currentSectionNumber}.
            </p>
            {selectedText && (
              <p className="mt-1 rounded-lg border border-[#43a08f]/30 bg-[#43a08f]/10 p-2 text-[10.5px] text-[#7fd8c9]">
                🎯 Focused on highlighted passage: &ldquo;{selectedText.slice(0, 75)}...&rdquo;
              </p>
            )}
          </div>
        )}

        {/* Full conversation transcript history */}
        <div className="flex flex-col gap-2">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={cn(
                "rounded-xl p-2.5 leading-relaxed text-xs",
                m.role === "user"
                  ? "self-end max-w-[85%] bg-[color:var(--orange)] text-[color:var(--ink)] font-semibold"
                  : "self-start max-w-[90%] bg-white/[0.06] text-[color:var(--cream)]"
              )}
            >
              <div className="mb-0.5 text-[9px] font-bold uppercase tracking-wider opacity-60">
                {m.role === "user" ? "You" : "Sinai Preceptor"}
              </div>
              <p>{m.content}</p>
            </div>
          ))}

          {/* User streaming transcript */}
          {currentUserMessage && (
            <div className="self-end max-w-[85%] rounded-xl border border-[#43a08f]/50 bg-[#43a08f]/20 p-2.5 text-xs text-[#7fd8c9] animate-pulse">
              <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">You (Speaking...)</span>
              <p>{currentUserMessage}</p>
            </div>
          )}

          {/* Assistant streaming transcript */}
          {currentMessage && (
            <div className="self-start max-w-[90%] rounded-xl border border-[color:var(--orange)]/40 bg-white/[0.08] p-2.5 text-xs text-[color:var(--cream)]">
              <span className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--orange)]">Sinai Preceptor (Speaking...)</span>
              <p>{currentMessage}</p>
            </div>
          )}
        </div>
      </div>

      {/* QUICK SOCRATIC VIVA PROMPTS (Sinai.ai Mode) */}
      <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between text-[10px] text-[color:var(--cream)]/60">
          <span className="font-bold uppercase tracking-wider text-[#7fd8c9]">Socratic Viva Starters:</span>
          <span>Click to speak prompt</span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onStart(`Quiz me orally like an MRCP clinical examiner on Section ${currentSectionNumber}`)}
            className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] p-2 text-left text-[10.5px] text-[color:var(--cream)]/85 transition-colors hover:border-[color:var(--orange)] hover:bg-[color:var(--orange)]/10"
          >
            <Award className="size-3.5 shrink-0 text-[color:var(--orange)]" />
            <span className="truncate">Oral Exam Viva</span>
          </button>

          <button
            type="button"
            onClick={() => onStart(`Explain the physiological S2 splitting mechanics out loud step by step`)}
            className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] p-2 text-left text-[10.5px] text-[color:var(--cream)]/85 transition-colors hover:border-[color:var(--orange)] hover:bg-[color:var(--orange)]/10"
          >
            <Sparkles className="size-3.5 shrink-0 text-[#7fd8c9]" />
            <span className="truncate">Walkthrough S2 Split</span>
          </button>
        </div>
      </div>
    </div>
  );
}
