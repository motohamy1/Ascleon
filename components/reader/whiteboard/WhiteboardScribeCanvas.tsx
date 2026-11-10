"use client";

import React, { useState, useEffect, useRef } from "react";
import { ChalkIllustrationSpec, ChalkNode } from "@/types/whiteboard";
import { MedicalPrimitiveRenderer } from "./MedicalSketchPrimitives";
import { cn } from "@/lib/utils";
import { Sparkles, Pointer } from "lucide-react";

interface WhiteboardScribeCanvasProps {
  illustration: ChalkIllustrationSpec;
  currentStepIndex: number;
  laserTargetId?: string;
  onNodeClick?: (node: ChalkNode) => void;
  isPlaying?: boolean;
  className?: string;
}

/**
 * High-Fidelity Vector Hand holding a Marker (VideoScribe / HealthSketch style)
 */
function DrawingHandMarker({ x, y, isDrawing }: { x: number; y: number; isDrawing: boolean }) {
  return (
    <div
      className={cn(
        "absolute z-40 pointer-events-none transition-all duration-300 ease-out",
        isDrawing ? "opacity-100" : "opacity-0"
      )}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-20px, -95px)",
      }}
    >
      <svg
        viewBox="0 0 100 120"
        className={cn("size-24 drop-shadow-md select-none", isDrawing && "animate-sketch-wobble")}
        fill="none"
      >
        {/* Arm / Forearm cuff */}
        <path d="M 60 115 L 88 120 L 78 85 L 50 82 Z" fill="#e2e8f0" stroke="#334155" strokeWidth="2" />

        {/* Human Hand & Fingers gripping marker */}
        <path
          d="M 42 75 C 38 68, 48 55, 56 60 C 62 64, 62 75, 58 82 C 55 88, 46 82, 42 75 Z"
          fill="#fed7aa"
          stroke="#9a3412"
          strokeWidth="2"
        />
        {/* Thumb */}
        <path
          d="M 36 68 C 30 62, 38 52, 45 56 C 50 60, 44 70, 36 68 Z"
          fill="#ffedd5"
          stroke="#9a3412"
          strokeWidth="2"
        />

        {/* Marker Body */}
        <polygon points="26,62 38,40 45,44 33,66" fill="#1e293b" stroke="#0f172a" strokeWidth="1.5" />
        {/* Marker Nib Cap */}
        <polygon points="22,68 26,62 33,66 28,72" fill="#94a3b8" stroke="#475569" strokeWidth="1" />
        {/* Marker Chisel Nib (Contact Point at 20, 75) */}
        <polygon points="18,74 22,68 28,72 23,78" fill="#dc2626" />
      </svg>
    </div>
  );
}

