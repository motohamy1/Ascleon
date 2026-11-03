"use client";

import React, { useState, useMemo } from "react";
import {
  MorphArtifactData,
  RoadmapCardItem,
  SimulatorPreset,
  DiagramNode,
  SpatialLandmark,
  MindMapNode,
} from "@/types/morph";
import { ConceptMapCanvas } from "./ConceptMapCanvas";
import {
  Sparkles,
  ArrowRight,
  Activity,
  Layers,
  MapPin,
  CheckCircle2,
  RefreshCw,
  Info,
  ExternalLink,
  Code2,
  Cpu,
  BarChart3,
  Lightbulb,
  GitFork,
  XCircle,
  Eye,
  Check,
  Compass,
  Workflow,
  Split,
  Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MorphCanvasProps {
  artifact: MorphArtifactData;
  onNavigateSegment?: (segmentIndex: number) => void;
  onResetToBoot?: () => void;
  isLoading?: boolean;
  onAskAI?: (prompt: string) => void;
  onQuizNode?: (concept: string) => void;
  onPinNode?: (title: string, details: string) => void;
}

export const MorphCanvas: React.FC<MorphCanvasProps> = ({
  artifact,
  onNavigateSegment,
  onResetToBoot,
  isLoading,
  onAskAI,
  onQuizNode,
  onPinNode,
}) => {
  const [activeTab, setActiveTab] = useState<
    "all" | "cards" | "diagram" | "anatomy" | "matrix" | "simulator"
  >("all");
  const [activeSimulatorPreset, setActiveSimulatorPreset] =
    useState<string>("clean");
  const [selectedCard, setSelectedCard] = useState<RoadmapCardItem | null>(null);
  const [selectedLandmark, setSelectedLandmark] =
    useState<SpatialLandmark | null>(null);

  const roadmapBlock = artifact.blocks.find((b) => b.type === "roadmap_cards");
  const mindMapBlock = artifact.blocks.find((b) => b.type === "mind_map");
  const diagramBlock = artifact.blocks.find(
    (b) => b.type === "interactive_diagram",
  );
  const spatialBlock = artifact.blocks.find(
    (b) => b.type === "spatial_illustration",
  );
  const comparisonBlock = artifact.blocks.find(
    (b) => b.type === "comparison_matrix",
  );
  const simulatorBlock = artifact.blocks.find(
    (b) => b.type === "animated_simulator",
  );

  // Synthesize or extract hierarchical concept mind map nodes
  const mindMapNodes: MindMapNode[] = useMemo(() => {
    if (mindMapBlock?.mindMapData?.nodes && mindMapBlock.mindMapData.nodes.length > 0) {
      return mindMapBlock.mindMapData.nodes;
    }

    if (mindMapBlock?.mindMapNodes && mindMapBlock.mindMapNodes.length > 0) {
      return mindMapBlock.mindMapNodes.map((n, idx) => ({
        id: n.id || `node-${idx}`,
        label: n.label,
        details: n.detail || "",
        category: idx === 0 ? "root" : "pillar",
        color: n.color || (idx === 0 ? "#ff4c00" : "#43a08f"),
        parent: n.parent,
        level: (n.parent ? 1 : 0) as 0 | 1 | 2,
      }));
    }

    // High-yield fallback: convert diagramBlock or roadmap cards into interactive Mind Map
    if (diagramBlock?.diagramData?.nodes && diagramBlock.diagramData.nodes.length > 0) {
      const rootId = "root-principle";
      const rootNode: MindMapNode = {
        id: rootId,
        label: artifact.focalConcept || "Core Principles",
        sublabel: "Core Architecture",
        details: artifact.contextSummary?.subsequentBridge || "Primary conceptual mechanisms synthesized from the active study source.",
        category: "root",
        color: "#ff4c00",
        level: 0,
        x: 30,
        y: 80,
      };

      const pillarNodes: MindMapNode[] = diagramBlock.diagramData.nodes.map((n, idx) => ({
        id: n.id,
        label: n.label,
        sublabel: n.sublabel,
        details: n.details || n.sublabel || `High-yield mechanism for ${n.label}`,
        category: (n.category as any) || "pillar",
        color: n.color || (idx % 2 === 0 ? "#43a08f" : "#ff4c00"),
        parent: rootId,
        level: 1,
        x: 250,
        y: 25 + idx * 95,
      }));

      return [rootNode, ...pillarNodes];
    }

    if (roadmapBlock?.roadmapCards && roadmapBlock.roadmapCards.length > 0) {
      const rootId = "root-principle";
      const rootNode: MindMapNode = {
        id: rootId,
        label: artifact.focalConcept || "Core Principles",
        sublabel: "Synthesized Concept",
        details: "Central foundation governing the clinical differentiations below.",
        category: "root",
        color: "#ff4c00",
        level: 0,
        x: 30,
        y: 80,
      };

      const cardNodes: MindMapNode[] = roadmapBlock.roadmapCards.map((c, idx) => ({
        id: c.id,
        label: c.title,
        sublabel: c.badge,
        details: c.subtitle || c.bulletPoints?.join(" • ") || "",
        category: "pillar",
        color: idx === 0 ? "#ff4c00" : idx === 1 ? "#43a08f" : "#e0459a",
        parent: rootId,
        level: 1,
        x: 250,
        y: 25 + idx * 95,
      }));

      return [rootNode, ...cardNodes];
    }

    return [];
  }, [mindMapBlock, diagramBlock, roadmapBlock, artifact.focalConcept, artifact.contextSummary]);

  const presets = simulatorBlock?.simulatorData?.presets || [];
  const currentPreset =
    presets.find((p) => p.id === activeSimulatorPreset) || presets[0];

  const isPhono = simulatorBlock?.simulatorData?.type === "s2_split";
  const a2Offset = currentPreset?.waveformOffsets?.a2Offset ?? 240;
  const p2Offset = currentPreset?.waveformOffsets?.p2Offset ?? 264;

  return (
    <div dir="auto" className="flex animate-in fade-in flex-col gap-4 duration-200">
      {/* HEADER BANNER */}
      <div className="flex flex-col gap-2.5 rounded-[20px] border-2 border-[color:var(--orange)]/30 bg-[color:var(--ink-soft)] p-4 shadow-chip">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[color:var(--orange)] text-[color:var(--ink)]">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-black tracking-tight text-[color:var(--cream)]">
                  {artifact.focalConcept}
                </h3>
                <span className="shrink-0 rounded-full border border-[color:var(--teal)]/40 bg-[color:var(--teal)]/10 px-2 py-0.5 text-[10px] font-bold text-[#7fd8c9]">
                  Morphed
                </span>
              </div>
              <p className="truncate text-[11px] text-[color:var(--cream)]/60">
                {artifact.contextSummary?.subsequentBridge ||
                  "Contextual connections mapped across sections"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onResetToBoot && (
              <button
                type="button"
                onClick={onResetToBoot}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-[color:var(--cream)]/80 transition-colors hover:bg-white/10 hover:text-[color:var(--cream)]"
                title="Re-generate morph"
              >
                <RefreshCw className={cn("size-3", isLoading && "animate-spin")} />
                <span>Re-morph</span>
              </button>
            )}
          </div>
        </div>

        {/* VIEW SELECTOR CHIPS */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={cn(
              "cursor-pointer rounded-full px-2.5 py-0.5 text-[10.5px] font-bold transition-all",
              activeTab === "all"
                ? "bg-[color:var(--orange)] text-[color:var(--ink)]"
                : "bg-white/5 text-[color:var(--cream)]/70 hover:bg-white/10"
            )}
          >
            Overview (All)
          </button>
          {mindMapNodes.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("diagram")}
              className={cn(
                "flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold transition-all",
                activeTab === "diagram"
                  ? "bg-[#43a08f] text-[color:var(--ink)]"
                  : "bg-white/5 text-[#7fd8c9] hover:bg-white/10"
              )}
            >
              <Workflow className="size-3" />
              <span>Concept Mind Map</span>
            </button>
          )}
          {spatialBlock && (
            <button
              type="button"
              onClick={() => setActiveTab("anatomy")}
              className={cn(
                "flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold transition-all",
                activeTab === "anatomy"
                  ? "bg-[#e0459a] text-[color:var(--ink)]"
                  : "bg-white/5 text-[#f08dc7] hover:bg-white/10"
              )}
            >
              <Compass className="size-3" />
              <span>Anatomical Drawing</span>
            </button>
          )}
          {comparisonBlock && (
            <button
              type="button"
              onClick={() => setActiveTab("matrix")}
              className={cn(
                "flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold transition-all",
                activeTab === "matrix"
                  ? "bg-[#f6d7a1] text-[color:var(--ink)]"
                  : "bg-white/5 text-[color:var(--cream)] hover:bg-white/10"
              )}
            >
              <Split className="size-3" />
              <span>Contrast Matrix</span>
            </button>
          )}
          {simulatorBlock && (
            <button
              type="button"
              onClick={() => setActiveTab("simulator")}
              className={cn(
                "flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold transition-all",
                activeTab === "simulator"
                  ? "bg-[color:var(--teal)] text-[color:var(--ink)]"
                  : "bg-white/5 text-[color:var(--cream)]/70 hover:bg-white/10"
              )}
            >
              <Activity className="size-3" />
              <span>Simulator</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. CONCEPT MIND MAP CANVAS (GEMINI NOTEBOOKLM PRINCIPLES)                */}
      {/* ========================================================================= */}
      {mindMapNodes.length > 0 && (activeTab === "all" || activeTab === "diagram") && (
        <ConceptMapCanvas
          rootLabel={artifact.focalConcept}
          nodes={mindMapNodes}
          onAskAI={onAskAI}
          onQuizNode={onQuizNode}
          onPinNode={onPinNode}
        />
      )}

      {/* ========================================================================= */}
      {/* 2. PRECORDIAL ANATOMICAL MAP / DRAWING (MEDICAL/CHEST SILHOUETTE) */}
      {/* ========================================================================= */}
      {spatialBlock && spatialBlock.spatialLandmarks && (activeTab === "all" || activeTab === "anatomy") && (
        <div className="flex flex-col gap-3 rounded-[20px] border-2 border-white/10 bg-[color:var(--ink-soft)] p-4 shadow-chip">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#e0459a]">
              <Compass className="size-4 text-[#e0459a]" />
              <span>{spatialBlock.title}</span>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9.5px] font-mono text-[color:var(--cream)]/60">
              Interactive Torso Schematic
            </span>
          </div>
          <p className="text-[11px] text-[color:var(--cream)]/70 -mt-1">
            Click listening posts on the chest drawing to inspect valve radiation & acoustics
          </p>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            {/* SVG Anatomical Torso Drawing */}
            <div className="md:col-span-6 relative overflow-hidden rounded-[14px] border border-white/10 bg-black/60 p-2 flex items-center justify-center">
              <svg
                viewBox="0 0 400 240"
                className="h-auto w-full select-none"
              >
                {/* Torso Silhouette Outline */}
                <path
                  d="M 120 20 Q 200 40 280 20 Q 320 60 310 140 Q 300 220 200 230 Q 100 220 90 140 Q 80 60 120 20 Z"
                  fill="#151419"
                  stroke="rgba(246, 215, 161, 0.15)"
                  strokeWidth="2"
                />
                {/* Clavicles */}
                <path
                  d="M 130 35 Q 200 48 270 35"
                  fill="none"
                  stroke="rgba(246, 215, 161, 0.25)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                {/* Sternum Centerline */}
                <line
                  x1="200"
                  y1="45"
                  x2="200"
                  y2="155"
                  stroke="rgba(246, 215, 161, 0.3)"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                {/* Rib Arches */}
                <path d="M 170 70 Q 200 65 230 70" fill="none" stroke="rgba(246, 215, 161, 0.1)" strokeWidth="2" />
                <path d="M 160 95 Q 200 90 240 95" fill="none" stroke="rgba(246, 215, 161, 0.1)" strokeWidth="2" />
                <path d="M 150 120 Q 200 115 250 120" fill="none" stroke="rgba(246, 215, 161, 0.1)" strokeWidth="2" />
                <path d="M 140 145 Q 200 140 260 145" fill="none" stroke="rgba(246, 215, 161, 0.1)" strokeWidth="2" />

                {/* Auscultation Hotspots */}
                {spatialBlock.spatialLandmarks.map((lm) => {
                  const isSelected = selectedLandmark?.id === lm.id;
                  const coords = lm.svgCoords || { x: 200, y: 100 };

                  return (
                    <g
                      key={lm.id}
                      onClick={() => setSelectedLandmark(isSelected ? null : lm)}
                      className="cursor-pointer transition-all duration-200"
                    >
                      <circle
                        cx={coords.x}
                        cy={coords.y}
                        r="18"
                        fill={lm.color}
                        opacity={isSelected ? "0.35" : "0.15"}
                        className={isSelected ? "animate-ping" : undefined}
                      />
                      <circle
                        cx={coords.x}
                        cy={coords.y}
                        r="7"
                        fill={lm.color}
                        stroke="#fff"
                        strokeWidth="1.5"
                      />
                      <text
                        x={coords.x}
                        y={coords.y - 12}
                        textAnchor="middle"
                        fill="#f6d7a1"
                        fontSize="9.5"
                        fontWeight="black"
                      >
                        {lm.name.split(" ")[0]}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Landmarks List & Details */}
            <div className="md:col-span-6 flex flex-col gap-2">
              {spatialBlock.spatialLandmarks.map((lm) => {
                const isSelected = selectedLandmark?.id === lm.id;
                return (
                  <div
                    key={lm.id}
                    onClick={() => setSelectedLandmark(isSelected ? null : lm)}
                    className={cn(
                      "flex cursor-pointer flex-col gap-1 rounded-xl border p-2.5 text-xs transition-all",
                      isSelected
                        ? "border-[color:var(--orange)] bg-[color:var(--orange)]/[0.08] shadow-chip"
                        : "border-white/10 bg-black/30 hover:border-white/20"
                    )}
                  >
                    <div className="flex items-center justify-between font-bold text-[color:var(--cream)]">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: lm.color }}
                        />
                        <span>{lm.name}</span>
                      </span>
                      <span className="text-[10px] text-[color:var(--cream)]/60 font-mono">
                        {lm.location}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-[color:var(--cream)]/80">
                      {lm.notes}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SIDE-BY-SIDE CONTRAST MATRIX (CLEAN CODE VS DEBT / SLUM) */}
      {/* ========================================================================= */}
      {comparisonBlock && comparisonBlock.comparisonData && (activeTab === "all" || activeTab === "matrix") && (
        <div className="flex flex-col gap-3 rounded-[20px] border-2 border-white/10 bg-[color:var(--ink-soft)] p-4 shadow-chip">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[color:var(--cream)]">
              <Split className="size-4 text-[color:var(--orange)]" />
              <span>{comparisonBlock.title}</span>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9.5px] font-mono text-[color:var(--cream)]/60">
              Pattern Battle
            </span>
          </div>
          <p className="text-[11px] text-[color:var(--cream)]/70 -mt-1">
            {comparisonBlock.subtitle}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Left: Distinctive Accent Column (Orange Fill) */}
            <div className="flex flex-col gap-2 rounded-[18px] border-2 border-[color:var(--ink)] bg-[#ff4c00] text-[color:var(--ink)] p-4 shadow-chip">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-[color:var(--ink)] px-2.5 py-0.5 text-[10px] font-black text-[#f6d7a1] uppercase tracking-wider">
                  {comparisonBlock.comparisonData.left.badge}
                </span>
                <span className="text-[10px] font-mono font-bold text-[color:var(--ink)]/80 uppercase">Primary Focus</span>
              </div>
              <h4 className="text-sm font-black text-[color:var(--ink)]">
                {comparisonBlock.comparisonData.left.title}
              </h4>

              <div className="flex flex-col gap-1.5 pt-2 border-t border-[color:var(--ink)]/20 text-[11px]">
                {comparisonBlock.comparisonData.left.characteristics.map((c, i) => (
                  <div key={i} className="flex items-start gap-1.5 leading-snug">
                    <span className="text-[color:var(--ink)] font-black">✦</span>
                    <span className="text-[color:var(--ink)]">
                      <strong>{c.label}:</strong> {c.value}
                    </span>
                  </div>
                ))}
              </div>

              {comparisonBlock.comparisonData.left.visualSnippet && (
                <div className="mt-2 rounded-lg bg-[color:var(--ink)] p-2 font-mono text-[10px] text-[#f6d7a1] border border-[color:var(--ink)] overflow-x-auto whitespace-pre">
                  {comparisonBlock.comparisonData.left.visualSnippet}
                </div>
              )}
            </div>

            {/* Right: Clean Standard Column (Mint/Teal Fill) */}
            <div className="flex flex-col gap-2 rounded-[18px] border-2 border-[color:var(--ink)] bg-[#7fd8c9] text-[color:var(--ink)] p-4 shadow-chip">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-[color:var(--ink)] px-2.5 py-0.5 text-[10px] font-black text-[#7fd8c9] uppercase tracking-wider">
                  {comparisonBlock.comparisonData.right.badge}
                </span>
                <span className="text-[10px] font-mono font-bold text-[color:var(--ink)]/80 uppercase">Differential Target</span>
              </div>
              <h4 className="text-sm font-black text-[color:var(--ink)]">
                {comparisonBlock.comparisonData.right.title}
              </h4>

              <div className="flex flex-col gap-1.5 pt-2 border-t border-[color:var(--ink)]/20 text-[11px]">
                {comparisonBlock.comparisonData.right.characteristics.map((c, i) => (
                  <div key={i} className="flex items-start gap-1.5 leading-snug">
                    <span className="text-[color:var(--ink)] font-black">✓</span>
                    <span className="text-[color:var(--ink)]">
                      <strong>{c.label}:</strong> {c.value}
                    </span>
                  </div>
                ))}
              </div>

              {comparisonBlock.comparisonData.right.visualSnippet && (
                <div className="mt-2 rounded-lg bg-[color:var(--ink)] p-2 font-mono text-[10px] text-[#7fd8c9] border border-[color:var(--ink)] overflow-x-auto whitespace-pre">
                  {comparisonBlock.comparisonData.right.visualSnippet}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. COLORIZED ROADMAP CARDS */}
      {/* ========================================================================= */}
      {roadmapBlock && roadmapBlock.roadmapCards && (activeTab === "all" || activeTab === "cards") && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[color:var(--cream)]">
              <Layers className="size-3.5 text-[color:var(--orange)]" />
              <span>{roadmapBlock.title}</span>
            </div>
            <span className="text-[10px] text-[color:var(--cream)]/60">
              {roadmapBlock.subtitle}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {roadmapBlock.roadmapCards.map((card: RoadmapCardItem, cardIdx: number) => {
              const isSelected = selectedCard?.id === card.id;

              // Alternating rich fill from design system: #ff4c00, #f6d7a1, #7fd8c9, #e0459a
              const paletteCycle = ["accent-orange", "accent-cream", "accent-teal", "accent-magenta"];
              const effectiveBadgeType = card.badgeType || paletteCycle[cardIdx % paletteCycle.length];

              let cardBg = "bg-[#ff4c00] text-[color:var(--ink)] border-2 border-[color:var(--ink)] shadow-chip";
              let badgeStyle = "bg-[color:var(--ink)] text-[#f6d7a1] border-[color:var(--ink)]";
              let bulletBullet = "text-[color:var(--ink)]";
              let dividerStyle = "border-[color:var(--ink)]/20";
              let subStyle = "text-[color:var(--ink)]/85";

              if (effectiveBadgeType === "accent-teal") {
                cardBg = "bg-[#7fd8c9] text-[color:var(--ink)] border-2 border-[color:var(--ink)] shadow-chip";
                badgeStyle = "bg-[color:var(--ink)] text-[#7fd8c9] border-[color:var(--ink)]";
                bulletBullet = "text-[color:var(--ink)]";
                dividerStyle = "border-[color:var(--ink)]/20";
                subStyle = "text-[color:var(--ink)]/85";
              } else if (effectiveBadgeType === "accent-cream") {
                cardBg = "bg-[#f6d7a1] text-[color:var(--ink)] border-2 border-[color:var(--ink)] shadow-chip";
                badgeStyle = "bg-[#ff4c00] text-[color:var(--ink)] border-[color:var(--ink)]";
                bulletBullet = "text-[#ff4c00]";
                dividerStyle = "border-[color:var(--ink)]/20";
                subStyle = "text-[color:var(--ink)]/85";
              } else if (effectiveBadgeType === "accent-magenta") {
                cardBg = "bg-[#e0459a] text-[color:var(--ink)] border-2 border-[color:var(--ink)] shadow-chip";
                badgeStyle = "bg-[color:var(--ink)] text-[#f6d7a1] border-[color:var(--ink)]";
                bulletBullet = "text-[color:var(--ink)]";
                dividerStyle = "border-[color:var(--ink)]/20";
                subStyle = "text-[color:var(--ink)]/90";
              }

              return (
                <div
                  key={card.id}
                  onClick={() => setSelectedCard(isSelected ? null : card)}
                  className={cn(
                    "group relative flex cursor-pointer flex-col justify-between rounded-[18px] p-4 transition-all duration-200 min-w-0 overflow-hidden",
                    cardBg,
                    isSelected
                      ? "ring-4 ring-[color:var(--ink)] -translate-y-1 scale-[1.01]"
                      : "hover:-translate-y-0.5",
                  )}
                >
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider shrink-0",
                          badgeStyle,
                        )}
                      >
                        {card.badge}
                      </span>
                      {card.contextLink && (
                        <span className="truncate text-[10px] font-mono font-bold text-[color:var(--ink)]/60">
                          Section {card.contextLink.targetPageOrSegment}
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-black leading-snug text-[color:var(--ink)] break-words">
                      {card.title}
                    </h4>

                    <p className={cn("text-xs font-semibold leading-relaxed break-words", subStyle)}>
                      {card.subtitle}
                    </p>

                    <ul className={cn("flex flex-col gap-1.5 pt-2 border-t text-[11px] font-medium text-[color:var(--ink)]", dividerStyle)}>
                      {card.bulletPoints.map((pt, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 leading-relaxed">
                          <span className={cn("shrink-0 font-black", bulletBullet)}>›</span>
                          <span className="break-words">{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {card.contextLink && (
                    <div className="mt-3 border-t border-[color:var(--ink)]/20 pt-2 text-[10px]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            onNavigateSegment &&
                            card.contextLink?.targetPageOrSegment !== undefined
                          ) {
                            onNavigateSegment(
                              card.contextLink.targetPageOrSegment - 1,
                            );
                          }
                        }}
                        className="flex w-full items-center justify-between text-left text-[color:var(--ink)] font-bold hover:underline transition-colors cursor-pointer"
                      >
                        <span className="font-bold flex items-center gap-1 truncate">
                          <span>🔗</span>
                          <span className="truncate">{card.contextLink.label}</span>
                        </span>
                        <ArrowRight className="size-3 shrink-0" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. ANIMATED SIMULATOR / SYSTEM METRICS */}
      {/* ========================================================================= */}
      {simulatorBlock && (activeTab === "all" || activeTab === "simulator") && (
        <div className="flex flex-col gap-3 rounded-[20px] border-2 border-white/10 bg-[color:var(--ink-soft)] p-4 shadow-chip">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#7fd8c9]">
              <Activity className="size-4 text-[color:var(--teal)]" />
              <span>{simulatorBlock.title}</span>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9.5px] font-bold text-[color:var(--cream)]/60">
              Interactive Dynamics Engine
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {presets.map((p: SimulatorPreset) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveSimulatorPreset(p.id)}
                className={cn(
                  "cursor-pointer rounded-full px-3 py-1 text-[11px] font-bold transition-all",
                  activeSimulatorPreset === p.id
                    ? "border-2 border-[color:var(--ink)] bg-[#43a08f] text-[color:var(--ink)] shadow-chip"
                    : "border border-white/10 text-[color:var(--cream)]/70 hover:bg-white/5 hover:text-[color:var(--cream)]",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Cardiology Phonocardiogram OR Software Metrics */}
          {isPhono ? (
            <div className="relative overflow-hidden rounded-[14px] border border-white/10 bg-black/60 p-3">
              <svg
                viewBox="0 0 420 120"
                className="h-auto w-full select-none"
              >
                <line
                  x1="10"
                  y1="64"
                  x2="410"
                  y2="64"
                  stroke="rgba(246, 215, 161, 0.2)"
                  strokeDasharray="3 3"
                />

                {/* S4 */}
                <g opacity="0.8">
                  <rect x="34" y="46" width="7" height="36" rx="3.5" fill="#e0459a" />
                  <text x="37.5" y="98" textAnchor="middle" fill="#f08dc7" fontSize="9.5" fontWeight="bold">
                    S4
                  </text>
                </g>

                {/* S1 */}
                <g className="animate-pulse">
                  <rect x="78" y="26" width="11" height="76" rx="4" fill="#ff4c00" />
                  <rect x="92" y="34" width="6" height="60" rx="3" fill="#f6d7a1" />
                </g>
                <text x="87" y="112" textAnchor="middle" fill="#ff4c00" fontSize="10" fontWeight="bold">
                  S1 (Lub)
                </text>

                {/* Systole */}
                <text x="165" y="58" textAnchor="middle" fill="rgba(246, 215, 161, 0.4)" fontSize="9.5">
                  ← SYSTOLE →
                </text>

                {/* A2 Bar */}
                <g style={{ transform: `translateX(${a2Offset}px)`, transition: "transform 0.3s ease-out" }}>
                  <rect x="0" y="28" width="9" height="72" rx="4" fill="#43a08f" className="animate-pulse" />
                  <text x="4.5" y="20" textAnchor="middle" fill="#7fd8c9" fontSize="9.5" fontWeight="bold">
                    A2
                  </text>
                </g>

                {/* P2 Bar */}
                <g style={{ transform: `translateX(${p2Offset}px)`, transition: "transform 0.3s ease-out" }}>
                  <rect x="0" y="36" width="9" height="56" rx="4" fill="#f6d7a1" className="animate-pulse" />
                  <text x="4.5" y="20" textAnchor="middle" fill="#f6d7a1" fontSize="9.5" fontWeight="bold">
                    P2
                  </text>
                </g>

                {/* S3 */}
                <g opacity="0.8">
                  <rect x="345" y="44" width="8" height="40" rx="4" fill="#eec584" />
                  <text x="349" y="98" textAnchor="middle" fill="#eec584" fontSize="9.5" fontWeight="bold">
                    S3
                  </text>
                </g>
              </svg>
            </div>
          ) : (
            <div className="rounded-[14px] border border-white/10 bg-black/60 p-4 flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center flex flex-col items-center gap-1">
                  <span className="text-[10px] uppercase font-mono text-[color:var(--cream)]/60">
                    Velocity
                  </span>
                  <span className={cn(
                    "text-lg font-black",
                    activeSimulatorPreset === "clean" ? "text-[#7fd8c9]" : activeSimulatorPreset === "hack" ? "text-[#ff6e33]" : "text-[color:var(--orange)]"
                  )}>
                    {activeSimulatorPreset === "clean" ? "Steady" : activeSimulatorPreset === "hack" ? "Dropping" : "Rebounding"}
                  </span>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center flex flex-col items-center gap-1">
                  <span className="text-[10px] uppercase font-mono text-[color:var(--cream)]/60">
                    Tech Debt
                  </span>
                  <span className={cn(
                    "text-lg font-black",
                    activeSimulatorPreset === "clean" ? "text-[#7fd8c9]" : activeSimulatorPreset === "hack" ? "text-[#ff4c00]" : "text-[color:var(--cream)]"
                  )}>
                    {activeSimulatorPreset === "clean" ? "Low" : activeSimulatorPreset === "hack" ? "Critical" : "Controlled"}
                  </span>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center flex flex-col items-center gap-1">
                  <span className="text-[10px] uppercase font-mono text-[color:var(--cream)]/60">
                    Bug Friction
                  </span>
                  <span className={cn(
                    "text-lg font-black",
                    activeSimulatorPreset === "clean" ? "text-[#7fd8c9]" : activeSimulatorPreset === "hack" ? "text-[#ff4c00]" : "text-[color:var(--cream)]"
                  )}>
                    {activeSimulatorPreset === "clean" ? "Near Zero" : activeSimulatorPreset === "hack" ? "Severe" : "Low"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {currentPreset && (
            <div className="flex items-start gap-2 rounded-xl bg-black/40 p-3 text-xs leading-relaxed text-[color:var(--cream)]/90 border border-white/5">
              <Info className="size-4 shrink-0 text-[#7fd8c9] mt-0.5" />
              <div>
                <strong className="text-[color:var(--cream)]">
                  {currentPreset.label}:{" "}
                </strong>
                <span>{currentPreset.caption}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
