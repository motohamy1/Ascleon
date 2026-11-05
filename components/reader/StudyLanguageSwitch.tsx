"use client";

import React from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { StudyLanguage, STUDY_LANGUAGES } from "@/lib/language";

interface StudyLanguageSwitchProps {
  currentLanguage: StudyLanguage;
  onLanguageChange: (lang: StudyLanguage) => void;
  className?: string;
  compact?: boolean;
}

export function StudyLanguageSwitch({
  currentLanguage,
  onLanguageChange,
  className,
  compact = false,
}: StudyLanguageSwitchProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1 sm:gap-1.5 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-0.5 sm:p-1 text-xs shadow-chip whitespace-nowrap",
        className
      )}
      title="Universal Study Language: controls Voice, AI Chat, Morph, Q banks & Summaries"
    >
      <div className="flex items-center gap-1 pl-1 sm:pl-1.5 pr-0.5 text-[color:var(--ink)]">
        <Globe className="size-3 sm:size-3.5 stroke-[2.5]" />
        {!compact && (
          <span className="hidden xl:inline font-mono text-[10px] font-black uppercase tracking-wider text-[color:var(--ink)]">
            Mode
          </span>
        )}
      </div>

      <div className="flex items-center gap-0.5 sm:gap-1">
        {STUDY_LANGUAGES.map((lang) => {
          const isSelected = currentLanguage === lang.id;
          return (
            <button
              key={lang.id}
              type="button"
              onClick={() => onLanguageChange(lang.id)}
              className={cn(
                "cursor-pointer rounded-full px-1.5 py-0.5 sm:px-2.5 sm:py-1 text-[9.5px] sm:text-[11px] font-black transition-all whitespace-nowrap leading-tight",
                isSelected
                  ? "border-2 border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)] shadow-[1px_1px_0px_#0f0e10]"
                  : "border-2 border-transparent text-[color:var(--ink)]/70 hover:border-[color:var(--ink)]/40 hover:bg-[color:var(--cream)] hover:text-[color:var(--ink)]"
              )}
              title={`${lang.label}: ${lang.sublabel}`}
            >
              {lang.id === "mixed" ? (
                <span>
                  <span className="sm:hidden">Mix</span>
                  <span className="hidden sm:inline">Mix <span className="text-[9.5px] opacity-80 font-bold">ع/EN</span></span>
                </span>
              ) : (
                lang.label
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
