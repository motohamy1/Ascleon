"use client";

import React from "react";
import { ChalkIllustrationSpec, ChalkNode } from "@/types/whiteboard";
import { cn } from "@/lib/utils";
import { Sparkles, Pointer } from "lucide-react";

interface ChalkIllustrationCanvasProps {
  illustration: ChalkIllustrationSpec;
  currentStepIndex: number;
  laserTargetId?: string;
  onNodeClick?: (node: ChalkNode) => void;
  className?: string;
}

export function ChalkIllustrationCanvas({
  illustration,
  currentStepIndex,
  laserTargetId,
  onNodeClick,
  className,
}: ChalkIllustrationCanvasProps) {
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

  const getNodeColor = (type?: string) => {
    switch (type) {
      case "trigger":
        return "border-[color:var(--orange)] bg-[#ffedd5] text-[#7c2d12]";
      case "mediator":
        return "border-amber-400 bg-amber-50 text-amber-950";
      case "outcome":
        return "border-[color:var(--mint)] bg-emerald-50 text-emerald-950";
      case "trap":
        return "border-red-500 bg-red-50 text-red-950";
      case "drug":
        return "border-sky-400 bg-sky-50 text-sky-950";
      default:
        return "border-[color:var(--ink)] bg-[color:var(--cream)] text-[color:var(--ink)]";
    }
  };

  return (
    <div
      className={cn(
        "relative w-full h-full min-h-[340px] rounded-[18px] border-2 border-[color:var(--ink)] bg-[#1a1c1e] p-4 text-white overflow-hidden shadow-chip select-none",
        className
      )}
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* Board Header Bar */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-[color:var(--orange)] animate-pulse" />
          <span className="font-mono text-xs font-black uppercase tracking-wider text-amber-200">
            {illustration.title || "Clinical Mechanism Canvas"}
          </span>
        </div>
        <div className="font-mono text-[10px] font-bold text-white/60">
          Choreography Step: {Math.min(currentStepIndex + 1, illustration.totalSteps)} /{" "}
          {illustration.totalSteps}
        </div>
      </div>

      {/* SVG Layer for Connecting Edges and Arrows */}
      <svg className="absolute inset-0 size-full pointer-events-none z-0">
        <defs>
          <marker
            id="chalk-arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
          </marker>
          <marker
            id="chalk-inhibition"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <line x1="5" y1="0" x2="5" y2="10" stroke="#ef4444" strokeWidth="3" />
          </marker>
        </defs>

        {visibleEdges.map((edge) => {
          const fromNode = illustration.nodes.find((n) => n.id === edge.from);
          const toNode = illustration.nodes.find((n) => n.id === edge.to);
          if (!fromNode || !toNode) return null;

          const isCurved = edge.style === "curved";
          const pathD = isCurved
            ? `M ${fromNode.x}% ${fromNode.y}% Q ${(fromNode.x + toNode.x) / 2}% ${
                (fromNode.y + toNode.y) / 2 - 12
              }% ${toNode.x}% ${toNode.y}%`
            : `M ${fromNode.x}% ${fromNode.y}% L ${toNode.x}% ${toNode.y}%`;

          return (
            <g key={edge.id} className="animate-in fade-in duration-300">
              <path
                d={pathD}
                fill="none"
                stroke={edge.style === "inhibition" ? "#ef4444" : "#f59e0b"}
                strokeWidth="2.5"
                strokeDasharray={edge.style === "dotted" ? "5 4" : undefined}
                markerEnd={
                  edge.style === "inhibition" ? "url(#chalk-inhibition)" : "url(#chalk-arrow)"
                }
                className="opacity-80 transition-all duration-300"
              />
              {edge.label && (
                <text
                  x={`${(fromNode.x + toNode.x) / 2}%`}
                  y={`${(fromNode.y + toNode.y) / 2 - 3}%`}
                  textAnchor="middle"
                  fill="#fef3c7"
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="bold"
                  className="bg-black/60 px-1"
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Nodes Layer */}
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
                "absolute pointer-events-auto cursor-pointer max-w-[170px] rounded-[14px] border-2 p-2.5 shadow-[3px_3px_0px_#0f0e10] transition-all duration-200 hover:scale-105 active:scale-95 animate-in zoom-in-95",
                getNodeColor(node.type),
                isTargetedByLaser && "ring-4 ring-red-500 ring-offset-2 ring-offset-black scale-105"
              )}
              title="Click to ask live mentor about this step"
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="font-mono text-[9px] font-black uppercase opacity-75">
                  {node.type || "STEP"}
                </span>
                {isTargetedByLaser && (
                  <span className="size-2 rounded-full bg-red-500 animate-ping" />
                )}
              </div>
              <div className="font-sans text-xs font-black leading-tight">{node.label}</div>
              {node.subtext && (
                <div className="mt-1 text-[10px] font-medium opacity-85 leading-snug">
                  {node.subtext}
                </div>
              )}
            </div>
          );
        })}
      </div>

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
            <div className="absolute size-10 rounded-full bg-red-500/30 animate-ping" />
            <div className="size-4 rounded-full bg-red-500 shadow-[0_0_12px_#ef4444] border-2 border-white" />
            <div className="absolute -top-7 left-3 flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[8.5px] font-mono font-black uppercase text-white shadow-sm whitespace-nowrap">
              <Pointer className="size-2.5" /> Mentor Pointing
            </div>
          </div>
        </div>
      )}

      {/* Chalk Notes Callout at Bottom of Board */}
      {illustration.chalkNotes && illustration.chalkNotes.length > 0 && (
        <div className="absolute bottom-2 left-3 right-3 z-20 flex items-center gap-2 rounded-[10px] border border-amber-300/30 bg-amber-950/40 px-3 py-1.5 text-xs text-amber-200">
          <Sparkles className="size-3.5 text-amber-400 shrink-0" />
          <span className="font-sans font-semibold text-[11px] truncate">
            {illustration.chalkNotes[0]}
          </span>
        </div>
      )}
    </div>
  );
}
