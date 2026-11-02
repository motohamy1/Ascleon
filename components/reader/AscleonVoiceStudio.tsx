"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  MicOff,
  Sparkles,
  Activity,
  X,
  MessageSquare,
  Award,
  Globe,
  Send,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { voiceLanguages, type VoiceLanguage } from "@/lib/constants";

interface AscleonVoiceStudioProps {
  bookTitle: string;
  currentPageNumber: number;
  currentSectionText: string;
  selectedText?: string;
  authoritativeReferences?: any[];
  language?: VoiceLanguage;
  onLanguageChange?: (language: VoiceLanguage) => void;
  onClose?: () => void;
  isFloating?: boolean;
}

interface MessageTurn {
  role: "user" | "model";
  content: string;
  time?: string;
}

export function AscleonVoiceStudio({
  bookTitle,
  currentPageNumber,
  currentSectionText,
  selectedText,
  authoritativeReferences = [],
  language = voiceLanguages.en,
  onLanguageChange,
  onClose,
  isFloating = false,
}: AscleonVoiceStudioProps) {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [messages, setMessages] = useState<MessageTurn[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [typedInput, setTypedInput] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<"en" | "ar" | "mixed">(
    language.code === "ar" ? "ar" : "en"
  );

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Initialize Speech Synthesis
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  // Scroll to bottom of transcripts
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentTranscript, status]);

  // Speak AI response
  const speakText = useCallback(
    (text: string) => {
      if (isMuted || !synthRef.current) return;

      synthRef.current.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      activeUtteranceRef.current = utterance;

      const hasArabic = /[\u0600-\u06FF]/.test(text);
      utterance.lang = hasArabic || selectedLanguage === "ar" ? "ar-SA" : "en-US";
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onstart = () => {
        setStatus("speaking");
      };

      utterance.onend = () => {
        setStatus("listening");
        startListening();
      };

      utterance.onerror = () => {
        setStatus("idle");
      };

      synthRef.current.speak(utterance);
    },
    [isMuted, selectedLanguage]
  );

  // Send turn to backend
  const sendSpokenTurn = useCallback(
    async (userSpeech: string) => {
      if (!userSpeech.trim()) return;

      setStatus("thinking");
      setCurrentTranscript("");

      const newHistory: MessageTurn[] = [
        ...messages,
        { role: "user", content: userSpeech.trim(), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
      ];
      setMessages(newHistory);

      try {
        const res = await fetch("/api/voice/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookTitle,
            pageNumber: currentPageNumber,
            pageText: currentSectionText,
            selectedText,
            userSpeech: userSpeech.trim(),
            language: selectedLanguage,
            history: newHistory.slice(-6),
            authoritativeReferences,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const spokenReply = data.responseText || "Let's review this together.";

          setMessages((prev) => [
            ...prev,
            {
              role: "model",
              content: spokenReply,
              time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            },
          ]);

          speakText(spokenReply);
        } else {
          throw new Error("Voice session response failed");
        }
      } catch (err) {
        console.warn("Voice interaction error, falling back:", err);
        const fallbackReply = `Grounded in Page ${currentPageNumber}: The key principle here is to examine the primary invariant before considering secondary variations.`;
        setMessages((prev) => [
          ...prev,
          { role: "model", content: fallbackReply },
        ]);
        speakText(fallbackReply);
      }
    },
    [bookTitle, currentPageNumber, currentSectionText, selectedText, selectedLanguage, messages, authoritativeReferences, speakText]
  );

  // Start continuous microphone listening
  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("Browser SpeechRecognition not supported in this client.");
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = selectedLanguage === "ar" ? "ar-SA" : "en-US";

      recognition.onstart = () => {
        setStatus("listening");
      };

      recognition.onresult = (event: any) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        if (interim) {
          setCurrentTranscript(interim);
        }

        if (final) {
          setCurrentTranscript("");
          sendSpokenTurn(final);
        }
      };

      recognition.onerror = (e: any) => {
        if (e.error !== "no-speech") {
          console.warn("Speech recognition notice:", e.error);
        }
        if (isActive && status === "listening") {
          setTimeout(() => {
            try {
              recognition.start();
            } catch {}
          }, 600);
        }
      };

      recognition.onend = () => {
        if (isActive && status === "listening") {
          try {
            recognition.start();
          } catch {}
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn("Could not start speech recognition:", err);
    }
  }, [isActive, status, selectedLanguage, sendSpokenTurn]);

  // Start session
  const startSession = (initialPrompt?: string) => {
    setIsActive(true);
    if (synthRef.current) {
      synthRef.current.cancel();
    }

    if (initialPrompt) {
      sendSpokenTurn(initialPrompt);
    } else {
      const greeting =
        selectedLanguage === "ar"
          ? `أهلاً بك! أنا مرشدك الأكاديمي الصوتي في صفحة ${currentPageNumber}. تفضل بأي سؤال.`
          : `Hello! I am your live oral mentor for Page ${currentPageNumber}. What would you like to explore or practice?`;

      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          content: greeting,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      speakText(greeting);
    }
  };

  // Stop session
  const stopSession = () => {
    setIsActive(false);
    setStatus("idle");
    setCurrentTranscript("");

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    if (synthRef.current) {
      synthRef.current.cancel();
    }
  };

  const handleLanguageToggle = (lang: "en" | "ar" | "mixed") => {
    setSelectedLanguage(lang);
    if (onLanguageChange) {
      onLanguageChange(lang === "ar" ? voiceLanguages.ar : voiceLanguages.en);
    }
    if (isActive) {
      stopSession();
      setTimeout(() => startSession(), 400);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedInput.trim()) return;
    const text = typedInput.trim();
    setTypedInput("");
    if (!isActive) {
      setIsActive(true);
    }
    sendSpokenTurn(text);
  };

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-[24px] border-2 border-[color:var(--ink)] bg-gradient-to-b from-[#1c1a20] to-[#111013] text-[color:var(--cream)] shadow-frame transition-all duration-300",
        isFloating ? "w-full max-w-lg p-5" : "h-full w-full p-4"
      )}
    >
      {/* HEADER: BRANDING & TOP-RIGHT LANGUAGE PILL */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-[color:var(--orange)] to-amber-300 text-[color:var(--ink)] shadow-xs">
            <Activity className="size-4 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-black tracking-tight text-[color:var(--cream)]">
              Ascleon Live Oral Mentor
            </span>
            <span className="text-[10px] text-[color:var(--cream)]/60">
              Page {currentPageNumber} • Bilingual Socratic Session
            </span>
          </div>
        </div>

        {/* Top-Right Language & Controls */}
        <div className="flex items-center gap-2">
          {/* Language Selector Pill in the upper-right corner */}
          <div className="flex items-center rounded-full border border-white/15 bg-white/5 p-0.5 text-[10px] font-bold">
            <button
              type="button"
              onClick={() => handleLanguageToggle("en")}
              className={cn(
                "px-2 py-0.5 rounded-full transition-colors cursor-pointer",
                selectedLanguage === "en"
                  ? "bg-[color:var(--orange)] text-[color:var(--ink)] font-bold shadow-xs"
                  : "text-white/60 hover:text-white"
              )}
              title="English dialogue"
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => handleLanguageToggle("ar")}
              className={cn(
                "px-2 py-0.5 rounded-full transition-colors cursor-pointer",
                selectedLanguage === "ar"
                  ? "bg-[color:var(--orange)] text-[color:var(--ink)] font-bold shadow-xs"
                  : "text-white/60 hover:text-white"
              )}
              title="Arabic dialogue (العربية)"
            >
              عربي
            </button>
            <button
              type="button"
              onClick={() => handleLanguageToggle("mixed")}
              className={cn(
                "px-2 py-0.5 rounded-full transition-colors cursor-pointer",
                selectedLanguage === "mixed"
                  ? "bg-[color:var(--orange)] text-[color:var(--ink)] font-bold shadow-xs"
                  : "text-white/60 hover:text-white"
              )}
              title="Mixed English + Arabic Code-Switching"
            >
              Mixed
            </button>
          </div>

          {/* Mute Toggle */}
          <button
            type="button"
            onClick={() => {
              setIsMuted((prev) => !prev);
              if (!isMuted && synthRef.current) {
                synthRef.current.cancel();
              }
            }}
            className="rounded-full p-1 text-[color:var(--cream)]/60 hover:bg-white/10 hover:text-[color:var(--cream)] cursor-pointer"
            title={isMuted ? "Unmute spoken answers" : "Mute spoken answers"}
          >
            {isMuted ? <VolumeX className="size-4 text-rose-400" /> : <Volume2 className="size-4" />}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-[color:var(--cream)]/60 hover:bg-white/10 hover:text-[color:var(--cream)] cursor-pointer"
              title="Close Voice Studio"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* CENTER: PULSING INTERACTIVE ORB & EQUALIZER */}
      <div className="my-3 flex flex-col items-center justify-center gap-2">
        <div className="relative flex size-24 items-center justify-center">
          {isActive && (
            <>
              <div
                className={cn(
                  "absolute inset-0 rounded-full opacity-40 blur-xl transition-all duration-500",
                  status === "speaking" && "bg-amber-400 scale-125 animate-pulse",
                  status === "listening" && "bg-emerald-400 scale-115 animate-ping",
                  status === "thinking" && "bg-[color:var(--orange)] scale-120 animate-spin"
                )}
              />
              <div className="absolute inset-1 rounded-full border-2 border-dashed border-white/20 animate-spin" />
            </>
          )}

          <button
            type="button"
            onClick={isActive ? stopSession : () => startSession()}
            className={cn(
              "relative z-10 flex size-18 cursor-pointer items-center justify-center rounded-full border-2 border-[color:var(--ink)] transition-all shadow-chip active:scale-95",
              isActive
                ? status === "speaking"
                  ? "bg-gradient-to-tr from-amber-400 to-[color:var(--orange)] text-[color:var(--ink)] scale-105"
                  : status === "listening"
                  ? "bg-gradient-to-tr from-emerald-400 to-[color:var(--cream)] text-[color:var(--ink)] scale-105"
                  : "bg-[color:var(--orange)] text-[color:var(--ink)]"
                : "bg-gradient-to-tr from-[#2a2730] to-[#1e1c22] text-[color:var(--cream)]/80 hover:text-[color:var(--orange)] hover:scale-105"
            )}
            title={isActive ? "Tap to pause session" : "Tap to speak with Ascleon mentor"}
          >
            {isActive ? (
              <Mic className="size-7 animate-bounce text-[color:var(--ink)]" />
            ) : (
              <MicOff className="size-6" />
            )}
          </button>
        </div>

        {/* Live Status Badge */}
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            status === "speaking"
              ? "bg-amber-400 text-black animate-pulse"
              : status === "listening"
              ? "bg-emerald-400 text-black animate-pulse"
              : status === "thinking"
              ? "bg-[color:var(--orange)] text-black animate-pulse"
              : "bg-white/10 text-[color:var(--cream)]/70"
          )}
        >
          {status === "speaking"
            ? "Mentor Speaking..."
            : status === "listening"
            ? "Listening to You..."
            : status === "thinking"
            ? "Reasoning with Source..."
            : "Tap Orb to Start"}
        </span>

        {/* Soundwave Bars */}
        {isActive && (
          <div className="flex items-center gap-1 h-5">
            {[35, 70, 90, 55, 80, 100, 65, 45, 75, 40].map((height, i) => (
              <div
                key={i}
                style={{
                  height: status === "speaking" || status === "listening" ? `${Math.max(20, height)}%` : "20%",
                  transition: "height 0.12s ease-in-out",
                }}
                className={cn(
                  "w-1 rounded-full",
                  status === "speaking"
                    ? "bg-amber-400"
                    : status === "listening"
                    ? "bg-emerald-400"
                    : "bg-white/20"
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* STREAMING TRANSCRIPTS FEED */}
      <div
        ref={scrollRef}
        className="custom-scrollbar-dark flex-1 overflow-y-auto rounded-[16px] border border-white/10 bg-black/50 p-3 text-xs min-h-[160px]"
      >
        {messages.length === 0 && !currentTranscript && (
          <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-center text-[color:var(--cream)]/50">
            <MessageSquare className="size-5 opacity-40" />
            <p className="text-[11px]">
              Tap the orb or select a prompt below to converse live on Page {currentPageNumber}.
            </p>
            {selectedText && (
              <p className="mt-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[10.5px] text-amber-300">
                🎯 Focused on highlighted passage: &ldquo;{selectedText.slice(0, 70)}...&rdquo;
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={cn(
                "rounded-[16px] p-3 leading-relaxed text-xs",
                m.role === "user"
                  ? "self-end max-w-[85%] border-2 border-[color:var(--ink)] bg-[#ff4c00] text-[color:var(--ink)] font-bold shadow-chip"
                  : "self-start max-w-[90%] border-2 border-[color:var(--ink)] bg-[#f6d7a1] text-[color:var(--ink)] font-medium shadow-chip"
              )}
            >
              <div className="mb-0.5 text-[9.5px] font-black uppercase tracking-wider text-[color:var(--ink)]/70">
                {m.role === "user" ? "You" : "Ascleon Mentor"}
              </div>
              <p>{m.content}</p>
            </div>
          ))}

          {currentTranscript && (
            <div className="self-end max-w-[85%] rounded-[16px] border-2 border-[color:var(--ink)] bg-[#7fd8c9] p-3 text-xs text-[color:var(--ink)] font-bold shadow-chip animate-pulse">
              <span className="text-[9.5px] font-black uppercase tracking-wider text-[color:var(--ink)]/80">You (Speaking...)</span>
              <p>{currentTranscript}</p>
            </div>
          )}
        </div>
      </div>

      {/* SOCRATIC VIVA STARTERS */}
      <div className="mt-2.5 flex flex-col gap-1.5 border-t border-[color:var(--ink)]/20 pt-2.5">
        <div className="flex items-center justify-between text-[10px] text-[color:var(--cream)]/60">
          <span className="font-bold uppercase tracking-wider text-[#7fd8c9]">Socratic Starters:</span>
          <span>Click to speak prompt</span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => startSession(`Quiz me orally on the core mechanisms of Page ${currentPageNumber}`)}
            className="flex cursor-pointer items-center gap-1.5 rounded-xl border-2 border-[color:var(--ink)] bg-[#f6d7a1] p-2 text-left text-[10.5px] text-[color:var(--ink)] font-bold shadow-xs transition-transform hover:-translate-y-0.5 hover:bg-[#ff4c00]"
          >
            <Award className="size-3.5 shrink-0 text-[#ff4c00]" />
            <span className="truncate">Oral Exam Viva</span>
          </button>

          <button
            type="button"
            onClick={() => startSession(`Explain the foundational principle of Page ${currentPageNumber} step by step`)}
            className="flex cursor-pointer items-center gap-1.5 rounded-xl border-2 border-[color:var(--ink)] bg-[#7fd8c9] p-2 text-left text-[10.5px] text-[color:var(--ink)] font-bold shadow-xs transition-transform hover:-translate-y-0.5 hover:bg-[#ff4c00]"
          >
            <Sparkles className="size-3.5 shrink-0 text-[color:var(--ink)]" />
            <span className="truncate">Step-by-Step Mechanism</span>
          </button>
        </div>
      </div>

      {/* TEXT INPUT FALLBACK BAR */}
      <form onSubmit={handleManualSubmit} className="mt-2 flex items-center gap-1.5">
        <input
          type="text"
          value={typedInput}
          onChange={(e) => setTypedInput(e.target.value)}
          placeholder={
            selectedLanguage === "ar"
              ? "اكتب سؤالك الصوتي هنا..."
              : "Type a spoken question here..."
          }
          className="flex-1 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-[color:var(--cream)] placeholder:text-white/40 focus:border-[color:var(--orange)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={!typedInput.trim()}
          className="flex size-7 items-center justify-center rounded-full bg-[color:var(--orange)] text-[color:var(--ink)] hover:opacity-90 disabled:opacity-40 cursor-pointer"
        >
          <Send className="size-3" />
        </button>
      </form>
    </div>
  );
}
