"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Mic, MicOff, PhoneOff, ShieldAlert } from "lucide-react";
import { StudyLanguage } from "@/lib/language";
import { DEFAULT_LIVE_VOICE } from "@/lib/voice-config";
import {
  useLiveVoice,
  LiveVoiceMessage,
  LiveVoiceStatus,
  VisualTriggerEvent,
} from "@/hooks/useLiveVoice";

interface VoiceSessionContextValue {
  status: LiveVoiceStatus;
  isConnected: boolean;
  isActiveOrConnecting: boolean;
  isMuted: boolean;
  toggleMute: () => void;
  noisyPlace: boolean;
  setNoisyPlace: (val: boolean) => void;
  isHoldToTalkActive: boolean;
  startHoldToTalk: () => void;
  stopHoldToTalk: () => void;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  resetSession: () => void;
  prefetchToken: () => void;
  bindVisualizerElement: (el: HTMLElement | null) => void;
  sendTextMessage: (text: string) => void;
  messages: LiveVoiceMessage[];
  currentCaption: string;
  errorMessage: string | null;
  activeVisualTrigger: VisualTriggerEvent | null;
  clearVisualTrigger: () => void;
  voiceName: string;
  setVoiceName: (voice: string) => void;
  language: StudyLanguage;
}

const VoiceSessionContext = createContext<VoiceSessionContextValue | null>(null);

interface VoiceSessionProviderProps {
  children: React.ReactNode;
  bookTitle: string;
  currentPageNumber: number;
  currentSectionText: string;
  selectedText?: string;
  authoritativeReferences?: unknown[];
  studyLanguage: StudyLanguage;
  voiceName?: string;
  onVoiceNameChange?: (voice: string) => void;
  isMicMuted?: boolean;
  onMicMutedChange?: (muted: boolean) => void;
  isAgentSoundMuted?: boolean;
  onTriggerMorph?: () => void;
}

export function VoiceSessionProvider({
  children,
  bookTitle,
  currentPageNumber,
  currentSectionText,
  selectedText,
  authoritativeReferences = [],
  studyLanguage,
  voiceName: controlledVoiceName,
  onVoiceNameChange,
  isMicMuted,
  onMicMutedChange,
  isAgentSoundMuted = false,
  onTriggerMorph,
}: VoiceSessionProviderProps) {
  const [internalVoiceName, setInternalVoiceName] = useState(DEFAULT_LIVE_VOICE);
  const voiceName = controlledVoiceName ?? internalVoiceName;
  const setVoiceName = useCallback(
    (v: string) => {
      setInternalVoiceName(v);
      onVoiceNameChange?.(v);
    },
    [onVoiceNameChange]
  );

  const [noisyPlace, setNoisyPlaceState] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("ascleon_voice_noisy_place") === "true";
    } catch {
      return false;
    }
  });

  const setNoisyPlace = useCallback((val: boolean) => {
    setNoisyPlaceState(val);
    try {
      localStorage.setItem("ascleon_voice_noisy_place", val ? "true" : "false");
    } catch {}
  }, []);

  const handleVisualTrigger = useCallback(
    (event: VisualTriggerEvent) => {
      if (event.action === "open_morph" && onTriggerMorph) {
        onTriggerMorph();
      }
    },
    [onTriggerMorph]
  );

  const voice = useLiveVoice({
    bookTitle,
    pageNumber: currentPageNumber,
    pageText: currentSectionText,
    selectedText,
    authoritativeReferences,
    language: studyLanguage,
    voiceName,
    noisyPlace,
    isMuted: isMicMuted,
    isOutputMuted: isAgentSoundMuted,
    onVisualTrigger: handleVisualTrigger,
  });

  const {
    isConnected: voiceConnected,
    updatePageContext,
    isMuted: voiceMuted,
    toggleMute: voiceToggleMute,
  } = voice;

  // Sync page changes while session is active
  useEffect(() => {
    if (voiceConnected) {
      updatePageContext(currentSectionText, currentPageNumber);
    }
  }, [currentPageNumber, currentSectionText, voiceConnected, updatePageContext]);

  const handleToggleMute = useCallback(() => {
    const nextMuted = !voiceMuted;
    voiceToggleMute();
    onMicMutedChange?.(nextMuted);
  }, [voiceMuted, voiceToggleMute, onMicMutedChange]);

  const isActiveOrConnecting =
    voice.isConnected || voice.status === "connecting" || voice.status === "reconnecting";

  return (
    <VoiceSessionContext.Provider
      value={{
        status: voice.status,
        isConnected: voice.isConnected,
        isActiveOrConnecting,
        isMuted: voice.isMuted,
        toggleMute: handleToggleMute,
        noisyPlace,
        setNoisyPlace,
        isHoldToTalkActive: voice.isHoldToTalkActive,
        startHoldToTalk: voice.startHoldToTalk,
        stopHoldToTalk: voice.stopHoldToTalk,
        connect: voice.connect,
        disconnect: voice.disconnect,
        resetSession: voice.resetSession,
        prefetchToken: voice.prefetchToken,
        bindVisualizerElement: voice.bindVisualizerElement,
        sendTextMessage: voice.sendTextMessage,
        messages: voice.messages,
        currentCaption: voice.currentCaption,
        errorMessage: voice.errorMessage,
        activeVisualTrigger: voice.activeVisualTrigger,
        clearVisualTrigger: voice.clearVisualTrigger,
        voiceName,
        setVoiceName,
        language: studyLanguage,
      }}
    >
      {children}
    </VoiceSessionContext.Provider>
  );
}

