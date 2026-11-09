"use client";

import React, { useState } from "react";
import { SourcePinboardSpec } from "@/types/whiteboard";
import { cn } from "@/lib/utils";
import { Pin, Sparkles, BookOpen } from "lucide-react";

interface SourcePinboardWidgetProps {
  spec: SourcePinboardSpec;
  onInteraction?: (actionDescription: string) => void;
  className?: string;
}

export function SourcePinboardWidget({
  spec,
  onInteraction,
  className,
}: SourcePinboardWidgetProps) {
  const [selectedPinId, setSelectedPinId] = useState<string>(
    spec.annotations[0]?.id || ""
  );

  const activePin = spec.annotations.find((a) => a.id === selectedPinId) || spec.annotations[0];

  const handlePinClick = (pin: (typeof spec.annotations)[0]) => {
    setSelectedPinId(pin.id);
    if (onInteraction) {
      onInteraction(`Focused on Pin #${pin.pinNumber}: "${pin.label}"`);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full rounded-[18px] border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-3 text-[color:var(--ink)] shadow-chip select-none overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-[color:var(--ink)]/15 pb-2 mb-2">
        <div className="flex items-center gap-1.5">
          <div className="flex size-6 items-center justify-center rounded-full border border-[color:var(--ink)] bg-[color:var(--orange)]">
            <Pin className="size-3.5 stroke-[2.5]" />
          </div>
          <div>
            <div className="font-mono text-[9px] font-black uppercase tracking-wider text-[color:var(--ink)]/70">
              TEXTBOOK PINBOARD
            </div>
            <div className="font-sans text-xs font-black leading-tight">{spec.title}</div>
          </div>
        </div>
      </div>

      {/* Snipped Image or Quote Stage */}
      {spec.imageUrl ? (
        <div className="relative w-full h-36 rounded-[12px] border-2 border-[color:var(--ink)] bg-black/10 overflow-hidden mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={spec.imageUrl}
            alt={spec.title}
            className="size-full object-contain"
          />
          {spec.annotations.map((pin) => (
            <button
              key={pin.id}
              type="button"
              onClick={() => handlePinClick(pin)}
              style={{
                left: `${pin.xPercent}%`,
                top: `${pin.yPercent}%`,
                transform: "translate(-50%, -50%)",
              }}
              className={cn(
                "absolute cursor-pointer flex size-5 items-center justify-center rounded-full border-2 border-[color:var(--ink)] font-mono text-[10px] font-black shadow-chip transition-all hover:scale-125",
                pin.id === selectedPinId
                  ? "bg-red-500 text-white scale-110"
                  : "bg-[color:var(--orange)] text-[color:var(--ink)]"
              )}
            >
              {pin.pinNumber}
            </button>
          ))}
        </div>
      ) : spec.referenceExcerpt ? (
        <div className="rounded-[12px] border border-[color:var(--ink)]/20 bg-[color:var(--panel)] p-2.5 text-xs italic text-[color:var(--ink)]/85 mb-2 leading-relaxed">
          <BookOpen className="size-3 text-[color:var(--orange)] inline mr-1" />
          &ldquo;{spec.referenceExcerpt.slice(0, 220)}...&rdquo;
        </div>
      ) : null}

      {/* Pins List */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {spec.annotations.map((pin) => (
          <button
            key={pin.id}
            type="button"
            onClick={() => handlePinClick(pin)}
            className={cn(
              "cursor-pointer rounded-full border-2 border-[color:var(--ink)] px-2 py-0.5 font-mono text-[10px] font-black transition-all shadow-[1px_1px_0px_#0f0e10]",
              pin.id === selectedPinId
                ? "bg-[color:var(--orange)] text-[color:var(--ink)] scale-105"
                : "bg-[color:var(--panel)] text-[color:var(--ink)] hover:bg-[color:var(--orange)]/30"
            )}
          >
            #{pin.pinNumber} {pin.label}
          </button>
        ))}
      </div>

      {/* Active Pin Callout */}
      {activePin && (
        <div className="flex-1 overflow-y-auto rounded-[12px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-2.5 shadow-[2px_2px_0px_#0f0e10]">
          <div className="font-sans text-xs font-black mb-1">
            #{activePin.pinNumber}: {activePin.label}
          </div>
          <div className="text-[11px] font-medium leading-relaxed opacity-90">
            {activePin.explanation}
          </div>
          {activePin.clinicalPearl && (
            <div className="mt-2 rounded-[8px] border border-amber-300 bg-amber-50 p-1.5 text-[10.5px] font-bold text-amber-950 flex items-center gap-1">
              <Sparkles className="size-3 text-amber-600 shrink-0" />
              <span>{activePin.clinicalPearl}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
