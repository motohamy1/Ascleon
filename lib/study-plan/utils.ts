import { z } from "zod";
import {
  StudyPlanDTO,
  StudyPlanSection,
  StudyPlanStep,
  StudyPlanStepContent,
  StudyPlanStepType,
} from "@/types/study-plan";

export const StepTypeSchema = z.enum(["summary", "quiz", "flashcards", "reading"]);

export const SummaryContentSchema = z.object({
  kind: z.literal("summary").default("summary"),
  keyTakeaways: z.array(z.string().min(1)).min(1).max(10),
  highYieldNotes: z.array(z.string().min(1)).min(1).max(12),
  clinicalPearls: z.array(z.string().min(1)).max(8).default([]),
});

export const FlashcardsContentSchema = z.object({
  kind: z.literal("flashcards").default("flashcards"),
  cards: z
    .array(
      z.object({
        front: z.string().min(1),
        back: z.string().min(1),
      })
    )
    .min(2)
    .max(12),
});

export const QuizContentSchema = z.object({
  kind: z.literal("quiz").default("quiz"),
  questions: z
    .array(
      z.object({
        question: z.string().min(1),
        options: z.array(z.string().min(1)).min(2).max(5),
        correctIndex: z.number().int().min(0).max(4),
        explanation: z.string().min(1),
      })
    )
    .min(1)
    .max(10),
});

export const ReadingContentSchema = z.object({
  kind: z.literal("reading").default("reading"),
  focusPoints: z.array(z.string().min(1)).min(1).max(10),
  guidingQuestions: z.array(z.string().min(1)).min(1).max(8),
});

export const SkeletonStepInputSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  type: StepTypeSchema,
  startPage: z.number().int().min(1),
  endPage: z.number().int().min(1),
  estimatedMinutes: z.number().int().min(5).max(180).default(20),
});

export const SkeletonSectionInputSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  dayNumber: z.number().int().min(1).max(60),
  topics: z.array(z.string().min(1)).default([]),
  steps: z.array(SkeletonStepInputSchema).min(1).max(8),
});

export const SkeletonOutputSchema = z.object({
  title: z.string().min(1).optional(),
  sections: z.array(SkeletonSectionInputSchema).min(1).max(14),
});

export const ReplanOutputSchema = z.object({
  assistantReply: z.string().min(1),
  diffSummary: z.object({
    added: z.array(z.string()).default([]),
    changed: z.array(z.string()).default([]),
    removed: z.array(z.string()).default([]),
  }),
  sections: z.array(SkeletonSectionInputSchema).min(1).max(14),
});

const STEP_TYPE_WEIGHT: Record<StudyPlanStepType, number> = {
  quiz: 1.4,
  flashcards: 1.25,
  summary: 1.0,
  reading: 1.0,
};

/**
 * Deterministic 0-100 readiness score weighted slightly higher for active recall
 * steps (quiz & flashcards). Deferred steps are excluded from the active denominator
 * unless all steps are deferred.
 */
export function computeReadinessScore(sections: StudyPlanSection[]): number {
  const allSteps = sections.flatMap((sec) => sec.steps || []);
  if (allSteps.length === 0) return 0;

  const activeSteps = allSteps.filter((s) => s.status !== "deferred");
  const pool = activeSteps.length > 0 ? activeSteps : allSteps;

  let totalWeight = 0;
  let earnedWeight = 0;

  for (const step of pool) {
    const w = STEP_TYPE_WEIGHT[step.type] ?? 1.0;
    totalWeight += w;
    if (step.status === "completed") {
      earnedWeight += w;
    } else if (step.status === "ready") {
      // Partial readiness credit for having generated & opened materials
      earnedWeight += w * 0.15;
    }
  }

  if (totalWeight <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((earnedWeight / totalWeight) * 100)));
}

