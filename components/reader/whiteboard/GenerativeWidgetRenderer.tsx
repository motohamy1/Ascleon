"use client";

import React from "react";
import { GenerativeWidgetSpec, WhiteboardWidgetControlEvent } from "@/types/whiteboard";
import { PhysiologySimulatorWidget } from "./widgets/PhysiologySimulatorWidget";
import { DifferentialMatrixWidget } from "./widgets/DifferentialMatrixWidget";
import { ClinicalAlgorithmWidget } from "./widgets/ClinicalAlgorithmWidget";
import { SourcePinboardWidget } from "./widgets/SourcePinboardWidget";

interface GenerativeWidgetRendererProps {
  widget: GenerativeWidgetSpec;
  widgetControlEvent?: WhiteboardWidgetControlEvent | null;
  onInteraction?: (actionDescription: string) => void;
  className?: string;
}

export function GenerativeWidgetRenderer({
  widget,
  widgetControlEvent,
  onInteraction,
  className,
}: GenerativeWidgetRendererProps) {
  if (widget.type === "physiology_simulator" && widget.physiologySimulator) {
    return (
      <PhysiologySimulatorWidget
        spec={widget.physiologySimulator}
        widgetControlEvent={widgetControlEvent}
        onInteraction={onInteraction}
        className={className}
      />
    );
  }

  if (widget.type === "differential_matrix" && widget.differentialMatrix) {
    return (
      <DifferentialMatrixWidget
        spec={widget.differentialMatrix}
        widgetControlEvent={widgetControlEvent}
        onInteraction={onInteraction}
        className={className}
      />
    );
  }

  if (widget.type === "clinical_algorithm" && widget.clinicalAlgorithm) {
    return (
      <ClinicalAlgorithmWidget
        spec={widget.clinicalAlgorithm}
        widgetControlEvent={widgetControlEvent}
        onInteraction={onInteraction}
        className={className}
      />
    );
  }

  if (widget.type === "source_pinboard" && widget.sourcePinboard) {
    return (
      <SourcePinboardWidget
        spec={widget.sourcePinboard}
        onInteraction={onInteraction}
        className={className}
      />
    );
  }

  // Fallback to simulator if specified widget object is missing
  return (
    <div className="flex h-full items-center justify-center rounded-[18px] border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-4 text-center font-mono text-xs font-bold text-[color:var(--ink)]">
      Clinical Generative UI Ready
    </div>
  );
}
