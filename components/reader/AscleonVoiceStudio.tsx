"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Sparkles,
  Activity,
  X,
  Volume2,
  Send,
  Radio,
  AlertCircle,
  ChevronDown,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StudyLanguage } from "@/lib/language";
import { AVAILABLE_LIVE_VOICES, DEFAULT_LIVE_VOICE } from "@/lib/voice-config";
import { useLiveVoice, VisualTriggerEvent } from "@/hooks/useLiveVoice";
import { StudyLanguageSwitch } from "@/components/reader/StudyLanguageSwitch";

interface AscleonVoiceStudioProps {
  bookTitle: string;
  currentPageNumber: number;
  currentSectionText: string;
  selectedText?: string;
  authoritativeReferences?: any[];
  studyLanguage?: StudyLanguage;
  onStudyLanguageChange?: (lang: StudyLanguage) => void;
  // Backwards compatibility props
  language?: any;
  onLanguageChange?: (lang: any) => void;
  onClose?: () => void;
  isFloating?: boolean;
  onTriggerMorph?: () => void;
}

export function AscleonVoiceStudio({
  bookTitle,
  currentPageNumber,
  currentSectionText,
  selectedText,
  authoritativeReferences = [],
  studyLanguage = "en",
  onStudyLanguageChange,
  language,
  onLanguageChange,
  onClose,
  isFloating = false,
  onTriggerMorph,
}: AscleonVoiceStudioProps) {
  // Normalize study language
  const activeLang: StudyLanguage =
    studyLanguage || (language?.code === "ar" ? "ar" : language?.code === "mixed" ? "mixed" : "en");

  const [selectedVoice, setSelectedVoice] = useState<string>(DEFAULT_LIVE_VOICE);
  const [typedInput, setTypedInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleVisualTrigger = (event: VisualTriggerEvent) => {
    if (event.action === "open_morph" && onTriggerMorph) {
      onTriggerMorph();
    }
  };

  const {
    status,
    isConnected,
    isMuted,
    toggleMute,
    connect,
    disconnect,
    resetSession,
    sendTextMessage,
    updatePageContext,
    messages,
    currentInputTranscript,
    currentOutputTranscript,
    inputLevel,
    outputLevel,
    errorMessage,
    activeVisualTrigger,
    clearVisualTrigger,
  } = useLiveVoice({
    bookTitle,
    pageNumber: currentPageNumber,
    pageText: currentSectionText,
    selectedText,
    authoritativeReferences,
    language: activeLang,
    voiceName: selectedVoice,
    onVisualTrigger: handleVisualTrigger,
  });

  // Track page changes during live call
  useEffect(() => {
    if (isConnected) {
      updatePageContext(currentSectionText, currentPageNumber);
    }
  }, [currentPageNumber, currentSectionText, isConnected, updatePageContext]);

  // Scroll to bottom of message transcripts
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentInputTranscript, currentOutputTranscript]);

  const handleSendText = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!typedInput.trim()) return;
    const textToSend = typedInput;
    setTypedInput("");

    if (!isConnected) {
      connect().then(() => {
        sendTextMessage(textToSend);
      });
    } else {
      sendTextMessage(textToSend);
    }
  };

  const handleChipClick = (chipText: string) => {
    if (!isConnected) {
      connect().then(() => {
        sendTextMessage(chipText);
      });
    } else {
      sendTextMessage(chipText);
    }
  };

  // Compute reactive visualizer energy
  const activeLevel = status === "mentor_speaking" ? outputLevel : inputLevel;
  const orbScale = isConnected ? 1 + Math.min(0.25, activeLevel * 0.4) : 1;

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-[color:var(--ink-soft)] text-[color:var(--ink)] overflow-hidden",
        isFloating && "fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] h-[580px] rounded-[22px] border-2 border-[color:var(--ink)] shadow-[6px_6px_0px_#0f0e10]"
      )}
    >
      {/* 1. TOP HEADER & CONTROLS BAR (Matches AI Chat header bar in LivingReader) */}
      <div className="flex flex-col gap-2.5 border-b-2 border-[color:var(--ink)] bg-[color:var(--ink-soft)] p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex size-7 items-center justify-center rounded-full border-2 border-[color:var(--ink)] shadow-chip transition-all",
                isConnected
                  ? "bg-[color:var(--orange)] text-[color:var(--ink)]"
                  : "bg-[color:var(--cream)] text-[color:var(--ink)]"
              )}
            >
              <Radio className="size-3.5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-black tracking-tight text-[color:var(--cream)] uppercase">
                  ASCLEON VOICE AGENT
                </span>
                <span className="rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-2 py-0.5 text-[9px] font-black uppercase text-[color:var(--ink)] shadow-[1px_1px_0px_#0f0e10]">
                  LIVE CLINICAL MENTOR
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* New Session Button if paused with existing messages */}
            {messages.length > 0 && !isConnected && (
              <button
                type="button"
                onClick={resetSession}
                className="cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--cream)] px-2.5 py-1 font-mono text-[10px] font-black uppercase text-[color:var(--ink)] shadow-chip hover:bg-[color:var(--orange)] transition-colors"
                title="Clear history and start a fresh session"
              >
                New Session
              </button>
            )}

            {/* Voice Persona Selector */}
            <div className="relative">
              <select
                value={selectedVoice}
                disabled={isConnected}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="appearance-none cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--cream)] pl-3 pr-7 py-1 font-mono text-[11px] font-black text-[color:var(--ink)] shadow-chip focus:outline-none disabled:opacity-50"
                title="Select Mentor Voice Persona"
              >
                {AVAILABLE_LIVE_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.gender})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-3 text-[color:var(--ink)] stroke-[2.5]" />
            </div>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-1.5 text-[color:var(--ink)] shadow-chip hover:bg-[color:var(--orange)]"
              >
                <X className="size-3.5 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>

        {/* Study Language Switch (Unified across Reader) */}
        {onStudyLanguageChange && (
          <div className="flex items-center justify-between pt-0.5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[color:var(--cream)]/80">
              Session Language:
            </span>
            <StudyLanguageSwitch
              currentLanguage={activeLang}
              onLanguageChange={onStudyLanguageChange}
            />
          </div>
        )}
      </div>

      {/* VISUAL TRIGGER ACTION BANNER ("Show while explaining") */}
      {activeVisualTrigger && (
        <div className="mx-3 mt-3 flex items-center justify-between rounded-[14px] border-2 border-[color:var(--ink)] bg-[color:var(--mint)] px-3 py-2 text-xs text-[color:var(--ink)] shadow-chip animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 shrink-0 text-[color:var(--ink)]" />
            <div>
              <div className="font-black">
                {activeVisualTrigger.action === "open_morph" ? "Morph View Activated:" : "Concept Highlighted:"}{" "}
                <span className="underline decoration-2">{activeVisualTrigger.conceptName}</span>
              </div>
              {activeVisualTrigger.explanation && (
                <div className="text-[11px] font-semibold text-[color:var(--ink)]/80">
                  {activeVisualTrigger.explanation}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {activeVisualTrigger.action === "open_morph" && onTriggerMorph && (
              <button
                type="button"
                onClick={onTriggerMorph}
                className="cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--panel)] px-2.5 py-1 text-[10px] font-black uppercase text-[color:var(--ink)] shadow-[1px_1px_0px_#0f0e10] hover:bg-[color:var(--orange)]"
              >
                View Morph
              </button>
            )}
            <button
              type="button"
              onClick={clearVisualTrigger}
              className="cursor-pointer rounded p-1 text-[color:var(--ink)] hover:opacity-70"
            >
              <X className="size-3.5 stroke-[2.5]" />
            </button>
          </div>
        </div>
      )}

      {/* ERROR NOTICE */}
      {errorMessage && (
        <div className="mx-3 mt-3 flex items-center justify-between rounded-[14px] border-2 border-[color:var(--ink)] bg-red-100 px-3 py-2 text-xs text-red-900 shadow-chip">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0 text-red-700" />
            <span className="font-bold">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={connect}
            className="flex items-center gap-1 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--cream)] px-2.5 py-1 text-[10px] font-black uppercase shadow-[1px_1px_0px_#0f0e10] hover:bg-[color:var(--orange)]"
          >
            <RefreshCw className="size-3 stroke-[2.5]" />
            Retry
          </button>
        </div>
      )}

      {/* 2. MAIN CONVERSATION STAGE & ORB */}
      <div className="flex flex-1 flex-col overflow-hidden p-3 gap-3">
        {/* INTERACTIVE LIVE ORB HERO CARD */}
        <div className="flex flex-col items-center justify-center rounded-[18px] border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-4 shadow-chip">
          <div className="relative flex items-center justify-center">
            {/* Outer reactive pulse rings */}
            <div
              className="absolute size-32 rounded-full border-2 border-[color:var(--ink)] transition-all duration-100"
              style={{
                transform: `scale(${orbScale * 1.15})`,
                opacity: isConnected ? 0.35 : 0,
              }}
            />
            <div
              className="absolute size-28 rounded-full border-2 border-[color:var(--orange)] transition-all duration-75"
              style={{
                transform: `scale(${orbScale * 1.08})`,
                opacity: isConnected ? 0.6 : 0,
              }}
            />

            {/* Central Orb Button */}
            <button
              type="button"
              onClick={isConnected ? disconnect : connect}
              className={cn(
                "relative z-10 flex size-24 cursor-pointer items-center justify-center rounded-full border-2 border-[color:var(--ink)] transition-all duration-150 shadow-chip",
                isConnected
                  ? status === "mentor_speaking"
                    ? "bg-[color:var(--mint)] text-[color:var(--ink)]"
                    : status === "interrupted"
                    ? "bg-amber-300 text-[color:var(--ink)]"
                    : "bg-[color:var(--orange)] text-[color:var(--ink)]"
                  : status === "connecting"
                  ? "bg-[color:var(--orange)] text-[color:var(--ink)] animate-spin"
                  : "bg-[color:var(--panel)] text-[color:var(--ink)] hover:bg-[color:var(--orange)]"
              )}
              style={{ transform: `scale(${orbScale})` }}
              title={isConnected ? "Tap to End Oral Session" : "Tap to Start Live Voice Mentor"}
            >
              {status === "connecting" ? (
                <Activity className="size-8 stroke-[2.5] animate-pulse" />
              ) : isConnected ? (
                status === "mentor_speaking" ? (
                  <Volume2 className="size-8 stroke-[2.5]" />
                ) : (
                  <Mic className="size-8 stroke-[2.5] animate-pulse" />
                )
              ) : (
                <Mic className="size-8 stroke-[2.5]" />
              )}
            </button>
          </div>

          {/* STATUS LABEL & LIVE MIC ENERGY */}
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <span className="font-mono text-[11px] font-black uppercase tracking-wider text-[color:var(--ink)]">
              {status === "connecting" && "SETTING UP ASCLEON VOICE AGENT..."}
              {status === "listening" && (isMuted ? "MIC MUTED (LISTENING PAUSED)" : "READY — SPEAK NATURALLY")}
              {status === "mentor_speaking" && "ASCLEON MENTOR SPEAKING (BARGE-IN READY)"}
              {status === "interrupted" && "INTERRUPTED! LISTENING TO YOUR QUESTION..."}
              {status === "disconnected" &&
                (messages.length > 0
                  ? "SESSION PAUSED — TAP MIC TO RESUME"
                  : "TAP MIC TO BEGIN LIVE VOICE SESSION")}
              {status === "error" && "DISCONNECTED"}
            </span>

            {/* Waveform indicator */}
            {isConnected && (
              <div className="flex items-center gap-1 py-0.5">
                {Array.from({ length: 9 }).map((_, i) => {
                  const factor = Math.sin((i / 8) * Math.PI);
                  const barHeight = Math.max(5, Math.round(activeLevel * 22 * factor));
                  return (
                    <div
                      key={i}
                      className="w-1.5 rounded-full border border-[color:var(--ink)] bg-[color:var(--ink)] transition-all duration-75"
                      style={{ height: `${barHeight}px` }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 3. LIVE TRANSCRIPT CARDS (BiDi safe with .ascleon-bidi & dir="auto") */}
        <div
          ref={scrollRef}
          className="custom-scrollbar-dark flex-1 space-y-3 overflow-y-auto rounded-[18px] border-2 border-[color:var(--ink)] bg-[color:var(--ink)]/40 p-3"
        >
          {messages.length === 0 && !currentInputTranscript && !currentOutputTranscript && (
            <div className="flex h-full flex-col items-center justify-center p-4 text-center">
              <Sparkles className="size-7 mb-2 text-[color:var(--orange)]" />
              <p className="font-bold text-xs text-[color:var(--cream)] max-w-xs leading-relaxed">
                {activeLang === "ar"
                  ? "تكلم بحرية باللهجة المصرية، اسأل أي سؤال إكلينيكي في الصفحة وقاطع دكتور وائل في أي لحظة زي الراوند الحقيقي!"
                  : activeLang === "mixed"
                  ? "تكلم براحتك مكس مصري + English Medical Terms، وقاطع الـ AI في أي وقت!"
                  : "Speak naturally in English grounded in this book. Interrupt at any time just like a real medical round!"}
              </p>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              dir="auto"
              className={cn(
                "ascleon-bidi rounded-[18px] border-2 border-[color:var(--ink)] p-3 text-xs shadow-chip",
                m.role === "user"
                  ? "ml-6 bg-[color:var(--orange)] text-[color:var(--ink)] font-bold"
                  : "mr-6 bg-[color:var(--cream)] text-[color:var(--ink)]"
              )}
            >
              <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-[color:var(--ink)]/20">
                <span className="font-mono text-[10px] font-black uppercase tracking-wider text-[color:var(--ink)]">
                  {m.role === "user" ? "YOU · VOICE" : `ASCLEON MENTOR (${selectedVoice})`}
                </span>
                <div className="flex items-center gap-1.5 font-mono text-[9px] text-[color:var(--ink)]/70">
                  {m.interrupted && (
                    <span className="rounded bg-red-500 text-white px-1 py-0.2 font-bold uppercase">
                      Interrupted
                    </span>
                  )}
                  <span>{m.time}</span>
                </div>
              </div>
              <p className="whitespace-pre-wrap">{m.text}</p>
            </div>
          ))}

          {/* Real-time Interim User Transcript */}
          {currentInputTranscript && (
            <div
              dir="auto"
              className="ascleon-bidi ml-6 rounded-[18px] border-2 border-[color:var(--ink)] bg-[color:var(--orange)]/90 p-3 text-xs text-[color:var(--ink)] font-bold shadow-chip animate-pulse"
            >
              <div className="mb-1 font-mono text-[10px] font-black uppercase tracking-wider text-[color:var(--ink)]">
                YOU (SPEAKING...)
              </div>
              <p className="whitespace-pre-wrap">{currentInputTranscript}</p>
            </div>
          )}

          {/* Real-time Interim Mentor Transcript */}
          {currentOutputTranscript && (
            <div
              dir="auto"
              className="ascleon-bidi mr-6 rounded-[18px] border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-3 text-xs text-[color:var(--ink)] shadow-chip animate-pulse"
            >
              <div className="mb-1 font-mono text-[10px] font-black uppercase tracking-wider text-[color:var(--ink)]">
                ASCLEON MENTOR (SPEAKING...)
              </div>
              <p className="whitespace-pre-wrap">{currentOutputTranscript}</p>
            </div>
          )}
        </div>

        {/* 4. SOCRATIC QUESTION SUGGESTION CHIPS */}
        <div className="flex flex-wrap gap-1.5">
          {[
            activeLang === "ar"
              ? "اشرح لي فكرة الصفحة دي ببساطة"
              : activeLang === "mixed"
              ? "إيه الـ mechanism بتاع الـ onset والـ course هنا؟"
              : "Explain the core mechanism on this page",
            activeLang === "ar"
              ? "اسألني سؤال شفوي سريع"
              : activeLang === "mixed"
              ? "Quiz me على الـ differential diagnosis"
              : "Quiz me on differential diagnosis",
            activeLang === "ar"
              ? "إيه أهم التريكات اللي بتيجي في الامتحان؟"
              : activeLang === "mixed"
              ? "إيه الـ high-yield exam pearls هنا؟"
              : "What are the high-yield exam pearls?",
          ].map((chip, idx) => (
            <button
              key={idx}
              type="button"
              dir="auto"
              onClick={() => handleChipClick(chip)}
              className="ascleon-bidi cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--panel)] px-3 py-1 font-sans text-[11px] font-bold text-[color:var(--ink)] shadow-chip transition-all hover:bg-[color:var(--orange)]"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* 5. FOOTER CONTROLS & TEXT INPUT (Matches AI Chat composer in LivingReader) */}
      <div className="border-t-2 border-[color:var(--ink)] bg-[color:var(--ink-soft)] p-3">
        <form onSubmit={handleSendText} className="flex items-center gap-2">
          {/* Mute Mic Toggle */}
          <button
            type="button"
            onClick={toggleMute}
            disabled={!isConnected}
            className={cn(
              "flex size-10 cursor-pointer items-center justify-center rounded-[14px] border-2 border-[color:var(--ink)] shadow-chip transition-all disabled:opacity-40",
              isMuted
                ? "bg-red-400 text-[color:var(--ink)]"
                : "bg-[color:var(--cream)] text-[color:var(--ink)] hover:bg-[color:var(--orange)]"
            )}
            title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
          >
            {isMuted ? <MicOff className="size-4 stroke-[2.5]" /> : <Mic className="size-4 stroke-[2.5]" />}
          </button>

          {/* Text Input Field */}
          <input
            type="text"
            dir="auto"
            value={typedInput}
            onChange={(e) => setTypedInput(e.target.value)}
            placeholder={
              isConnected
                ? activeLang === "ar"
                  ? "اكتب أو اتكلم مع دكتور وائل في الراوند الشفوي..."
                  : activeLang === "mixed"
                  ? "Type your clinical question or speak..."
                  : "Type your clinical question into oral session..."
                : "Type question or tap mic above..."
            }
            className="ascleon-bidi flex-1 rounded-[14px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] px-3 py-2 text-xs font-bold text-[color:var(--ink)] placeholder-[color:var(--ink)]/50 shadow-chip focus:outline-none focus:ring-2 focus:ring-[color:var(--orange)]"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!typedInput.trim()}
            className="flex size-10 cursor-pointer items-center justify-center rounded-[14px] border-2 border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)] font-bold shadow-chip transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            title="Send into session"
          >
            <Send className="size-4 stroke-[2.5]" />
          </button>
        </form>
      </div>
    </div>
  );
}