export function useVoiceSession() {
  const ctx = useContext(VoiceSessionContext);
  if (!ctx) {
    throw new Error("useVoiceSession must be used inside VoiceSessionProvider");
  }
  return ctx;
}

export function NoisyPlaceQuickToggle() {
  const { noisyPlace, setNoisyPlace } = useVoiceSession();
  return (
    <button
      type="button"
      onClick={() => setNoisyPlace(!noisyPlace)}
      className={`flex w-full cursor-pointer items-center justify-between rounded-lg border px-2.5 py-1.5 text-[10.5px] font-bold transition-colors ${
        noisyPlace
          ? "border-[#ff4c00]/70 bg-[#ff4c00]/20 text-[#f6d7a1]"
          : "border-white/15 bg-white/5 text-[#f6d7a1]/80 hover:bg-white/10"
      }`}
      title="Enable hold-to-talk when studying in a noisy place"
    >
      <span className="flex items-center gap-1.5">
        <ShieldAlert className="size-3.5" />
        <span>Noisy place (Hold-to-talk)</span>
      </span>
      <span className="text-[9.5px] uppercase tracking-wider opacity-80">
        {noisyPlace ? "On" : "Off"}
      </span>
    </button>
  );
}

export function ActiveVoiceMiniBar({ onReturnToVoice }: { onReturnToVoice: () => void }) {
  const { isActiveOrConnecting, status, isMuted, toggleMute, disconnect } = useVoiceSession();
  if (!isActiveOrConnecting) return null;

  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-[#ff4c00]/15 px-3 py-1.5 text-xs text-[#f6d7a1]">
      <button
        type="button"
        onClick={onReturnToVoice}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
      >
        <span
          className={`size-2 shrink-0 rounded-full ${
            status === "speaking" ? "bg-[#7fd8c9]" : "bg-[#ff4c00] animate-pulse"
          }`}
        />
        <span className="truncate font-bold">
          Live Voice {status === "speaking" ? "Speaking" : "Active"} — Tap to return
        </span>
      </button>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggleMute}
          className={`flex size-7 cursor-pointer items-center justify-center rounded-full border ${
            isMuted
              ? "border-red-400/60 bg-red-500/20 text-red-200"
              : "border-white/20 bg-white/10 text-[#f6d7a1]"
          }`}
          title={isMuted ? "Unmute mic" : "Mute mic"}
        >
          {isMuted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={disconnect}
          className="flex size-7 cursor-pointer items-center justify-center rounded-full border border-red-500 bg-red-600 text-white hover:bg-red-500"
          title="End live voice"
        >
          <PhoneOff className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
