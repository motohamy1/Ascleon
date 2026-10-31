"use client";

import React from "react";
import { voiceOptions, voiceCategories, DEFAULT_VOICE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { User, Volume2 } from "lucide-react";

interface VoiceSelectorProps {
  value?: string;
  onChange: (voiceId: string) => void;
  disabled?: boolean;
  className?: string;
}

const VoiceSelector = ({
  value = DEFAULT_VOICE,
  onChange,
  disabled = false,
  className,
}: VoiceSelectorProps) => {
  const maleVoices = voiceCategories.male.map((key) => ({
    key,
    ...voiceOptions[key as keyof typeof voiceOptions],
  }));
  const femaleVoices = voiceCategories.female.map((key) => ({
    key,
    ...voiceOptions[key as keyof typeof voiceOptions],
  }));

  const renderVoiceGroup = (voices: typeof maleVoices, label: string) => (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider text-[color:var(--ink)] opacity-75">
        {label}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {voices.map((voice) => {
          const isSelected = value === voice.id || value === voice.key;
          return (
            <button
              key={voice.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(voice.id)}
              className={cn(
                "flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all text-left cursor-pointer",
                isSelected
                  ? "border-[color:var(--ink)] bg-[color:var(--orange)]/20 shadow-xs"
                  : "border-[color:var(--ink)]/20 bg-[color:var(--cream)] hover:border-[color:var(--ink)]/60 hover:bg-[color:var(--cream)]/80",
                disabled && "opacity-50 cursor-not-allowed",
              )}
            >
              <div
                className={cn(
                  "p-2 rounded-lg border border-[color:var(--ink)]",
                  isSelected
                    ? "bg-[color:var(--orange)] text-[color:var(--ink)]"
                    : "bg-[color:var(--panel)] text-[color:var(--ink)]/60",
                )}
              >
                {isSelected ? (
                  <Volume2 className="size-3.5" />
                ) : (
                  <User className="size-3.5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-[color:var(--ink)] truncate">
                  {voice.name}
                </p>
                <p className="text-[11px] text-[color:var(--ink)]/70 truncate">
                  {voice.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={cn("space-y-4", className)}>
      {renderVoiceGroup(maleVoices, "Male Voices")}
      {renderVoiceGroup(femaleVoices, "Female Voices")}
    </div>
  );
};

export default VoiceSelector;