export function WhiteboardScribeCanvas({
  illustration,
  currentStepIndex,
  laserTargetId,
  onNodeClick,
  isPlaying = false,
  className,
}: WhiteboardScribeCanvasProps) {
  const [handPos, setHandPos] = useState<{ x: number; y: number }>({ x: 25, y: 45 });
  const [isHandDrawing, setIsHandDrawing] = useState(false);

  // Compute laser position based on target node
  const laserPos = React.useMemo(() => {
    if (!laserTargetId) return null;
    const targetNode = illustration.nodes.find((n) => n.id === laserTargetId);
    return targetNode ? { x: targetNode.x, y: targetNode.y } : null;
  }, [laserTargetId, illustration.nodes]);

  // Nodes revealed up to currentStepIndex
  const visibleNodes = illustration.nodes.filter(
    (n) => typeof n.revealedInStep !== "number" || n.revealedInStep <= currentStepIndex
  );

  const visibleEdges = illustration.edges.filter(
    (e) => typeof e.revealedInStep !== "number" || e.revealedInStep <= currentStepIndex
  );

  // Animate hand when new step reveals or laser points to a node
  useEffect(() => {
    const targetNode =
      (laserTargetId && illustration.nodes.find((n) => n.id === laserTargetId)) ||
      illustration.nodes.find((n) => n.revealedInStep === currentStepIndex) ||
      illustration.nodes[0];
    if (targetNode) {
      setHandPos({ x: targetNode.x, y: targetNode.y });
      setIsHandDrawing(true);
      const timer = setTimeout(() => setIsHandDrawing(false), 1800);
      return () => clearTimeout(timer);
    }
  }, [currentStepIndex, laserTargetId, illustration.nodes]);

  const getNodeBorderColor = (type?: string, colorVariant?: string) => {
    if (colorVariant === "red" || type === "trigger" || type === "trap") {
      return "border-red-500 bg-red-50/90 text-red-950 shadow-[3px_3px_0px_#b91c1c]";
    }
    if (colorVariant === "blue" || type === "outcome") {
      return "border-blue-600 bg-blue-50/90 text-blue-950 shadow-[3px_3px_0px_#1d4ed8]";
    }
    if (colorVariant === "green" || type === "drug") {
      return "border-emerald-600 bg-emerald-50/90 text-emerald-950 shadow-[3px_3px_0px_#047857]";
    }
    if (colorVariant === "amber" || type === "mediator") {
      return "border-amber-500 bg-amber-50/90 text-amber-950 shadow-[3px_3px_0px_#b45309]";
    }
    return "border-slate-800 bg-white/95 text-slate-900 shadow-[3px_3px_0px_#0f172a]";
  };

  return (
    <div
      className={cn(
        "relative w-full h-full min-h-[380px] rounded-[18px] border-2 border-[color:var(--ink)] bg-[#fcfaf5] p-4 text-[color:var(--ink)] overflow-hidden shadow-chip select-none transition-all",
        className
      )}
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgba(15, 23, 42, 0.07) 1px, transparent 0)",
        backgroundSize: "28px 28px",
      }}
    >
      {/* Hand-Drawn Board Top Ribbon */}
      <div className="flex items-center justify-between border-b-2 border-slate-300 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-full bg-red-600 animate-pulse" />
          <span className="font-mono text-xs font-black uppercase tracking-wider text-slate-900">
            {illustration.title || "Medical Whiteboard Animation Canvas"}
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] font-bold text-slate-600">
          <span className="rounded-full bg-slate-200 px-2 py-0.5">
            Step {Math.min(currentStepIndex + 1, illustration.totalSteps)} / {illustration.totalSteps}
          </span>
          {isPlaying && (
            <span className="flex items-center gap-1 text-red-600 font-black animate-pulse">
              ● Recording Draw
            </span>
          )}
        </div>
      </div>

      {/* SVG Vector Layer for Connecting Hand-Drawn Flow Arrows */}
      <svg className="absolute inset-0 size-full pointer-events-none z-0">
        <defs>
          <marker
            id="scribe-arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#dc2626" />
          </marker>
          <marker
            id="scribe-inhibition"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <line x1="5" y1="0" x2="5" y2="10" stroke="#b91c1c" strokeWidth="3" />
          </marker>
        </defs>

        {visibleEdges.map((edge) => {
          const fromNode = illustration.nodes.find((n) => n.id === edge.from);
          const toNode = illustration.nodes.find((n) => n.id === edge.to);
          if (!fromNode || !toNode) return null;

          const isCurved = edge.style === "curved";
          const pathD = isCurved
            ? `M ${fromNode.x}% ${fromNode.y}% Q ${(fromNode.x + toNode.x) / 2}% ${
                (fromNode.y + toNode.y) / 2 - 14
              }% ${toNode.x}% ${toNode.y}%`
            : `M ${fromNode.x}% ${fromNode.y}% L ${toNode.x}% ${toNode.y}%`;

          return (
            <g key={edge.id} className="animate-in fade-in duration-300">
              <path
                d={pathD}
                fill="none"
                stroke={edge.style === "inhibition" ? "#b91c1c" : "#dc2626"}
                strokeWidth="3"
                strokeDasharray={edge.style === "dotted" ? "5 4" : undefined}
                markerEnd={
                  edge.style === "inhibition" ? "url(#scribe-inhibition)" : "url(#scribe-arrow)"
                }
                className="opacity-85 transition-all duration-300"
              />
              {edge.label && (
                <text
                  x={`${(fromNode.x + toNode.x) / 2}%`}
                  y={`${(fromNode.y + toNode.y) / 2 - 5}%`}
                  textAnchor="middle"
                  fill="#7f1d1d"
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="bold"
                  className="bg-white/80 px-1 select-none"
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Nodes & Hand-Drawn Medical Illustrations Layer */}
      <div className="relative size-full z-10 pointer-events-none">
        {visibleNodes.map((node) => {
          const isTargetedByLaser = laserTargetId === node.id;

          return (
            <div
              key={node.id}
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
                transform: "translate(-50%, -50%)",
              }}
              onClick={() => onNodeClick && onNodeClick(node)}
              className={cn(
                "absolute pointer-events-auto cursor-pointer w-[165px] sm:w-[190px] rounded-[16px] border-2 p-2.5 transition-all duration-200 hover:scale-105 active:scale-95 animate-in zoom-in-95",
                getNodeBorderColor(node.type, node.colorVariant),
                isTargetedByLaser && "ring-4 ring-red-500 ring-offset-2 ring-offset-white scale-105"
              )}
              title="Click node to ask live voice mentor about this step"
            >
              {/* Node Header Badge */}
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="font-mono text-[9px] font-black uppercase tracking-wider opacity-80">
                  {node.type || "STEP"}
                </span>
                {isTargetedByLaser && (
                  <span className="size-2 rounded-full bg-red-600 animate-ping" />
                )}
              </div>

              {/* Hand-Drawn Medical Vector Sketch */}
              {node.sketchType && (
                <div className="h-16 w-full flex items-center justify-center my-1 bg-white/70 rounded-[10px] p-1 border border-slate-200">
                  <MedicalPrimitiveRenderer sketchType={node.sketchType} isAnimated={true} />
                </div>
              )}

              {/* Node Title & Clinical Subtext */}
              <div className="font-sans text-xs font-black leading-tight text-slate-900 mt-1">
                {node.label}
              </div>
              {node.subtext && (
                <div className="mt-1 text-[10px] font-medium text-slate-700 leading-snug line-clamp-3">
                  {node.subtext}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Animated VideoScribe Hand Marker Cursor */}
      <DrawingHandMarker x={handPos.x} y={handPos.y} isDrawing={isHandDrawing} />

      {/* Live Glowing Laser Pointer */}
      {laserPos && (
        <div
          className="absolute z-30 pointer-events-none transition-all duration-500 ease-out"
          style={{
            left: `${laserPos.x}%`,
            top: `${laserPos.y}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div className="relative flex items-center justify-center">
            {/* Outer red pulsing halo */}
            <div className="absolute size-10 rounded-full bg-red-500/35 animate-ping" />
            <div className="size-4 rounded-full bg-red-600 shadow-[0_0_14px_#ef4444] border-2 border-white" />
            <div className="absolute -top-7 left-3 flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[8.5px] font-mono font-black uppercase text-white shadow-sm whitespace-nowrap">
              <Pointer className="size-2.5" /> Mentor Pointing
            </div>
          </div>
        </div>
      )}

      {/* Handwritten Marker Clinical Pearl Note Banner at Bottom */}
      {illustration.chalkNotes && illustration.chalkNotes.length > 0 && (
        <div className="absolute bottom-2.5 left-3 right-3 z-20 flex items-center gap-2 rounded-[12px] border-2 border-amber-400 bg-amber-50/95 px-3 py-1.5 text-xs text-amber-950 shadow-sm">
          <Sparkles className="size-3.5 text-amber-600 shrink-0" />
          <span className="font-sans font-bold text-[11px] truncate">
            {illustration.chalkNotes[0]}
          </span>
        </div>
      )}
    </div>
  );
}
