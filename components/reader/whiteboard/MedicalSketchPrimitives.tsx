"use client";

import React from "react";
import { MedicalPrimitiveType } from "@/types/whiteboard";
import { cn } from "@/lib/utils";

interface PrimitiveProps {
  className?: string;
  isAnimated?: boolean;
  colorVariant?: "red" | "blue" | "dark" | "green" | "amber";
}

/**
 * 1. Blood Vessel with Thrombus Occlusion (VideoScribe Stroke Reference)
 * Shows endothelial lumen, plaque narrowing, and platelet thrombus cutting off flow
 */
export function VesselOcclusionSketch({ className, isAnimated = true, colorVariant = "red" }: PrimitiveProps) {
  return (
    <svg viewBox="0 0 160 100" className={cn("size-full overflow-visible", className)} fill="none">
      {/* Vessel walls (Upper & Lower Endothelium) */}
      <path
        d="M 10 25 C 50 25, 70 35, 150 25"
        stroke="#dc2626"
        strokeWidth="4"
        strokeLinecap="round"
        className={isAnimated ? "animate-draw-stroke" : ""}
      />
      <path
        d="M 10 75 C 50 75, 70 65, 150 75"
        stroke="#dc2626"
        strokeWidth="4"
        strokeLinecap="round"
        className={isAnimated ? "animate-draw-stroke" : ""}
      />

      {/* Atherosclerotic Plaque (Lipid Core) */}
      <path
        d="M 45 27 C 60 45, 80 45, 95 27 Z"
        fill="#fef08a"
        stroke="#ca8a04"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M 50 73 C 65 55, 85 55, 100 73 Z"
        fill="#fef08a"
        stroke="#ca8a04"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Platelet/Fibrin Thrombus (The Occlusion) */}
      <circle cx="85" cy="50" r="14" fill="#991b1b" stroke="#7f1d1d" strokeWidth="2.5" />
      <circle cx="75" cy="46" r="6" fill="#b91c1c" />
      <circle cx="92" cy="54" r="5" fill="#ef4444" />

      {/* Blocked Blood Cells before clot */}
      <circle cx="28" cy="48" r="4.5" fill="#ef4444" opacity="0.9" />
      <circle cx="42" cy="42" r="4" fill="#dc2626" opacity="0.9" />
      <circle cx="36" cy="56" r="4" fill="#b91c1c" opacity="0.9" />

      {/* Blockage Cross / X indicator */}
      <path d="M 80 45 L 90 55 M 90 45 L 80 55" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />

      {/* Downstream Ischemia dotted arrow */}
      <path
        d="M 110 50 L 140 50"
        stroke="#94a3b8"
        strokeWidth="2.5"
        strokeDasharray="4 4"
        strokeLinecap="round"
      />
      <text x="125" y="42" textAnchor="middle" fill="#64748b" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
        NO FLOW
      </text>
    </svg>
  );
}

/**
 * 2. Hemorrhagic Blood Vessel Rupture
 * Shows arterial wall tearing with extravasating blood pool
 */
export function VesselRuptureSketch({ className, isAnimated = true }: PrimitiveProps) {
  return (
    <svg viewBox="0 0 160 100" className={cn("size-full overflow-visible", className)} fill="none">
      {/* Upper wall intact */}
      <path d="M 15 30 L 145 30" stroke="#dc2626" strokeWidth="4" strokeLinecap="round" />

      {/* Lower wall with ruptured defect */}
      <path d="M 15 70 L 65 70" stroke="#dc2626" strokeWidth="4" strokeLinecap="round" />
      <path d="M 95 70 L 145 70" stroke="#dc2626" strokeWidth="4" strokeLinecap="round" />

      {/* Ruptured bleeding pool */}
      <path
        d="M 65 70 C 60 92, 100 95, 95 70 C 105 85, 120 78, 105 65 C 120 55, 95 45, 80 55 C 70 48, 55 58, 65 70 Z"
        fill="#b91c1c"
        fillOpacity="0.85"
        stroke="#7f1d1d"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Pressure Jets */}
      <path d="M 72 74 Q 68 88 60 94" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
      <path d="M 88 74 Q 95 88 105 92" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
      <circle cx="80" cy="85" r="3" fill="#ef4444" />
      <text x="80" y="22" textAnchor="middle" fill="#b91c1c" fontSize="8" fontWeight="bold" fontFamily="monospace">
        RUPTURE / BLEED
      </text>
    </svg>
  );
}

/**
 * 3. Brain with Vascular Territories & Ischemic Penumbra
 */
