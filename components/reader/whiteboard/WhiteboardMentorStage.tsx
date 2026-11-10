"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  WhiteboardDeck,
  WhiteboardChoreographEvent,
  WhiteboardWidgetControlEvent,
  ChalkNode,
} from "@/types/whiteboard";
import { WhiteboardScribeCanvas } from "./WhiteboardScribeCanvas";
import { ChalkIllustrationCanvas } from "./ChalkIllustrationCanvas";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  RefreshCw,
  Volume2,
  VolumeX,
  Play,
  Pause,
  RotateCcw,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Tv,
  Layers,
} from "lucide-react";

interface WhiteboardMentorStageProps {
  deck: WhiteboardDeck;
  activeChoreography?: WhiteboardChoreographEvent | null;
  activeWidgetControl?: WhiteboardWidgetControlEvent | null;
  currentMentorSubtitle?: string;
  isVoiceConnected?: boolean;
  voiceStatus?: string;
  onConnectVoice?: () => void;
  onDisconnectVoice?: () => void;
  onStartLiveLecture?: () => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
  onStudentInteraction?: (interactionText: string) => void;
  onRefreshDeck?: () => void;
  isDeckLoading?: boolean;
  isCinema?: boolean;
  onToggleCinema?: () => void;
  onChangeScopeOrTopic?: () => void;
  className?: string;
}

