import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { buildLanguageDirective, StudyLanguage } from "@/lib/language";
import {
  clearModelCooldown,
  FAST_GEMINI_MODEL_CHAIN,
  markModelCooldownFromError,
  orderModelsByHealth,
  PRIMARY_GEMINI_MODEL,
} from "@/lib/ai/model-cooldown";

export const maxDuration = 60;
import { getBookSegmentsByRange } from "@/lib/actions/book.actions";
import { retrieveFromBookRAG } from "@/lib/ai/rag/book-rag-retriever";
import { isPlaceholderPageText } from "@/lib/ai/rag/chunker";
import {
  calculateDynamicCreditCost,
  getScopePageSpan,
} from "@/lib/subscription-constants";
import {
  buildBillingErrorResponse,
  consumeCredits,
  requireAuthAndCredits,
} from "@/lib/usage.server";

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAuthAndCredits(0);
    if (!authCheck.ok) return authCheck.response;

    const body = await req.json();
    const {
      bookId,
      bookTitle = "Study Material",
      pageNumber = 1,
      pageText = "",
      selectedText = "",
      language = "en",
      studyScope,
      forceRefresh = false,
    } = body;

    const rawLiveText = (selectedText || pageText || "").trim();
    const hasRealLiveText = Boolean(rawLiveText) && !isPlaceholderPageText(rawLiveText);
    let focalText = rawLiveText;
    let scopeLabel = `Page ${pageNumber}`;

    const isMultiPageScope =
      Boolean(studyScope && (studyScope.type === "range" || studyScope.type === "topic"));

    if (bookId && isMultiPageScope) {
      try {
        const ragRes = await retrieveFromBookRAG({
          bookId,
          query: studyScope?.topicTitle || "executive summary",
          scope: studyScope,
          activePage: pageNumber,
          livePageText: rawLiveText,
          topK: 6,
        });
        if (ragRes.combinedContext) {
          focalText = ragRes.combinedContext;
          scopeLabel = studyScope.type === "topic" && studyScope.topicTitle
            ? `Topic "${studyScope.topicTitle}" (Pages ${studyScope.startPage}–${studyScope.endPage})`
            : `Pages ${studyScope.startPage}–${studyScope.endPage}`;
        } else {
          const rangeRes = await getBookSegmentsByRange(
            bookId,
            studyScope.startPage,
            studyScope.endPage
          );
          if (rangeRes.success && rangeRes.data && rangeRes.data.length > 0) {
            focalText = rangeRes.data
              .map((s) => `[Page ${s.pageNumber}]\n${s.content}`)
              .join("\n\n");
            scopeLabel = studyScope.type === "topic" && studyScope.topicTitle
              ? `Topic "${studyScope.topicTitle}" (Pages ${studyScope.startPage}–${studyScope.endPage})`
              : `Pages ${studyScope.startPage}–${studyScope.endPage}`;
          }
        }
      } catch (err) {
        console.warn("Could not fetch segments by range for Summary:", err);
      }
    } else if (bookId && !hasRealLiveText) {
      try {
        const ragRes = await retrieveFromBookRAG({
          bookId,
          query: "executive summary",
          scope: studyScope,
          activePage: pageNumber,
          livePageText: rawLiveText,
          topK: 2,
        });
        if (ragRes.combinedContext) {
          focalText = ragRes.combinedContext;
        }
      } catch (err) {
        console.warn("Could not retrieve RAG page fallback for Summary:", err);
      }
    }

    if (!focalText) {
      return NextResponse.json({ error: "Missing text to summarize" }, { status: 400 });
    }

    const dynamicCost = calculateDynamicCreditCost({
      feature: "summary",
      scopeType: studyScope?.type,
      pageSpan: getScopePageSpan(studyScope),
      forceRefresh: Boolean(forceRefresh),
    });

    const creditCheck = await consumeCredits(authCheck.userId, dynamicCost.total);
    if (!creditCheck.allowed) {
      return buildBillingErrorResponse(creditCheck, dynamicCost.total);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `You are Ascleon's Deep Study Synthesizer.
Generate an executive, high-yield summary for ${scopeLabel} of "${bookTitle}".

Passage Text:
"""
${focalText.slice(0, 4500)}
"""

Task:
Produce a JSON object with this exact shape:
{
  "executiveSummary": "2-3 crisp sentences capturing the core thesis and clinical/academic value of this page.",
  "keyTakeaways": [
    "First crucial principle or invariant from this page",
    "Second key mechanism or relationship",
    "Third practical or diagnostic application"
  ],
  "proTips": [
    "High-yield board pearl or exam rule of thumb",
    "Common trap or mistake students make on this topic"
  ],
  "mnemonics": [
    {
      "title": "Short mnemonic title",
      "mnemonic": "ACRONYM",
      "expansion": "Expansion of acronym letters",
      "notes": "Brief explanation of how this helps memory"
    }
  ]
}

Return ONLY the JSON object.

${buildLanguageDirective(language as StudyLanguage, "json")}`;

        const summaryModels = orderModelsByHealth(FAST_GEMINI_MODEL_CHAIN);
        for (let idx = 0; idx < summaryModels.length; idx++) {
          const candidateModel = summaryModels[idx];
          const timeoutMs = idx === 0 ? 15_000 : 10_000;
          const supportsThinking = !candidateModel.includes("lite");
          const thinkingBudget = candidateModel === PRIMARY_GEMINI_MODEL ? 128 : 0;
          const abortCtrl = new AbortController();
          const timer = setTimeout(() => abortCtrl.abort(), timeoutMs);
          try {
            const generatePromise = ai.models.generateContent({
              model: candidateModel,
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              config: {
                responseMimeType: "application/json",
                temperature: 0.2,
                abortSignal: abortCtrl.signal,
                ...(supportsThinking ? { thinkingConfig: { thinkingBudget } } : {}),
              },
            });

            const timeoutPromise = new Promise<never>((_, reject) =>
              abortCtrl.signal.addEventListener("abort", () =>
                reject(new Error(`Summary ${candidateModel} timed out after ${timeoutMs}ms`))
              )
            );

            const response: any = await Promise.race([generatePromise, timeoutPromise]);
            const text = response.text?.trim() || "";
            if (text) {
              const parsed = JSON.parse(text);
              clearModelCooldown(`gemini:${candidateModel}`);
              return NextResponse.json({
                success: true,
                summary: parsed,
                source: candidateModel,
                creditsCharged: dynamicCost.total,
                creditsRemaining: creditCheck.remaining,
                creditBreakdown: dynamicCost.summary,
              });
            }
          } catch (modelErr) {
            markModelCooldownFromError(`gemini:${candidateModel}`, modelErr);
            console.warn(`[Summary] ${candidateModel} failed:`, modelErr);
          } finally {
            clearTimeout(timer);
          }
        }
      } catch (aiErr) {
        console.warn("AI Summary generation warning, using fallback:", aiErr);
      }
    }

    // Dynamic Fallback
    const sentences = focalText.split(/(?<=[.!?])\s+/).filter((s: string) => s.length > 20);
    const fallback = {
      executiveSummary: sentences.slice(0, 2).join(" ") || `Core foundational concepts for Page ${pageNumber} of ${bookTitle}.`,
      keyTakeaways: [
        sentences[0] || `Foundational invariant on Page ${pageNumber}`,
        sentences[1] || "Direct relationship between physical constraints and observable behavior",
        sentences[2] || "Critical boundary condition for exams and practical application",
      ],
      proTips: [
        "Focus on the primary mechanism before analyzing secondary variations.",
        "Verify your understanding against the authoritative canonical standard.",
      ],
      mnemonics: [
        {
          title: "First Principles Anchor",
          mnemonic: "F - P - R",
          expansion: "Foundation, Process, Result",
          notes: "Trace any complex presentation back to its foundational process.",
        },
      ],
    };

    return NextResponse.json({
      success: true,
      summary: fallback,
      source: "fallback",
      creditsCharged: dynamicCost.total,
      creditsRemaining: creditCheck.remaining,
      creditBreakdown: dynamicCost.summary,
    });
  } catch (error) {
    console.error("Summary API fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate summary" },
      { status: 500 }
    );
  }
}