export function BrainTerritoriesSketch({ className, isAnimated = true }: PrimitiveProps) {
  return (
    <svg viewBox="0 0 160 110" className={cn("size-full overflow-visible", className)} fill="none">
      {/* Hand-drawn Brain Silhouette */}
      <path
        d="M 25 65 C 20 40, 40 20, 80 20 C 120 20, 140 40, 140 65 C 140 85, 125 95, 105 92 C 95 90, 90 98, 75 98 C 55 98, 48 85, 38 88 C 28 88, 22 78, 25 65 Z"
        fill="#f8fafc"
        stroke="#334155"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Sulci / Gyri hand-drawn curves */}
      <path d="M 45 42 Q 60 38, 70 48 T 90 42" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
      <path d="M 38 60 Q 55 58, 65 70" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
      <path d="M 85 58 Q 100 52, 115 62" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
      <path d="M 100 40 Q 115 38, 128 50" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />

      {/* Ischemic Infarct Core (Dark Red) */}
      <circle cx="108" cy="62" r="12" fill="#ef4444" fillOpacity="0.75" stroke="#b91c1c" strokeWidth="2" />

      {/* Penumbra Shaded Ring (Orange warning zone) */}
      <circle
        cx="108"
        cy="62"
        r="18"
        fill="#f97316"
        fillOpacity="0.2"
        stroke="#ea580c"
        strokeWidth="1.8"
        strokeDasharray="3 3"
      />

      {/* Arrow pointing to MCA territory */}
      <path d="M 135 85 L 118 70" stroke="#b91c1c" strokeWidth="2.5" markerEnd="url(#scribe-arrow)" strokeLinecap="round" />
      <text x="135" y="96" textAnchor="middle" fill="#b91c1c" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
        ISCHEMIC CORE
      </text>
    </svg>
  );
}

/**
 * 4. Heart & Coronary Artery Cascade
 */
export function HeartCoronarySketch({ className, isAnimated = true }: PrimitiveProps) {
  return (
    <svg viewBox="0 0 160 110" className={cn("size-full overflow-visible", className)} fill="none">
      {/* Heart Silhouette */}
      <path
        d="M 80 95 C 40 70, 20 48, 35 30 C 48 15, 70 22, 80 38 C 90 22, 112 15, 125 30 C 140 48, 120 70, 80 95 Z"
        fill="#fef2f2"
        stroke="#dc2626"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* LAD Coronary Artery Branch */}
      <path
        d="M 75 35 Q 70 55, 62 70 Q 58 78, 55 85"
        stroke="#991b1b"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M 68 55 Q 80 62, 85 70" stroke="#991b1b" strokeWidth="2" strokeLinecap="round" />

      {/* Myocardial Ischemia Zone (Apex/Septum) */}
      <path
        d="M 52 72 Q 72 75, 78 92 Q 60 88, 52 72 Z"
        fill="#7f1d1d"
        fillOpacity="0.4"
        stroke="#991b1b"
        strokeWidth="1.5"
        strokeDasharray="2 2"
      />
      <text x="80" y="105" textAnchor="middle" fill="#991b1b" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
        MYOCARDIAL INFARCT
      </text>
    </svg>
  );
}

/**
 * 5. Lungs & Alveolar Gas Exchange
 */
export function LungsAlveoliSketch({ className }: PrimitiveProps) {
  return (
    <svg viewBox="0 0 160 110" className={cn("size-full overflow-visible", className)} fill="none">
      {/* Alveolar Sac Outline */}
      <circle cx="65" cy="55" r="28" fill="#eff6ff" stroke="#2563eb" strokeWidth="3" />
      <circle cx="100" cy="50" r="22" fill="#eff6ff" stroke="#2563eb" strokeWidth="3" />

      {/* Capillary Membrane Wrap */}
      <path
        d="M 32 45 C 45 88, 115 88, 128 40"
        stroke="#dc2626"
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* O2 diffusion arrow (inward to blood) */}
      <path d="M 65 40 L 65 65" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" />
      <text x="65" y="34" textAnchor="middle" fill="#2563eb" fontSize="8" fontWeight="bold" fontFamily="monospace">
        O₂ Influx
      </text>

      {/* CO2 diffusion arrow (outward to alveoli) */}
      <path d="M 98 68 L 98 44" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />
      <text x="98" y="78" textAnchor="middle" fill="#475569" fontSize="8" fontWeight="bold" fontFamily="monospace">
        CO₂ Out
      </text>
    </svg>
  );
}

/**
 * 6. Kidney & Nephron Filtration Barrier
 */
