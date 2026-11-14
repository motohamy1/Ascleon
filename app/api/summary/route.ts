import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { buildLanguageDirective, StudyLanguage } from "@/lib/language";
import { getBookSegmentsByRange } from "@/lib/actions/book.actions";
import { AI_CREDIT_COSTS } from "@/lib/subscription-constants";
import { requireAuthAndCredits } from "@/lib/usage.server";

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAuthAndCredits(AI_CREDIT_COSTS.SUMMARY);
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
    } = body;

    let focalText = (selectedText || pageText || "").trim();
    let scopeLabel = `Page ${pageNumber}`;

    if (bookId && studyScope && (studyScope.type === "range" || studyScope.type === "topic")) {
      try {
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
      } catch (err) {
        console.warn("Could not fetch segments by range for Summary:", err);
      }
    }

    if (!focalText) {
      return NextResponse.json({ error: "Missing text to summarize" }, { status: 400 });
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

        const generatePromise = ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            responseMimeType: "application/json",
            temperature: 0.2,
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        });

        // 30-second timeout guard to prevent premature dropouts
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Gemini Summary timed out after 30s")), 30000)
        );

        const response: any = await Promise.race([generatePromise, timeoutPromise]);

        const text = response.text?.trim() || "";
        if (text) {
          const parsed = JSON.parse(text);
          return NextResponse.json({
            success: true,
            summary: parsed,
            source: "gemini-3-flash-preview",
          });
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
    });
  } catch (error) {
    console.error("Summary API fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate summary" },
      { status: 500 }
    );
  }
}
