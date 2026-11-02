"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  MindMapNode,
} from "@/types/morph";
import {
  Sparkles,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  MessageSquare,
  HelpCircle,
  BookmarkPlus,
  Compass,
  Check,
  ChevronRight,
  Layers,
  Activity,
  Workflow,
  X,
  Maximize2,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ConceptMapCanvasProps {
  rootLabel?: string;
  nodes: MindMapNode[];
  edges?: { from: string; to: string; label?: string }[];
  onAskAI?: (prompt: string) => void;
  onQuizNode?: (concept: string) => void;
  onPinNode?: (title: string, details: string) => void;
  className?: string;
}

export function ConceptMapCanvas({
  rootLabel = "Core Principles Concept Map",
  nodes,
  edges = [],
  onAskAI,
  onQuizNode,
  onPinNode,
  className,
}: ConceptMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan & Zoom Transform State
  const [zoom, setZoom] = useState<number>(0.92);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 20, y: 15 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialPan = useRef<{ x: number; y: number }>({ x: 20, y: 15 });

  // Selected Node State
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pinnedSuccess, setPinnedSuccess] = useState(false);

  // Compute node layouts based on hierarchy (Levels 0, 1, 2)
  const computedNodes = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];

    const rootNodes = nodes.filter((n) => n.level === 0 || !n.parent);
    const level1Nodes = nodes.filter((n) => n.level === 1 || (n.parent && n.parent === rootNodes[0]?.id));
    const level2Nodes = nodes.filter((n) => n.level === 2 || (n.parent && n.parent !== rootNodes[0]?.id));

    const result: Array<MindMapNode & { xPos: number; yPos: number; width: number; height: number }> = [];

    // 1. Position Root Node (Left column, centered vertically)
    const root = rootNodes[0] || nodes[0];
    const totalPillars = Math.max(level1Nodes.length, 1);
    const totalHeight = totalPillars * 96;
    const rootY = Math.max(60, totalHeight / 2 - 20);

    result.push({
      ...root,
      xPos: root.x ?? 30,
      yPos: root.y ?? rootY,
      width: 175,
      height: 64,
    });

    // 2. Position Level 1 Pillars (Middle column)
    const pillarYMap = new Map<string, number>();
    level1Nodes.forEach((pNode, pIdx) => {
      const y = 25 + pIdx * 94;
      pillarYMap.set(pNode.id, y);
      result.push({
        ...pNode,
        xPos: pNode.x ?? 250,
        yPos: pNode.y ?? y,
        width: 180,
        height: 68,
      });
    });

    // 3. Position Level 2 Leaves (Right column, aligned to their parent pillar)
    const pillarLeafCounts = new Map<string, number>();
    level2Nodes.forEach((lNode) => {
      const parentId = lNode.parent || level1Nodes[0]?.id;
      const count = pillarLeafCounts.get(parentId) || 0;
      pillarLeafCounts.set(parentId, count + 1);

      const parentY = pillarYMap.get(parentId) ?? (25 + count * 80);
      const leafY = parentY + (count * 60) - 10;

      result.push({
        ...lNode,
        xPos: lNode.x ?? 480,
        yPos: lNode.y ?? Math.max(15, leafY),
        width: 200,
        height: 58,
      });
    });

    return result;
  }, [nodes]);

  // Find currently active node object
  const activeNode = useMemo(() => {
    return computedNodes.find((n) => n.id === selectedNodeId) || null;
  }, [computedNodes, selectedNodeId]);

  // Compute Connecting SVG Bezier Edges
  const computedEdges = useMemo(() => {
    const list: Array<{
      id: string;
      fromId: string;
      toId: string;
      path: string;
      color: string;
      label?: string;
      isHighlighted: boolean;
    }> = [];

    computedNodes.forEach((child) => {
      if (!child.parent) return;
      const parent = computedNodes.find((p) => p.id === child.parent);
      if (!parent) return;

      const sx = parent.xPos + parent.width;
      const sy = parent.yPos + parent.height / 2;
      const tx = child.xPos;
      const ty = child.yPos + child.height / 2;

      const deltaX = Math.max(30, (tx - sx) / 2);
      const path = `M ${sx} ${sy} C ${sx + deltaX} ${sy}, ${tx - deltaX} ${ty}, ${tx} ${ty}`;

      const isHighlighted =
        selectedNodeId === child.id ||
        selectedNodeId === parent.id ||
        (activeNode?.parent === parent.id);

      const color = child.color || parent.color || "#ff4c00";

      list.push({
        id: `${parent.id}->${child.id}`,
        fromId: parent.id,
        toId: child.id,
        path,
        color,
        isHighlighted,
      });
    });

    return list;
  }, [computedNodes, selectedNodeId, activeNode]);

  // Pan Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag on canvas background, not when clicking interactive buttons
    if ((e.target as HTMLElement).closest(".mindmap-interactive")) return;

    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    initialPan.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({
      x: initialPan.current.x + dx,
      y: initialPan.current.y + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom Controls
  const handleZoomIn = () => setZoom((z) => Math.min(1.4, z + 0.12));
  const handleZoomOut = () => setZoom((z) => Math.max(0.55, z - 0.12));
  const handleResetView = () => {
    setZoom(0.92);
    setPan({ x: 20, y: 15 });
  };

  // Action Dispatchers for Selected Node
  const handleAskAIAboutNode = useCallback(() => {
    if (!activeNode) return;
    const prompt = `Deep dive into this core principle from the concept map: "${activeNode.label}" (${activeNode.category}). Context details: "${activeNode.details}". Explain the underlying mechanism and clinical or exam significance.`;
    onAskAI?.(prompt);
  }, [activeNode, onAskAI]);

  const handleQuizAboutNode = useCallback(() => {
    if (!activeNode) return;
    onQuizNode?.(`${activeNode.label}: ${activeNode.details}`);
  }, [activeNode, onQuizNode]);

  const handlePinActiveNode = useCallback(() => {
    if (!activeNode) return;
    onPinNode?.(activeNode.label, activeNode.details);
    setPinnedSuccess(true);
    setTimeout(() => setPinnedSuccess(false), 1800);
  }, [activeNode, onPinNode]);

  return (
    <div
      className={cn(
        // Strict boundary: bounded height, solid border, never overlays cards below
        "relative flex h-[410px] w-full flex-col overflow-hidden rounded-[20px] border-2 border-[color:var(--orange)]/35 shadow-chip select-none",
        className
      )}
      // Project's signature Ink color with subtle Ascleon Orange radial dot grid
      style={{
        backgroundColor: "var(--ink, #16151a)",
        backgroundImage:
          "radial-gradient(circle, rgba(255, 76, 0, 0.14) 1.2px, transparent 1.2px)",
        backgroundSize: "22px 22px",
      }}
    >
      {/* ===================================================================== */}
      {/* CANVAS HEADER BAR (Pinned inside the container)                       */}
      {/* ===================================================================== */}
      <div className="mindmap-interactive relative z-20 flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-[#16151a]/90 px-3.5 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-lg bg-[color:var(--orange)] text-[color:var(--ink)] shadow-xs">
            <Workflow className="size-3.5" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black tracking-tight text-[color:var(--cream)]">
              Core Principles Concept Map
            </span>
            <span className="hidden sm:inline-flex rounded-full border border-[color:var(--orange)]/30 bg-[color:var(--orange)]/15 px-2 py-0.5 text-[9.5px] font-bold text-[color:var(--orange)]">
              Gemini Notebook Model
            </span>
          </div>
        </div>

        {/* Canvas Toolbar Controls: Zoom & Reset */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleZoomOut}
            className="flex size-6.5 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-white/5 text-[color:var(--cream)]/80 hover:bg-white/15 hover:text-[color:var(--cream)] transition-colors"
            title="Zoom Out (-)"
          >
            <ZoomOut className="size-3.5" />
          </button>
          <span className="w-8 text-center font-mono text-[10.5px] font-bold text-[color:var(--cream)]/70">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            className="flex size-6.5 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-white/5 text-[color:var(--cream)]/80 hover:bg-white/15 hover:text-[color:var(--cream)] transition-colors"
            title="Zoom In (+)"
          >
            <ZoomIn className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetView}
            className="flex size-6.5 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-white/5 text-[color:var(--cream)]/80 hover:bg-white/15 hover:text-[color:var(--cream)] transition-colors"
            title="Reset Pan & Zoom"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* INTERACTIVE PAN/ZOOM WORKSPACE                                        */}
      {/* ===================================================================== */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={cn(
          "relative flex-1 overflow-hidden",
          isDragging ? "cursor-grabbing" : "cursor-grab"
        )}
      >
        <div
          className="absolute origin-top-left transition-transform duration-75 ease-out"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            width: "780px",
            height: "460px",
          }}
        >
          {/* SVG Connecting Edges Layer */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <defs>
              <linearGradient id="activeEdgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ff4c00" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#43a08f" stopOpacity="0.95" />
              </linearGradient>
              <filter id="edgeGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {computedEdges.map((edge) => (
              <g key={edge.id}>
                <path
                  d={edge.path}
                  fill="none"
                  stroke={edge.isHighlighted ? "url(#activeEdgeGrad)" : "rgba(255, 255, 255, 0.18)"}
                  strokeWidth={edge.isHighlighted ? "2.5" : "1.5"}
                  strokeDasharray={edge.isHighlighted ? "5 3" : undefined}
                  filter={edge.isHighlighted ? "url(#edgeGlow)" : undefined}
                  className={edge.isHighlighted ? "animate-pulse" : undefined}
                />
              </g>
            ))}
          </svg>

          {/* Render All Hierarchical Node Cards */}
          {computedNodes.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const isRoot = node.level === 0;
            const isPillar = node.level === 1;

            return (
              <div
                key={node.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNodeId(isSelected ? null : node.id);
                }}
                style={{
                  left: `${node.xPos}px`,
                  top: `${node.yPos}px`,
                  width: `${node.width}px`,
                }}
                className={cn(
                  "mindmap-interactive group absolute cursor-pointer rounded-xl border p-2.5 transition-all duration-200 shadow-md",
                  isSelected
                    ? "scale-105 border-[color:var(--orange)] bg-[#211f29] shadow-lg ring-2 ring-[color:var(--orange)]/60 z-30"
                    : isRoot
                    ? "border-[color:var(--orange)]/70 bg-[#241a18] hover:border-[color:var(--orange)] z-20"
                    : isPillar
                    ? "border-white/20 bg-[#1c1b22] hover:border-white/40 z-10"
                    : "border-white/10 bg-[#151419]/90 hover:border-white/25 z-10"
                )}
              >
                {/* Node Category Pill */}
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[8.5px] font-black uppercase tracking-wider",
                      isRoot
                        ? "bg-[color:var(--orange)] text-[color:var(--ink)]"
                        : "bg-white/10 text-[color:var(--cream)]/70"
                    )}
                    style={
                      !isRoot && node.color
                        ? { color: node.color, backgroundColor: `${node.color}20` }
                        : undefined
                    }
                  >
                    {isRoot ? "Root Topic" : node.category || "Principle"}
                  </span>

                  {node.sublabel && (
                    <span className="truncate text-[8px] font-mono text-[color:var(--cream)]/50">
                      {node.sublabel}
                    </span>
                  )}
                </div>

                {/* Node Main Title (Full text, wrapped, zero truncation) */}
                <h4
                  className={cn(
                    "font-bold leading-snug line-clamp-2",
                    isRoot
                      ? "text-xs font-black text-[color:var(--cream)]"
                      : "text-[11px] text-[color:var(--cream)]"
                  )}
                >
                  {node.label}
                </h4>

                {/* Node Brief Footnote / Hint */}
                {node.details && (
                  <p className="mt-1 line-clamp-1 text-[9.5px] text-[color:var(--cream)]/65 leading-tight">
                    {node.details}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Canvas Background Pan Hint */}
        <div className="pointer-events-none absolute bottom-2 left-3 z-10 text-[9.5px] font-mono text-[color:var(--cream)]/40">
          ✦ Drag canvas to pan • Click node to open deep study actions
        </div>

        {/* =================================================================== */}
        {/* ACTION DOCK (Docked inside canvas bottom when a node is selected)     */}
        {/* =================================================================== */}
        {activeNode && (
          <div className="mindmap-interactive animate-in fade-in slide-in-from-bottom-3 duration-150 absolute bottom-3 left-3 right-3 z-30 flex flex-col gap-2 rounded-2xl border-2 border-[color:var(--orange)] bg-[#17161c]/95 p-3 text-xs text-[color:var(--cream)] shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ backgroundColor: activeNode.color || "#ff4c00" }}
                />
                <strong className="truncate text-xs font-black text-[color:var(--orange)]">
                  {activeNode.label}
                </strong>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] uppercase font-mono text-[color:var(--cream)]/60">
                  {activeNode.category}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setSelectedNodeId(null)}
                className="rounded-full p-1 text-[color:var(--cream)]/60 hover:bg-white/10 hover:text-[color:var(--cream)] cursor-pointer"
                title="Close Inspector"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Full Concept Explanation */}
            <p className="line-clamp-2 text-[11px] leading-relaxed text-[color:var(--cream)]/90">
              {activeNode.details || "Core structural insight extracted directly from the active passage."}
            </p>

            {/* Action Buttons: Ask AI, Test in QBank, Pin to Vault */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
              <button
                type="button"
                onClick={handleAskAIAboutNode}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[color:var(--ink)] bg-[color:var(--orange)] px-3 py-1 text-[11px] font-black text-[color:var(--ink)] shadow-xs hover:scale-105 transition-transform"
              >
                <MessageSquare className="size-3" />
                <span>Explain in AI Chat</span>
              </button>

              <button
                type="button"
                onClick={handleQuizAboutNode}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-[color:var(--cream)] hover:bg-white/15 transition-colors"
              >
                <HelpCircle className="size-3 text-amber-400" />
                <span>Test in QBank</span>
              </button>

              <button
                type="button"
                onClick={handlePinActiveNode}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20 transition-colors"
              >
                {pinnedSuccess ? <Check className="size-3 text-emerald-400" /> : <BookmarkPlus className="size-3" />}
                <span>{pinnedSuccess ? "Pinned to Vault!" : "Pin to Vault"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