export function KidneyNephronSketch({ className }: PrimitiveProps) {
  return (
    <svg viewBox="0 0 160 110" className={cn("size-full overflow-visible", className)} fill="none">
      {/* Bowman's Capsule Cup */}
      <path
        d="M 45 35 C 30 50, 30 75, 45 90 C 70 95, 75 75, 70 65 L 115 65 L 115 85 L 130 85"
        stroke="#ca8a04"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="#fefce8"
      />

      {/* Glomerular Capillary Tuft */}
      <path
        d="M 50 48 C 65 42, 65 78, 50 72 C 35 68, 58 55, 42 55"
        stroke="#dc2626"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <text x="52" y="30" textAnchor="middle" fill="#b45309" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
        GLOMERULUS (GFR)
      </text>
      <text x="125" y="58" textAnchor="middle" fill="#854d0e" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
        TUBULE
      </text>
    </svg>
  );
}

/**
 * 7. Cell Membrane & Receptor Mechanism
 */
export function CellReceptorSketch({ className }: PrimitiveProps) {
  return (
    <svg viewBox="0 0 160 100" className={cn("size-full overflow-visible", className)} fill="none">
      {/* Lipid Bilayer */}
      <path d="M 10 50 L 150 50" stroke="#0284c7" strokeWidth="6" strokeLinecap="round" />
      <path d="M 10 62 L 150 62" stroke="#0284c7" strokeWidth="6" strokeLinecap="round" />

      {/* Transmembrane Receptor */}
      <path
        d="M 70 30 C 65 20, 95 20, 90 30 L 90 80 L 70 80 Z"
        fill="#a855f7"
        stroke="#7e22ce"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Binding Pocket */}
      <path d="M 75 25 Q 80 32, 85 25" stroke="#581c87" strokeWidth="2" fill="none" />

      {/* Ligand / Drug docking */}
      <polygon points="76,14 84,14 80,22" fill="#059669" stroke="#047857" strokeWidth="1.5" />

      <text x="80" y="10" textAnchor="middle" fill="#047857" fontSize="7" fontWeight="bold" fontFamily="monospace">
        AGONIST / DRUG
      </text>
      <text x="80" y="94" textAnchor="middle" fill="#6b21a8" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
        2ND MESSENGER (cAMP)
      </text>
    </svg>
  );
}

/**
 * 8. ECG Waveform (P-QRS-T)
 */
export function ECGWaveformSketch({ className }: PrimitiveProps) {
  return (
    <svg viewBox="0 0 160 90" className={cn("size-full overflow-visible", className)} fill="none">
      {/* ECG Grid lines */}
      <line x1="10" y1="50" x2="150" y2="50" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />

      {/* P - QRS - T Wave Trace */}
      <path
        d="M 10 50 L 35 50 Q 42 42, 50 50 L 62 50 L 65 56 L 72 16 L 78 68 L 82 50 L 95 50 Q 106 36, 118 50 L 150 50"
        stroke="#dc2626"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Wave annotations */}
      <text x="45" y="38" fill="#64748b" fontSize="8" fontWeight="bold" fontFamily="monospace">P</text>
      <text x="70" y="12" fill="#dc2626" fontSize="9" fontWeight="bold" fontFamily="monospace">R</text>
      <text x="108" y="32" fill="#64748b" fontSize="8" fontWeight="bold" fontFamily="monospace">T</text>
    </svg>
  );
}

/**
 * 9. Patient Signs (FAST Stroke Clinical Presentation: Face, Arm, Speech)
 */
export function PatientDroopSketch({ className }: PrimitiveProps) {
  return (
    <svg viewBox="0 0 160 110" className={cn("size-full overflow-visible", className)} fill="none">
      {/* Patient Head Outline */}
      <circle cx="80" cy="50" r="32" fill="#fffbeb" stroke="#334155" strokeWidth="3" />

      {/* Normal Eye (Right patient side / Left viewer side) */}
      <ellipse cx="68" cy="44" rx="4" ry="5" fill="#334155" />

      {/* Drooping Eye / Ptosis */}
      <path d="M 88 47 Q 96 49, 94 44" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />

      {/* Asymmetric Drooping Smile (Classic Stroke Facial Palsy) */}
      <path d="M 68 62 Q 78 68, 92 56" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" />

      {/* Warning indicator */}
      <path d="M 98 52 L 105 58" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
      <text x="80" y="96" textAnchor="middle" fill="#dc2626" fontSize="8" fontWeight="bold" fontFamily="monospace">
        FACIAL DROOP (VII)
      </text>
    </svg>
  );
}

/**
 * 10. Syringe & Emergency tPA Thrombolysis Intervention
 */