export function WhiteboardMentorStage({
  deck,
  activeChoreography,
  activeWidgetControl,
  currentMentorSubtitle,
  isVoiceConnected,
  voiceStatus,
  onConnectVoice,
  onDisconnectVoice,
  onStartLiveLecture,
  isMuted,
  onToggleMute,
  onStudentInteraction,
  onRefreshDeck,
  isDeckLoading,
  isCinema,
  onToggleCinema,
  onChangeScopeOrTopic,
  className,
}: WhiteboardMentorStageProps) {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [laserTargetId, setLaserTargetId] = useState<string | undefined>(undefined);
  const [activeChalkAnnotation, setActiveChalkAnnotation] = useState<string | null>(null);

  // VideoScribe Player States
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [canvasMode, setCanvasMode] = useState<"scribe" | "chalk">("scribe");

  // Sync with live voice choreography tool calls from Gemini Live
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

  // Auto-point laser at the currently revealed node when stepping through
  useEffect(() => {
    const stepNode = activeScene?.illustration?.nodes?.find(
      (n) => n.revealedInStep === currentStepIndex
    );
    if (stepNode && !activeChoreography?.laserTargetId) {
      setLaserTargetId(stepNode.id);
    }
  }, [currentStepIndex, activeScene, activeChoreography]);

  // Progressive Visual Drawing Loop:
  // When Gemini Live is speaking (voiceStatus === "mentor_speaking") OR the user pressed Play,
  // progressively reveal drawing steps on the canvas so the hand marker illustrates continuously.
  const isActivelyAnimating = isPlaying || voiceStatus === "mentor_speaking";

  useEffect(() => {
    if (!isActivelyAnimating) return;

    const stepInterval = Math.max(2400, 4200 / playbackSpeed);
    const interval = setInterval(() => {
      setCurrentStepIndex((prevStep) => {
        const totalSteps = activeScene.illustration.totalSteps || 3;
        if (prevStep < totalSteps - 1) {
          return prevStep + 1;
        } else {
          // If playing in auto-video mode and not waiting on live voice choreography, advance scene
          if (!isVoiceConnected && currentSceneIndex < deck.scenes.length - 1) {
            setCurrentSceneIndex((prevScene) => prevScene + 1);
            return 0;
          } else if (!isVoiceConnected) {
            setIsPlaying(false);
            return prevStep;
          }
          return prevStep;
        }
      });
    }, stepInterval);

    return () => {
      clearInterval(interval);
    };
  }, [
    isActivelyAnimating,
    isVoiceConnected,
    activeScene,
    currentSceneIndex,
    deck.scenes.length,
    playbackSpeed,
  ]);

  const handleTogglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      if (onStartLiveLecture) {
        onStartLiveLecture();
      } else if (!isVoiceConnected && onConnectVoice) {
        onConnectVoice();
      }
    }
  };

  const handlePrevScene = () => {
    if (currentSceneIndex > 0) {
      const prev = currentSceneIndex - 1;
      setCurrentSceneIndex(prev);
      setCurrentStepIndex(0);
      if (isVoiceConnected && onStudentInteraction) {
        onStudentInteraction(
          `Moved to Scene ${prev + 1}: "${deck.scenes[prev].title}". Please explain and choreograph this scene on the whiteboard.`
        );
      }
    }
  };

  const handleNextScene = () => {
    if (currentSceneIndex < deck.scenes.length - 1) {
      const next = currentSceneIndex + 1;
      setCurrentSceneIndex(next);
      setCurrentStepIndex(0);
      if (isVoiceConnected && onStudentInteraction) {
        onStudentInteraction(
          `Moved to Scene ${next + 1}: "${deck.scenes[next].title}". Please explain and choreograph this scene on the whiteboard.`
        );
      }
    }
  };

  const handleRestart = () => {
    setCurrentSceneIndex(0);
    setCurrentStepIndex(0);
    setIsPlaying(true);
    if (onStartLiveLecture) {
      onStartLiveLecture();
    }
  };

  const handleNodeClick = (node: ChalkNode) => {
    setLaserTargetId(node.id);
    if (onStudentInteraction) {
      onStudentInteraction(
        `Tapped on whiteboard illustration node "${node.label}" (ID: ${node.id}, ${node.subtext || "Mechanism"}). Explain how this operates and highlight it on the board.`
      );
    }
  };

  const totalStepsInScene = activeScene.illustration.totalSteps || 3;

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-[color:var(--ink-soft)] text-[color:var(--ink)] overflow-hidden select-none transition-all duration-300",
        isCinema && "fixed inset-0 z-50 p-4 bg-black/90 backdrop-blur-md",
        className
      )}
    >
      {/* 1. SCENE TIMELINE & TOP CONTROL STRIP */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[color:var(--ink)] bg-[color:var(--panel)] px-3 py-2">
        {/* Left: Title & Scene Chapter Indicator */}
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] shadow-chip shrink-0">
            <Tv className="size-3.5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-[9px] font-black uppercase tracking-wider text-[color:var(--ink)]/70">
                SCENE {currentSceneIndex + 1} OF {deck.scenes.length}
              </span>
              {onChangeScopeOrTopic && (
                <button
                  type="button"
                  onClick={onChangeScopeOrTopic}
                  className="cursor-pointer flex items-center gap-1 rounded-full border border-[color:var(--ink)] bg-[color:var(--cream)] px-2 py-0.2 font-mono text-[8.5px] font-black uppercase text-[color:var(--ink)] hover:bg-[color:var(--orange)] shadow-xs transition-all"
                  title="Change Topic or Study Scope"
                >
                  <Layers className="size-2.5 text-[color:var(--ink)]" />
                  <span>Scope: {deck.topicTitle ? deck.topicTitle.slice(0, 24) + (deck.topicTitle.length > 24 ? "…" : "") : "Topic"}</span>
                </button>
              )}
              {isVoiceConnected && (
                <span className="flex items-center gap-1 rounded-full border border-[color:var(--ink)] bg-[color:var(--mint)] px-1.5 py-0.2 font-mono text-[8.5px] font-black uppercase text-[color:var(--ink)] animate-pulse">
                  <Volume2 className="size-2.5" /> Live AI Mentor Synced
                </span>
              )}
            </div>
            <div className="font-sans text-xs font-black truncate max-w-[200px] sm:max-w-xs md:max-w-md">
              {activeScene.title}
            </div>
          </div>
        </div>

        {/* Center: Video Timeline Scrubber & Step Controls */}
        <div className="flex items-center gap-1.5 bg-[color:var(--cream)] rounded-full border-2 border-[color:var(--ink)] px-2 py-0.5 shadow-chip">
          {/* Play / Pause Button (Starts Live AI Mentor Lecture + Hand Drawing) */}
          <button
            type="button"
            onClick={handleTogglePlay}
            className="cursor-pointer rounded-full px-2 py-0.5 bg-[color:var(--orange)] text-[color:var(--ink)] border border-[color:var(--ink)] hover:scale-105 transition-all shadow-xs flex items-center gap-1 font-mono text-[9.5px] font-black uppercase"
            title={
              isActivelyAnimating
                ? "Pause Whiteboard Animation"
                : "Start Live AI Mentor Whiteboard Explanation"
            }
          >
            {isActivelyAnimating ? (
              <>
                <Pause className="size-3 stroke-[2.5]" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="size-3 stroke-[2.5]" />
                <span>Explain</span>
              </>
            )}
          </button>

          {/* Replay */}
          <button
            type="button"
            onClick={handleRestart}
            className="cursor-pointer rounded-full p-1 hover:bg-[color:var(--ink)]/10 text-[color:var(--ink)]"
            title="Restart from Scene 1"
          >
            <RotateCcw className="size-3 stroke-[2.5]" />
          </button>

          <div className="h-4 w-px bg-[color:var(--ink)]/20 mx-0.5" />

          {/* Scene Nav */}
          <button
            type="button"
            onClick={handlePrevScene}
            disabled={currentSceneIndex === 0}
            className="cursor-pointer p-0.5 disabled:opacity-30 disabled:cursor-not-allowed"
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
                    if (isVoiceConnected && onStudentInteraction) {
                      onStudentInteraction(
                        `Switched to Scene ${idx + 1}: "${scene.title}". Explain and choreograph this scene.`
                      );
                    }
                  }}
                  className={cn(
                    "cursor-pointer rounded-full px-2 py-0.2 font-mono text-[9px] font-black transition-all border",
                    isSelected
                      ? "bg-[color:var(--orange)] text-[color:var(--ink)] border-[color:var(--ink)] scale-105"
                      : "bg-transparent text-[color:var(--ink)]/70 border-transparent hover:bg-black/5"
                  )}
                  title={scene.title}
                >
                  S{idx + 1}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleNextScene}
            disabled={currentSceneIndex === deck.scenes.length - 1}
            className="cursor-pointer p-0.5 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next Scene"
          >
            <ChevronRight className="size-3.5 stroke-[2.5]" />
          </button>

          <div className="h-4 w-px bg-[color:var(--ink)]/20 mx-0.5" />

          {/* Step Scrubber inside current scene */}
          <div className="flex items-center gap-0.5" title="Click to reveal drawing steps in this scene">
            {Array.from({ length: totalStepsInScene }).map((_, sIdx) => (
              <button
                key={sIdx}
                type="button"
                onClick={() => setCurrentStepIndex(sIdx)}
                className={cn(
                  "cursor-pointer size-2 rounded-full transition-all",
                  sIdx <= currentStepIndex
                    ? "bg-[color:var(--ink)] scale-110"
                    : "bg-[color:var(--ink)]/25 hover:bg-[color:var(--ink)]/50"
                )}
                title={`Reveal Step ${sIdx + 1} of ${totalStepsInScene}`}
              />
            ))}
          </div>

          <div className="h-4 w-px bg-[color:var(--ink)]/20 mx-0.5" />

          {/* Speed Selector */}
          <button
            type="button"
            onClick={() => {
              const speeds = [1, 1.25, 1.5, 0.75];
              const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
              setPlaybackSpeed(speeds[nextIdx]);
            }}
            className="cursor-pointer font-mono text-[9px] font-bold text-[color:var(--ink)] px-1 rounded hover:bg-[color:var(--ink)]/10"
            title="Drawing Speed"
          >
            {playbackSpeed}x
          </button>
        </div>

        {/* Right: Actions (Voice Mentor, Interactive Lab Drawer, Refresh, Cinema) */}
        <div className="flex items-center gap-1.5">
          {/* Live Voice Controls */}
          {isVoiceConnected ? (
            <div className="flex items-center gap-1">
              {onToggleMute && (
                <button
                  type="button"
                  onClick={onToggleMute}
                  className={cn(
                    "cursor-pointer rounded-full border-2 border-[color:var(--ink)] p-1.5 shadow-chip transition-all",
                    isMuted
                      ? "bg-amber-300 text-[color:var(--ink)]"
                      : "bg-[color:var(--mint)] text-[color:var(--ink)]"
                  )}
                  title={isMuted ? "Unmute Mic" : "Mute Mic"}
                >
                  {isMuted ? <MicOff className="size-3.5 stroke-[2.5]" /> : <Mic className="size-3.5 stroke-[2.5]" />}
                </button>
              )}
              {onDisconnectVoice && (
                <button
                  type="button"
                  onClick={onDisconnectVoice}
                  className="cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-red-100 p-1.5 shadow-chip hover:bg-red-200 text-red-900"
                  title="End Live Voice Session"
                >
                  <PhoneOff className="size-3.5 stroke-[2.5]" />
                </button>
              )}
            </div>
          ) : voiceStatus === "connecting" ? (
            <div className="flex items-center gap-1 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-2.5 py-1 font-mono text-[10px] font-black uppercase text-[color:var(--ink)] shadow-chip animate-pulse">
              <Radio className="size-3 animate-spin" />
              <span>Connecting...</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleTogglePlay}
              className="cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-2.5 py-1 font-sans text-[10px] font-black uppercase text-[color:var(--ink)] shadow-chip hover:scale-105 flex items-center gap-1.5"
              title="Connect Live AI Mentor & Start Whiteboard Choreography"
            >
              <Mic className="size-3 stroke-[2.5]" />
              <span>Live AI Mentor</span>
            </button>
          )}


          {/* Regenerate Whiteboard */}
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

          {/* Full Cinema Toggle */}
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

      {/* 2. CHALK ANNOTATION POPUP BANNER */}
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

      {/* 3. MAIN VIDEOSCRIBE CANVAS STAGE */}
      <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 flex flex-col">
        <div className="w-full flex-1 flex flex-col min-h-[380px] transition-all duration-300">
          {canvasMode === "scribe" ? (
            <WhiteboardScribeCanvas
              illustration={activeScene.illustration}
              currentStepIndex={currentStepIndex}
              laserTargetId={laserTargetId}
              onNodeClick={handleNodeClick}
              isPlaying={isActivelyAnimating}
              className="flex-1"
            />
          ) : (
            <ChalkIllustrationCanvas
              illustration={activeScene.illustration}
              currentStepIndex={currentStepIndex}
              laserTargetId={laserTargetId}
              onNodeClick={handleNodeClick}
              className="flex-1"
            />
          )}
        </div>
      </div>

      {/* 4. BOTTOM LIVE MENTOR SUBTITLE RIBBON */}
      <div className="border-t-2 border-[color:var(--ink)] bg-[color:var(--panel)] px-3 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-hidden flex-1">
          <div
            className={cn(
              "flex size-5 items-center justify-center rounded-full shrink-0",
              voiceStatus === "mentor_speaking"
                ? "bg-[color:var(--mint)] animate-pulse"
                : "bg-[color:var(--orange)]"
            )}
          >
            <Volume2 className="size-3 text-[color:var(--ink)] stroke-[2.5]" />
          </div>
          <div
            dir="auto"
            className="ascleon-bidi font-sans text-xs font-bold text-[color:var(--ink)] line-clamp-2"
          >
            {currentMentorSubtitle ||
              activeScene.spokenScriptHint ||
              "Click 'Explain' or 'Live AI Mentor' to hear the Ascleon Voice Agent narrate and choreograph this whiteboard..."}
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-[9px] font-bold text-[color:var(--ink)]/60 uppercase shrink-0">
          <button
            type="button"
            onClick={() => setCanvasMode(canvasMode === "scribe" ? "chalk" : "scribe")}
            className="cursor-pointer hover:underline text-[color:var(--orange)] font-black"
          >
            {canvasMode === "scribe" ? "VideoScribe Mode" : "Chalkboard Mode"}
          </button>
          <span>•</span>
          <span>BiDi Synced</span>
        </div>
      </div>
    </div>
  );
}