export function addDaysIsoDate(baseDate: Date, offsetDays: number): string {
  const d = new Date(baseDate.getTime());
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function normalizeSectionsFromInput(
  rawSections: z.infer<typeof SkeletonSectionInputSchema>[],
  totalPages: number,
  startDate: Date = new Date()
): StudyPlanSection[] {
  const safeTotal = Math.max(1, totalPages || 1);
  return rawSections.map((sec, sIdx) => {
    const dayNum = Math.max(1, sec.dayNumber || sIdx + 1);
    const secId = sec.id?.trim() || `sec_${dayNum}_${sIdx + 1}`;
    const steps: StudyPlanStep[] = sec.steps.map((st, stIdx) => {
      const sp = Math.max(1, Math.min(safeTotal, Math.round(st.startPage)));
      const ep = Math.max(sp, Math.min(safeTotal, Math.round(st.endPage)));
      return {
        id: st.id?.trim() || `${secId}_step_${stIdx + 1}`,
        title: st.title.trim(),
        type: st.type,
        startPage: sp,
        endPage: ep,
        estimatedMinutes: Math.max(5, Math.min(180, Math.round(st.estimatedMinutes || 20))),
        status: "pending",
        generatedContent: null,
        completedAt: null,
      };
    });

    return {
      id: secId,
      title: sec.title.trim(),
      dayNumber: dayNum,
      scheduledDate: addDaysIsoDate(startDate, dayNum - 1),
      topics: sec.topics.slice(0, 8),
      steps,
    };
  });
}

/**
 * Merges updated skeleton sections from conversational replanning while preserving
 * completed status and already-generated step payloads for matching step IDs.
 */
export function preserveStepsOnReplan(
  existingSections: StudyPlanSection[],
  nextSections: StudyPlanSection[]
): StudyPlanSection[] {
  const prevById = new Map<string, StudyPlanStep>();
  for (const sec of existingSections) {
    for (const st of sec.steps) {
      prevById.set(st.id, st);
    }
  }

  return nextSections.map((sec) => ({
    ...sec,
    steps: sec.steps.map((st) => {
      const prev = prevById.get(st.id);
      if (!prev) return st;
      return {
        ...st,
        status: prev.status,
        generatedContent: prev.generatedContent ?? null,
        completedAt: prev.completedAt ?? null,
      };
    }),
  }));
}

/**
 * Defers a step: marks it as "deferred" or moves it into the following session
 * and updates scheduled dates cleanly.
 */
export function deferStepInSections(
  sections: StudyPlanSection[],
  stepId: string,
  moveToNextSession = true
): { sections: StudyPlanSection[]; found: boolean } {
  let found = false;
  let movedStep: StudyPlanStep | null = null;
  let sourceSectionIndex = -1;

  const nextSections = sections.map((sec, sIdx) => {
    const idx = sec.steps.findIndex((st) => st.id === stepId);
    if (idx === -1) return { ...sec, steps: [...sec.steps] };

    found = true;
    sourceSectionIndex = sIdx;
    const step = sec.steps[idx];

    if (!moveToNextSession) {
      const updated = [...sec.steps];
      updated[idx] = { ...step, status: "deferred" };
      return { ...sec, steps: updated };
    }

    movedStep = { ...step, status: step.status === "completed" ? "completed" : "pending" };
    return {
      ...sec,
      steps: sec.steps.filter((st) => st.id !== stepId),
    };
  });

  if (!found) return { sections, found: false };

  if (moveToNextSession && movedStep) {
    const targetIdx = sourceSectionIndex + 1;
    if (targetIdx < nextSections.length) {
      nextSections[targetIdx] = {
        ...nextSections[targetIdx],
        steps: [movedStep, ...nextSections[targetIdx].steps],
      };
    } else {
      const last = nextSections[nextSections.length - 1];
      const nextDay = (last?.dayNumber ?? nextSections.length) + 1;
      const base = last?.scheduledDate ? new Date(`${last.scheduledDate}T00:00:00.000Z`) : new Date();
      nextSections.push({
        id: `sec_deferred_${nextDay}`,
        title: `Session ${nextDay} · Deferred Catch-Up`,
        dayNumber: nextDay,
        scheduledDate: addDaysIsoDate(base, 1),
        topics: ["Review & Catch-Up"],
        steps: [movedStep],
      });
    }
  }

  return {
    sections: nextSections.filter((sec) => sec.steps.length > 0),
    found: true,
  };
}

export function buildFallbackSkeleton(params: {
  bookTitle: string;
  totalPages: number;
  examDate?: string | null;
  topics?: string[];
  outlineHints?: Array<{ title: string; startPage: number; endPage: number }>;
}): StudyPlanSection[] {
  const safeTotal = Math.max(1, params.totalPages || 1);
  let sessionCount = 5;

  if (params.examDate) {
    const examMs = Date.parse(params.examDate);
    if (Number.isFinite(examMs)) {
      const daysUntil = Math.ceil((examMs - Date.now()) / 86_400_000);
      sessionCount = Math.max(3, Math.min(10, daysUntil));
    }
  }

  if (safeTotal <= 6) {
    sessionCount = Math.min(sessionCount, 3);
  }

  const startDate = new Date();
  const hints = params.outlineHints && params.outlineHints.length > 0 ? params.outlineHints : [];
  const sections: StudyPlanSection[] = [];
  const pagesPerSession = Math.max(1, Math.ceil(safeTotal / sessionCount));

  for (let i = 0; i < sessionCount; i++) {
    const dayNumber = i + 1;
    const isFinal = i === sessionCount - 1;
    const startPage = Math.min(safeTotal, i * pagesPerSession + 1);
    const endPage = isFinal
      ? safeTotal
      : Math.min(safeTotal, Math.max(startPage, (i + 1) * pagesPerSession));

    const matchedHint = hints[i % Math.max(1, hints.length)];
    const userTopic = params.topics?.[i % Math.max(1, params.topics?.length || 1)];
    const topicLabel = isFinal
      ? "Comprehensive Exam Readiness & Active Recall"
      : userTopic || matchedHint?.title || `Core Concepts (pp. ${startPage}–${endPage})`;

    const stepSp = matchedHint && !isFinal ? matchedHint.startPage : startPage;
    const stepEp = matchedHint && !isFinal ? Math.max(stepSp, matchedHint.endPage) : endPage;

    const steps: StudyPlanStep[] = isFinal
      ? [
          {
            id: `sec_${dayNumber}_step_1`,
            title: `High-Yield Synthesis: ${params.bookTitle}`,
            type: "summary",
            startPage: 1,
            endPage: safeTotal,
            estimatedMinutes: 25,
            status: "pending",
            generatedContent: null,
            completedAt: null,
          },
          {
            id: `sec_${dayNumber}_step_2`,
            title: "Final Rapid-Fire Flashcards",
            type: "flashcards",
            startPage: 1,
            endPage: safeTotal,
            estimatedMinutes: 20,
            status: "pending",
            generatedContent: null,
            completedAt: null,
          },
          {
            id: `sec_${dayNumber}_step_3`,
            title: "Final Mock Exam Check",
            type: "quiz",
            startPage: 1,
            endPage: safeTotal,
            estimatedMinutes: 30,
            status: "pending",
            generatedContent: null,
            completedAt: null,
          },
        ]
      : [
          {
            id: `sec_${dayNumber}_step_1`,
            title: `Guided Reading & Focus: ${topicLabel}`,
            type: "reading",
            startPage: stepSp,
            endPage: stepEp,
            estimatedMinutes: 20,
            status: "pending",
            generatedContent: null,
            completedAt: null,
          },
          {
            id: `sec_${dayNumber}_step_2`,
            title: `High-Yield Summary: pp. ${stepSp}–${stepEp}`,
            type: "summary",
            startPage: stepSp,
            endPage: stepEp,
            estimatedMinutes: 15,
            status: "pending",
            generatedContent: null,
            completedAt: null,
          },
          {
            id: `sec_${dayNumber}_step_3`,
            title: `Active Recall Quiz: ${topicLabel}`,
            type: "quiz",
            startPage: stepSp,
            endPage: stepEp,
            estimatedMinutes: 15,
            status: "pending",
            generatedContent: null,
            completedAt: null,
          },
        ];

    sections.push({
      id: `sec_${dayNumber}`,
      title: isFinal
        ? `Session ${dayNumber} · Final Exam Mock & Review`
        : `Session ${dayNumber} · ${topicLabel}`,
      dayNumber,
      scheduledDate: addDaysIsoDate(startDate, i),
      topics: [topicLabel],
      steps,
    });
  }

  return sections;
}

export function serializeStudyPlan(doc: any): StudyPlanDTO {
  const plain = typeof doc?.toObject === "function" ? doc.toObject() : doc;
  return {
    _id: String(plain._id),
    clerkId: String(plain.clerkId),
    bookId: String(plain.bookId),
    bookSlug: String(plain.bookSlug || ""),
    bookTitle: String(plain.bookTitle || "Study Source"),
    title: String(plain.title || "Exam Study Plan"),
    subject: String(plain.subject || "General"),
    examDate: plain.examDate ? new Date(plain.examDate).toISOString() : null,
    targetGrade: String(plain.targetGrade || "A"),
    confidenceLevel: Number(plain.confidenceLevel) || 3,
    language: (plain.language === "ar" || plain.language === "mixed" ? plain.language : "en"),
    status: (plain.status === "completed" || plain.status === "archived" ? plain.status : "active"),
    readinessScore: Number(plain.readinessScore) || 0,
    sections: Array.isArray(plain.sections)
      ? plain.sections.map((sec: any) => ({
          id: String(sec.id),
          title: String(sec.title),
          dayNumber: Number(sec.dayNumber) || 1,
          scheduledDate: String(sec.scheduledDate || ""),
          topics: Array.isArray(sec.topics) ? sec.topics.map(String) : [],
          steps: Array.isArray(sec.steps)
            ? sec.steps.map((st: any) => ({
                id: String(st.id),
                title: String(st.title),
                type: st.type,
                startPage: Number(st.startPage) || 1,
                endPage: Number(st.endPage) || 1,
                estimatedMinutes: Number(st.estimatedMinutes) || 20,
                status: st.status || "pending",
                generatedContent: (st.generatedContent as StudyPlanStepContent) ?? null,
                completedAt: st.completedAt ? new Date(st.completedAt).toISOString() : null,
              }))
            : [],
        }))
      : [],
    chatHistory: Array.isArray(plain.chatHistory)
      ? plain.chatHistory.map((m: any) => ({
          role: m.role === "user" ? "user" : "assistant",
          text: String(m.text || ""),
          diffSummary: m.diffSummary
            ? {
                added: Array.isArray(m.diffSummary.added) ? m.diffSummary.added.map(String) : [],
                changed: Array.isArray(m.diffSummary.changed) ? m.diffSummary.changed.map(String) : [],
                removed: Array.isArray(m.diffSummary.removed) ? m.diffSummary.removed.map(String) : [],
              }
            : null,
          createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
        }))
      : [],
    createdAt: plain.createdAt ? new Date(plain.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: plain.updatedAt ? new Date(plain.updatedAt).toISOString() : new Date().toISOString(),
  };
}
