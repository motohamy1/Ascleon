"use client";

import React, { useState, useMemo } from "react";
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Sliders,
  HelpCircle,
  Eye,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MorphJourney, MorphJourneyStage } from "@/lib/ai/schemas/decision-models";
import { BiDiText } from "@/components/ui/BiDiText";

interface InteractiveJourneyStageProps {
  journey: MorphJourney;
  onNavigateToPage?: (page: number) => void;
  onAskAI?: (prompt: string) => void;
}

export default function InteractiveJourneyStage({
  journey,
  onNavigateToPage,
  onAskAI,
}: InteractiveJourneyStageProps) {
  const [currentStageIdx, setCurrentStageIdx] = useState(0);
  const [unlockedStages, setUnlockedStages] = useState<number[]>([0]);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);

  // Dynamic Simulation Parameter (e.g. Stenosis %, Pressure, Troponin)
  const currentStage = journey.stages[currentStageIdx] || journey.stages[0];
  const sim = currentStage.interactiveSimulation;

  const [metricValue, setMetricValue] = useState<number>(sim.defaultMetricValue ?? 50);

  // Checkpoint Quiz State
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasSubmittedCheckpoint, setHasSubmittedCheckpoint] = useState(false);
  const isCorrect = selectedOption === currentStage.checkpoint.correctOptionIndex;

  // Reset stage-local state when switching stages
  const handleStageChange = (newIdx: number) => {
    setCurrentStageIdx(newIdx);
    setSelectedHotspotId(null);
    setSelectedOption(null);
    setHasSubmittedCheckpoint(false);
    const newSim = journey.stages[newIdx]?.interactiveSimulation;
    if (newSim) {
      setMetricValue(newSim.defaultMetricValue ?? 50);
    }
  };

  const handleCheckpointSubmit = () => {
    setHasSubmittedCheckpoint(true);
    if (selectedOption === currentStage.checkpoint.correctOptionIndex) {
      const nextIdx = currentStageIdx + 1;
      if (nextIdx < journey.stages.length && !unlockedStages.includes(nextIdx)) {
        setUnlockedStages((prev) => [...prev, nextIdx]);
      }
    }
  };

  // SVG Calculation for Plaque & Vessel Lumen Simulation
  const stenosisPercent = metricValue;
  const lumenRadius = Math.max(8, 48 - (stenosisPercent / 100) * 36);
  const plaqueThickness = (stenosisPercent / 100) * 38;

  // Shared Hotspots Renderer
  const renderHotspots = () => (
    <>
      {sim.hotspots.map((hs) => {
        const isSelected = selectedHotspotId === hs.id;
        const cx = (hs.xPercent / 100) * 380 + 10;
        const cy = (hs.yPercent / 100) * 200 + 20;

        return (
          <g
            key={hs.id}
            onClick={() => setSelectedHotspotId(isSelected ? null : hs.id)}
            className="cursor-pointer group"
          >
            <circle
              cx={cx}
              cy={cy}
              r={isSelected ? "14" : "10"}
              fill={isSelected ? "#ff4c00" : "#7fd8c9"}
              opacity="0.95"
              stroke="#0f0e10"
              strokeWidth="2"
            />
            <text
              x={cx}
              y={cy + 3}
              textAnchor="middle"
              fill="#0f0e10"
              fontSize="9"
              fontWeight="900"
            >
              {hs.id.slice(-1)}
            </text>
          </g>
        );
      })}
    </>
  );

  // 1. Telemetry ECG Monitor Simulation (dynamic ST elevation/depression)
  const renderEcgSimulation = () => {
    const stShift = ((metricValue - 30) / 70) * 32;
    const stElevatedY = 120 - Math.max(-15, Math.min(45, stShift));
    const isStElevated = stShift > 8;
    const isStDepressed = stShift < -4;

    return (
      <svg className="w-full h-full" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="ecgGridSmall" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M 8 0 L 0 0 0 8" fill="none" stroke="#251216" strokeWidth="0.5" />
          </pattern>
          <pattern id="ecgGridLarge" width="40" height="40" patternUnits="userSpaceOnUse">
            <rect width="40" height="40" fill="url(#ecgGridSmall)" />
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#481822" strokeWidth="1" />
          </pattern>
        </defs>

        <rect x="0" y="0" width="400" height="240" fill="#0d0b0f" />
        <rect x="0" y="0" width="400" height="240" fill="url(#ecgGridLarge)" opacity="0.8" />

        <text x="14" y="22" fill="#7fd8c9" fontSize="9" fontWeight="900" fontFamily="monospace">
          LEAD II/V1-V4 • 25 mm/s • 10 mm/mV • HR: 78 BPM
        </text>
        <text x="386" y="22" textAnchor="end" fill={isStElevated ? "#ff4c00" : isStDepressed ? "#e0459a" : "#7fd8c9"} fontSize="9.5" fontWeight="900" fontFamily="monospace">
          {isStElevated ? `⚡ ST-ELEVATION (+${(stShift / 10).toFixed(1)} mm)` : isStDepressed ? "ST-DEPRESSION" : "ISOELECTRIC BASELINE"}
        </text>

        <line x1="0" y1="120" x2="400" y2="120" stroke="rgba(246,215,161,0.15)" strokeDasharray="3,3" />

        <path
          d={`M 0 120 L 25 120 Q 38 108 50 120 L 70 120 L 76 132 L 86 35 L 96 155 L 102 120 L 115 ${stElevatedY} L 140 ${stElevatedY} Q 165 ${stElevatedY - 20} 185 120 L 220 120 Q 233 108 245 120 L 265 120 L 271 132 L 281 35 L 291 155 L 297 120 L 310 ${stElevatedY} L 335 ${stElevatedY} Q 360 ${stElevatedY - 20} 380 120 L 400 120`}
          fill="none"
          stroke={isStElevated ? "#ff4c00" : "#7fd8c9"}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-all duration-200"
        />

        <circle cx="102" cy={stElevatedY} r="3" fill="#ff4c00" className="animate-ping" />
        <text x="102" y={stElevatedY - 8} textAnchor="middle" fill="#f6d7a1" fontSize="9" fontWeight="bold">
          J-Point
        </text>

        {renderHotspots()}
      </svg>
    );
  };

  // 2. Cellular & Molecular Cascade Simulation
  const renderCellularCascadeSimulation = () => {
    const activationLevel = Math.max(5, Math.min(100, metricValue));

    return (
      <svg className="w-full h-full" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="extracellularBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#121824" />
            <stop offset="100%" stopColor="#0c111a" />
          </linearGradient>
          <linearGradient id="cytoplasmBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1118" />
            <stop offset="100%" stopColor="#0f0c10" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="400" height="90" fill="url(#extracellularBg)" />
        <text x="14" y="20" fill="#7fd8c9" fontSize="9" fontWeight="bold">EXTRACELLULAR FLUID</text>

        <rect x="0" y="90" width="400" height="24" fill="#302028" stroke="#ff4c00" strokeWidth="1" strokeDasharray="4,2" />
        <text x="200" y="106" textAnchor="middle" fill="#f6d7a1" fontSize="8" fontWeight="bold" letterSpacing="2">
          PLASMA MEMBRANE BILAYER
        </text>

        <rect x="0" y="114" width="400" height="126" fill="url(#cytoplasmBg)" />
        <text x="14" y="132" fill="#f6d7a1" fontSize="9" fontWeight="bold">INTRACELLULAR CYTOPLASM</text>

        <rect x="180" y="70" width="40" height="64" rx="8" fill="#43a08f" stroke="#7fd8c9" strokeWidth="2" />
        <text x="200" y="105" textAnchor="middle" fill="#0f0e10" fontSize="8" fontWeight="900">RECEPTOR</text>

        <circle cx="200" cy="62" r={activationLevel > 30 ? "8" : "6"} fill="#ff4c00" stroke="#fff" strokeWidth="1.5" className="animate-pulse" />

        <path d="M 200 134 L 200 170 L 140 195" fill="none" stroke="#ff4c00" strokeWidth="2" strokeDasharray="4,3" />
        <path d="M 200 170 L 260 195" fill="none" stroke="#43a08f" strokeWidth="2" strokeDasharray="4,3" />

        <circle cx="140" cy="195" r="16" fill="#a1156e" stroke="#f08dc7" strokeWidth="1.5" />
        <text x="140" y="198" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">Effector</text>

        <circle cx="260" cy="195" r="16" fill="#e0459a" stroke="#fff" strokeWidth="1.5" />
        <text x="260" y="198" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">Kinase</text>

        <rect x="100" y="215" width="200" height="20" rx="10" fill="#0f0e10" stroke="#ff4c00" strokeWidth="1" />
        <text x="200" y="228" textAnchor="middle" fill="#ff4c00" fontSize="8.5" fontWeight="black">
          Receptor Activation Level: {activationLevel}%
        </text>

        {renderHotspots()}
      </svg>
    );
  };

  // 3. Clinical Decision Algorithm / Treatment Tree Simulation
  const renderTreatmentTreeSimulation = () => {
    const score = metricValue;
    const isHighRisk = score >= 50;

    return (
      <svg className="w-full h-full" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid meet">
        <rect x="0" y="0" width="400" height="240" fill="#0d0c11" />

        <text x="14" y="22" fill="#f6d7a1" fontSize="9" fontWeight="900" letterSpacing="1">
          CLINICAL ALGORITHM &bull; SCORE: {score}
        </text>

        <rect x="135" y="38" width="130" height="34" rx="8" fill="#1b1a22" stroke="#f6d7a1" strokeWidth="1.5" />
        <text x="200" y="54" textAnchor="middle" fill="#fff" fontSize="8.5" fontWeight="bold">Initial Presentation</text>
        <text x="200" y="66" textAnchor="middle" fill="#7fd8c9" fontSize="7.5">Diagnostic Evaluation</text>

        <path d="M 200 72 L 200 95 L 90 95 L 90 120" fill="none" stroke={!isHighRisk ? "#43a08f" : "#333"} strokeWidth={!isHighRisk ? "2.5" : "1"} />
        <path d="M 200 72 L 200 95 L 310 95 L 310 120" fill="none" stroke={isHighRisk ? "#ff4c00" : "#333"} strokeWidth={isHighRisk ? "2.5" : "1"} />

        <rect x="25" y="120" width="130" height="42" rx="8" fill={!isHighRisk ? "#152420" : "#131215"} stroke={!isHighRisk ? "#43a08f" : "#2a2830"} strokeWidth={!isHighRisk ? "2" : "1"} />
        <text x="90" y="137" textAnchor="middle" fill={!isHighRisk ? "#7fd8c9" : "#666"} fontSize="8.5" fontWeight="bold">Low-Risk / Stable</text>
        <text x="90" y="151" textAnchor="middle" fill={!isHighRisk ? "#fff" : "#555"} fontSize="7.5">Medical Management</text>

        <rect x="245" y="120" width="130" height="42" rx="8" fill={isHighRisk ? "#281216" : "#131215"} stroke={isHighRisk ? "#ff4c00" : "#2a2830"} strokeWidth={isHighRisk ? "2" : "1"} />
        <text x="310" y="137" textAnchor="middle" fill={isHighRisk ? "#ff4c00" : "#666"} fontSize="8.5" fontWeight="bold">High-Risk / Acute</text>
        <text x="310" y="151" textAnchor="middle" fill={isHighRisk ? "#fff" : "#555"} fontSize="7.5">Urgent Intervention</text>

        <rect x="80" y="186" width="240" height="26" rx="13" fill="#0f0e10" stroke={isHighRisk ? "#ff4c00" : "#43a08f"} strokeWidth="1.5" />
        <text x="200" y="202" textAnchor="middle" fill={isHighRisk ? "#ff4c00" : "#7fd8c9"} fontSize="8.5" fontWeight="black">
          {isHighRisk ? "⚡ High-Risk Threshold Exceeded: Urgent Track" : "✓ Standard Medical Protocol Active"}
        </text>

        {renderHotspots()}
      </svg>
    );
  };

  // 4. Hemodynamic & Vascular Flow Simulation (for stenosis & pressures)
  const renderHemodynamicSimulation = () => (
    <svg
      className="w-full h-full"
      viewBox="0 0 400 240"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="vesselWall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a1156e" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#4a1525" stopOpacity="0.9" />
        </linearGradient>

        <linearGradient id="atheromaCore" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffdf88" />
          <stop offset="60%" stopColor="#d4a853" />
          <stop offset="100%" stopColor="#8a601e" />
        </linearGradient>

        <linearGradient id="bloodStream" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff4c00" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#d42c00" stopOpacity="1" />
          <stop offset="100%" stopColor="#a1156e" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      <rect x="0" y="20" width="400" height="28" fill="url(#vesselWall)" rx="4" />
      <rect x="0" y="192" width="400" height="28" fill="url(#vesselWall)" rx="4" />

      <line x1="0" y1="48" x2="400" y2="48" stroke="#ff4c00" strokeWidth="2" strokeDasharray="6,3" />
      <line x1="0" y1="192" x2="400" y2="192" stroke="#ff4c00" strokeWidth="2" strokeDasharray="6,3" />

      <rect
        x="0"
        y={48 + plaqueThickness * 0.4}
        width="400"
        height={Math.max(16, 144 - plaqueThickness * 1.5)}
        fill="url(#bloodStream)"
        opacity="0.35"
      />

      <path
        d={`M 0 120 Q 200 ${120 + (stenosisPercent > 70 ? 25 : 0)} 400 120`}
        fill="none"
        stroke="#ff4c00"
        strokeWidth={Math.max(1.5, 4 - (stenosisPercent / 100) * 3)}
        strokeDasharray="12,8"
        className="animate-pulse"
      />

      {plaqueThickness > 4 && (
        <path
          d={`M 110 192 Q 200 ${192 - plaqueThickness * 2.2} 290 192 Z`}
          fill="url(#atheromaCore)"
          stroke="#ff4c00"
          strokeWidth="2"
          className="transition-all duration-300"
        />
      )}

      {stenosisPercent >= 75 && (
        <g className="animate-bounce">
          <circle cx="200" cy={192 - plaqueThickness * 2.2} r="6" fill="#ff4c00" />
          <path
            d={`M 194 ${192 - plaqueThickness * 2.2} L 206 ${192 - plaqueThickness * 2.2}`}
            stroke="#ffffff"
            strokeWidth="2"
          />
          <text
            x="200"
            y={170 - plaqueThickness * 2.2}
            textAnchor="middle"
            fill="#ff4c00"
            fontSize="10"
            fontWeight="bold"
            fontFamily="sans-serif"
          >
            &bull; Critical Narrowing Point
          </text>
        </g>
      )}

      {renderHotspots()}
    </svg>
  );

  const renderActiveSimulationSvg = () => {
    switch (sim.simulationType) {
      case "ecg_rhythm":
        return renderEcgSimulation();
      case "cellular_cascade":
        return renderCellularCascadeSimulation();
      case "treatment_tree":
      case "generic_dynamic_flow":
        return renderTreatmentTreeSimulation();
      case "flow_pressure":
      case "plaque_rupture":
      default:
        return renderHemodynamicSimulation();
    }
  };

  return (
    <div className="w-full flex flex-col gap-4 text-[#0f0e10]">
      {/* 1. Journey Header & Multi-Stage Milestone Stepper */}
      <div className="rounded-[18px] border-2 border-[#0f0e10] bg-[#fbf7f0] p-4 shadow-chip">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#0f0e10]/15 pb-3">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-[#ff4c00] text-[#0f0e10] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">
                Living Journey
              </span>
              <h2 className="text-sm sm:text-base font-black font-serif text-[#0f0e10]">
                {journey.title}
              </h2>
            </div>
            <p className="text-xs text-[#0f0e10]/70 mt-0.5">
              Interactive clinical path • Stage {currentStageIdx + 1} of {journey.stages.length}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentStageIdx === 0}
              onClick={() => handleStageChange(currentStageIdx - 1)}
              className="p-1.5 rounded-lg border border-[#0f0e10]/30 hover:bg-[#f6d7a1] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
              title="Previous Stage"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              disabled={currentStageIdx === journey.stages.length - 1 || !unlockedStages.includes(currentStageIdx + 1)}
              onClick={() => handleStageChange(currentStageIdx + 1)}
              className="p-1.5 rounded-lg border border-[#0f0e10]/30 bg-[#ff4c00] text-[#0f0e10] font-bold hover:bg-[#ff4c00]/80 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1 text-xs"
              title="Next Stage"
            >
              <span>Next</span>
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        {/* Milestone Stepper Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5 pt-3">
          {journey.stages.map((stg, sIdx) => {
            const isCurrent = sIdx === currentStageIdx;
            const isUnlocked = unlockedStages.includes(sIdx);
            return (
              <button
                key={stg.id}
                type="button"
                disabled={!isUnlocked}
                onClick={() => handleStageChange(sIdx)}
                className={cn(
                  "p-2 rounded-xl text-left border transition-all cursor-pointer flex flex-col gap-0.5",
                  isCurrent
                    ? "border-2 border-[#0f0e10] bg-[#f6d7a1] shadow-xs"
                    : isUnlocked
                    ? "border-[#0f0e10]/20 bg-white hover:bg-[#f6d7a1]/50 text-[#0f0e10]"
                    : "border-gray-200 bg-gray-100/60 opacity-40 cursor-not-allowed"
                )}
              >
                <div className="flex items-center justify-between text-[10px] font-black uppercase">
                  <span>Step {sIdx + 1}</span>
                  {isUnlocked && sIdx < currentStageIdx && (
                    <CheckCircle2 className="size-3 text-[#2e6f68]" />
                  )}
                </div>
                <span className="text-[11px] font-bold truncate line-clamp-1">
                  {stg.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Dual-Engine Interactive Simulation & Story Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column (7 cols): 60fps Vector Pathophysiology Simulation */}
        <div className="lg:col-span-7 rounded-[18px] border-2 border-[#0f0e10] bg-[#0f0e10] p-4 text-[#f6d7a1] shadow-chip flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-[#ff4c00] animate-pulse" />
              <span className="text-xs font-black uppercase tracking-wider text-[#ff4c00]">
                Interactive Simulation: {sim.simulationType.replace(/_/g, " ")}
              </span>
            </div>
            <span className="text-[11px] font-mono font-bold text-white/80">
              {sim.primaryMetricLabel}: <strong className="text-[#ff4c00]">{metricValue}{sim.metricUnit}</strong>
            </span>
          </div>

          {/* Dynamic Interactive SVG Canvas */}
          <div className="relative w-full h-64 sm:h-72 rounded-xl bg-gradient-to-b from-[#18161c] to-[#0c0b0d] border border-white/10 flex items-center justify-center overflow-hidden">
            {renderActiveSimulationSvg()}

            {/* Hotspot Detailed Tooltip Overlay */}
            {selectedHotspotId && (
              <div className="absolute bottom-3 inset-x-3 bg-[#0f0e10]/95 border-2 border-[#ff4c00] rounded-xl p-3 text-xs shadow-xl animate-in fade-in duration-150">
                {(() => {
                  const hs = sim.hotspots.find((h) => h.id === selectedHotspotId);
                  if (!hs) return null;
                  return (
                    <div>
                      <div className="flex items-center justify-between text-[#ff4c00] font-black pb-1 border-b border-white/10 mb-1">
                        <span>✦ {hs.label}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedHotspotId(null)}
                          className="text-white/60 hover:text-white"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="text-white/90 leading-relaxed text-[11px]">
                        {hs.description}
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Dynamic Slider Controls */}
          <div className="mt-4 pt-3 border-t border-white/10 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold flex items-center gap-1.5 text-white/90">
                <Sliders className="size-3.5 text-[#ff4c00]" />
                Simulate {sim.primaryMetricLabel} Progression:
              </span>
              <span className="font-mono font-bold text-[#ff4c00]">
                {metricValue}{sim.metricUnit}
              </span>
            </div>

            <input
              type="range"
              min={sim.minMetricValue ?? 0}
              max={sim.maxMetricValue ?? 100}
              value={metricValue}
              onChange={(e) => setMetricValue(Number(e.target.value))}
              className="w-full accent-[#ff4c00] cursor-pointer"
            />

            <div className="flex justify-between text-[10px] text-white/50 font-mono">
              <span>Normal ({sim.minMetricValue ?? 0}{sim.metricUnit})</span>
              <span>Moderate (50{sim.metricUnit})</span>
              <span>Critical Occlusion ({sim.maxMetricValue ?? 100}{sim.metricUnit})</span>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Narrative Clinical Story & Mechanism Panel */}
        <div className="lg:col-span-5 rounded-[18px] border-2 border-[#0f0e10] bg-[#fbf7f0] p-4 shadow-chip flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 pb-2 border-b border-[#0f0e10]/15">
              <Info className="size-4 text-[#ff4c00]" />
              <h3 className="font-black text-xs uppercase tracking-wider text-[#0f0e10]">
                Phase: {currentStage.phase.replace(/_/g, " ")}
              </h3>
            </div>

            {/* Narrative Explanation with BiDi Protection */}
            <div className="mt-3">
              <BiDiText className="text-xs leading-relaxed text-[#0f0e10]/95 font-medium">
                {currentStage.description}
              </BiDiText>
            </div>

            {/* Key Mechanistic Steps */}
            <div className="mt-4">
              <h4 className="text-[11px] font-black uppercase text-[#663820] mb-2 tracking-wide">
                ✦ Core Pathological Invariants:
              </h4>
              <ul className="space-y-1.5">
                {currentStage.keyPathologyPoints.map((pt, pIdx) => (
                  <li
                    key={pIdx}
                    className="flex items-start gap-2 text-xs text-[#0f0e10] leading-snug"
                  >
                    <span className="size-1.5 rounded-full bg-[#ff4c00] mt-1.5 shrink-0" />
                    <BiDiText text={pt} />
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Ask AI deeper explanation button */}
          <div className="mt-4 pt-3 border-t border-[#0f0e10]/15">
            <button
              type="button"
              onClick={() => onAskAI?.(`Explain stage "${currentStage.title}" of ${journey.title} with full underlying cellular mechanics and patient presentation.`)}
              className="w-full py-2 px-3 rounded-xl border border-[#0f0e10] bg-white hover:bg-[#f6d7a1] text-[#0f0e10] text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
            >
              <Sparkles className="size-3.5 text-[#ff4c00]" />
              <span>Deep-Dive this Stage in AI Chat →</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Interactive Stage Checkpoint (Required to Unlock Next Stage) */}
      <div className="rounded-[18px] border-2 border-[#0f0e10] bg-[#f6d7a1] p-4 text-[#0f0e10] shadow-chip">
        <div className="flex items-center gap-2 pb-2 border-b border-[#0f0e10]/20 mb-3">
          <HelpCircle className="size-4 text-[#ff4c00]" />
          <h3 className="font-black text-xs uppercase tracking-wider text-[#0f0e10]">
            Clinical Checkpoint • Unlock Next Milestone
          </h3>
        </div>

        <p className="text-xs font-bold leading-relaxed mb-3">
          {currentStage.checkpoint.prompt}
        </p>

        {/* Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          {currentStage.checkpoint.options.map((opt, optIdx) => {
            const isSelected = selectedOption === optIdx;
            const isAnswer = hasSubmittedCheckpoint && optIdx === currentStage.checkpoint.correctOptionIndex;
            const isWrongSelection = hasSubmittedCheckpoint && isSelected && !isCorrect;

            return (
              <button
                key={optIdx}
                type="button"
                disabled={hasSubmittedCheckpoint && isCorrect}
                onClick={() => setSelectedOption(optIdx)}
                className={cn(
                  "p-3 rounded-xl text-left text-xs font-medium border-2 transition-all cursor-pointer",
                  isSelected
                    ? "border-[#0f0e10] bg-white shadow-sm font-bold"
                    : "border-[#0f0e10]/30 bg-white/70 hover:bg-white",
                  isAnswer && "border-[#2e6f68] bg-[#7fd8c9] text-[#0f0e10] font-black",
                  isWrongSelection && "border-rose-600 bg-rose-100 text-rose-900"
                )}
              >
                <div className="flex items-start gap-2">
                  <span className="font-mono font-bold text-[11px] shrink-0">
                    {String.fromCharCode(65 + optIdx)}.
                  </span>
                  <BiDiText text={opt} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Submit or Explanation Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {!hasSubmittedCheckpoint ? (
            <button
              type="button"
              disabled={selectedOption === null}
              onClick={handleCheckpointSubmit}
              className="py-2 px-5 rounded-xl border-2 border-[#0f0e10] bg-[#ff4c00] text-[#0f0e10] text-xs font-black hover:bg-[#ff4c00]/80 disabled:opacity-40 cursor-pointer shadow-xs"
            >
              Confirm Clinical Decision
            </button>
          ) : (
            <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white/80 p-3 rounded-xl border border-[#0f0e10]/30">
              <div className="flex items-start gap-2 text-xs">
                {isCorrect ? (
                  <CheckCircle2 className="size-4 text-[#2e6f68] shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="size-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="text-[11px]">
                  <strong>{isCorrect ? "Correct Diagnosis!" : "Clinical Re-evaluation:"}</strong>{" "}
                  <BiDiText text={currentStage.checkpoint.explanation} />
                </div>
              </div>

              {isCorrect && currentStageIdx < journey.stages.length - 1 && (
                <button
                  type="button"
                  onClick={() => handleStageChange(currentStageIdx + 1)}
                  className="shrink-0 py-1.5 px-4 rounded-xl border-2 border-[#0f0e10] bg-[#ff4c00] text-[#0f0e10] font-black text-xs hover:bg-[#ff4c00]/80 cursor-pointer shadow-xs"
                >
                  Advance to Stage {currentStageIdx + 2} →
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
