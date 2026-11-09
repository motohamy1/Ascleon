"use client";

import React, { useState, useEffect } from "react";
import {
  WhiteboardDeck,
  WhiteboardChoreographEvent,
  WhiteboardWidgetControlEvent,
  ChalkNode,
} from "@/types/whiteboard";
import { ChalkIllustrationCanvas } from "./ChalkIllustrationCanvas";
import { GenerativeWidgetRenderer } from "./GenerativeWidgetRenderer";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  RefreshCw,
  Volume2,
  Tv,
} from "lucide-react";

interface WhiteboardMentorStageProps {
  deck: WhiteboardDeck;
  activeChoreography?: WhiteboardChoreographEvent | null;
  activeWidgetControl?: WhiteboardWidgetControlEvent | null;
  currentMentorSubtitle?: string;
  isVoiceConnected?: boolean;
  onStudentInteraction?: (interactionText: string) => void;
  onRefreshDeck?: () => void;
  isDeckLoading?: boolean;
  isCinema?: boolean;
  onToggleCinema?: () => void;
  className?: string;
}

export function WhiteboardMentorStage({
  deck,
  activeChoreography,
  activeWidgetControl,
  currentMentorSubtitle,
  isVoiceConnected,
  onStudentInteraction,
  onRefreshDeck,
  isDeckLoading,
  isCinema,
  onToggleCinema,
  className,
}: WhiteboardMentorStageProps) {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [laserTargetId, setLaserTargetId] = useState<string | undefined>(undefined);
  const [activeChalkAnnotation, setActiveChalkAnnotation] = useState<string | null>(null);

  // Sync with live voice choreography tool calls
  useEffect(() => {
    if (!activeChoreography) return;

    let timer: NodeJS.Timeout | null = null;
    const frame = requestAnimationFrame(() => {
      if (
        typeof activeChoreography.sceneIndex === "number" &&
        activeChoreography.sceneIndex >= 0 &&
        activeChoreography.sceneIndex < deck.scenes.length
      ) {
        setCurrentSceneIndex(activeChoreography.sceneIndex);
      }

      if (typeof activeChoreography.revealStepIndex === "number") {
        setCurrentStepIndex(activeChoreography.revealStepIndex);
      }

      if (activeChoreography.laserTargetId) {
        setLaserTargetId(activeChoreography.laserTargetId);
      }

      if (activeChoreography.chalkAnnotation) {
        setActiveChalkAnnotation(activeChoreography.chalkAnnotation);
        timer = setTimeout(() => setActiveChalkAnnotation(null), 8000);
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
    };
  }, [activeChoreography, deck.scenes.length]);

  const activeScene = deck.scenes[currentSceneIndex] || deck.scenes[0];

  const handlePrevScene = () => {
    if (currentSceneIndex > 0) {
      const prev = currentSceneIndex - 1;
      setCurrentSceneIndex(prev);
      setCurrentStepIndex(deck.scenes[prev].illustration.totalSteps - 1);
    }
  };

  const handleNextScene = () => {
    if (currentSceneIndex < deck.scenes.length - 1) {
      const next = currentSceneIndex + 1;
      setCurrentSceneIndex(next);
      setCurrentStepIndex(0);
    }
  };

  const handleNodeClick = (node: ChalkNode) => {
    setLaserTargetId(node.id);
    if (onStudentInteraction) {
      onStudentInteraction(
        `Tapped on whiteboard node "${node.label}" (${node.subtext || "Mechanism"}). Can you explain how this operates?`
      );
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-[color:var(--ink-soft)] text-[color:var(--ink)] overflow-hidden select-none transition-all duration-300",
        isCinema && "fixed inset-0 z-50 p-4 bg-black/90 backdrop-blur-md",
        className
      )}
    >
      {/* 1. SCENE TIMELINE & CONTROL STRIP */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[color:var(--ink)] bg-[color:var(--panel)] px-3 py-2">
        {/* Left: Topic Title & Scene Badges */}
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] shadow-chip">
            <Tv className="size-3.5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[9px] font-black uppercase tracking-wider text-[color:var(--ink)]/70">
                SCENE {currentSceneIndex + 1} OF {deck.scenes.length}
              </span>
              {isVoiceConnected && (
                <span className="flex items-center gap-1 rounded-full border border-[color:var(--ink)] bg-[color:var(--mint)] px-1.5 py-0.2 font-mono text-[8.5px] font-black uppercase text-[color:var(--ink)] animate-pulse">
                  <Volume2 className="size-2.5" /> Voice Synced
                </span>
              )}
            </div>
            <div className="font-sans text-xs font-black truncate max-w-[240px] md:max-w-md">
              {activeScene.title}
            </div>
          </div>
        </div>

        {/* Center: Scene Scrubber Tabs */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrevScene}
            disabled={currentSceneIndex === 0}
            className="cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-1 shadow-chip hover:bg-[color:var(--orange)] disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous Scene"
          >
            <ChevronLeft className="size-3.5 stroke-[2.5]" />
          </button>

          <div className="flex items-center gap-1">
            {deck.scenes.map((scene, idx) => {
              const isSelected = idx === currentSceneIndex;
              return (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => {
                    setCurrentSceneIndex(idx);
                    setCurrentStepIndex(scene.illustration.totalSteps - 1);
                  }}
                  className={cn(
                    "cursor-pointer rounded-full border-2 border-[color:var(--ink)] px-2.5 py-0.5 font-mono text-[10px] font-black transition-all shadow-chip",
                    isSelected
                      ? "bg-[color:var(--orange)] text-[color:var(--ink)] scale-105"
                      : "bg-[color:var(--cream)] text-[color:var(--ink)]/80 hover:bg-[color:var(--cream)]"
                  )}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleNextScene}
            disabled={currentSceneIndex === deck.scenes.length - 1}
            className="cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-1 shadow-chip hover:bg-[color:var(--orange)] disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next Scene"
          >
            <ChevronRight className="size-3.5 stroke-[2.5]" />
          </button>
        </div>

        {/* Right: Actions (Refresh, Cinema Theater Toggle) */}
        <div className="flex items-center gap-1.5">
          {onRefreshDeck && (
            <button
              type="button"
              disabled={isDeckLoading}
              onClick={onRefreshDeck}
              className="cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-1.5 shadow-chip hover:bg-[color:var(--orange)] disabled:opacity-40"
              title="Regenerate Whiteboard Deck"
            >
              <RefreshCw className={cn("size-3.5 stroke-[2.5]", isDeckLoading && "animate-spin")} />
            </button>
          )}

          {onToggleCinema && (
            <button
              type="button"
              onClick={onToggleCinema}
              className="cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--cream)] px-2 py-1 font-mono text-[10px] font-black uppercase shadow-chip hover:bg-[color:var(--orange)] flex items-center gap-1"
              title={isCinema ? "Exit Cinema Theater" : "Full Cinema Theater"}
            >
              {isCinema ? (
                <>
                  <Minimize2 className="size-3 stroke-[2.5]" />
                  <span>Exit</span>
                </>
              ) : (
                <>
                  <Maximize2 className="size-3 stroke-[2.5]" />
                  <span>Cinema</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 2. CHALK ANNOTATION POPUP BANNER (Live Mentor Handwritten Stamp) */}
      {activeChalkAnnotation && (
        <div className="mx-3 mt-2 flex items-center justify-between rounded-[14px] border-2 border-[color:var(--ink)] bg-amber-200 px-3 py-1.5 text-xs text-[color:var(--ink)] shadow-chip animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-amber-800 shrink-0" />
            <span className="font-mono text-[11px] font-black">
              MENTOR BOARD CALLOUT: {activeChalkAnnotation}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveChalkAnnotation(null)}
            className="text-xs font-bold hover:opacity-70 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 3. DUAL-STAGE THEATER: CHALK CANVAS (Left) + GENERATIVE CLINICAL WIDGET (Right) */}
      <div className="flex-1 overflow-hidden p-3 grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Chalk SVG Illustration Stage (7 cols on desktop) */}
        <div className="md:col-span-7 flex flex-col h-full min-h-[320px]">
          <ChalkIllustrationCanvas
            illustration={activeScene.illustration}
            currentStepIndex={currentStepIndex}
            laserTargetId={laserTargetId}
            onNodeClick={handleNodeClick}
            className="flex-1"
          />
        </div>

        {/* Generative Clinical UI Widget (5 cols on desktop) */}
        <div className="md:col-span-5 flex flex-col h-full min-h-[320px]">
          <GenerativeWidgetRenderer
            widget={activeScene.widget}
            widgetControlEvent={activeWidgetControl}
            onInteraction={onStudentInteraction}
            className="flex-1"
          />
        </div>
      </div>

      {/* 4. BOTTOM LIVE MENTOR SUBTITLE RIBBON */}
      <div className="border-t-2 border-[color:var(--ink)] bg-[color:var(--panel)] px-3 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-hidden flex-1">
          <div className="flex size-5 items-center justify-center rounded-full bg-[color:var(--orange)] shrink-0">
            <Volume2 className="size-3 text-[color:var(--ink)] stroke-[2.5]" />
          </div>
          <div
            dir="auto"
            className="ascleon-bidi font-sans text-xs font-bold text-[color:var(--ink)] truncate"
          >
            {currentMentorSubtitle ||
              activeScene.spokenScriptHint ||
              "Ready. Listen to the mentor or tap any node on the whiteboard to ask..."}
          </div>
        </div>

        <div className="font-mono text-[9px] font-bold text-[color:var(--ink)]/60 uppercase shrink-0">
          BiDi Synced
        </div>
      </div>
    </div>
  );
}
