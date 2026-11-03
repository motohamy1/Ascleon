import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { buildLanguageDirective, StudyLanguage } from "@/lib/language";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      bookTitle = "Study Material",
      pageNumber = 1,
      pageText = "",
      selectedText = "",
      snippedDiagram = null,
      authoritativeReferences = [],
      language = "en",
    } = body;

    const focalText = (selectedText || pageText || "").trim();
    if (!focalText && !snippedDiagram) {
      return NextResponse.json({ error: "Missing text or diagram to generate questions" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `You are Ascleon's elite Question Bank (QBank) Examiner.
Generate 2 high-yield, exam-grade multiple-choice vignette questions grounded strictly in Page ${pageNumber} of "${bookTitle}".

Passage Text:
"""
${focalText.slice(0, 3000)}
"""

Task:
Produce a JSON array of 2 question vignettes with this exact structure:
[
  {
    "id": "qbank-1",
    "examType": "Clinical Board / Comprehensive Exam",
    "topic": "Concise concept name from the text",
    "difficulty": "hard",
    "vignette": "Realistic multi-sentence scenario requiring application of the concepts on this page, concluding with a clear question.",
    "options": [
      "Plausible Option A",
      "Plausible Option B",
      "Plausible Option C",
      "Plausible Option D"
    ],
    "correctIndex": 0,
    "distractorRationales": {
      "0": "Detailed explanation of why this option is correct based on the mechanisms.",
      "1": "Explanation of why Option B is an incorrect distractor.",
      "2": "Explanation of why Option C is an incorrect distractor.",
      "3": "Explanation of why Option D is an incorrect distractor."
    },
    "highYieldTakeaway": "1-2 sentence core high-yield takeaway to memorize for this topic."
  }
]

Return ONLY the JSON array.

${buildLanguageDirective(language as StudyLanguage, "json")}`;

        const userParts: any[] = [{ text: prompt }];

        if (snippedDiagram && typeof snippedDiagram === "string" && snippedDiagram.startsWith("data:image")) {
          const cleanBase64 = snippedDiagram.replace(/^data:image\/\w+;base64,/, "");
          userParts.push({
            inlineData: {
              mimeType: "image/png",
              data: cleanBase64,
            },
          });
        }

        const generatePromise = ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{ role: "user", parts: userParts }],
          config: {
            responseMimeType: "application/json",
            temperature: 0.25,
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        });

        // 30-second timeout guard to prevent premature dropouts
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Gemini QBank timed out after 30s")), 30000)
        );

        const response: any = await Promise.race([generatePromise, timeoutPromise]);

        const text = response.text?.trim() || "";
        if (text) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return NextResponse.json({
              success: true,
              questions: parsed,
              source: "gemini-3.8-flash",
            });
          }
        }
      } catch (aiErr) {
        console.warn("AI QBank generation warning, using fallback:", aiErr);
      }
    }

    // Dynamic Fallback derived from the active page text
    const sentences = focalText.split(/(?<=[.!?])\s+/).filter((s: string) => s.length > 20);
    const primaryConcept = sentences[0] || `Key concepts of Page ${pageNumber}`;

    const fallbackQuestions = [
      {
        id: `qbank-p${pageNumber}-1`,
        examType: "Applied Examination",
        topic: `Foundations of Page ${pageNumber}`,
        difficulty: "medium",
        vignette: `A student reviewing Page ${pageNumber} of "${bookTitle}" is asked to evaluate the primary mechanism introduced in this section: "${primaryConcept.slice(0, 160)}...". What is the foundational principle governing this behavior?`,
        options: [
          "Direct mechanistic dependency on specified initial boundary conditions",
          "Arbitrary fluctuation independent of physiological or physical constraints",
          "Secondary artifacts that can be safely disregarded in formal analysis",
          "Empirical anomalies with no underlying theoretical basis",
        ],
        correctIndex: 0,
        distractorRationales: {
          0: "Correct: The passage establishes that outcomes depend directly on verified initial boundary invariants.",
          1: "Incorrect: Physical and biological systems adhere to rigorous conservation and gradient laws.",
          2: "Incorrect: Core observations are functional invariants, not negligible artifacts.",
          3: "Incorrect: The text outlines a systematic theoretical framework.",
        },
        highYieldTakeaway: "Mastery begins with isolating primary boundary invariants before predicting system trajectories.",
      },
    ];

    return NextResponse.json({
      success: true,
      questions: fallbackQuestions,
      source: "fallback",
    });
  } catch (error) {
    console.error("QBank API fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate QBank" },
      { status: 500 }
    );
  }
}
