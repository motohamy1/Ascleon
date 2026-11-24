"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  Layers,
  Loader2,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { IBook } from "@/types";
import { StudyLanguage } from "@/lib/language";
import {
  StudyPlanDTO,
  StudyPlanStep,
  StudyPlanStepType,
} from "@/types/study-plan";
import { cn } from "@/lib/utils";

interface StudyPlanPanelProps {
  books: IBook[];
  initialPlans: StudyPlanDTO[];
}

const STEP_TYPE_META: Record<
  StudyPlanStepType,
  { label: string; badgeClass: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  reading: {
    label: "Reading",
    badgeClass: "bg-[color:var(--cream)] text-[color:var(--ink)]",
    Icon: BookOpen,
  },
  summary: {
    label: "Summary",
    badgeClass: "bg-[#7fd8c9] text-[color:var(--ink)]",
    Icon: FileText,
  },
  flashcards: {
    label: "Flashcards",
    badgeClass: "bg-[#f6d7a1] text-[color:var(--ink)]",
    Icon: Layers,
  },
  quiz: {
    label: "Quiz",
    badgeClass: "bg-[color:var(--orange)] text-[color:var(--ink)]",
    Icon: HelpCircle,
  },
};

function formatDaysUntil(examDate: string | null): string | null {
  if (!examDate) return null;
  const ms = Date.parse(examDate);
  if (!Number.isFinite(ms)) return null;
  const days = Math.ceil((ms - Date.now()) / 86_400_000);
  if (days < 0) return "Exam passed";
  if (days === 0) return "Exam today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

export default function StudyPlanPanel({
  books,
  initialPlans,
}: StudyPlanPanelProps) {
  const [plans, setPlans] = useState<StudyPlanDTO[]>(initialPlans);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
    initialPlans[0]?._id ?? null
  );

  // Creation Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [bookId, setBookId] = useState<string>(books[0]?._id ?? "");
  const [planTitle, setPlanTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [targetGrade, setTargetGrade] = useState("A");
  const [confidenceLevel, setConfidenceLevel] = useState<number>(3);
  const [topicsInput, setTopicsInput] = useState("");
  const [language, setLanguage] = useState<StudyLanguage>("en");
  const [isCreating, setIsCreating] = useState(false);

  // Step Execution & Interactive Modal State
  const [generatingStepId, setGeneratingStepId] = useState<string | null>(null);
  const [mutatingStepId, setMutatingStepId] = useState<string | null>(null);
  const [activeStepModal, setActiveStepModal] = useState<{
    planId: string;
    step: StudyPlanStep;
  } | null>(null);

  // Flashcards viewer state
  const [cardIndex, setCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);

  // Quiz viewer state
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});

  // Conversational replan state
  const [chatInput, setChatInput] = useState("");
  const [isReplanning, setIsReplanning] = useState(false);

  const activePlan = useMemo(
    () => plans.find((p) => p._id === selectedPlanId) ?? plans[0] ?? null,
    [plans, selectedPlanId]
  );

  const upsertPlanInState = (updated: StudyPlanDTO) => {
    setPlans((prev) => {
      const exists = prev.some((p) => p._id === updated._id);
      return exists
        ? prev.map((p) => (p._id === updated._id ? updated : p))
        : [updated, ...prev];
    });
    setSelectedPlanId(updated._id);
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookId) {
      toast.error("Please select a book from your library first.");
      return;
    }

    setIsCreating(true);
    try {
      const topics = topicsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch("/api/study-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          title: planTitle.trim() || undefined,
          examDate: examDate ? new Date(examDate).toISOString() : null,
          targetGrade: targetGrade.trim() || "A",
          confidenceLevel,
          topics,
          language,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.plan) {
        throw new Error(data.error || "Failed to create study plan");
      }

      upsertPlanInState(data.plan);
      setShowCreateModal(false);
      setPlanTitle("");
      setTopicsInput("");
      toast.success("Study plan skeleton created! Click any step to generate it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create plan");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeletePlan = async (id: string) => {
    try {
      const res = await fetch(`/api/study-plans/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setPlans((prev) => {
        const next = prev.filter((p) => p._id !== id);
        if (selectedPlanId === id) {
          setSelectedPlanId(next[0]?._id ?? null);
        }
        return next;
      });
      toast.success("Study plan removed.");
    } catch {
      toast.error("Could not delete study plan.");
    }
  };

  const handleOpenOrGenerateStep = async (planId: string, step: StudyPlanStep, force = false) => {
    if (!force && step.generatedContent && (step.status === "ready" || step.status === "completed")) {
      setCardIndex(0);
      setCardFlipped(false);
      setQuizAnswers({});
      setActiveStepModal({ planId, step });
      return;
    }

    setGeneratingStepId(step.id);
    try {
      const res = await fetch(
        `/api/study-plans/${planId}/steps/${encodeURIComponent(step.id)}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.plan || !data.step) {
        throw new Error(data.error || "Failed to generate step");
      }
      upsertPlanInState(data.plan);
      setCardIndex(0);
      setCardFlipped(false);
      setQuizAnswers({});
      setActiveStepModal({ planId, step: data.step });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGeneratingStepId(null);
    }
  };

  const handleToggleStepComplete = async (planId: string, step: StudyPlanStep) => {
    const nextStatus = step.status === "completed" ? "pending" : "completed";
    setMutatingStepId(step.id);
    try {
      const res = await fetch(
        `/api/study-plans/${planId}/steps/${encodeURIComponent(step.id)}/progress`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.plan) {
        throw new Error(data.error || "Failed to update progress");
      }
      upsertPlanInState(data.plan);
      if (activeStepModal?.step.id === step.id) {
        const refreshed = (data.plan as StudyPlanDTO).sections
          .flatMap((s) => s.steps)
          .find((st) => st.id === step.id);
        if (refreshed) {
          setActiveStepModal({ planId, step: refreshed });
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update step");
    } finally {
      setMutatingStepId(null);
    }
  };

  const handleDeferStep = async (planId: string, stepId: string) => {
    setMutatingStepId(stepId);
    try {
      const res = await fetch(
        `/api/study-plans/${planId}/steps/${encodeURIComponent(stepId)}/defer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moveToNextSession: true }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.plan) {
        throw new Error(data.error || "Failed to defer step");
      }
      upsertPlanInState(data.plan);
      toast.success("Step deferred to the next study session.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not defer step");
    } finally {
      setMutatingStepId(null);
    }
  };

  const handleReplanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePlan || !chatInput.trim() || isReplanning) return;
    const msg = chatInput.trim();
    setChatInput("");
    setIsReplanning(true);
    try {
      const res = await fetch(`/api/study-plans/${activePlan._id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      if (!res.ok || !data.plan) {
        throw new Error(data.error || "Failed to update study plan");
      }
      upsertPlanInState(data.plan);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Replanning failed");
    } finally {
      setIsReplanning(false);
    }
  };

  const daysBadge = activePlan ? formatDaysUntil(activePlan.examDate) : null;

  return (
    <section className="rounded-[24px] border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-5 sm:p-7 lg:p-8 shadow-chip">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--ink)]/15 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="meta-label text-[color:var(--ink)]/75">
              Exam Study Plans · Two-Phase AI Builder
            </p>
            <span className="rounded-full border border-[color:var(--ink)] bg-[#7fd8c9] px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase text-[color:var(--ink)]">
              On-Demand
            </span>
          </div>
          <h2 className="display mt-1 text-[26px] sm:text-[32px] leading-tight text-[color:var(--ink)]">
            {activePlan ? activePlan.title : "Build your exam roadmap"}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {plans.length > 1 && (
            <select
              aria-label="Switch active study plan"
              value={activePlan?._id ?? ""}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className="rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--panel)] px-3.5 py-1.5 text-xs font-bold text-[color:var(--ink)] focus:outline-none"
            >
              {plans.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.title} ({p.readinessScore}%)
                </option>
              ))}
            </select>
          )}

          {activePlan && (
            <button
              type="button"
              onClick={() => handleDeletePlan(activePlan._id)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border-2 border-[color:var(--ink)]/30 bg-white/60 px-3 py-1.5 text-xs font-bold text-[color:var(--ink)]/75 transition-colors hover:border-rose-500 hover:bg-rose-50 hover:text-rose-700"
              title="Delete active plan"
            >
              <Trash2 className="size-3.5" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (!bookId && books[0]?._id) setBookId(books[0]._id);
              setShowCreateModal(true);
            }}
            disabled={books.length === 0}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-4 py-1.5 text-xs font-black uppercase tracking-wider text-[color:var(--ink)] shadow-xs transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-3.5 stroke-[2.5]" />
            <span>New Study Plan</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {!activePlan ? (
        <div className="mt-5 flex flex-col items-start justify-between gap-4 rounded-[20px] border-2 border-dashed border-[color:var(--ink)]/25 bg-[color:var(--panel)] p-6 sm:flex-row sm:items-center">
          <div className="max-w-xl">
            <p className="display text-[22px] text-[color:var(--ink)]">
              Turn any book into a day-by-day exam schedule.
            </p>
            <p className="mt-1.5 text-xs sm:text-sm font-medium leading-relaxed text-[color:var(--ink)]/75">
              Pick a textbook, set your exam date and target grade, and Ascleon generates a lightweight schedule instantly — then builds summaries, flashcards, and quizzes on demand when you click each step.
            </p>
          </div>
          {books.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                if (!bookId && books[0]?._id) setBookId(books[0]._id);
                setShowCreateModal(true);
              }}
              className="shrink-0 cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--ink)] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-[color:var(--cream)] shadow-xs transition-transform hover:-translate-y-0.5"
            >
              Create First Plan
            </button>
          ) : (
            <Link
              href="/library"
              className="shrink-0 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--ink)] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-[color:var(--cream)] shadow-xs"
            >
              Upload a Book First
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-12">
          {/* Left / Main Column: Readiness + Sessions */}
          <div className="flex flex-col gap-4 lg:col-span-8">
            {/* Readiness + Metadata Strip */}
            <div className="rounded-[18px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/books/${activePlan.bookSlug}`}
                    className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ink)] bg-white px-2.5 py-0.5 text-[11px] font-bold text-[color:var(--ink)] hover:bg-[color:var(--orange)]/20"
                  >
                    <BookOpen className="size-3" />
                    <span className="max-w-[200px] truncate">{activePlan.bookTitle}</span>
                    <ArrowUpRight className="size-3" />
                  </Link>
                  {daysBadge && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ink)] bg-[#f6d7a1] px-2.5 py-0.5 text-[11px] font-bold text-[color:var(--ink)]">
                      <Calendar className="size-3" />
                      {daysBadge}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ink)]/30 bg-white/70 px-2.5 py-0.5 text-[11px] font-bold text-[color:var(--ink)]">
                    <Target className="size-3" />
                    Goal: {activePlan.targetGrade}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="meta-label text-[color:var(--ink)]/70">Readiness</span>
                  <span className="rounded-full border-2 border-[color:var(--ink)] bg-[#7fd8c9] px-3 py-0.5 font-mono text-sm font-black text-[color:var(--ink)]">
                    {activePlan.readinessScore}%
                  </span>
                </div>
              </div>

              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full border border-[color:var(--ink)] bg-white">
                <div
                  className="h-full bg-[color:var(--orange)] transition-all duration-500"
                  style={{ width: `${activePlan.readinessScore}%` }}
                />
              </div>
            </div>

            {/* Day-by-Day Sessions */}
            <div className="flex flex-col gap-3">
              {activePlan.sections.map((section) => {
                const completedCount = section.steps.filter((s) => s.status === "completed").length;
                return (
                  <div
                    key={section.id}
                    className="rounded-[18px] border-2 border-[color:var(--ink)] bg-white/85 p-4 shadow-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[color:var(--ink)]/10">
                      <div>
                        <p className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-[color:var(--ink)]/60">
                          Day {section.dayNumber} · {section.scheduledDate}
                        </p>
                        <h3 className="text-sm sm:text-base font-black text-[color:var(--ink)]">
                          {section.title}
                        </h3>
                      </div>
                      <span className="rounded-full border border-[color:var(--ink)]/25 bg-[color:var(--cream)] px-2.5 py-0.5 font-mono text-[11px] font-bold text-[color:var(--ink)]">
                        {completedCount}/{section.steps.length} done
                      </span>
                    </div>

                    <div className="mt-3 flex flex-col gap-2">
                      {section.steps.map((step) => {
                        const meta = STEP_TYPE_META[step.type] ?? STEP_TYPE_META.reading;
                        const Icon = meta.Icon;
                        const isGenerating = generatingStepId === step.id;
                        const isMutating = mutatingStepId === step.id;
                        const isCompleted = step.status === "completed";
                        const isReady = step.status === "ready" && Boolean(step.generatedContent);

                        return (
                          <div
                            key={step.id}
                            className={cn(
                              "flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[color:var(--ink)]/25 p-2.5 sm:p-3 transition-colors",
                              isCompleted
                                ? "bg-[#7fd8c9]/20"
                                : "bg-[color:var(--panel)]/65"
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full border border-[color:var(--ink)] px-2 py-0.5 text-[10px] font-black uppercase",
                                    meta.badgeClass
                                  )}
                                >
                                  <Icon className="size-2.5" />
                                  {meta.label}
                                </span>
                                <Link
                                  href={`/books/${activePlan.bookSlug}`}
                                  className="rounded-full bg-white px-2 py-0.5 font-mono text-[10px] font-bold text-[color:var(--ink)]/75 hover:underline"
                                >
                                  pp. {step.startPage}–{step.endPage}
                                </Link>
                                <span className="inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-[color:var(--ink)]/65">
                                  <Clock className="size-2.5" />
                                  {step.estimatedMinutes}m
                                </span>
                                {isReady && !isCompleted && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9.5px] font-black uppercase text-emerald-800">
                                    Ready
                                  </span>
                                )}
                              </div>
                              <p
                                className={cn(
                                  "mt-1 text-xs sm:text-[13px] font-bold text-[color:var(--ink)]",
                                  isCompleted && "line-through opacity-65"
                                )}
                              >
                                {step.title}
                              </p>
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isGenerating}
                                onClick={() => handleOpenOrGenerateStep(activePlan._id, step)}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--ink)] px-3 py-1 text-[11px] font-bold text-[color:var(--cream)] transition-opacity hover:opacity-90 disabled:opacity-50"
                              >
                                {isGenerating ? (
                                  <>
                                    <Loader2 className="size-3 animate-spin" />
                                    <span>Building...</span>
                                  </>
                                ) : isReady || isCompleted ? (
                                  <>
                                    <Sparkles className="size-3" />
                                    <span>Open</span>
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="size-3" />
                                    <span>Generate &amp; Open</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                disabled={isMutating}
                                onClick={() => handleToggleStepComplete(activePlan._id, step)}
                                className={cn(
                                  "inline-flex cursor-pointer items-center gap-1 rounded-full border-2 px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-50",
                                  isCompleted
                                    ? "border-[color:var(--ink)] bg-[#7fd8c9] text-[color:var(--ink)]"
                                    : "border-[color:var(--ink)]/30 bg-white text-[color:var(--ink)] hover:border-[color:var(--ink)]"
                                )}
                                title={isCompleted ? "Mark incomplete" : "Mark step done"}
                              >
                                <CheckCircle2 className="size-3" />
                                <span>{isCompleted ? "Done" : "Mark"}</span>
                              </button>

                              {!isCompleted && (
                                <button
                                  type="button"
                                  disabled={isMutating}
                                  onClick={() => handleDeferStep(activePlan._id, step.id)}
                                  className="cursor-pointer rounded-full border border-[color:var(--ink)]/25 bg-white px-2.5 py-1 text-[10.5px] font-bold text-[color:var(--ink)]/75 hover:border-[color:var(--ink)] hover:text-[color:var(--ink)] disabled:opacity-50"
                                  title="Defer step to next session"
                                >
                                  Defer
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Plan Adjustment Chat */}
          <div className="flex flex-col justify-between rounded-[20px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-4 sm:p-5 lg:col-span-4">
            <div>
              <div className="flex items-center gap-2 border-b border-[color:var(--ink)]/15 pb-3">
                <MessageSquare className="size-4 text-[color:var(--orange)]" />
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-[color:var(--ink)]">
                    Adjust Plan in Chat
                  </p>
                  <p className="text-[11px] text-[color:var(--ink)]/70">
                    e.g. &ldquo;Make my plan shorter&rdquo; or &ldquo;Add a final mock review&rdquo;
                  </p>
                </div>
              </div>

              <div className="mt-3 flex max-h-[360px] flex-col gap-2.5 overflow-y-auto pr-1">
                {activePlan.chatHistory.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[color:var(--ink)]/25 bg-white/60 p-3.5 text-xs text-[color:var(--ink)]/75">
                    Need to shift topics or compress sessions before your exam? Ask here and completed steps stay intact.
                  </div>
                ) : (
                  activePlan.chatHistory.map((msg, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "rounded-xl border p-3 text-xs leading-relaxed",
                        msg.role === "user"
                          ? "self-end border-[color:var(--ink)] bg-[color:var(--orange)] font-bold text-[color:var(--ink)]"
                          : "self-start border-[color:var(--ink)]/30 bg-white text-[color:var(--ink)]"
                      )}
                    >
                      <p>{msg.text}</p>
                      {msg.diffSummary &&
                        (msg.diffSummary.added.length > 0 ||
                          msg.diffSummary.changed.length > 0 ||
                          msg.diffSummary.removed.length > 0) && (
                          <div className="mt-2 rounded-lg border border-[color:var(--ink)]/20 bg-[color:var(--cream)] p-2 text-[10.5px]">
                            <p className="font-black uppercase tracking-wider text-[color:var(--ink)]">
                              Plan Updated
                            </p>
                            {msg.diffSummary.added.map((a, i) => (
                              <p key={`a-${i}`} className="text-emerald-800 font-semibold">
                                + {a}
                              </p>
                            ))}
                            {msg.diffSummary.changed.map((c, i) => (
                              <p key={`c-${i}`} className="text-amber-800 font-semibold">
                                ~ {c}
                              </p>
                            ))}
                            {msg.diffSummary.removed.map((r, i) => (
                              <p key={`r-${i}`} className="text-rose-700 font-semibold">
                                - {r}
                              </p>
                            ))}
                          </div>
                        )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <form onSubmit={handleReplanSubmit} className="mt-3 flex items-center gap-2 pt-3 border-t border-[color:var(--ink)]/15">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask to adjust this plan..."
                disabled={isReplanning}
                className="min-w-0 flex-1 rounded-full border-2 border-[color:var(--ink)] bg-white px-3.5 py-2 text-xs text-[color:var(--ink)] placeholder:text-[color:var(--ink)]/50 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isReplanning || !chatInput.trim()}
                className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--ink)] text-[color:var(--cream)] disabled:opacity-45"
                title="Update study plan"
              >
                {isReplanning ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* CREATE PLAN MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-[24px] border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-6 text-[color:var(--ink)] shadow-chip">
            <div className="flex items-center justify-between border-b border-[color:var(--ink)]/15 pb-3">
              <div>
                <p className="meta-label text-[color:var(--ink)]/70">Phase 1 · Fast Skeleton</p>
                <h3 className="display text-2xl text-[color:var(--ink)]">Create Exam Study Plan</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="cursor-pointer rounded-full p-1 text-[color:var(--ink)]/70 hover:text-[color:var(--ink)]"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="mt-4 flex flex-col gap-3.5 text-xs">
              <label className="flex flex-col gap-1 font-bold">
                <span>Book / Source Material</span>
                <select
                  value={bookId}
                  onChange={(e) => setBookId(e.target.value)}
                  required
                  className="rounded-xl border-2 border-[color:var(--ink)] bg-white px-3 py-2 text-xs font-semibold text-[color:var(--ink)]"
                >
                  {books.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 font-bold">
                <span>Plan Title (optional)</span>
                <input
                  type="text"
                  value={planTitle}
                  onChange={(e) => setPlanTitle(e.target.value)}
                  placeholder="e.g. Cardiology Midterm Sprint"
                  className="rounded-xl border-2 border-[color:var(--ink)] bg-white px-3 py-2 text-xs font-medium text-[color:var(--ink)]"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 font-bold">
                  <span>Exam Date (optional)</span>
                  <input
                    type="date"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="rounded-xl border-2 border-[color:var(--ink)] bg-white px-3 py-2 text-xs font-medium text-[color:var(--ink)]"
                  />
                </label>

                <label className="flex flex-col gap-1 font-bold">
                  <span>Target Grade</span>
                  <input
                    type="text"
                    value={targetGrade}
                    onChange={(e) => setTargetGrade(e.target.value)}
                    placeholder="A / 90%"
                    className="rounded-xl border-2 border-[color:var(--ink)] bg-white px-3 py-2 text-xs font-medium text-[color:var(--ink)]"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 font-bold">
                  <span>Current Confidence ({confidenceLevel}/5)</span>
                  <div className="flex items-center gap-1 pt-1">
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setConfidenceLevel(lvl)}
                        className={cn(
                          "flex-1 cursor-pointer rounded-lg border-2 py-1.5 font-mono text-xs font-black transition-colors",
                          confidenceLevel === lvl
                            ? "border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)]"
                            : "border-[color:var(--ink)]/25 bg-white text-[color:var(--ink)]/70"
                        )}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </label>

                <label className="flex flex-col gap-1 font-bold">
                  <span>Study Language</span>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as StudyLanguage)}
                    className="rounded-xl border-2 border-[color:var(--ink)] bg-white px-3 py-2 text-xs font-semibold text-[color:var(--ink)]"
                  >
                    <option value="en">English</option>
                    <option value="ar">العربية (Egyptian)</option>
                    <option value="mixed">Mixed عربي / EN</option>
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-1 font-bold">
                <span>Focus Topics (comma-separated, optional)</span>
                <input
                  type="text"
                  value={topicsInput}
                  onChange={(e) => setTopicsInput(e.target.value)}
                  placeholder="e.g. Heart Failure, Arrhythmias, Pharmacology"
                  className="rounded-xl border-2 border-[color:var(--ink)] bg-white px-3 py-2 text-xs font-medium text-[color:var(--ink)]"
                />
              </label>

              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="cursor-pointer rounded-full border border-[color:var(--ink)]/30 px-4 py-2 text-xs font-bold text-[color:var(--ink)]/75"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-5 py-2 text-xs font-black uppercase tracking-wider text-[color:var(--ink)] shadow-xs disabled:opacity-60"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>Building Skeleton...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3.5" />
                      <span>Generate Plan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INTERACTIVE STEP MODAL */}
      {activeStepModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs">
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-[24px] border-2 border-[color:var(--ink)] bg-[color:var(--cream)] text-[color:var(--ink)] shadow-chip">
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--ink)]/15 p-5">
              <div>
                <p className="meta-label text-[color:var(--ink)]/70">
                  {STEP_TYPE_META[activeStepModal.step.type].label} · pp. {activeStepModal.step.startPage}–{activeStepModal.step.endPage}
                </p>
                <h3 className="display mt-0.5 text-2xl leading-tight text-[color:var(--ink)]">
                  {activeStepModal.step.title}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={generatingStepId === activeStepModal.step.id}
                  onClick={() =>
                    handleOpenOrGenerateStep(activeStepModal.planId, activeStepModal.step, true)
                  }
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[color:var(--ink)]/30 bg-white px-2.5 py-1 text-[10.5px] font-bold text-[color:var(--ink)] hover:border-[color:var(--ink)]"
                  title="Regenerate this step"
                >
                  <RotateCcw className="size-3" />
                  <span>Regenerate</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStepModal(null)}
                  className="cursor-pointer rounded-full p-1 text-[color:var(--ink)]/70 hover:text-[color:var(--ink)]"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 text-sm">
              {(() => {
                const content = activeStepModal.step.generatedContent;
                if (!content) {
                  return <p className="text-xs text-[color:var(--ink)]/70">No content generated yet.</p>;
                }

                if (content.kind === "summary") {
                  return (
                    <div className="flex flex-col gap-4">
                      <div className="rounded-xl border border-[color:var(--ink)]/25 bg-white p-4">
                        <h4 className="meta-label text-[color:var(--orange)]">Key Takeaways</h4>
                        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs font-medium leading-relaxed">
                          {content.keyTakeaways.map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-xl border border-[color:var(--ink)]/25 bg-white p-4">
                        <h4 className="meta-label text-[#2e6f68]">High-Yield Notes</h4>
                        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed">
                          {content.highYieldNotes.map((n, i) => (
                            <li key={i}>{n}</li>
                          ))}
                        </ul>
                      </div>
                      {content.clinicalPearls.length > 0 && (
                        <div className="rounded-xl border border-[color:var(--ink)]/25 bg-[#f6d7a1] p-4">
                          <h4 className="meta-label text-[color:var(--ink)]">Exam &amp; Clinical Pearls</h4>
                          <ul className="mt-2 space-y-1 text-xs font-semibold">
                            {content.clinicalPearls.map((p, i) => (
                              <li key={i}>✦ {p}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                }

                if (content.kind === "flashcards") {
                  const cards = content.cards;
                  const safeIdx = Math.min(cardIndex, Math.max(0, cards.length - 1));
                  const card = cards[safeIdx];
                  if (!card) return null;
                  return (
                    <div className="flex flex-col items-center gap-4">
                      <p className="meta-label text-[color:var(--ink)]/70">
                        Card {safeIdx + 1} of {cards.length} · Click card to flip
                      </p>
                      <button
                        type="button"
                        onClick={() => setCardFlipped((f) => !f)}
                        className="flex min-h-[190px] w-full cursor-pointer flex-col items-center justify-center rounded-[20px] border-2 border-[color:var(--ink)] bg-white p-6 text-center shadow-chip transition-colors hover:bg-[color:var(--panel)]"
                      >
                        <span className="meta-label mb-2 text-[color:var(--orange)]">
                          {cardFlipped ? "Answer" : "Prompt"}
                        </span>
                        <p className="text-base font-bold leading-relaxed text-[color:var(--ink)]">
                          {cardFlipped ? card.back : card.front}
                        </p>
                      </button>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={safeIdx === 0}
                          onClick={() => {
                            setCardIndex((i) => Math.max(0, i - 1));
                            setCardFlipped(false);
                          }}
                          className="cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-white px-4 py-1.5 text-xs font-bold disabled:opacity-40"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          disabled={safeIdx >= cards.length - 1}
                          onClick={() => {
                            setCardIndex((i) => Math.min(cards.length - 1, i + 1));
                            setCardFlipped(false);
                          }}
                          className="cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-4 py-1.5 text-xs font-bold disabled:opacity-40"
                        >
                          Next Card
                        </button>
                      </div>
                    </div>
                  );
                }

                if (content.kind === "quiz") {
                  return (
                    <div className="flex flex-col gap-4">
                      {content.questions.map((q, qIdx) => {
                        const chosen = quizAnswers[qIdx];
                        const answered = typeof chosen === "number";
                        return (
                          <div
                            key={qIdx}
                            className="rounded-xl border-2 border-[color:var(--ink)]/25 bg-white p-4"
                          >
                            <p className="text-xs font-black text-[color:var(--ink)]">
                              Q{qIdx + 1}. {q.question}
                            </p>
                            <div className="mt-2.5 flex flex-col gap-1.5">
                              {q.options.map((opt, oIdx) => {
                                const isChosen = chosen === oIdx;
                                const isCorrect = oIdx === q.correctIndex;
                                return (
                                  <button
                                    key={oIdx}
                                    type="button"
                                    onClick={() =>
                                      setQuizAnswers((prev) => ({ ...prev, [qIdx]: oIdx }))
                                    }
                                    className={cn(
                                      "cursor-pointer rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors",
                                      !answered && "border-[color:var(--ink)]/25 bg-[color:var(--panel)]/40 hover:border-[color:var(--ink)]",
                                      answered && isCorrect && "border-emerald-600 bg-emerald-50 font-bold text-emerald-900",
                                      answered && isChosen && !isCorrect && "border-rose-600 bg-rose-50 font-bold text-rose-900",
                                      answered && !isChosen && !isCorrect && "border-[color:var(--ink)]/15 opacity-65"
                                    )}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                            {answered && (
                              <p className="mt-2.5 rounded-lg bg-[color:var(--cream)] p-2.5 text-[11px] leading-relaxed text-[color:var(--ink)]">
                                <strong>Explanation:</strong> {q.explanation}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                return (
                  <div className="flex flex-col gap-4">
                    <div className="rounded-xl border border-[color:var(--ink)]/25 bg-white p-4">
                      <h4 className="meta-label text-[color:var(--orange)]">Focus Points</h4>
                      <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed">
                        {content.focusPoints.map((pt, i) => (
                          <li key={i}>{pt}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-[color:var(--ink)]/25 bg-white p-4">
                      <h4 className="meta-label text-[#2e6f68]">Self-Check Questions</h4>
                      <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed">
                        {content.guidingQuestions.map((gq, i) => (
                          <li key={i}>{gq}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--ink)]/15 p-4">
              {activePlan && (
                <Link
                  href={`/books/${activePlan.bookSlug}`}
                  className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ink)]/30 bg-white px-3.5 py-1.5 text-xs font-bold text-[color:var(--ink)] hover:border-[color:var(--ink)]"
                >
                  <span>Open Book (pp. {activeStepModal.step.startPage}–{activeStepModal.step.endPage})</span>
                  <ArrowUpRight className="size-3.5" />
                </Link>
              )}

              <button
                type="button"
                disabled={mutatingStepId === activeStepModal.step.id}
                onClick={() =>
                  handleToggleStepComplete(activeStepModal.planId, activeStepModal.step)
                }
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-[color:var(--ink)] px-5 py-1.5 text-xs font-black uppercase tracking-wider",
                  activeStepModal.step.status === "completed"
                    ? "bg-[#7fd8c9] text-[color:var(--ink)]"
                    : "bg-[color:var(--orange)] text-[color:var(--ink)]"
                )}
              >
                <CheckCircle2 className="size-3.5" />
                <span>
                  {activeStepModal.step.status === "completed"
                    ? "Completed"
                    : "Mark Step Complete"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
