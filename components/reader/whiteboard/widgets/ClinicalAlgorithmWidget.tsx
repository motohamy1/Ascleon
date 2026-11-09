"use client";

import React, { useState, useEffect } from "react";
import { ClinicalAlgorithmSpec, WhiteboardWidgetControlEvent } from "@/types/whiteboard";
import { cn } from "@/lib/utils";
import { GitBranch, AlertCircle, ArrowRight } from "lucide-react";

interface ClinicalAlgorithmWidgetProps {
  spec: ClinicalAlgorithmSpec;
  widgetControlEvent?: WhiteboardWidgetControlEvent | null;
  onInteraction?: (actionDescription: string) => void;
  className?: string;
}

export function ClinicalAlgorithmWidget({
  spec,
  widgetControlEvent,
  onInteraction,
  className,
}: ClinicalAlgorithmWidgetProps) {
  const [activeStepId, setActiveStepId] = useState<string>(
    spec.firstStepId || spec.steps[0]?.id || ""
  );

  useEffect(() => {
    if (widgetControlEvent?.activeStepId) {
      const stepId = widgetControlEvent.activeStepId;
      const frame = requestAnimationFrame(() => {
        setActiveStepId(stepId);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [widgetControlEvent]);

  const activeStep = spec.steps.find((s) => s.id === activeStepId) || spec.steps[0];

  const handleBranchClick = (nextStepId: string, choiceLabel: string) => {
    setActiveStepId(nextStepId);
    if (onInteraction) {
      onInteraction(
        `Selected clinical decision branch: "${choiceLabel}" transitioning to next step.`
      );
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
            <GitBranch className="size-3.5 stroke-[2.5]" />
          </div>
          <div>
            <div className="font-mono text-[9px] font-black uppercase tracking-wider text-[color:var(--ink)]/70">
              CLINICAL DECISION PATHWAY
            </div>
            <div className="font-sans text-xs font-black leading-tight">{spec.title}</div>
          </div>
        </div>
      </div>

      {/* Step Sequence Pills */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-2">
        {spec.steps.map((step) => {
          const isCurrent = step.id === activeStepId;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => setActiveStepId(step.id)}
              className={cn(
                "cursor-pointer rounded-full border-2 border-[color:var(--ink)] px-2 py-0.5 font-mono text-[9.5px] font-black shrink-0 transition-all",
                isCurrent
                  ? "bg-[color:var(--orange)] text-[color:var(--ink)] shadow-[1px_1px_0px_#0f0e10] scale-105"
                  : "bg-[color:var(--panel)] text-[color:var(--ink)]/70 hover:bg-[color:var(--orange)]/30"
              )}
            >
              Step {step.stepNumber}: {step.stageName}
            </button>
          );
        })}
      </div>

      {/* Active Step Card */}
      {activeStep && (
        <div className="flex-1 overflow-y-auto space-y-2 rounded-[14px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-3 shadow-[2px_2px_0px_#0f0e10]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-black uppercase tracking-wider text-[color:var(--ink)]/70">
              Stage: {activeStep.stageName}
            </span>
            {activeStep.evidenceLevel && (
              <span className="rounded-full border border-blue-500 bg-blue-50 px-2 py-0.5 font-mono text-[9px] font-black text-blue-900 uppercase">
                {activeStep.evidenceLevel}
              </span>
            )}
          </div>

          <div className="font-sans text-xs font-black leading-snug">
            {activeStep.actionText}
          </div>

          {/* Decision Branches */}
          {activeStep.branches && activeStep.branches.length > 0 && (
            <div className="pt-2 border-t border-[color:var(--ink)]/10">
              <div className="font-mono text-[9px] font-black uppercase text-[color:var(--ink)]/70 mb-1.5">
                Next Decision Branch (Tap to Route)
              </div>
              <div className="space-y-1.5">
                {activeStep.branches.map((b, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleBranchClick(b.nextStepId, b.choiceLabel)}
                    className={cn(
                      "cursor-pointer w-full flex items-center justify-between rounded-[10px] border-2 border-[color:var(--ink)] p-2 text-left text-xs font-bold transition-all shadow-[1.5px_1.5px_0px_#0f0e10] hover:scale-[1.01] active:translate-y-0.5",
                      b.isUrgent
                        ? "bg-red-100 text-red-950 border-red-500 hover:bg-red-200"
                        : "bg-[color:var(--cream)] text-[color:var(--ink)] hover:bg-[color:var(--orange)]"
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {b.isUrgent && <AlertCircle className="size-3 text-red-600 shrink-0" />}
                      <span>{b.choiceLabel}</span>
                    </div>
                    <ArrowRight className="size-3.5 stroke-[2.5]" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Contraindications */}
          {activeStep.contraindications && activeStep.contraindications.length > 0 && (
            <div className="rounded-[10px] border border-red-300 bg-red-50 p-2 text-red-950">
              <div className="font-mono text-[9px] font-black uppercase text-red-800">
                Contraindications & Harm Traps
              </div>
              <ul className="mt-0.5 space-y-0.5 text-[10.5px] font-bold">
                {activeStep.contraindications.map((c, idx) => (
                  <li key={idx}>⚠️ {c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
