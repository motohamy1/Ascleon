"use client";

import React, { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  HelpCircle,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { BoardChallenge } from "@/types/lesson-board";
import { cn } from "@/lib/utils";

interface BoardChallengePanelProps {
  challenge: BoardChallenge;
  sectionTitle: string;
  onComplete?: (passed: boolean) => void;
}

function getScrambledIds(challenge: BoardChallenge): string[] {
  if (challenge.kind !== "order-steps") return [];
  const ids = challenge.items.map((it) => it.id);
  return ids.length >= 2 ? [...ids.slice(1), ids[0]] : ids;
}

function getInitialSlider(challenge: BoardChallenge): number {
  if (challenge.kind !== "predict-slider") return 0;
  return Number(((challenge.min + challenge.max) * 0.25).toFixed(2));
}

export function BoardChallengePanel({
  challenge,
  sectionTitle,
  onComplete,
}: BoardChallengePanelProps) {
  // Deterministic initial scramble for order-steps so items don't start solved
  const initialScrambled = useMemo(() => getScrambledIds(challenge), [challenge]);

  const [prevChallenge, setPrevChallenge] = useState<BoardChallenge>(challenge);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[]>(() => initialScrambled);
  const [sliderVal, setSliderVal] = useState<number>(() => getInitialSlider(challenge));
  const [submitted, setSubmitted] = useState(false);
  const [passed, setPassed] = useState(false);

  if (challenge !== prevChallenge) {
    setPrevChallenge(challenge);
    setSelectedChoice(null);
    setSubmitted(false);
    setPassed(false);
    if (challenge.kind === "order-steps") {
      setOrderedIds(initialScrambled);
    } else if (challenge.kind === "predict-slider") {
      setSliderVal(getInitialSlider(challenge));
    }
  }

  const moveOrderItem = (idx: number, delta: -1 | 1) => {
    if (submitted) return;
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= orderedIds.length) return;
    const copy = [...orderedIds];
    [copy[idx], copy[nextIdx]] = [copy[nextIdx], copy[idx]];
    setOrderedIds(copy);
  };

  const handleCheck = () => {
    let ok = false;
    if (challenge.kind === "clinical-choice") {
      ok = selectedChoice === challenge.correctId;
    } else if (challenge.kind === "order-steps") {
      ok =
        orderedIds.length === challenge.correctOrder.length &&
        orderedIds.every((id, i) => id === challenge.correctOrder[i]);
    } else if (challenge.kind === "predict-slider") {
      ok = sliderVal >= challenge.targetMin && sliderVal <= challenge.targetMax;
    }
    setSubmitted(true);
    setPassed(ok);
    onComplete?.(ok);
  };

  const handleReset = () => {
    setSubmitted(false);
    setPassed(false);
    setSelectedChoice(null);
    if (challenge.kind === "order-steps") {
      setOrderedIds(initialScrambled);
    }
  };

  return (
    <div className="flex flex-col h-full w-full rounded-[14px] border-2 border-[var(--study-panel-border)] bg-[var(--study-surface)] backdrop-blur-md text-[var(--study-text)] overflow-hidden shadow-[var(--study-shadow)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--study-border)] bg-[var(--study-surface-muted)] px-3.5 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <HelpCircle className="size-4 text-[#ff4c00] shrink-0" />
          <span className="truncate font-mono text-[10.5px] font-black uppercase tracking-wider text-[var(--study-text)]">
            Active Recall · {sectionTitle}
          </span>
        </div>
        {submitted && (
          <button
            type="button"
            onClick={handleReset}
            className="cursor-pointer flex items-center gap-1 rounded-full border border-[var(--study-pill-border)] bg-[var(--study-surface-solid)] text-[var(--study-text)] px-2.5 py-0.5 font-mono text-[9.5px] font-black uppercase hover:bg-[var(--study-glass-hover)]"
          >
            <RotateCcw className="size-2.5" />
            <span>Retry</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <p dir="auto" className="font-sans text-sm font-black text-[var(--study-text)] leading-snug">
          {challenge.prompt}
        </p>

        {challenge.kind === "clinical-choice" && (
          <div className="space-y-2">
            {challenge.options.map((opt) => {
              const isSelected = selectedChoice === opt.id;
              const isCorrect = opt.id === challenge.correctId;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={submitted}
                  onClick={() => setSelectedChoice(opt.id)}
                  className={cn(
                    "w-full cursor-pointer text-left rounded-xl border-2 px-3 py-2.5 text-xs font-bold transition-all",
                    submitted && isCorrect
                      ? "border-[var(--study-teal-border)] bg-[var(--study-teal-bg)] text-[var(--study-text)]"
                      : submitted && isSelected && !isCorrect
                      ? "border-[var(--study-red-border)] bg-[var(--study-red-bg)] text-[var(--study-red-text)]"
                      : isSelected
                      ? "border-[var(--study-panel-border)] bg-[#ff4c00]/20 text-[var(--study-text)]"
                      : "border-[var(--study-border)] bg-[var(--study-surface-solid)] text-[var(--study-text)] hover:border-[var(--study-panel-border)]"
                  )}
                >
                  <span dir="auto">{opt.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {challenge.kind === "order-steps" && (
          <div className="space-y-2">
            {orderedIds.map((id, idx) => {
              const item = challenge.items.find((it) => it.id === id);
              const isInRightSlot =
                submitted && challenge.correctOrder[idx] === id;
              return (
                <div
                  key={id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-xs font-bold text-[var(--study-text)]",
                    submitted
                      ? isInRightSlot
                        ? "border-[var(--study-teal-border)] bg-[var(--study-teal-bg)]"
                        : "border-[var(--study-red-border)] bg-[var(--study-red-bg)]"
                      : "border-[var(--study-border)] bg-[var(--study-surface-solid)]"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex size-5 items-center justify-center rounded-full bg-[color:var(--orange)] font-mono text-[10px] font-black text-[#0f0e10] shrink-0">
                      {idx + 1}
                    </span>
                    <span dir="auto" className="truncate">
                      {item?.label || id}
                    </span>
                  </div>
                  {!submitted && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveOrderItem(idx, -1)}
                        className="cursor-pointer rounded-md border border-[var(--study-border-strong)] bg-[var(--study-surface-muted)] p-1 hover:bg-[var(--study-glass-hover)] disabled:opacity-30"
                      >
                        <ArrowUp className="size-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === orderedIds.length - 1}
                        onClick={() => moveOrderItem(idx, 1)}
                        className="cursor-pointer rounded-md border border-[var(--study-border-strong)] bg-[var(--study-surface-muted)] p-1 hover:bg-[var(--study-glass-hover)] disabled:opacity-30"
                      >
                        <ArrowDown className="size-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {challenge.kind === "predict-slider" && (
          <div className="rounded-xl border-2 border-[var(--study-border)] bg-[var(--study-surface-solid)] p-3.5 space-y-2.5 text-[var(--study-text)]">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>{challenge.paramLabel}</span>
              <span className="font-mono font-black text-[#ff4c00]">
                {sliderVal}
                {challenge.unit || ""}
              </span>
            </div>
            <input
              type="range"
              disabled={submitted}
              min={challenge.min}
              max={challenge.max}
              step={(challenge.max - challenge.min) / 30}
              value={sliderVal}
              onChange={(e) => setSliderVal(Number(e.target.value))}
              className="w-full accent-[#ff4c00] cursor-pointer rounded-full focus:outline-none focus-visible:!shadow-none focus-visible:!outline-2 focus-visible:!outline-[#ff4c00] focus-visible:outline-offset-2"
            />
            <div className="flex justify-between font-mono text-[10px] text-[var(--study-text-muted)]">
              <span>
                {challenge.min}
                {challenge.unit || ""}
              </span>
              <span>
                {challenge.max}
                {challenge.unit || ""}
              </span>
            </div>
          </div>
        )}

        {!submitted ? (
          <button
            type="button"
            disabled={
              challenge.kind === "clinical-choice" && !selectedChoice
            }
            onClick={handleCheck}
            className="w-full cursor-pointer rounded-full border-2 border-[var(--study-panel-border)] bg-[#ff4c00] py-2 font-mono text-xs font-black uppercase text-[#0f0e10] shadow-[var(--study-active-shadow)] hover:brightness-105 disabled:opacity-45"
          >
            Check Answer
          </button>
        ) : (
          <div
            className={cn(
              "rounded-xl border-2 p-3 text-xs space-y-1",
              passed
                ? "border-[var(--study-teal-border)] bg-[var(--study-teal-bg)] text-[var(--study-text)]"
                : "border-[var(--study-amber-border)] bg-[var(--study-amber-bg)] text-[var(--study-text)]"
            )}
          >
            <div className="flex items-center gap-1.5 font-black uppercase font-mono text-[10.5px]">
              {passed ? (
                <>
                  <CheckCircle2 className="size-4 text-[var(--study-teal-text)]" />
                  <span>Spot On!</span>
                </>
              ) : (
                <>
                  <XCircle className="size-4 text-[var(--study-amber-text)]" />
                  <span>Review Takeaway</span>
                </>
              )}
            </div>
            <p dir="auto" className="leading-relaxed font-medium text-[var(--study-text-soft)]">
              {challenge.explanation}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
