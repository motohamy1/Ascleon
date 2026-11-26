"use client";

import React, { useState, useRef, useMemo, useCallback } from "react";
import { MindMapNode } from "@/types/morph";
import {
  Sparkles,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  MessageSquare,
  HelpCircle,
  BookmarkPlus,
  Check,
  Workflow,
  X,
  Layers,
  Move,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BiDiText, resolveTextDirection } from "@/components/ui/BiDiText";

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
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

  // Local dragged node coordinate overrides
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});

  const dragPointerStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialPan = useRef<{ x: number; y: number }>({ x: 20, y: 15 });
  const initialNodePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Selected Node State
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pinnedSuccess, setPinnedSuccess] = useState(false);

  // Compute node layouts based on hierarchy (Levels 0, 1, 2)
  const computedNodes = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];

    const rootNodes = nodes.filter((n) => n.level === 0 || !n.parent);
    const level1Nodes = nodes.filter(
      (n) => n.level === 1 || (n.parent && n.parent === rootNodes[0]?.id)
    );
    const level2Nodes = nodes.filter(
      (n) => n.level === 2 || (n.parent && n.parent !== rootNodes[0]?.id)
    );

    const result: Array<
      MindMapNode & { xPos: number; yPos: number; width: number; height: number }
    > = [];

    const estimateNodeHeight = (node: MindMapNode, baseH: number, width: number) => {
      const labelLen = (node.label || "").length;
      const hasArabic = /[\u0600-\u06FF]/.test(node.label || "");
      const charsPerLine = Math.max(14, Math.floor((width - 24) / (hasArabic ? 9.5 : 8)));
      const lines = Math.min(4, Math.max(1, Math.ceil(labelLen / charsPerLine)));
      const subH = node.sublabel ? 18 : 0;
      return Math.max(baseH, 34 + lines * 20 + subH);
    };

    // 2. Level 1 Pillars (Middle column) with collision-free cumulative vertical packing
    const pillarYMap = new Map<string, number>();
    let pillarCursorY = 24;
    level1Nodes.forEach((pNode) => {
      const nodeW = 195;
      const estH = estimateNodeHeight(pNode, 74, nodeW);
      const defaultY = pillarCursorY;
      pillarCursorY += estH + 22;
      pillarYMap.set(pNode.id, defaultY);

      const override = nodePositions[pNode.id];
      result.push({
        ...pNode,
        xPos: override?.x ?? 275,
        yPos: override?.y ?? defaultY,
        width: nodeW,
        height: estH,
      });
    });

    // 3. Level 2 Leaves (Right column) with cumulative collision guard
    let leafCursorY = 20;
    level2Nodes.forEach((lNode) => {
      const nodeW = 220;
      const estH = estimateNodeHeight(lNode, 66, nodeW);
      const parentId = lNode.parent || level1Nodes[0]?.id;
      const parentY = pillarYMap.get(parentId) ?? leafCursorY;
      const defaultLeafY = Math.max(leafCursorY, parentY);
      leafCursorY = defaultLeafY + estH + 20;

      const override = nodePositions[lNode.id];
      result.push({
        ...lNode,
        xPos: override?.x ?? 530,
        yPos: override?.y ?? defaultLeafY,
        width: nodeW,
        height: estH,
      });
    });

    // 1. Root Node (Left column centered vertically across packed pillars)
    const root = rootNodes[0] || nodes[0];
    const totalHeight = Math.max(220, pillarCursorY);
    const rootEstH = estimateNodeHeight(root, 72, 185);
    const rootY = Math.max(40, totalHeight / 2 - rootEstH / 2);

    const rootOverride = nodePositions[root.id];
    result.unshift({
      ...root,
      xPos: rootOverride?.x ?? 24,
      yPos: rootOverride?.y ?? rootY,
      width: 185,
      height: rootEstH,
    });

    return result;
  }, [nodes, nodePositions]);

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

      const startX = parent.xPos + parent.width;
      const startY = parent.yPos + parent.height / 2;
      const endX = child.xPos;
      const endY = child.yPos + child.height / 2;

      const deltaX = Math.max(30, (endX - startX) / 2);
      const cp1X = startX + deltaX;
      const cp1Y = startY;
      const cp2X = endX - deltaX;
      const cp2Y = endY;

      const path = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;
      const isHighlighted =
        selectedNodeId === child.id ||
        selectedNodeId === parent.id ||
        activeNode?.parent === parent.id;

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

  // Pointer Events (Pan Canvas or Drag Node with Mouse or Touch)
  const handlePointerDownCanvas = (e: React.PointerEvent<HTMLDivElement>) => {
    // If pointer-down was on an inspector button, skip
    if ((e.target as HTMLElement).closest(".mindmap-controls")) return;

    // Capture pointer for continuous tracking outside canvas boundary
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    setIsDraggingCanvas(true);
    dragPointerStart.current = { x: e.clientX, y: e.clientY };
    initialPan.current = { ...pan };
  };

  const handlePointerDownNode = (
    e: React.PointerEvent<HTMLDivElement>,
    node: MindMapNode & { xPos: number; yPos: number }
  ) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    setDraggedNodeId(node.id);
    dragPointerStart.current = { x: e.clientX, y: e.clientY };
    initialNodePos.current = { x: node.xPos, y: node.yPos };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggedNodeId) {
      // Dragging a specific node
      const dx = (e.clientX - dragPointerStart.current.x) / zoom;
      const dy = (e.clientY - dragPointerStart.current.y) / zoom;
      setNodePositions((prev) => ({
        ...prev,
        [draggedNodeId]: {
          x: Math.max(10, initialNodePos.current.x + dx),
          y: Math.max(10, initialNodePos.current.y + dy),
        },
      }));
    } else if (isDraggingCanvas) {
      // Panning the canvas
      const dx = e.clientX - dragPointerStart.current.x;
      const dy = e.clientY - dragPointerStart.current.y;
      setPan({
        x: initialPan.current.x + dx,
        y: initialPan.current.y + dy,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingCanvas) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setIsDraggingCanvas(false);
    }
    if (draggedNodeId) {
      setDraggedNodeId(null);
    }
  };

  // Wheel Zoom Support
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.08 : -0.08;
    setZoom((z) => Math.min(1.6, Math.max(0.5, z + delta)));
  };

  // Zoom Controls
  const handleZoomIn = () => setZoom((z) => Math.min(1.6, z + 0.12));
  const handleZoomOut = () => setZoom((z) => Math.max(0.5, z - 0.12));
  const handleResetView = () => {
    setZoom(0.92);
    setPan({ x: 20, y: 15 });
    setNodePositions({});
  };

  // Action Dispatchers for Selected Node
  const handleAskAIAboutNode = useCallback(() => {
    if (!activeNode) return;
    const prompt = `Explain the core mechanism, clinical significance, and practical exam pearls for "${activeNode.label}": ${
      activeNode.details || "as presented in this study source"
    }`;
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
      ref={containerRef}
      onPointerDown={handlePointerDownCanvas}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      className={cn(
        "relative flex h-[460px] w-full flex-col overflow-hidden rounded-[20px] border-2 border-[var(--study-panel-border)] shadow-[var(--study-shadow)] select-none cursor-grab active:cursor-grabbing",
        className
      )}
      style={{
        backgroundColor: "var(--study-canvas-bg)",
        backgroundImage:
          "radial-gradient(circle, var(--study-canvas-dot) var(--study-canvas-dot-size, 1.25px), transparent calc(var(--study-canvas-dot-size, 1.25px) + 0.2px))",
        backgroundSize: "22px 22px",
        touchAction: "none",
      }}
    >
      {/* Header Controls Bar */}
      <div className="mindmap-controls relative z-20 flex h-10 shrink-0 items-center justify-between border-b border-[var(--study-border)] bg-[var(--study-surface)] px-3 backdrop-blur-md">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-[#ff4c00] text-[#0f0e10] shadow-xs">
            <Workflow className="size-3" />
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate text-xs font-black tracking-tight text-[var(--study-text)]">
              {rootLabel}
            </span>
            <span className="hidden sm:inline-flex shrink-0 rounded-full border border-[#ff4c00]/40 bg-[#ff4c00]/15 px-2 py-0.5 text-[9.5px] font-bold text-[#ff4c00]">
              Interactive Node Canvas
            </span>
          </div>
        </div>

        {/* Pan/Zoom Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-mono text-[var(--study-text-muted)] mr-1 hidden sm:inline">
            Drag canvas or nodes • Scroll to zoom
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            className="flex size-7 items-center justify-center rounded-lg border border-[var(--study-border)] bg-[var(--study-surface-muted)] text-[var(--study-text)] hover:bg-[#ff4c00] hover:text-[#0f0e10] hover:border-[#0f0e10] transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="flex size-7 items-center justify-center rounded-lg border border-[var(--study-border)] bg-[var(--study-surface-muted)] text-[var(--study-text)] hover:bg-[#ff4c00] hover:text-[#0f0e10] hover:border-[#0f0e10] transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetView}
            className="flex size-7 items-center justify-center rounded-lg border border-[var(--study-border)] bg-[var(--study-surface-muted)] text-[var(--study-text)] hover:bg-[#ff4c00] hover:text-[#0f0e10] hover:border-[#0f0e10] transition-colors cursor-pointer"
            title="Reset View"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Main Interactive Scalable Canvas Surface */}
      <div
        className="relative flex-1 origin-top-left"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transition: isDraggingCanvas || draggedNodeId ? "none" : "transform 0.15s ease-out",
        }}
      >
        {/* SVG Curved Connectors Layer */}
        <svg
          className="absolute inset-0 pointer-events-none"
          style={{ width: 1400, height: 900 }}
        >
          {computedEdges.map((edge) => (
            <path
              key={edge.id}
              d={edge.path}
              fill="none"
              stroke={edge.isHighlighted ? "#ff4c00" : edge.color}
              strokeWidth={edge.isHighlighted ? 3.5 : 2}
              strokeOpacity={edge.isHighlighted ? 1 : 0.45}
              strokeDasharray={edge.isHighlighted ? undefined : "6,4"}
              className="transition-all duration-200"
            />
          ))}
        </svg>

        {/* Nodes Layer */}
        {computedNodes.map((node) => {
          const isSelected = selectedNodeId === node.id;
          const isRoot = node.level === 0;
          const isPillar = node.level === 1;

          return (
            <div
              key={node.id}
              onPointerDown={(e) => handlePointerDownNode(e, node)}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedNodeId(isSelected ? null : node.id);
              }}
              className={cn(
                "absolute rounded-[14px] p-2.5 transition-all cursor-move flex flex-col justify-between border-2",
                isSelected
                  ? "border-[#ff4c00] bg-[#f6d7a1] text-[#0f0e10] shadow-[0_0_20px_rgba(255,76,0,0.45)] scale-105 z-30"
                  : isRoot
                  ? "border-[#ff4c00] bg-[var(--study-surface-solid)] text-[var(--study-text)] shadow-lg z-20 hover:scale-102"
                  : isPillar
                  ? "border-[var(--study-teal-border)] bg-[var(--study-surface-solid)] text-[var(--study-teal-text)] shadow-md z-15 hover:scale-102"
                  : "border-[var(--study-border-strong)] bg-[var(--study-surface-solid)] text-[var(--study-text)] shadow-sm z-10 hover:border-[#ff4c00]/60"
              )}
              style={{
                left: node.xPos,
                top: node.yPos,
                width: node.width,
                minHeight: node.height,
              }}
            >
              <div className="flex items-center justify-between gap-1 pb-1">
                <BiDiText
                  as="span"
                  className="text-[9px] font-black uppercase tracking-wider opacity-85 truncate"
                  text={node.category || (isRoot ? "Root Topic" : isPillar ? "Core Pillar" : "Key Rule")}
                />
                <Move className="size-2.5 opacity-60 shrink-0" />
              </div>

              <div
                dir={resolveTextDirection(node.label)}
                className="font-bold text-xs leading-relaxed break-words line-clamp-3 text-start"
              >
                <BiDiText text={node.label} />
              </div>

              {node.sublabel && (
                <div
                  dir={resolveTextDirection(node.sublabel)}
                  className="text-[10px] opacity-85 truncate mt-0.5 text-start"
                >
                  <BiDiText text={node.sublabel} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Deep Comprehensive Node Inspector Drawer (Non-truncated) */}
      {activeNode && (
        <div className="mindmap-controls absolute bottom-2 inset-x-2 z-30 rounded-[16px] border-2 border-[#ff4c00] bg-[var(--study-surface-solid)] p-3.5 text-[var(--study-text)] shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-2 duration-150 max-h-56 overflow-y-auto study-scrollbar">
          <div className="flex items-start justify-between gap-2 pb-2 border-b border-[var(--study-border)] mb-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <BiDiText
                  as="span"
                  className="rounded-full bg-[#ff4c00] text-[#0f0e10] px-2 py-0.5 text-[9.5px] font-black uppercase"
                  text={activeNode.category}
                />
                <BiDiText as="h4" className="font-serif font-bold text-xs sm:text-sm text-[var(--study-text)]">
                  {activeNode.label}
                </BiDiText>
              </div>
              {activeNode.sublabel && (
                <BiDiText as="p" className="text-[11px] text-[var(--study-teal-text)] mt-0.5">
                  {activeNode.sublabel}
                </BiDiText>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSelectedNodeId(null)}
              className="text-[var(--study-text-muted)] hover:text-[var(--study-text)] p-1 rounded-md cursor-pointer shrink-0"
              title="Close Drawer"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Full Non-Truncated Explanation */}
          <div
            dir={resolveTextDirection(activeNode.details)}
            className="text-xs leading-relaxed text-[var(--study-text-soft)] mb-3 text-start"
          >
            <BiDiText as="p" text={activeNode.details} />
          </div>

          {/* Step-by-Step Mechanisms if available */}
          {activeNode.mechanismSteps && activeNode.mechanismSteps.length > 0 && (
            <div className="mb-3 p-2 rounded-lg bg-[var(--study-surface-muted)] border border-[var(--study-border)] text-xs">
              <span className="text-[10px] font-black uppercase text-[#ff4c00] block mb-1">
                ✦ Step-by-Step Mechanism:
              </span>
              <ul className="space-y-1 text-[var(--study-text)]">
                {activeNode.mechanismSteps.map((step, sIdx) => (
                  <li
                    key={sIdx}
                    dir={resolveTextDirection(step)}
                    className="ascleon-bidi flex items-start gap-1.5 text-[11px] leading-relaxed text-start"
                  >
                    <bdi dir="ltr" className="shrink-0 font-bold text-[#ff4c00]">{sIdx + 1}.</bdi>
                    <BiDiText as="span" className="min-w-0 flex-1" text={step} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--study-border)]">
            <button
              type="button"
              onClick={handleAskAIAboutNode}
              className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#0f0e10] bg-[#ff4c00] px-3 py-1 text-[11px] font-black text-[#0f0e10] shadow-xs hover:brightness-105"
            >
              <MessageSquare className="size-3" />
              <span>Explain in AI Chat</span>
            </button>

            <button
              type="button"
              onClick={handleQuizAboutNode}
              className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--study-border-strong)] bg-[var(--study-surface-muted)] px-3 py-1 text-[11px] font-bold text-[var(--study-text)] hover:bg-[#ff4c00] hover:text-[#0f0e10] hover:border-[#0f0e10] transition-colors"
            >
              <HelpCircle className="size-3 text-[#ff4c00]" />
              <span>Test in QBank</span>
            </button>

            <button
              type="button"
              onClick={handlePinActiveNode}
              className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--study-teal-border)] bg-[var(--study-teal-bg)] px-3 py-1 text-[11px] font-bold text-[var(--study-teal-text)] hover:opacity-90 transition-colors"
            >
              {pinnedSuccess ? <Check className="size-3 text-[var(--study-teal-text)]" /> : <BookmarkPlus className="size-3" />}
              <span>{pinnedSuccess ? "Pinned!" : "Pin to Vault"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
