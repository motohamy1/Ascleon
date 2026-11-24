import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import Book from "@/database/models/book.model";
import BookSegment from "@/database/models/book-segment.model";
import { buildLanguageDirective, StudyLanguage } from "@/lib/language";
import {
  clearModelCooldown,
  FAST_GEMINI_MODEL_CHAIN,
  markModelCooldownFromError,
  orderModelsByHealth,
} from "@/lib/ai/model-cooldown";
import {
  StudyPlanDiffSummary,
  StudyPlanSection,
  StudyPlanStep,
  StudyPlanStepContent,
} from "@/types/study-plan";
import {
  buildFallbackSkeleton,
  FlashcardsContentSchema,
  normalizeSectionsFromInput,
  preserveStepsOnReplan,
  QuizContentSchema,
  ReadingContentSchema,
  ReplanOutputSchema,
  SkeletonOutputSchema,
  SummaryContentSchema,
} from "./utils";

function parseJsonFromModel(raw: string): unknown {
  let clean = raw.trim();
  clean = clean.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
  clean = clean.replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(clean.slice(start, end + 1));
    }
    throw new Error("Study plan model output was not valid JSON.");
  }
}

async function callGeminiStudyPlanJson<T>(
  prompt: string,
  schema: z.ZodType<T>,
  temperature = 0.25
): Promise<T | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return null;
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelsToTry = orderModelsByHealth(FAST_GEMINI_MODEL_CHAIN);

  for (const modelName of modelsToTry) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 24_000);
    try {
      const promise = ai.models.generateContent({
        model: modelName,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          temperature,
          responseMimeType: "application/json",
          abortSignal: abort.signal,
        },
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        abort.signal.addEventListener("abort", () =>
          reject(new Error(`Gemini ${modelName} timed out`))
        )
      );
      const response = await Promise.race([promise, timeoutPromise]);
      const rawText = (response?.text || "").trim();
      if (!rawText) throw new Error(`Empty response from ${modelName}`);

      const parsedJson = parseJsonFromModel(rawText);
      const validated = schema.safeParse(parsedJson);
      if (!validated.success) {
        throw new Error(`Zod validation failed: ${validated.error.message}`);
      }
      clearModelCooldown(`gemini:${modelName}`);
      return validated.data;
    } catch (err) {
      markModelCooldownFromError(`gemini:${modelName}`, err);
      console.warn(`[study-plan] ${modelName} failed:`, err instanceof Error ? err.message : err);
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

export async function generateStudyPlanSkeleton(params: {
  bookId: string;
  examDate?: string | null;
  targetGrade?: string;
  confidenceLevel?: number;
  topics?: string[];
  language?: StudyLanguage;
  customTitle?: string;
}): Promise<{
  title: string;
  subject: string;
  bookTitle: string;
  bookSlug: string;
  totalPages: number;
  sections: StudyPlanSection[];
}> {
  const book = await Book.findById(params.bookId).lean();
  if (!book) {
    throw new Error("Book not found");
  }

  const totalPages = Math.max(1, Number((book as any).totalPages || (book as any).totalSegments || 1));
  const bookTitle = String((book as any).title || "Study Source");
  const bookSlug = String((book as any).slug || "");
  const subject = String((book as any).topic || (book as any).domain || "General");
  const language: StudyLanguage = params.language || "en";

  const segments = await BookSegment.find({ bookId: (book as any)._id })
    .select("segmentIndex pageNumber headings keyTerms summary content")
    .sort({ segmentIndex: 1 })
    .limit(60)
    .lean();

  const outlineHints: Array<{ title: string; startPage: number; endPage: number }> = [];
  const topicMapTopics = Array.isArray((book as any).blueprint?.topicMap?.topics)
    ? ((book as any).blueprint.topicMap.topics as Array<{ title?: string; startPage?: number; endPage?: number }>)
    : [];

  for (const t of topicMapTopics.slice(0, 12)) {
    if (t?.title) {
      const sp = Math.max(1, Math.min(totalPages, Number(t.startPage) || 1));
      const ep = Math.max(sp, Math.min(totalPages, Number(t.endPage) || sp));
      outlineHints.push({ title: String(t.title), startPage: sp, endPage: ep });
    }
  }

  if (outlineHints.length === 0 && segments.length > 0) {
    const stride = Math.max(1, Math.floor(segments.length / 8));
    for (let i = 0; i < segments.length; i += stride) {
      const seg: any = segments[i];
      const p = Number(seg.pageNumber) || Number(seg.segmentIndex) + 1;
      const heading =
        (Array.isArray(seg.headings) && seg.headings[0]) ||
        (Array.isArray(seg.keyTerms) && seg.keyTerms.slice(0, 2).join(", ")) ||
        `Section starting p.${p}`;
      outlineHints.push({
        title: String(heading).slice(0, 70),
        startPage: Math.max(1, Math.min(totalPages, p)),
        endPage: Math.max(1, Math.min(totalPages, p + stride)),
      });
    }
  }

  const outlineText = segments
    .slice(0, 35)
    .map((seg: any) => {
      const page = Number(seg.pageNumber) || Number(seg.segmentIndex) + 1;
      const head = Array.isArray(seg.headings) && seg.headings.length > 0 ? seg.headings.join(" | ") : "";
      const terms = Array.isArray(seg.keyTerms) && seg.keyTerms.length > 0 ? seg.keyTerms.slice(0, 5).join(", ") : "";
      const preview = String(seg.summary || seg.content || "").replace(/\s+/g, " ").slice(0, 140);
      return `p.${page}: ${head ? `[${head}] ` : ""}${terms ? `(${terms}) ` : ""}${preview}`;
    })
    .join("\n");

  let targetSessions = 5;
  if (params.examDate) {
    const ms = Date.parse(params.examDate);
    if (Number.isFinite(ms)) {
      const daysLeft = Math.ceil((ms - Date.now()) / 86_400_000);
      targetSessions = Math.max(3, Math.min(10, daysLeft));
    }
  }

  const langDirective = buildLanguageDirective(language, "json");
  const prompt = `You are Ascleon's Exam Study Plan Architect.
Design ONLY the lightweight day-by-day SKELETON of an exam preparation plan (do NOT generate full notes, flashcards, or quiz questions yet — those are generated lazily per step).

Book Title: "${bookTitle}"
Subject: "${subject}"
Total Pages: ${totalPages}
Target Sessions: ${targetSessions} (between 3 and 10)
Exam Date: ${params.examDate || "Flexible / Not set"}
Target Grade: ${params.targetGrade || "A"}
Student Confidence (1-5): ${params.confidenceLevel ?? 3}
Requested Focus Topics: ${params.topics?.length ? params.topics.join(", ") : "Cover full scope progressively"}

Book Outline & Sampled Pages:
${outlineText || `Book covers pages 1 to ${totalPages}.`}

${langDirective}

Return strict JSON matching this exact shape:
{
  "title": "Concise plan title",
  "sections": [
    {
      "id": "sec_1",
      "title": "Session 1 · Topic Name",
      "dayNumber": 1,
      "topics": ["Topic A", "Topic B"],
      "steps": [
        {
          "id": "sec_1_step_1",
          "title": "Step action title",
          "type": "reading" | "summary" | "flashcards" | "quiz",
          "startPage": 1,
          "endPage": 5,
          "estimatedMinutes": 20
        }
      ]
    }
  ]
}

Rules:
- Create ${targetSessions} sessions (2 to 4 steps per session).
- Use valid page numbers within 1..${totalPages} with startPage <= endPage.
- Include active recall ("quiz" and "flashcards") in sessions, especially a final mock/review session on the last day.
- Keep titles crisp and actionable.`;

  const aiResult = await callGeminiStudyPlanJson(prompt, SkeletonOutputSchema, 0.25);

  const sections = aiResult
    ? normalizeSectionsFromInput(aiResult.sections, totalPages)
    : buildFallbackSkeleton({
        bookTitle,
        totalPages,
        examDate: params.examDate,
        topics: params.topics,
        outlineHints,
      });

  const title =
    params.customTitle?.trim() ||
    aiResult?.title?.trim() ||
    `${bookTitle} · Exam Prep Plan`;

  return {
    title,
    subject,
    bookTitle,
    bookSlug,
    totalPages,
    sections,
  };
}

async function loadStepSourceText(
  bookId: string,
  startPage: number,
  endPage: number,
  stepTitle: string
): Promise<string> {
  const segments = await BookSegment.find({
    bookId,
    $or: [
      { pageNumber: { $gte: startPage, $lte: endPage } },
      {
        segmentIndex: {
          $gte: Math.max(0, startPage - 1),
          $lte: Math.max(0, endPage - 1),
        },
      },
    ],
  })
    .sort({ segmentIndex: 1 })
    .limit(12)
    .lean();

  let combined = segments
    .map((s: any) => `[Page ${s.pageNumber || s.segmentIndex + 1}]\n${String(s.content || "")}`)
    .join("\n\n");

  if (!combined.trim()) {
    const fallbackSegs = await BookSegment.find({ bookId })
      .sort({ segmentIndex: 1 })
      .limit(5)
      .lean();
    combined = fallbackSegs
      .map((s: any) => `[Page ${s.pageNumber || s.segmentIndex + 1}]\n${String(s.content || "")}`)
      .join("\n\n");
  }

  return combined.slice(0, 12_000) || `Focus topic: ${stepTitle} (Pages ${startPage}–${endPage}).`;
}

function buildFallbackStepContent(
  step: StudyPlanStep,
  sourceText: string
): StudyPlanStepContent {
  const sentences = sourceText
    .replace(/\[Page \d+\]/g, "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 24);

  if (step.type === "summary") {
    return {
      kind: "summary",
      keyTakeaways: [
        sentences[0] || `Core mechanism and foundational definitions for ${step.title}.`,
        sentences[1] || `Review pages ${step.startPage}–${step.endPage} carefully for clinical correlations.`,
      ],
      highYieldNotes: sentences.slice(0, 4).length
        ? sentences.slice(0, 4)
        : [`Focus on high-yield diagnostic and mechanistic concepts in ${step.title}.`],
      clinicalPearls: [
        `Connect the core mechanism in pages ${step.startPage}–${step.endPage} to bedside presentation.`,
      ],
    };
  }

  if (step.type === "flashcards") {
    return {
      kind: "flashcards",
      cards: [
        {
          front: `What is the primary concept covered in ${step.title}?`,
          back: sentences[0] || `Key principles from pages ${step.startPage}–${step.endPage}.`,
        },
        {
          front: `Key mechanism / relationship in pages ${step.startPage}–${step.endPage}?`,
          back: sentences[1] || `Trace cause-and-effect steps outlined in ${step.title}.`,
        },
      ],
    };
  }

  if (step.type === "quiz") {
    return {
      kind: "quiz",
      questions: [
        {
          question: `Which study strategy best reinforces "${step.title}" (pp. ${step.startPage}–${step.endPage})?`,
          options: [
            "Active recall of mechanisms and diagnostic criteria from memory",
            "Passive re-reading without self-testing",
            "Skipping foundational definitions",
            "Memorizing page numbers only",
          ],
          correctIndex: 0,
          explanation:
            sentences[0] ||
            "Active recall strengthens long-term retention and clinical problem solving.",
        },
      ],
    };
  }

  return {
    kind: "reading",
    focusPoints: [
      sentences[0] || `Read pages ${step.startPage}–${step.endPage} focusing on primary mechanisms.`,
      sentences[1] || `Highlight key definitions and exceptions in ${step.title}.`,
    ],
    guidingQuestions: [
      `How do the concepts in ${step.title} connect to clinical presentation or problem solving?`,
    ],
  };
}

export async function generateStudyPlanStep(params: {
  bookId: string;
  bookTitle: string;
  language: StudyLanguage;
  step: StudyPlanStep;
}): Promise<StudyPlanStepContent> {
  const { bookId, bookTitle, language, step } = params;
  const sourceText = await loadStepSourceText(
    bookId,
    step.startPage,
    step.endPage,
    step.title
  );
  const langDirective = buildLanguageDirective(language, "json");

  const baseHeader = `You are Ascleon's Academic Study Generator.
Book: "${bookTitle}"
Step: "${step.title}" (Pages ${step.startPage}–${step.endPage})
Source Text:
${sourceText}

${langDirective}
`;

  if (step.type === "summary") {
    const prompt = `${baseHeader}
Return strict JSON:
{
  "kind": "summary",
  "keyTakeaways": ["3-5 crisp high-yield takeaways"],
  "highYieldNotes": ["4-7 detailed mechanistic/clinical notes"],
  "clinicalPearls": ["2-4 exam pearls or pitfalls"]
}`;
    const res = await callGeminiStudyPlanJson(prompt, SummaryContentSchema, 0.25);
    if (res) return { ...res, kind: "summary" };
  } else if (step.type === "flashcards") {
    const prompt = `${baseHeader}
Return strict JSON with 5-8 active-recall flashcards grounded in the source text:
{
  "kind": "flashcards",
  "cards": [{ "front": "Concise question/prompt", "back": "Accurate concise answer" }]
}`;
    const res = await callGeminiStudyPlanJson(prompt, FlashcardsContentSchema, 0.3);
    if (res) return { ...res, kind: "flashcards" };
  } else if (step.type === "quiz") {
    const prompt = `${baseHeader}
Return strict JSON with 4-6 board-style multiple-choice questions grounded in the source text:
{
  "kind": "quiz",
  "questions": [
    {
      "question": "Clinical or conceptual question stem",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Why the correct answer is right and distractors are wrong"
    }
  ]
}`;
    const res = await callGeminiStudyPlanJson(prompt, QuizContentSchema, 0.25);
    if (res) return { ...res, kind: "quiz" };
  } else {
    const prompt = `${baseHeader}
Return strict JSON for a guided active-reading session:
{
  "kind": "reading",
  "focusPoints": ["3-5 core concepts to locate while reading these pages"],
  "guidingQuestions": ["2-4 self-check questions to answer after reading"]
}`;
    const res = await callGeminiStudyPlanJson(prompt, ReadingContentSchema, 0.25);
    if (res) return { ...res, kind: "reading" };
  }

  return buildFallbackStepContent(step, sourceText);
}

export async function replanStudyPlanWithChat(params: {
  bookTitle: string;
  totalPages: number;
  language: StudyLanguage;
  currentSections: StudyPlanSection[];
  userMessage: string;
}): Promise<{
  assistantReply: string;
  diffSummary: StudyPlanDiffSummary;
  sections: StudyPlanSection[];
}> {
  const { bookTitle, totalPages, language, currentSections, userMessage } = params;
  const compactCurrent = currentSections.map((sec) => ({
    id: sec.id,
    title: sec.title,
    dayNumber: sec.dayNumber,
    topics: sec.topics,
    steps: sec.steps.map((st) => ({
      id: st.id,
      title: st.title,
      type: st.type,
      startPage: st.startPage,
      endPage: st.endPage,
      estimatedMinutes: st.estimatedMinutes,
      status: st.status,
    })),
  }));

  const langDirective = buildLanguageDirective(language, "json");
  const prompt = `You are modifying an active Exam Study Plan for "${bookTitle}" (total pages: ${totalPages}).
Current Plan Skeleton:
${JSON.stringify(compactCurrent)}

Student Request:
"${userMessage}"

${langDirective}

Rules:
- Preserve existing "id" values for unchanged or slightly adjusted steps so completed work is kept.
- Only add/remove/reorder sessions or steps as requested.
- Page numbers must stay within 1..${Math.max(1, totalPages)}.
- Return strict JSON:
{
  "assistantReply": "Brief, helpful explanation of the adjustment",
  "diffSummary": {
    "added": ["short description of any added items"],
    "changed": ["short description of any changed items"],
    "removed": ["short description of any removed items"]
  },
  "sections": [ ...same section/step skeleton shape... ]
}`;

  const aiRes = await callGeminiStudyPlanJson(prompt, ReplanOutputSchema, 0.25);
  if (aiRes) {
    const normalized = normalizeSectionsFromInput(aiRes.sections, totalPages);
    const merged = preserveStepsOnReplan(currentSections, normalized);
    return {
      assistantReply: aiRes.assistantReply,
      diffSummary: aiRes.diffSummary,
      sections: merged,
    };
  }

  // Deterministic heuristic fallback if offline/rate-limited
  const lower = userMessage.toLowerCase();
  if ((lower.includes("shorter") || lower.includes("condense") || lower.includes("fewer")) && currentSections.length > 2) {
    const kept = currentSections.slice(0, currentSections.length - 1);
    const removed = currentSections[currentSections.length - 1];
    return {
      assistantReply: `Condensed the schedule from ${currentSections.length} sessions down to ${kept.length}.`,
      diffSummary: {
        added: [],
        changed: [`Adjusted schedule to ${kept.length} sessions`],
        removed: [removed.title],
      },
      sections: kept,
    };
  }

  const nextDay = currentSections.length + 1;
  const addedSection: StudyPlanSection = {
    id: `sec_custom_${nextDay}`,
    title: `Session ${nextDay} · Focused Revision`,
    dayNumber: nextDay,
    scheduledDate: new Date(Date.now() + (nextDay - 1) * 86_400_000).toISOString().slice(0, 10),
    topics: ["Targeted Active Recall"],
    steps: [
      {
        id: `sec_custom_${nextDay}_step_1`,
        title: `Targeted Review: ${userMessage.slice(0, 50)}`,
        type: "quiz",
        startPage: 1,
        endPage: Math.max(1, totalPages),
        estimatedMinutes: 20,
        status: "pending",
        generatedContent: null,
        completedAt: null,
      },
    ],
  };

  return {
    assistantReply: `Added a targeted revision session for "${userMessage.slice(0, 60)}".`,
    diffSummary: {
      added: [addedSection.title],
      changed: [],
      removed: [],
    },
    sections: [...currentSections, addedSection],
  };
}
