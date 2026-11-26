import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { buildLanguageDirective, StudyLanguage } from "@/lib/language";
import {
  clearModelCooldown,
  FAST_GEMINI_MODEL_CHAIN,
  markModelCooldownFromError,
  orderModelsByHealth,
  PRIMARY_GEMINI_MODEL,
} from "@/lib/ai/model-cooldown";
import { buildSafeErrorResponse } from "@/lib/security/error-handler";
import { sanitizePlainText, sanitizeRichText } from "@/lib/security/sanitize";

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
  refundCredits,
  requireAuthAndCredits,
} from "@/lib/usage.server";

const SummaryRequestSchema = z.object({
  bookId: z.string().max(120).optional(),
  bookTitle: z.string().max(240).optional().default("Study Material"),
  pageNumber: z.number().int().min(1).max(10000).optional().default(1),
  pageText: z.string().max(50000).optional().default(""),
  selectedText: z.string().max(20000).optional().default(""),
  language: z.enum(["en", "ar", "mixed"]).optional().default("en"),
  studyScope: z
    .object({
      type: z.enum(["page", "range", "topic"]).default("page"),
      startPage: z.number().int().min(1).max(10000).default(1),
      endPage: z.number().int().min(1).max(10000).default(1),
      topicTitle: z.string().max(200).optional(),
      topicId: z.string().max(100).optional(),
    })
    .optional(),
  forceRefresh: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  let chargedUserId: string | null = null;
  let chargedCredits = 0;

  try {
    const authCheck = await requireAuthAndCredits(0);
    if (!authCheck.ok) return authCheck.response;

    const rawBody = await req.json().catch(() => null);
    const parsedBody = SummaryRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid summary request parameters." },
        { status: 400 }
      );
    }

    const { bookId, pageNumber, language, studyScope, forceRefresh } = parsedBody.data;
    const bookTitle = sanitizePlainText(parsedBody.data.bookTitle, 240) || "Study Material";
    const pageText = sanitizeRichText(parsedBody.data.pageText, 25000);
    const selectedText = sanitizeRichText(parsedBody.data.selectedText, 12000);

    const rawLiveText = (selectedText || pageText || "").trim();
    const hasRealLiveText = Boolean(rawLiveText) && !isPlaceholderPageText(rawLiveText);
    let focalText = rawLiveText;
    let scopeLabel = `Page ${pageNumber}`;

    const isMultiPageScope =
      Boolean(studyScope && (studyScope.type === "range" || studyScope.type === "topic"));

    if (bookId && isMultiPageScope && studyScope) {
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
    chargedUserId = authCheck.userId;
    chargedCredits = dynamicCost.total;

    const apiKey = process.env.GEMINI_API_KEY;
    let lastProviderError: unknown = null;
    if (apiKey && apiKey !== "your_gemini_api_key_here") {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { retryOptions: { attempts: 1 } },
        });
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
            lastProviderError = modelErr;
            markModelCooldownFromError(`gemini:${candidateModel}`, modelErr);
            console.warn(`[Summary] ${candidateModel} failed:`, modelErr);
          } finally {
            clearTimeout(timer);
          }
        }
      } catch (aiErr) {
        lastProviderError = aiErr;
        console.warn("AI Summary generation warning:", aiErr);
      }
    }

    if (chargedUserId && chargedCredits > 0) {
      await refundCredits(chargedUserId, chargedCredits).catch(() => {});
      chargedCredits = 0;
    }

    return buildSafeErrorResponse(
      "POST /api/summary:providers_exhausted",
      lastProviderError || new Error("All AI summary providers unavailable"),
      {
        creditsRefunded: true,
        meta: { bookId, pageNumber },
      }
    );
  } catch (error) {
    if (chargedUserId && chargedCredits > 0) {
      await refundCredits(chargedUserId, chargedCredits).catch(() => {});
    }
    return buildSafeErrorResponse("POST /api/summary", error, {
      fallbackMessage: "Unable to generate summary right now. Please try again.",
      creditsRefunded: chargedCredits > 0,
    });
  }
}
