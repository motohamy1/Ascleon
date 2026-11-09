"use client";

import React, { useState, useEffect } from "react";
import { DifferentialMatrixSpec, WhiteboardWidgetControlEvent } from "@/types/whiteboard";
import { cn } from "@/lib/utils";
import { Scale, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

interface DifferentialMatrixWidgetProps {
  spec: DifferentialMatrixSpec;
  widgetControlEvent?: WhiteboardWidgetControlEvent | null;
  onInteraction?: (actionDescription: string) => void;
  className?: string;
}

export function DifferentialMatrixWidget({
  spec,
  widgetControlEvent,
  onInteraction,
  className,
}: DifferentialMatrixWidgetProps) {
  const [selectedConditionId, setSelectedConditionId] = useState<string>(
    spec.conditions[0]?.id || ""
  );

  // Sync if mentor voice highlights condition
  useEffect(() => {
    if (widgetControlEvent?.activeConditionId) {
      const condId = widgetControlEvent.activeConditionId;
      const frame = requestAnimationFrame(() => {
        setSelectedConditionId(condId);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [widgetControlEvent]);

  const handleSelectCondition = (condId: string, condName: string) => {
    setSelectedConditionId(condId);
    if (onInteraction) {
      onInteraction(`Focused on differential diagnosis condition: "${condName}"`);
    }
  };

  const activeCondition = spec.conditions.find((c) => c.id === selectedConditionId) || spec.conditions[0];

  const getProbBadge = (prob: string) => {
    switch (prob) {
      case "High":
        return "bg-emerald-100 text-emerald-900 border-emerald-500";
      case "Moderate":
        return "bg-amber-100 text-amber-900 border-amber-500";
      case "Rule Out":
        return "bg-red-100 text-red-900 border-red-500";
      default:
        return "bg-neutral-100 text-neutral-800 border-neutral-400";
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
            <Scale className="size-3.5 stroke-[2.5]" />
          </div>
          <div>
            <div className="font-mono text-[9px] font-black uppercase tracking-wider text-[color:var(--ink)]/70">
              DIFFERENTIAL BATTLE BOARD
            </div>
            <div className="font-sans text-xs font-black leading-tight">{spec.title}</div>
          </div>
        </div>
      </div>

      {/* Condition Selector Chips */}
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {spec.conditions.map((cond) => {
          const isSelected = cond.id === selectedConditionId;
          return (
            <button
              key={cond.id}
              type="button"
              onClick={() => handleSelectCondition(cond.id, cond.conditionName)}
              className={cn(
                "cursor-pointer rounded-full border-2 border-[color:var(--ink)] px-2.5 py-1 text-left text-xs transition-all shadow-[1.5px_1.5px_0px_#0f0e10]",
                isSelected
                  ? "bg-[color:var(--orange)] font-black text-[color:var(--ink)] scale-105"
                  : "bg-[color:var(--panel)] font-bold text-[color:var(--ink)] hover:bg-[color:var(--orange)]/30"
              )}
            >
              {cond.conditionName}
            </button>
          );
        })}
      </div>

      {/* Selected Condition Deep-Dive Card */}
      {activeCondition && (
        <div className="flex-1 overflow-y-auto space-y-2 rounded-[14px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-2.5 shadow-[2px_2px_0px_#0f0e10]">
          <div className="flex items-center justify-between">
            <span className="font-sans text-xs font-black">{activeCondition.conditionName}</span>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 font-mono text-[9px] font-black uppercase",
                getProbBadge(activeCondition.probability)
              )}
            >
              {activeCondition.probability}
            </span>
          </div>

          {/* Hallmark Features */}
          <div>
            <div className="font-mono text-[9px] font-black uppercase text-[color:var(--ink)]/70 mb-1">
              Hallmark Features
            </div>
            <ul className="space-y-1">
              {activeCondition.hallmarkFeatures.map((f, idx) => (
                <li key={idx} className="flex items-start gap-1.5 text-[11px] font-bold leading-tight">
                  <CheckCircle2 className="size-3 text-emerald-600 mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pathognomonic Sign */}
          {activeCondition.pathognomonicSign && (
            <div className="rounded-[10px] border border-amber-400 bg-amber-50 p-2 text-amber-950">
              <div className="font-mono text-[9px] font-black uppercase flex items-center gap-1 text-amber-800">
                <AlertTriangle className="size-3" /> Pathognomonic Sign
              </div>
              <div className="font-sans text-[11px] font-bold mt-0.5">
                {activeCondition.pathognomonicSign}
              </div>
            </div>
          )}

          {/* Red Flags */}
          {activeCondition.redFlags && activeCondition.redFlags.length > 0 && (
            <div className="rounded-[10px] border border-red-400 bg-red-50 p-2 text-red-950">
              <div className="font-mono text-[9px] font-black uppercase flex items-center gap-1 text-red-800">
                <ShieldAlert className="size-3" /> High-Risk Red Flags
              </div>
              <ul className="mt-0.5 space-y-0.5">
                {activeCondition.redFlags.map((rf, idx) => (
                  <li key={idx} className="font-sans text-[10.5px] font-bold">
                    • {rf}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Treatment Clue */}
          {activeCondition.treatmentClue && (
            <div className="font-mono text-[10px] font-bold text-[color:var(--ink)]/80 pt-1 border-t border-[color:var(--ink)]/10">
              Rx Clue: {activeCondition.treatmentClue}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