export function SyringeTpaSketch({ className }: PrimitiveProps) {
  return (
    <svg viewBox="0 0 160 90" className={cn("size-full overflow-visible", className)} fill="none">
      {/* Syringe barrel */}
      <rect x="50" y="35" width="60" height="20" rx="3" fill="#f0fdf4" stroke="#059669" strokeWidth="2.5" />
      {/* Measurement ticks */}
      <line x1="65" y1="35" x2="65" y2="43" stroke="#059669" strokeWidth="1.5" />
      <line x1="80" y1="35" x2="80" y2="45" stroke="#059669" strokeWidth="1.5" />
      <line x1="95" y1="35" x2="95" y2="43" stroke="#059669" strokeWidth="1.5" />

      {/* Plunger */}
      <rect x="110" y="40" width="28" height="10" fill="#cbd5e1" stroke="#475569" strokeWidth="2" />
      <line x1="138" y1="32" x2="138" y2="58" stroke="#475569" strokeWidth="3" strokeLinecap="round" />

      {/* Needle */}
      <line x1="50" y1="45" x2="20" y2="45" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />

      {/* Drug Droplets */}
      <circle cx="14" cy="45" r="2.5" fill="#059669" />
      <circle cx="8" cy="49" r="2" fill="#059669" />

      <text x="80" y="24" textAnchor="middle" fill="#047857" fontSize="8" fontWeight="bold" fontFamily="monospace">
        IV tPA / THROMBOLYSIS
      </text>
    </svg>
  );
}

/**
 * 11. Warning Stamp / Clinical Pearl Badge
 */
export function WarningStampSketch({ className }: PrimitiveProps) {
  return (
    <svg viewBox="0 0 160 80" className={cn("size-full overflow-visible", className)} fill="none">
      <rect
        x="15"
        y="15"
        width="130"
        height="50"
        rx="8"
        fill="#fef2f2"
        stroke="#dc2626"
        strokeWidth="3"
        strokeDasharray="6 4"
        transform="rotate(-2 80 40)"
      />
      <text
        x="80"
        y="38"
        textAnchor="middle"
        fill="#991b1b"
        fontSize="11"
        fontWeight="900"
        fontFamily="sans-serif"
        transform="rotate(-2 80 40)"
      >
        TIME IS BRAIN
      </text>
      <text
        x="80"
        y="52"
        textAnchor="middle"
        fill="#b91c1c"
        fontSize="8"
        fontWeight="bold"
        fontFamily="monospace"
        transform="rotate(-2 80 40)"
      >
        Golden Window &lt; 4.5 Hours
      </text>
    </svg>
  );
}

/**
 * Universal Medical Primitive Renderer
 * Dispatches to the corresponding hand-drawn SVG vector component
 */
export function MedicalPrimitiveRenderer({
  sketchType,
  className,
  isAnimated = true,
  colorVariant = "dark",
}: {
  sketchType?: MedicalPrimitiveType;
  className?: string;
  isAnimated?: boolean;
  colorVariant?: "red" | "blue" | "dark" | "green" | "amber";
}) {
  switch (sketchType) {
    case "vessel_occlusion":
    case "vessel_plaque":
      return <VesselOcclusionSketch className={className} isAnimated={isAnimated} colorVariant={colorVariant} />;
    case "vessel_rupture":
      return <VesselRuptureSketch className={className} isAnimated={isAnimated} colorVariant={colorVariant} />;
    case "brain_territories":
      return <BrainTerritoriesSketch className={className} isAnimated={isAnimated} colorVariant={colorVariant} />;
    case "heart_coronary":
      return <HeartCoronarySketch className={className} isAnimated={isAnimated} colorVariant={colorVariant} />;
    case "lungs_alveoli":
      return <LungsAlveoliSketch className={className} isAnimated={isAnimated} colorVariant={colorVariant} />;
    case "kidney_nephron":
      return <KidneyNephronSketch className={className} isAnimated={isAnimated} colorVariant={colorVariant} />;
    case "cell_receptor":
      return <CellReceptorSketch className={className} isAnimated={isAnimated} colorVariant={colorVariant} />;
    case "ecg_waveform":
    case "action_potential":
      return <ECGWaveformSketch className={className} isAnimated={isAnimated} colorVariant={colorVariant} />;
    case "patient_droop":
      return <PatientDroopSketch className={className} isAnimated={isAnimated} colorVariant={colorVariant} />;
    case "syringe_tpa":
    case "rx_pill":
      return <SyringeTpaSketch className={className} isAnimated={isAnimated} colorVariant={colorVariant} />;
    case "warning_stamp":
      return <WarningStampSketch className={className} isAnimated={isAnimated} colorVariant={colorVariant} />;
    default:
      return <BrainTerritoriesSketch className={className} isAnimated={isAnimated} colorVariant={colorVariant} />;
  }
}
