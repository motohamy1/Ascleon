import { NextResponse } from "next/server";
import * as agentHarness from "@/lib/ai/agent-harness";
import { runStudyAgent } from "@/lib/ai/agent-harness";
import { getBookSegmentsByRange } from "@/lib/actions/book.actions";
import {
  calculateDynamicCreditCost,
  getScopePageSpan,
} from "@/lib/subscription-constants";
import {
  buildBillingErrorResponse,
  consumeCredits,
  requireAuthAndCredits,
} from "@/lib/usage.server";
import {
  isGenericTopicTitle,
  resolveActivePageTopic,
  sanitizeStudyScope,
  sanitizeTopicCandidates,
} from "@/lib/ai/rag/topic-resolution";
import { isPlaceholderPageText, tokenizeText } from "@/lib/ai/rag/chunker";
import {
  retrieveFromBookRAG,
  type BookRagRetrievalResult,
  type RagAlignmentStatus,
} from "@/lib/ai/rag/book-rag-retriever";
import { retrieveEnrichedContext } from "@/lib/ai/knowledge/knowledge-retriever";
import type { EnrichedStudyContext } from "@/types/knowledge";

import type { StudyScope } from "@/components/reader/StudyScopeBar";

export const maxDuration = 60;

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
  socraticMode?: boolean;
  history?: Array<{
    sender?: string;
    role?: string;
    text?: string;
    content?: string;
    pageNumber?: number;
  }>;
  studyScope?: StudyScope;
  topicMap?: { topics?: unknown[] };
  stream?: boolean;
}

