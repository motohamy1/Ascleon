"use client";

import React, { useState, useEffect } from "react";
import { PhysiologySimulatorSpec, WhiteboardWidgetControlEvent } from "@/types/whiteboard";
import { cn } from "@/lib/utils";
import { Activity, Zap, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";

interface PhysiologySimulatorWidgetProps {
  spec: PhysiologySimulatorSpec;
  widgetControlEvent?: WhiteboardWidgetControlEvent | null;
  onInteraction?: (actionDescription: string) => void;
  className?: string;
}

export function PhysiologySimulatorWidget({
  spec,
  widgetControlEvent,
  onInteraction,
  className,
}: PhysiologySimulatorWidgetProps) {
  // Local state for active interventions
  const [activeInterventions, setActiveInterventions] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    spec.interventions.forEach((i) => {
      initial[i.id] = i.active || false;
    });
    return initial;
  });

  // Synchronize if live mentor voice tool calls `whiteboard_control_widget`
  useEffect(() => {
    if (widgetControlEvent?.activeInterventionId) {
      const id = widgetControlEvent.activeInterventionId;
      const targetState =
        typeof widgetControlEvent.toggleIntervention === "boolean"
          ? widgetControlEvent.toggleIntervention
          : true;

      const frame = requestAnimationFrame(() => {
        setActiveInterventions((prev) => ({
          ...prev,
          [id]: targetState,
        }));
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [widgetControlEvent]);

  // Compute live parameter values based on active interventions
  const computedParameters = spec.parameters.map((param) => {
    let deltaSum = 0;
    spec.interventions.forEach((intervention) => {
      if (activeInterventions[intervention.id]) {
        const impact = intervention.parameterImpacts[param.id] || 0;
        deltaSum += impact;
      }
    });

    const liveValue = Math.min(param.max, Math.max(param.min, param.baseValue + deltaSum));
    const isUp = liveValue > param.baseValue;
    const isDown = liveValue < param.baseValue;

    return {
      ...param,
      liveValue,
      direction: isUp ? "up" : isDown ? "down" : "stable",
      delta: deltaSum,
    };
  });

  const toggleIntervention = (interventionId: string, label: string) => {
    const nextState = !activeInterventions[interventionId];
    setActiveInterventions((prev) => ({
      ...prev,
      [interventionId]: nextState,
    }));

    if (onInteraction) {
      onInteraction(
        `Toggled intervention "${label}" to ${nextState ? "ACTIVE" : "INACTIVE"}`
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
            <Activity className="size-3.5 stroke-[2.5]" />
          </div>
          <div>
            <div className="font-mono text-[9px] font-black uppercase tracking-wider text-[color:var(--ink)]/70">
              {spec.organSystem || "PHYSIOLOGY SIMULATOR"}
            </div>
            <div className="font-sans text-xs font-black leading-tight">{spec.title}</div>
          </div>
        </div>
      </div>

      {/* Main Parameters Gauges */}
      <div className="space-y-2 mb-3">
        {computedParameters.map((p) => {
          const percent = Math.round(((p.liveValue - p.min) / (p.max - p.min)) * 100);

          return (
            <div
              key={p.id}
              className="rounded-[12px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-2 shadow-[2px_2px_0px_#0f0e10] transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[11px] font-black">{p.name}</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs font-black">
                    {p.liveValue} {p.unit}
                  </span>
                  {p.direction === "up" && (
                    <span className="flex items-center text-[10px] font-black text-red-600 bg-red-100 px-1 rounded">
                      <TrendingUp className="size-2.5 mr-0.5" /> +{p.delta}
                    </span>
                  )}
                  {p.direction === "down" && (
                    <span className="flex items-center text-[10px] font-black text-blue-600 bg-blue-100 px-1 rounded">
                      <TrendingDown className="size-2.5 mr-0.5" /> {p.delta}
                    </span>
                  )}
                  {p.direction === "stable" && (
                    <span className="flex items-center text-[10px] font-black text-neutral-500 bg-neutral-200 px-1 rounded">
                      <Minus className="size-2.5" />
                    </span>
                  )}
                </div>
              </div>

              {/* Progress Bar with Normal Target Zone */}
              <div className="relative h-2 w-full rounded-full border border-[color:var(--ink)] bg-black/10 overflow-hidden">
                <div
                  className="h-full bg-[color:var(--orange)] transition-all duration-300"
                  style={{ width: `${Math.max(5, Math.min(100, percent))}%` }}
                />
              </div>

              {p.clinicalSignificance && (
                <div className="mt-1 text-[9.5px] font-semibold text-[color:var(--ink)]/75 leading-tight flex items-center gap-1">
                  <Info className="size-2.5 shrink-0 opacity-60" />
                  <span>{p.clinicalSignificance}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Interactive Interventions / Drug Toggles */}
      <div className="mt-auto border-t border-[color:var(--ink)]/15 pt-2">
        <div className="font-mono text-[9px] font-black uppercase text-[color:var(--ink)]/70 mb-1.5 flex items-center gap-1">
          <Zap className="size-3 text-[color:var(--orange)]" /> Interactive Interventions (Tap to Test)
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          {spec.interventions.map((i) => {
            const isActive = activeInterventions[i.id];

            return (
              <button
                key={i.id}
                type="button"
                onClick={() => toggleIntervention(i.id, i.label)}
                className={cn(
                  "cursor-pointer flex items-center justify-between rounded-[10px] border-2 border-[color:var(--ink)] px-2.5 py-1.5 text-left text-xs transition-all shadow-[1.5px_1.5px_0px_#0f0e10] hover:scale-[1.01] active:translate-y-0.5",
                  isActive
                    ? "bg-[color:var(--mint)] text-[color:var(--ink)] font-black"
                    : "bg-[color:var(--panel)] text-[color:var(--ink)] hover:bg-[color:var(--orange)] font-bold"
                )}
              >
                <div>
                  <div className="font-bold text-[11px]">{i.label}</div>
                  <div className="text-[9.5px] opacity-80">{i.effectDescription}</div>
                </div>
                <div
                  className={cn(
                    "ml-2 size-3.5 rounded-full border-2 border-[color:var(--ink)] flex items-center justify-center shrink-0",
                    isActive ? "bg-[color:var(--ink)]" : "bg-transparent"
                  )}
                >
                  {isActive && <div className="size-1 rounded-full bg-white" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
