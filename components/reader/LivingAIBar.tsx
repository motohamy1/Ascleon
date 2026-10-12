"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Send,
  ChevronUp,
  ChevronDown,
  Lightbulb,
  CheckCircle,
  HelpCircle,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LivingAIBarProps {
  bookId: string;
  bookTitle: string;
  currentSegmentContent: string;
  onOpenVoiceMode?: () => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  keyPoints?: string[];
}

export default function LivingAIBar({
  bookId,
  bookTitle,
  currentSegmentContent,
}: LivingAIBarProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const handleAsk = async (textToAsk: string) => {
    const q = textToAsk.trim();
    if (!q || isLoading) return;

    setQuery("");
    setIsOpen(true);
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/reader-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          bookTitle,
          query: q,
          currentSegmentContent,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            keyPoints: data.keyPoints,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Sorry, I could not process your query at this moment.",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Failed to connect to assistant.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickPrompts = [
    { label: "Summarize this section", icon: Lightbulb, query: "Summarize this section concisely" },
    { label: "Core takeaways", icon: CheckCircle, query: "What are the core takeaways from this section?" },
    { label: "Quiz my understanding", icon: HelpCircle, query: "Quiz me on the main concepts in this section" },
  ];

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 z-40">
      <div className="bg-[#1C160F]/95 backdrop-blur-md text-[#F4ECE1] border border-[#4A3B2C] rounded-2xl shadow-[0_16px_36px_rgba(0,0,0,0.35)] overflow-hidden transition-all duration-300">
        {/* Expanded Messages Drawer */}
        {isOpen && (
          <div className="max-h-80 sm:max-h-96 overflow-y-auto p-4 sm:p-5 border-b border-[#3A2E22] flex flex-col gap-3.5 scrollbar-thin scrollbar-thumb-white/20">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-amber-300/90">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Living Reader Companion • Sinai & Gloss AI</span>
              </div>
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMessages([])}
                    className="text-[11px] text-white/50 hover:text-white/80 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1 text-white/60 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {messages.length === 0 ? (
              <div className="py-6 text-center text-xs text-white/60">
                Ask any question about this passage or select one of the quick suggestions below.
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex flex-col gap-1 text-xs leading-relaxed rounded-xl p-3.5",
                    msg.role === "user"
                      ? "bg-white/10 text-white self-end max-w-[85%]"
                      : "bg-[#2A2016] text-[#EFE6DC] border border-[#4A3826] self-start w-full",
                  )}
                >
                  <span className="text-[10px] font-bold tracking-wider uppercase opacity-50">
                    {msg.role === "user" ? "You" : "Book Companion"}
                  </span>
                  <div className="whitespace-pre-wrap">{msg.content}</div>

                  {msg.keyPoints && msg.keyPoints.length > 0 && (
                    <ul className="mt-2 pt-2 border-t border-white/10 space-y-1">
                      {msg.keyPoints.map((pt, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-200/90">
                          <span>✦</span>
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}

            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-amber-300 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Consulting book knowledge...</span>
              </div>
            )}
          </div>
        )}

        {/* Quick Suggestion Pills */}
        <div className="px-3 pt-2.5 flex items-center gap-2 overflow-x-auto scrollbar-none">
          {quickPrompts.map((p, idx) => {
            const Icon = p.icon;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleAsk(p.query)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[11px] text-white/90 whitespace-nowrap transition-colors cursor-pointer"
              >
                <Icon className="w-3 h-3 text-amber-300" />
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>

        {/* Floating Input Row */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk(query);
          }}
          className="flex items-center gap-2 p-2.5 sm:p-3"
        >
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle AI drawer"
            className="p-1.5 text-white/60 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Ask about ${bookTitle || "the whole text"}...`}
            className="flex-1 bg-transparent text-xs sm:text-sm text-white placeholder-white/40 focus:outline-none px-2"
          />

          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            aria-label="Send question"
            className="p-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
