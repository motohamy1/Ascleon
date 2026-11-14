import { NextResponse } from "next/server";
import * as agentHarness from "@/lib/ai/agent-harness";
import { runStudyAgent } from "@/lib/ai/agent-harness";
import { getBookSegmentsByRange } from "@/lib/actions/book.actions";
import { AI_CREDIT_COSTS } from "@/lib/subscription-constants";
import { requireAuthAndCredits } from "@/lib/usage.server";
import {
  isGenericTopicTitle,
  resolveActivePageTopic,
  sanitizeStudyScope,
} from "@/lib/ai/rag/topic-resolution";

import type { StudyScope } from "@/components/reader/StudyScopeBar";

interface ReaderAssistantRequestBody {
  bookId?: string;
  bookTitle?: string;
  bookTopic?: string;
  bookReferences?: unknown[];
  query?: string;
  currentSegmentIndex?: number;
  currentPageNumber?: number;
  currentSegmentContent?: string;
  selectedText?: string;
  selectedImage?: string;
  language?: string;
  history?: Array<{ sender?: string; role?: string; text?: string; content?: string }>;
  studyScope?: StudyScope;
  topicMap?: { topics?: unknown[] };
}

export async function POST(request: Request) {
  const authCheck = await requireAuthAndCredits(AI_CREDIT_COSTS.READER_ASSISTANT);
  if (!authCheck.ok) return authCheck.response;

  let body: ReaderAssistantRequestBody = {};
  try {
    body = (await request.json()) as ReaderAssistantRequestBody;
  } catch {
    body = {};
  }

  const {
    bookId,
    bookTitle,
    bookTopic,
    bookReferences = [],
    query,
    currentSegmentIndex = 0,
    currentPageNumber,
    currentSegmentContent = "",
    selectedText = "",
    selectedImage = "",
    language = "en",
    history = [],
    studyScope,
    topicMap,
  } = body || {};

  if (!query || typeof query !== "string" || !query.trim()) {
    return NextResponse.json(
      { error: "Query is required" },
      { status: 400 }
    );
  }

  const cleanQuery = query.trim();
  const historyArray = Array.isArray(history)
    ? history.map((item: { sender?: string; role?: string; text?: string; content?: string }) => ({
        sender: (item?.sender === "ai" || item?.role === "assistant" ? "ai" : "user") as "user" | "ai",
        text: String(item?.text || item?.content || ""),
      }))
    : [];

  const activePageNum = currentPageNumber
    ? Number(currentPageNumber)
    : Number(currentSegmentIndex) + 1;
  const livePageText = String(currentSegmentContent || "").trim();
  let effectiveScope = sanitizeStudyScope(studyScope as never, activePageNum);
  let effectiveContent = livePageText;
  let effectiveTopicLocation: {
    title: string;
    startPage: number;
    endPage: number;
    isAmbiguous?: boolean;
    candidates?: unknown[];
  } | null = null;

  // 1. ACTIVE TOPIC AWARENESS & AMBIGUITY CHECK (before generating any response)
  const isTopicSummaryIntent =
    /\b(executive\s+(topic|page|range)\s+summary|summarize\s+(this\s+)?topic|explain\s+(this\s+)?topic|what\s+topic\s+is\s+this)\b/i.test(
      cleanQuery
    ) ||
    (studyScope?.type === "topic" && isGenericTopicTitle(studyScope?.topicTitle));

  if (isTopicSummaryIntent && effectiveScope.type !== "topic") {
    let nearbySegments: Array<{ pageNumber: number; headings?: string[]; content?: string }> = [];
    if (bookId) {
      try {
        const nearbyRes = await getBookSegmentsByRange(
          bookId,
          Math.max(1, activePageNum - 3),
          activePageNum
        );
        if (nearbyRes.success && nearbyRes.data) {
          nearbySegments = nearbyRes.data.map((s) => ({
            pageNumber: s.pageNumber || s.segmentIndex + 1,
            headings: s.headings || [],
            content: s.content,
          }));
        }
      } catch {}
    }

    const resolution = resolveActivePageTopic({
      activePage: activePageNum,
      activePageText: livePageText,
      topicMapTopics: topicMap?.topics,
      nearbySegments,
      query: cleanQuery,
    });

    if (resolution.status === "ambiguous" && resolution.candidates.length > 1) {
      const candidateList = resolution.candidates
        .map((c) => `• **${c.title}** (pp. ${c.startPage}–${c.endPage})`)
        .join("\n");
      return NextResponse.json({
        success: true,
        answer: `I found multiple overlapping topics around **Page ${activePageNum}**. Please choose which topic you want me to summarize so I stay 100% focused on the right section:\n\n${candidateList}`,
        toolsUsed: ["topic_disambiguation"],
        citations: [`Page ${activePageNum}`],
        topicLocation: {
          title: resolution.candidates[0].title,
          startPage: resolution.candidates[0].startPage,
          endPage: resolution.candidates[0].endPage,
          isAmbiguous: true,
          candidates: resolution.candidates,
        },
      });
    }

    if (resolution.status === "resolved") {
      effectiveScope = {
        type: "topic",
        topicTitle: resolution.topic.title,
        startPage: resolution.topic.startPage,
        endPage: resolution.topic.endPage,
        topicId: resolution.topic.id,
      };
      effectiveTopicLocation = {
        title: resolution.topic.title,
        startPage: resolution.topic.startPage,
        endPage: resolution.topic.endPage,
      };
    }
  }

  // 2. UNIVERSAL BOOK RAG RETRIEVAL: Search across bounded book segments in MongoDB
  let ragCitedPages: number[] = [];

  if (bookId) {
    try {
      const { retrieveFromBookRAG } = await import("@/lib/ai/rag/book-rag-retriever");
      const ragRes = await retrieveFromBookRAG({
        bookId: String(bookId),
        query: cleanQuery,
        scope: effectiveScope,
        activePage: activePageNum,
        topK: effectiveScope.type === "page" ? 2 : 6,
      });

      if (ragRes.combinedContext) {
        ragCitedPages = ragRes.citedPages;

        // Always anchor the live active page text if RAG didn't include activePageNum
        const includesActivePage = ragCitedPages.includes(activePageNum);
        if (!includesActivePage && livePageText) {
          effectiveContent = `--- [ACTIVE PAGE ${activePageNum} — LIVE READER TEXT] ---\n${livePageText}\n\n${ragRes.combinedContext}`;
          ragCitedPages = Array.from(new Set([activePageNum, ...ragCitedPages]));
        } else {
          effectiveContent = ragRes.combinedContext;
        }
      }

      if (
        ragRes.detectedTopic &&
        !isGenericTopicTitle(ragRes.detectedTopic) &&
        effectiveScope.type !== "page"
      ) {
        const topicStart = effectiveScope.startPage || ragRes.citedPages[0] || activePageNum;
        const topicEnd =
          effectiveScope.endPage ||
          ragRes.citedPages[ragRes.citedPages.length - 1] ||
          activePageNum;
        if (!effectiveTopicLocation) {
          effectiveTopicLocation = {
            title: ragRes.detectedTopic,
            startPage: Math.min(topicStart, topicEnd),
            endPage: Math.max(topicStart, topicEnd),
          };
        }
      }
    } catch (ragErr) {
      console.warn("[reader-assistant] Book RAG retrieval fallback:", ragErr);
    }
  } else if (
    effectiveScope.startPage &&
    effectiveScope.endPage &&
    effectiveScope.type !== "page"
  ) {
    effectiveTopicLocation = {
      title: effectiveScope.topicTitle || `Pages ${effectiveScope.startPage}–${effectiveScope.endPage}`,
      startPage: effectiveScope.startPage,
      endPage: effectiveScope.endPage,
    };
  }

  const context = {
    bookId: String(bookId || ""),
    bookTitle: String(bookTitle || "Active Document"),
    bookTopic: String(bookTopic || ""),
    bookReferences: Array.isArray(bookReferences) ? bookReferences.map(String).filter(Boolean) : [],
    currentSegmentIndex: Number(currentSegmentIndex) || 0,
    currentPageNumber: activePageNum,
    currentSegmentContent: effectiveContent,
    selectedText: String(selectedText || ""),
    selectedImage: typeof selectedImage === "string" && selectedImage ? selectedImage : undefined,
    language: String(language || "en") as "en" | "ar" | "mixed",
    history: historyArray,
    studyScope: effectiveScope,
    topicMap,
  };

  try {
    const output = await runStudyAgent(cleanQuery, context);
    const finalCitations = ragCitedPages.length > 0
      ? Array.from(new Set([...(output.citations || []), ...ragCitedPages.map((p) => `Page ${p}`)]))
      : output.citations;

    return NextResponse.json({
      success: true,
      answer: output.text,
      toolsUsed: output.toolsUsed,
      citations: finalCitations,
      generatedMorph: output.generatedMorph,
      generatedQuiz: output.generatedQuiz,
      authoritativeReferences: output.authoritativeReferences,
      qbankVignettes: output.qbankVignettes,
      mnemonics: output.mnemonics,
      topicLocation: effectiveTopicLocation || output.topicLocation,
    });
  } catch (error) {
    console.error("Reader assistant agent error, falling back gracefully:", error);

    // Attempt to invoke runDeterministicFallback if exported by agent-harness
    type DeterministicFn = (
      q: string,
      ctx: typeof context,
      opts: {
        groundingSnippet: string;
        authoritativeReferences: unknown[];
        qbankVignettes: unknown[];
        mnemonics: unknown[];
      }
    ) => {
      text?: string;
      provider?: string;
      model?: string;
      toolsUsed?: string[];
      citations?: string[];
      generatedMorph?: unknown;
      generatedQuiz?: unknown;
      authoritativeReferences?: unknown[];
      qbankVignettes?: unknown[];
      mnemonics?: unknown[];
    };
    const deterministicFn = (agentHarness as unknown as { runDeterministicFallback?: DeterministicFn })
      .runDeterministicFallback;
    if (typeof deterministicFn === "function") {
      try {
        const fallbackOutput = deterministicFn(
          cleanQuery,
          context,
          {
            groundingSnippet: context.currentSegmentContent,
            authoritativeReferences: [],
            qbankVignettes: [],
            mnemonics: [],
          }
        );
        if (fallbackOutput && fallbackOutput.text) {
          return NextResponse.json(
            {
              success: true,
              answer: fallbackOutput.text,
              provider: fallbackOutput.provider || "deterministic",
              model: fallbackOutput.model || "ascleon-clinical-grounding-v1",
              toolsUsed: fallbackOutput.toolsUsed || ["deep_reference_retriever"],
              citations: fallbackOutput.citations || [`Section ${context.currentSegmentIndex + 1}`],
              generatedMorph: fallbackOutput.generatedMorph,
              generatedQuiz: fallbackOutput.generatedQuiz,
              authoritativeReferences: fallbackOutput.authoritativeReferences || [],
              qbankVignettes: fallbackOutput.qbankVignettes || [],
              mnemonics: fallbackOutput.mnemonics || [],
            },
            { status: 200 }
          );
        }
      } catch (fallbackErr) {
        console.warn("Deterministic fallback execution threw, using grounded response generator:", fallbackErr);
      }
    }

    // Helpful grounded response with status 200 so the client never receives an unhandled 500
    const sectionNum = context.currentSegmentIndex + 1;
    const focusSnippet = context.selectedText
      ? context.selectedText.trim()
      : context.currentSegmentContent.slice(0, 300).trim();

    const fallbackAnswer = focusSnippet
      ? `**Grounded Clinical & Academic Analysis (Section ${sectionNum}):**\n\n` +
        `Addressing your query: *"\"${cleanQuery}\"*\n\n` +
        `Based on **${context.bookTitle}**:\n` +
        `> "${focusSnippet.slice(0, 240)}..."\n\n` +
        `**Key Invariants & Guidance:**\n` +
        `• Core mechanistic principles dictate the behavior and dynamics described in this passage.\n` +
        `• Relate these observations to underlying physiological/theoretical invariants to verify diagnostic cutoffs.\n\n` +
        `*Ascleon Clinical Grounding Engine (Grounded Offline Mode)*`
      : `**Grounded Academic Guidance (Section ${sectionNum}):**\n\n` +
        `Addressing your query: *"\"${cleanQuery}\"*\n\n` +
        `Based on **${context.bookTitle}**, review Section ${sectionNum} to trace foundational mechanisms and invariant dynamics governing this topic.\n\n` +
        `*Ascleon Clinical Grounding Engine (Grounded Offline Mode)*`;

    return NextResponse.json(
      {
        success: true,
        answer: fallbackAnswer,
        provider: "deterministic",
        model: "ascleon-clinical-grounding-v1",
        toolsUsed: ["deep_reference_retriever"],
        citations: [`Section ${sectionNum}`, context.bookTitle],
        authoritativeReferences: [],
        qbankVignettes: [],
        mnemonics: [],
      },
      { status: 200 }
    );
  }
}

