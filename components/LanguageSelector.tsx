"use client";

import React from "react";
import { voiceLanguages, type VoiceLanguage } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Globe, Check } from "lucide-react";

interface LanguageSelectorProps {
  value?: VoiceLanguage;
  onChange: (language: VoiceLanguage) => void;
  disabled?: boolean;
  className?: string;
}

export const LanguageSelector = ({
  value = voiceLanguages.en,
  onChange,
  disabled = false,
  className,
}: LanguageSelectorProps) => {
  const languages = Object.values(voiceLanguages);

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-bold uppercase tracking-wider text-[color:var(--ink)] opacity-75">
        Voice Language
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {languages.map((lang) => {
          const isSelected = value.code === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              disabled={disabled}
              onClick={() => onChange(lang)}
              className={cn(
                "flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-left cursor-pointer",
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
                  <Check className="size-3.5" />
                ) : (
                  <Globe className="size-3.5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-[color:var(--ink)] truncate">
                  {lang.label}
                </p>
                <p className="text-[11px] text-[color:var(--ink)]/70 truncate">
                  {lang.nativeLabel}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LanguageSelector;