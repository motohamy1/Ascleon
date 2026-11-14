"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  PhoneOff,
  Settings2,
  Captions,
  ShieldAlert,
  Sparkles,
  X,
  RefreshCw,
  AlertCircle,
  Send,
  MessageSquare,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StudyLanguage } from "@/lib/language";
import { AVAILABLE_LIVE_VOICES } from "@/lib/voice-config";
import { StudyLanguageSwitch } from "@/components/reader/StudyLanguageSwitch";
import { useVoiceSession } from "@/components/reader/VoiceSessionContext";

interface AscleonVoiceStudioProps {
  currentPageNumber: number;
  onStudyLanguageChange?: (lang: StudyLanguage) => void;
  onClose?: () => void;
  onTriggerMorph?: () => void;
  onContinueInChat?: (summaryText: string) => void;
}

export function AscleonVoiceStudio({
  currentPageNumber,
  onStudyLanguageChange,
  onClose,
  onTriggerMorph,
  onContinueInChat,
}: AscleonVoiceStudioProps) {
  const {
    status,
    isConnected,
    isActiveOrConnecting,
    isMuted,
    toggleMute,
    noisyPlace,
    setNoisyPlace,
    isHoldToTalkActive,
    startHoldToTalk,
    stopHoldToTalk,
    connect,
    disconnect,
    resetSession,
    prefetchToken,
    bindVisualizerElement,
    sendTextMessage,
    messages,
    currentCaption,
    errorMessage,
    activeVisualTrigger,
    clearVisualTrigger,
    voiceName,
    setVoiceName,
    language,
  } = useVoiceSession();

  const [showSettings, setShowSettings] = useState(false);
  const [showTranscriptSheet, setShowTranscriptSheet] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [typedInput, setTypedInput] = useState("");
  const orbContainerRef = useRef<HTMLDivElement>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bindVisualizerElement(orbContainerRef.current);
    return () => bindVisualizerElement(null);
  }, [bindVisualizerElement, isActiveOrConnecting]);

  // Prefetch ephemeral token while idle so tapping Start connects fast
  useEffect(() => {
    if (status === "idle") {
      prefetchToken();
    }
  }, [status, prefetchToken]);

  // Auto-scroll transcript when sheet or post-call log updates
  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [messages, currentCaption, showTranscriptSheet]);

  // Spacebar hold-to-talk when noisyPlace is active
  useEffect(() => {
    if (!isConnected || !noisyPlace) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !e.repeat &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target as HTMLElement)?.isContentEditable
        )
      ) {
        e.preventDefault();
        startHoldToTalk();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        stopHoldToTalk();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isConnected, noisyPlace, startHoldToTalk, stopHoldToTalk]);

  const handleStarterChip = async (prompt: string) => {
    if (!isConnected) {
      await connect();
    }
    sendTextMessage(prompt);
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedInput.trim()) return;
    const text = typedInput.trim();
    setTypedInput("");
    if (!isConnected) {
      await connect();
    }
    sendTextMessage(text);
  };

  const statusLabel =
    status === "connecting"
      ? language === "ar"
        ? "جاري الاتصال…"
        : "Connecting…"
      : status === "reconnecting"
      ? language === "ar"
        ? "إعادة الاتصال…"
        : "Reconnecting…"
      : status === "speaking"
      ? language === "ar"
        ? "يتحدث"
        : "Speaking"
      : isMuted
      ? language === "ar"
        ? "الميكروفون مكتوم"
        : "Muted"
      : noisyPlace
      ? isHoldToTalkActive
        ? language === "ar"
          ? "يستمع إليك…"
          : "Listening…"
        : language === "ar"
        ? "اضغط مطولاً للتحدث"
        : "Hold to speak"
      : language === "ar"
      ? "يستمع"
      : "Listening";

  const latestCaption =
    currentCaption || (messages.length > 0 ? messages[messages.length - 1].text : "");

  // Settings Popover / Sheet (shared across Idle & Live)
  const renderSettingsPanel = () => {
    if (!showSettings) return null;
    return (
      <div className="absolute right-3 top-14 z-30 w-72 rounded-2xl border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-4 text-[color:var(--ink)] shadow-[4px_4px_0px_#0f0e10]">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-wider">Voice Settings</span>
          <button
            type="button"
            onClick={() => setShowSettings(false)}
            className="cursor-pointer rounded-full p-1 hover:bg-[color:var(--ink)]/10"
            aria-label="Close settings"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3.5 text-xs">
          {/* Language */}
          {onStudyLanguageChange && (
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-[color:var(--ink)]/70">
                Session Language
              </label>
              <StudyLanguageSwitch
                currentLanguage={language}
                onLanguageChange={onStudyLanguageChange}
              />
            </div>
          )}

          {/* Voice Persona */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-[color:var(--ink)]/70">
              Mentor Voice {isConnected ? "(next session)" : ""}
            </label>
            <select
              value={voiceName}
              disabled={isConnected}
              onChange={(e) => setVoiceName(e.target.value)}
              className="w-full cursor-pointer rounded-xl border-2 border-[color:var(--ink)] bg-white px-3 py-1.5 text-xs font-bold text-[color:var(--ink)] focus:outline-none disabled:opacity-50"
            >
              {AVAILABLE_LIVE_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.gender}) — {v.tone}
                </option>
              ))}
            </select>
          </div>

          {/* Noisy Place Toggle */}
          <div className="flex items-start justify-between gap-3 rounded-xl border border-[color:var(--ink)]/15 bg-white/70 p-2.5">
            <div>
              <div className="font-bold text-[color:var(--ink)]">
                {language === "ar" ? "مكان مزدحم (اضغط للتحدث)" : "Noisy place (Hold-to-talk)"}
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-[color:var(--ink)]/65">
                {language === "ar"
                  ? "يمنع الضوضاء المحيطة من مقاطعة الشرح."
                  : "Manual hold-to-speak so background chatter never interrupts."}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={noisyPlace}
              onClick={() => setNoisyPlace(!noisyPlace)}
              className={cn(
                "relative mt-0.5 h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-[color:var(--ink)] transition-colors duration-150",
                noisyPlace ? "bg-[color:var(--orange)]" : "bg-[color:var(--cream)]"
              )}
            >
              <span
                className={cn(
                  "block size-4 rounded-full bg-[color:var(--ink)] transition-transform duration-150",
                  noisyPlace ? "translate-x-5" : "translate-x-0.5"
                )}
              />
            </button>
          </div>

          {/* Captions Toggle */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--ink)]/15 bg-white/70 p-2.5">
            <span className="font-bold text-[color:var(--ink)]">
              {language === "ar" ? "إظهار الترجمة الحية" : "Live mentor captions"}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={showCaptions}
              onClick={() => setShowCaptions((prev) => !prev)}
              className={cn(
                "relative h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-[color:var(--ink)] transition-colors duration-150",
                showCaptions ? "bg-[color:var(--mint)]" : "bg-[color:var(--cream)]"
              )}
            >
              <span
                className={cn(
                  "block size-4 rounded-full bg-[color:var(--ink)] transition-transform duration-150",
                  showCaptions ? "translate-x-5" : "translate-x-0.5"
                )}
              />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // =========================================================================
  // 1. FOCUSED LIVE MODE (ChatGPT / Gemini / Claude style)
  // =========================================================================
  if (isActiveOrConnecting) {
    return (
      <div className="relative flex h-full flex-col justify-between overflow-hidden bg-[color:var(--ink-soft)] text-[color:var(--cream)]">
        {/* Quiet Top Bar */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full transition-colors duration-200",
                status === "speaking"
                  ? "bg-[color:var(--mint)]"
                  : status === "connecting" || status === "reconnecting"
                  ? "bg-amber-400 animate-pulse motion-reduce:animate-none"
                  : isMuted
                  ? "bg-red-400"
                  : "bg-[color:var(--orange)]"
              )}
            />
            <span className="text-xs font-semibold tracking-wide text-[color:var(--cream)]/85">
              {statusLabel}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowSettings((s) => !s)}
              className={cn(
                "flex size-8 cursor-pointer items-center justify-center rounded-full border transition-colors",
                showSettings
                  ? "border-[color:var(--orange)] bg-[color:var(--orange)] text-[color:var(--ink)]"
                  : "border-white/15 bg-white/5 text-[color:var(--cream)]/80 hover:bg-white/10"
              )}
              title="Voice settings"
              aria-label="Voice settings"
            >
              <Settings2 className="size-4" />
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/5 text-[color:var(--cream)]/80 hover:bg-white/10"
                title="Minimize"
                aria-label="Minimize"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {renderSettingsPanel()}

        {/* Optional Visual Grounding Pill */}
        {activeVisualTrigger && (
          <div className="mx-auto mt-1 flex max-w-[90%] items-center gap-2 rounded-full border border-[color:var(--mint)]/40 bg-[color:var(--mint)]/15 px-3 py-1 text-[11px] text-[color:var(--mint)]">
            <Sparkles className="size-3.5 shrink-0" />
            <span className="truncate font-semibold">{activeVisualTrigger.conceptName}</span>
            {activeVisualTrigger.action === "open_morph" && onTriggerMorph && (
              <button
                type="button"
                onClick={onTriggerMorph}
                className="cursor-pointer rounded-full bg-[color:var(--mint)] px-2 py-0.5 text-[10px] font-black text-[color:var(--ink)]"
              >
                Open Morph
              </button>
            )}
            <button
              type="button"
              onClick={clearVisualTrigger}
              className="cursor-pointer opacity-70 hover:opacity-100"
              aria-label="Dismiss visual trigger"
            >
              <X className="size-3" />
            </button>
          </div>
        )}

        {/* Centre Reactive Orb & Single Caption */}
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div
            ref={orbContainerRef}
            style={
              {
                "--voice-level": "0",
                "--voice-scale": "1",
              } as React.CSSProperties
            }
            className="relative flex items-center justify-center"
          >
            {/* Outer Ambient Halo */}
            <div
              className={cn(
                "pointer-events-none absolute size-44 rounded-full transition-colors duration-300 motion-reduce:transition-none",
                status === "speaking"
                  ? "bg-[color:var(--mint)]/18"
                  : isHoldToTalkActive
                  ? "bg-[color:var(--orange)]/25"
                  : "bg-[color:var(--orange)]/12"
              )}
              style={{
                transform: "scale(calc(var(--voice-scale, 1) * 1.12))",
              }}
            />

            {/* Primary Interactive Orb */}
            <button
              type="button"
              onPointerDown={noisyPlace ? startHoldToTalk : undefined}
              onPointerUp={noisyPlace ? stopHoldToTalk : undefined}
              onPointerCancel={noisyPlace ? stopHoldToTalk : undefined}
              onPointerLeave={noisyPlace ? stopHoldToTalk : undefined}
              onClick={!noisyPlace ? toggleMute : undefined}
              className={cn(
                "relative z-10 flex size-32 cursor-pointer select-none items-center justify-center rounded-full border-2 border-[color:var(--ink)] shadow-[0_0_40px_rgba(255,76,0,0.18)] transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--orange)] motion-reduce:transform-none",
                status === "speaking"
                  ? "bg-[color:var(--mint)] text-[color:var(--ink)]"
                  : status === "connecting" || status === "reconnecting"
                  ? "bg-[color:var(--cream)] text-[color:var(--ink)]"
                  : isMuted
                  ? "bg-white/10 text-[color:var(--cream)]/60 border-white/20"
                  : isHoldToTalkActive
                  ? "bg-[color:var(--orange)] text-[color:var(--ink)] ring-4 ring-[color:var(--orange)]/40"
                  : "bg-[color:var(--orange)] text-[color:var(--ink)]"
              )}
              style={{
                transform: "scale(var(--voice-scale, 1))",
              }}
              aria-label={
                noisyPlace
                  ? "Hold to speak"
                  : isMuted
                  ? "Unmute microphone"
                  : "Mute microphone"
              }
            >
              {status === "connecting" || status === "reconnecting" ? (
                <RefreshCw className="size-9 animate-spin motion-reduce:animate-none" />
              ) : isMuted ? (
                <MicOff className="size-9" />
              ) : (
                <Mic className="size-9" />
              )}
            </button>
          </div>

          {/* Helper hint for Noisy Place */}
          {noisyPlace && isConnected && (
            <p className="mt-4 text-[11px] font-semibold tracking-wide text-[color:var(--cream)]/65">
              {isHoldToTalkActive
                ? language === "ar"
                  ? "اترك الزر عند الانتهاء"
                  : "Release when done"
                : language === "ar"
                ? "اضغط مطولاً على الدائرة أو زر المسافة للتحدث"
                : "Hold orb or Spacebar to speak"}
            </p>
          )}

          {/* Single Live Mentor Caption Line */}
          {showCaptions && latestCaption && (
            <button
              type="button"
              onClick={() => setShowTranscriptSheet(true)}
              dir="auto"
              className="mt-6 max-w-[42ch] cursor-pointer rounded-2xl px-4 py-2 text-center text-sm font-medium leading-relaxed text-[color:var(--cream)]/90 transition-colors hover:bg-white/5 line-clamp-3"
              title="Tap to view full mentor transcript"
            >
              {latestCaption}
            </button>
          )}
        </div>

        {/* Bottom 4-Button Dock */}
        <div className="flex items-center justify-center gap-4 px-4 pb-6 pt-2">
          {/* 1. Mute / Unmute */}
          <button
            type="button"
            onClick={toggleMute}
            className={cn(
              "flex size-12 cursor-pointer items-center justify-center rounded-full border-2 transition-all duration-150",
              isMuted
                ? "border-red-400/70 bg-red-500/20 text-red-200 hover:bg-red-500/30"
                : "border-white/15 bg-white/10 text-[color:var(--cream)] hover:bg-white/20"
            )}
            title={isMuted ? "Unmute microphone" : "Mute microphone"}
            aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
          >
            {isMuted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </button>

          {/* 2. Noisy Place (Hold-to-Talk) */}
          <button
            type="button"
            onClick={() => setNoisyPlace(!noisyPlace)}
            className={cn(
              "flex size-12 cursor-pointer items-center justify-center rounded-full border-2 transition-all duration-150",
              noisyPlace
                ? "border-[color:var(--orange)] bg-[color:var(--orange)] text-[color:var(--ink)]"
                : "border-white/15 bg-white/10 text-[color:var(--cream)] hover:bg-white/20"
            )}
            title={
              noisyPlace
                ? "Noisy Place ON (Hold-to-talk) — tap for hands-free"
                : "Hands-free — tap to switch to Noisy Place (Hold-to-talk)"
            }
            aria-label="Toggle Noisy Place hold-to-talk"
            aria-pressed={noisyPlace}
          >
            <ShieldAlert className="size-5" />
          </button>

          {/* 3. Captions / Transcript Sheet */}
          <button
            type="button"
            onClick={() => setShowTranscriptSheet((s) => !s)}
            className={cn(
              "flex size-12 cursor-pointer items-center justify-center rounded-full border-2 transition-all duration-150",
              showTranscriptSheet
                ? "border-[color:var(--mint)] bg-[color:var(--mint)] text-[color:var(--ink)]"
                : "border-white/15 bg-white/10 text-[color:var(--cream)] hover:bg-white/20"
            )}
            title="View mentor transcript"
            aria-label="View mentor transcript"
          >
            <Captions className="size-5" />
          </button>

          {/* 4. End Session */}
          <button
            type="button"
            onClick={disconnect}
            className="flex size-12 cursor-pointer items-center justify-center rounded-full border-2 border-red-500 bg-red-600 text-white transition-all duration-150 hover:bg-red-500"
            title="End live session"
            aria-label="End live session"
          >
            <PhoneOff className="size-5" />
          </button>
        </div>

        {/* Slide-up Mentor Transcript Sheet */}
        {showTranscriptSheet && (
          <div className="absolute inset-x-0 bottom-0 top-14 z-20 flex flex-col rounded-t-2xl border-t-2 border-[color:var(--ink)] bg-[color:var(--panel)] text-[color:var(--ink)] shadow-lg">
            <div className="flex items-center justify-between border-b border-[color:var(--ink)]/10 px-4 py-3">
              <span className="text-xs font-black uppercase tracking-wider">
                Mentor Transcript
              </span>
              <button
                type="button"
                onClick={() => setShowTranscriptSheet(false)}
                className="cursor-pointer rounded-full p-1 hover:bg-[color:var(--ink)]/10"
                aria-label="Close transcript"
              >
                <X className="size-4" />
              </button>
            </div>

            <div ref={transcriptScrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && !currentCaption && (
                <p className="py-8 text-center text-xs font-medium text-[color:var(--ink)]/55">
                  Mentor captions will appear here as the session progresses.
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  dir="auto"
                  className="ascleon-bidi rounded-xl border border-[color:var(--ink)]/15 bg-white p-3 text-xs leading-relaxed text-[color:var(--ink)]"
                >
                  <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-[color:var(--ink)]/55">
                    <span>ASCLEON MENTOR</span>
                    <div className="flex items-center gap-1.5">
                      {m.interrupted && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                          Interrupted
                        </span>
                      )}
                      <span>{m.time}</span>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                </div>
              ))}
              {currentCaption && (
                <div
                  dir="auto"
                  className="ascleon-bidi rounded-xl border border-[color:var(--orange)]/40 bg-[color:var(--cream)]/50 p-3 text-xs leading-relaxed text-[color:var(--ink)]"
                >
                  <p className="whitespace-pre-wrap">{currentCaption}</p>
                </div>
              )}
            </div>

            <form
              onSubmit={handleSendText}
              className="flex items-center gap-2 border-t border-[color:var(--ink)]/10 bg-white p-3"
            >
              <input
                type="text"
                dir="auto"
                value={typedInput}
                onChange={(e) => setTypedInput(e.target.value)}
                placeholder="Type a question silently…"
                className="ascleon-bidi flex-1 rounded-xl border border-[color:var(--ink)]/20 bg-[color:var(--panel)] px-3 py-2 text-xs font-medium text-[color:var(--ink)] focus:border-[color:var(--orange)] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!typedInput.trim()}
                className="flex size-9 cursor-pointer items-center justify-center rounded-xl bg-[color:var(--orange)] text-[color:var(--ink)] disabled:opacity-40"
                aria-label="Send"
              >
                <Send className="size-4" />
              </button>
            </form>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // 2. IDLE / POST-CALL VIEW
  // =========================================================================
  return (
    <div className="relative flex h-full flex-col bg-[color:var(--ink-soft)] text-[color:var(--cream)]">
      {/* Clean Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-[color:var(--cream)]">
            Ascleon Voice
          </span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--cream)]/75">
            Page {currentPageNumber}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={resetSession}
              className="flex cursor-pointer items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-[color:var(--cream)] hover:bg-white/10"
              title="Clear history and start a new session"
            >
              <RotateCcw className="size-3" />
              <span>New</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSettings((s) => !s)}
            className={cn(
              "flex size-8 cursor-pointer items-center justify-center rounded-full border transition-colors",
              showSettings
                ? "border-[color:var(--orange)] bg-[color:var(--orange)] text-[color:var(--ink)]"
                : "border-white/15 bg-white/5 text-[color:var(--cream)]/80 hover:bg-white/10"
            )}
            title="Voice settings"
            aria-label="Voice settings"
          >
            <Settings2 className="size-4" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/5 text-[color:var(--cream)]/80 hover:bg-white/10"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {renderSettingsPanel()}

      {/* Error Notice */}
      {errorMessage && (
        <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-xl border border-red-400/50 bg-red-500/15 px-3 py-2 text-xs text-red-100">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0 text-red-300" />
            <span className="font-medium">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={connect}
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-400"
          >
            <RefreshCw className="size-3" />
            Retry
          </button>
        </div>
      )}

      {/* Main Content: Empty Hero vs Post-Call Review */}
      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <button
            type="button"
            onPointerEnter={prefetchToken}
            onFocus={prefetchToken}
            onClick={connect}
            className="flex size-28 cursor-pointer items-center justify-center rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)] shadow-[0_0_40px_rgba(255,76,0,0.22)] transition-transform duration-150 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--orange)]"
            aria-label="Start live voice session"
          >
            <Mic className="size-10" />
          </button>

          <h3 className="mt-5 text-sm font-bold text-[color:var(--cream)]">
            {language === "ar"
              ? "ابدأ جلسة صوتية حية"
              : "Tap to start a live voice session"}
          </h3>
          <p className="mt-1.5 max-w-[34ch] text-xs leading-relaxed text-[color:var(--cream)]/65">
            {language === "ar"
              ? "اتكلم بشكل طبيعي وقاطع الشرح في أي وقت للسؤال."
              : "Speak naturally about this page and interrupt anytime to ask a question."}
          </p>

          {/* Starter Chips */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {[
              language === "ar"
                ? "اشرح لي الصفحة دي ببساطة"
                : language === "mixed"
                ? "اشرح لي الـ mechanism هنا"
                : "Explain this page clearly",
              language === "ar"
                ? "اسألني سؤال شفوي سريع"
                : language === "mixed"
                ? "Quiz me على النقطة دي"
                : "Quiz me orally on this",
              language === "ar"
                ? "أهم نقاط الامتحان هنا"
                : language === "mixed"
                ? "إيه الـ high-yield pearls هنا؟"
                : "High-yield exam pearls",
            ].map((chip) => (
              <button
                key={chip}
                type="button"
                dir="auto"
                onClick={() => handleStarterChip(chip)}
                className="ascleon-bidi cursor-pointer rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-[color:var(--cream)]/90 transition-colors hover:border-[color:var(--orange)] hover:bg-white/10"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div ref={transcriptScrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m) => (
              <div
                key={m.id}
                dir="auto"
                className="ascleon-bidi rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-relaxed text-[color:var(--cream)]/90"
              >
                <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-[color:var(--cream)]/50">
                  <span>ASCLEON MENTOR</span>
                  <span>{m.time}</span>
                </div>
                <p className="whitespace-pre-wrap">{m.text}</p>
              </div>
            ))}
          </div>

          {/* Resume & Continue Actions */}
          <div className="flex items-center gap-2 border-t border-white/10 p-3">
            <button
              type="button"
              onClick={connect}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-[color:var(--ink)] bg-[color:var(--orange)] py-2.5 text-xs font-black text-[color:var(--ink)] transition-opacity hover:opacity-95"
            >
              <Mic className="size-4" />
              <span>{language === "ar" ? "استكمال الجلسة" : "Resume Voice"}</span>
            </button>

            {onContinueInChat && (
              <button
                type="button"
                onClick={() => {
                  const summary = messages.map((m) => m.text).join("\n\n");
                  onContinueInChat(summary);
                }}
                className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3.5 py-2.5 text-xs font-bold text-[color:var(--cream)] hover:bg-white/10"
              >
                <MessageSquare className="size-4" />
                <span>{language === "ar" ? "متابعة في الشات" : "AI Chat"}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