export async function POST(request: Request) {
  const authCheck = await requireAuthAndCredits(0);
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
    socraticMode = false,
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

  const acceptHeader = request.headers.get("accept") || "";
  const wantStream =
    Boolean(body?.stream) ||
    acceptHeader.includes("application/x-ndjson") ||
    acceptHeader.includes("text/event-stream");

  const cleanQuery = query.trim();
  const historyArray = Array.isArray(history)
    ? history.map(
        (item: {
          sender?: string;
          role?: string;
          text?: string;
          content?: string;
          pageNumber?: number;
        }) => ({
          sender: (item?.sender === "ai" || item?.role === "assistant" ? "ai" : "user") as "user" | "ai",
          text: String(item?.text || item?.content || ""),
          pageNumber:
            typeof item?.pageNumber === "number" && item.pageNumber > 0
              ? item.pageNumber
              : undefined,
        })
      )
    : [];

  const activePageNum = currentPageNumber
    ? Number(currentPageNumber)
    : Number(currentSegmentIndex) + 1;
  const livePageText = String(currentSegmentContent || "").trim();
  const hasRealLiveText = Boolean(livePageText) && !isPlaceholderPageText(livePageText);
  let effectiveScope = sanitizeStudyScope(studyScope as never, activePageNum);
  let effectiveContent = livePageText;
  let effectiveTopicLocation: {
    title: string;
    startPage: number;
    endPage: number;
    isAmbiguous?: boolean;
    candidates?: unknown[];
  } | null = null;

  // 1. EXPLICIT NAMED TOPIC MATCH IN QUERY (e.g. "Explain Pulmonary Embolism" while viewing another page)
  const referencesCurrentPage =
    /\b(this page|current page|on this page|here|this section)\b|الصفحة\s*(دي|هذه|الحالية)/i.test(
      cleanQuery
    );

  if (effectiveScope.type === "page" && !referencesCurrentPage && cleanQuery.length > 4) {
    const mapTopics = sanitizeTopicCandidates(topicMap?.topics);
    const qLower = cleanQuery.toLowerCase();
    const namedTopicMatches = mapTopics.filter((t) => {
      const tLower = t.title.toLowerCase();
      if (tLower.length >= 4 && qLower.includes(tLower)) return true;
      const tWords = tokenizeText(t.title);
      return tWords.length >= 2 && tWords.every((w) => qLower.includes(w));
    });

    if (namedTopicMatches.length === 1) {
      const matched = namedTopicMatches[0];
      effectiveScope = {
        type: "topic",
        topicTitle: matched.title,
        startPage: matched.startPage,
        endPage: matched.endPage,
        topicId: matched.id,
      };
      effectiveTopicLocation = {
        title: matched.title,
        startPage: matched.startPage,
        endPage: matched.endPage,
      };
    }
  }

  // 1b. ACTIVE TOPIC AWARENESS & AMBIGUITY CHECK (when explicitly asking for topic-wide summary)
  const isTopicSummaryIntent =
    /\b(executive\s+topic\s+summary|summarize\s+(this\s+)?topic|explain\s+(this\s+)?topic|what\s+topic\s+is\s+this)\b|اشرح\s+الموضوع|لخص\s+الموضوع/i.test(
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

  const isTopicDeepDive =
    Boolean(isTopicSummaryIntent) ||
    effectiveScope.type === "topic" ||
    effectiveScope.type === "range";

  const dynamicCost = calculateDynamicCreditCost({
    feature: "reader_assistant",
    scopeType: effectiveScope.type,
    pageSpan: getScopePageSpan(effectiveScope),
    hasVisionInput: Boolean(typeof selectedImage === "string" && selectedImage),
    isTopicDeepDive,
  });

  // 2. PARALLEL PRE-FLIGHT: Credits + Book RAG + Knowledge Enrichment
  let ragCitedPages: number[] = [];
  let ragAlignmentStatus: RagAlignmentStatus = hasRealLiveText ? "live_only" : "verified";

  const normalizedBookRefs = Array.isArray(bookReferences)
    ? bookReferences
        .map((ref) => {
          if (typeof ref === "string") return ref.trim();
          if (ref && typeof ref === "object") {
            const obj = ref as Record<string, unknown>;
            return String(obj.title || obj.source || obj.name || "").trim();
          }
          return "";
        })
        .filter((s) => Boolean(s) && s.toLowerCase() !== "[object object]")
    : [];
  const emptyEnriched: EnrichedStudyContext = {
    focalTopic: String(bookTopic || bookTitle || "General Study"),
    groundingSnippet: "",
    authoritativeReferences: [],
    qbankVignettes: [],
    mnemonics: [],
  };

  const ragPromise: Promise<BookRagRetrievalResult | null> = bookId
    ? Promise.race([
        retrieveFromBookRAG({
          bookId: String(bookId),
          query: cleanQuery,
          scope: effectiveScope,
          activePage: activePageNum,
          livePageText,
          topK: effectiveScope.type === "page" ? 2 : 6,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Book RAG lookup timed out after 2s")), 2000)
        ),
      ]).catch((ragErr) => {
        console.warn("[reader-assistant] Book RAG retrieval fallback:", ragErr);
        return null;
      })
    : Promise.resolve(null);

  const enrichedPromise: Promise<EnrichedStudyContext> = Promise.race([
    retrieveEnrichedContext({
      text: livePageText,
      query: cleanQuery,
      bookTitle: String(bookTitle || "Active Document"),
      bookTopic: String(bookTopic || ""),
      bookReferences: normalizedBookRefs,
    }).catch(() => emptyEnriched),
    new Promise<EnrichedStudyContext>((resolve) =>
      setTimeout(() => resolve(emptyEnriched), 1000)
    ),
  ]);

  const [creditCheck, ragRes, enrichedContext] = await Promise.all([
    consumeCredits(authCheck.userId, dynamicCost.total),
    ragPromise,
    enrichedPromise,
  ]);

  if (!creditCheck.allowed) {
    return buildBillingErrorResponse(creditCheck, dynamicCost.total);
  }

  if (bookId) {
    if (ragRes) {
      ragAlignmentStatus = ragRes.alignmentStatus;

      if (ragRes.combinedContext) {
        ragCitedPages = ragRes.citedPages;

        if (effectiveScope.type === "page") {
          if (hasRealLiveText) {
            const supplementarySegments = ragRes.segments.filter(
              (s) => s.pageNumber !== activePageNum
            );
            const activeMeta = ragRes.segments.find((s) => s.pageNumber === activePageNum);
            const activeHeading =
              activeMeta?.headings?.length
                ? ` [${activeMeta.headings.join(" / ")}]`
                : "";
            const activeGs =
              ragAlignmentStatus === "verified" && activeMeta?.goldStandards?.length
                ? `\n- Author-Stated Gold Standards / Primary Rules: ${activeMeta.goldStandards.join("; ")}`
                : "";
            const supplementaryBlock =
              supplementarySegments.length > 0
                ? `\n\n=== SUPPLEMENTARY BOOK CONTEXT ===\n` +
                  supplementarySegments
                    .map(
                      (s) =>
                        `--- [Page ${s.pageNumber}] ---\n${s.content}`
                    )
                    .join("\n\n")
                : "";
            effectiveContent = `=== PRIMARY ACTIVE PAGE ${activePageNum} (CURRENTLY ON STUDENT'S SCREEN)${activeHeading} ===\n${livePageText}${activeGs}${supplementaryBlock}`;
            ragCitedPages = Array.from(new Set([activePageNum, ...ragCitedPages]));
          } else {
            effectiveContent = ragRes.combinedContext;
          }
        } else {
          const activeInScope =
            activePageNum >= (effectiveScope.startPage || activePageNum) &&
            activePageNum <= (effectiveScope.endPage || activePageNum);
          if (
            hasRealLiveText &&
            activeInScope &&
            (ragAlignmentStatus !== "verified" || !ragCitedPages.includes(activePageNum))
          ) {
            effectiveContent = `=== PRIMARY ACTIVE PAGE ${activePageNum} (CURRENTLY ON STUDENT'S SCREEN) ===\n${livePageText}\n\n=== SUPPLEMENTARY BOOK CONTEXT ===\n${ragRes.combinedContext}`;
            ragCitedPages = Array.from(new Set([activePageNum, ...ragCitedPages]));
          } else {
            effectiveContent = ragRes.combinedContext;
          }
        }
      } else if (hasRealLiveText) {
        effectiveContent = `=== PRIMARY ACTIVE PAGE ${activePageNum} (CURRENTLY ON STUDENT'S SCREEN) ===\n${livePageText}`;
        ragCitedPages = [activePageNum];
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
    } else if (hasRealLiveText) {
      effectiveContent = `=== PRIMARY ACTIVE PAGE ${activePageNum} (CURRENTLY ON STUDENT'S SCREEN) ===\n${livePageText}`;
      ragCitedPages = [activePageNum];
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
    bookReferences: normalizedBookRefs,
    currentSegmentIndex: Number(currentSegmentIndex) || 0,
    currentPageNumber: activePageNum,
    currentSegmentContent: effectiveContent,
    selectedText: String(selectedText || ""),
    selectedImage: typeof selectedImage === "string" && selectedImage ? selectedImage : undefined,
    language: String(language || "en") as "en" | "ar" | "mixed",
    socraticMode: Boolean(socraticMode),
    history: historyArray,
    studyScope: effectiveScope,
    topicMap,
  };

  const buildFallbackPayload = () => {
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
            authoritativeReferences: enrichedContext.authoritativeReferences,
            qbankVignettes: enrichedContext.qbankVignettes,
            mnemonics: enrichedContext.mnemonics,
          }
        );
        if (fallbackOutput && fallbackOutput.text) {
          return {
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
            creditsCharged: dynamicCost.total,
            creditsRemaining: creditCheck.remaining,
            creditBreakdown: dynamicCost.summary,
          };
        }
      } catch (fallbackErr) {
        console.warn("Deterministic fallback execution threw, using grounded response generator:", fallbackErr);
      }
    }

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

    return {
      success: true,
      answer: fallbackAnswer,
      provider: "deterministic",
      model: "ascleon-clinical-grounding-v1",
      toolsUsed: ["deep_reference_retriever"],
      citations: [`Section ${sectionNum}`, context.bookTitle],
      authoritativeReferences: [],
      qbankVignettes: [],
      mnemonics: [],
      creditsCharged: dynamicCost.total,
      creditsRemaining: creditCheck.remaining,
      creditBreakdown: dynamicCost.summary,
    };
  };

  if (wantStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            // Stream already closed by client
          }
        };

        try {
          const output = await runStudyAgent(cleanQuery, context, {
            precomputedEnriched: enrichedContext,
            onDelta: (text) => {
              if (text) sendEvent({ type: "delta", text });
            },
          });
          const finalCitations =
            ragCitedPages.length > 0
              ? Array.from(
                  new Set([
                    ...(output.citations || []),
                    ...ragCitedPages.map((p) => `Page ${p}`),
                  ])
                )
              : output.citations;

          sendEvent({
            type: "done",
            payload: {
              success: true,
              answer: output.text,
              routedTier: output.routedTier,
              intent: output.intent,
              toolsUsed: output.toolsUsed,
              citations: finalCitations,
              generatedMorph: output.generatedMorph,
              generatedQuiz: output.generatedQuiz,
              authoritativeReferences: output.authoritativeReferences,
              qbankVignettes: output.qbankVignettes,
              mnemonics: output.mnemonics,
              topicLocation: effectiveTopicLocation || output.topicLocation,
              ragMeta: {
                alignmentStatus: ragAlignmentStatus,
                activePage: activePageNum,
                citedPages: finalCitations,
              },
              creditsCharged: dynamicCost.total,
              creditsRemaining: creditCheck.remaining,
              creditBreakdown: dynamicCost.summary,
            },
          });
        } catch (error) {
          console.error("Reader assistant streaming error, falling back gracefully:", error);
          sendEvent({ type: "done", payload: buildFallbackPayload() });
        } finally {
          try {
            controller.close();
          } catch {
            // Already closed
          }
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  }

  try {
    const output = await runStudyAgent(cleanQuery, context, {
      precomputedEnriched: enrichedContext,
    });
    const finalCitations = ragCitedPages.length > 0
      ? Array.from(new Set([...(output.citations || []), ...ragCitedPages.map((p) => `Page ${p}`)]))
      : output.citations;

    return NextResponse.json({
      success: true,
      answer: output.text,
      routedTier: output.routedTier,
      intent: output.intent,
      toolsUsed: output.toolsUsed,
      citations: finalCitations,
      generatedMorph: output.generatedMorph,
      generatedQuiz: output.generatedQuiz,
      authoritativeReferences: output.authoritativeReferences,
      qbankVignettes: output.qbankVignettes,
      mnemonics: output.mnemonics,
      topicLocation: effectiveTopicLocation || output.topicLocation,
      ragMeta: {
        alignmentStatus: ragAlignmentStatus,
        activePage: activePageNum,
        citedPages: finalCitations,
      },
      creditsCharged: dynamicCost.total,
      creditsRemaining: creditCheck.remaining,
      creditBreakdown: dynamicCost.summary,
    });
  } catch (error) {
    console.error("Reader assistant agent error, falling back gracefully:", error);
    return NextResponse.json(buildFallbackPayload(), { status: 200 });
  }
}

