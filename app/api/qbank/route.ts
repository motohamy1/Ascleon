import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { buildLanguageDirective, StudyLanguage } from "@/lib/language";
import { retrieveFromBookRAG } from "@/lib/ai/rag/book-rag-retriever";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      bookId,
      bookTitle = "Study Material",
      pageNumber = 1,
      pageText = "",
      selectedText = "",
      snippedDiagram = null,
      language = "en",
      studyScope,
      excludeTopics = [],
    } = body;

    let focalText = (selectedText || pageText || "").trim();
    let scopeLabel = `Page ${pageNumber}`;
    let citedPages: number[] = [pageNumber];

    // Ground via Universal Book RAG if bookId is available
    if (bookId) {
      try {
        const ragRes = await retrieveFromBookRAG({
          bookId,
          query: studyScope?.topicTitle || selectedText || "high yield concepts and principles",
          scope: studyScope,
          activePage: pageNumber,
          topK: 4,
        });

        if (ragRes.combinedContext) {
          focalText = ragRes.combinedContext;
          citedPages = ragRes.citedPages;
          scopeLabel = ragRes.detectedTopic
            ? `Topic "${ragRes.detectedTopic}" (Pages ${citedPages.join(", ")})`
            : studyScope?.type === "topic" && studyScope.topicTitle
            ? `Topic "${studyScope.topicTitle}" (Pages ${studyScope.startPage}–${studyScope.endPage})`
            : studyScope?.type === "range"
            ? `Pages ${studyScope.startPage}–${studyScope.endPage}`
            : `Page ${pageNumber}`;
        }
      } catch (ragErr) {
        console.warn("[QBank API] RAG retrieval fallback:", ragErr);
      }
    }

    if (!focalText && !snippedDiagram) {
      return NextResponse.json({ error: "Missing text or diagram to generate questions" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const excludeDirective = Array.isArray(excludeTopics) && excludeTopics.length > 0
          ? `\nAvoid repeating these previously tested concepts: ${excludeTopics.join(", ")}.`
          : "";

        const prompt = `You are Ascleon's elite Question Bank (QBank) Examiner across all academic and scientific disciplines.
Generate 4-5 high-yield, exam-grade multiple-choice practice questions grounded strictly in ${scopeLabel} of "${bookTitle}".
${excludeDirective}

Passage Context:
"""
${focalText.slice(0, 5500)}
"""

Task:
Produce a JSON array of 4-5 distinct multiple-choice questions with this exact structure:
[
  {
    "id": "qbank-1",
    "examType": "Clinical Board / Comprehensive Exam",
    "topic": "Concise concept name from the text",
    "difficulty": "hard",
    "vignette": "Realistic multi-sentence scenario requiring application of the concepts in this section, concluding with a clear question.",
    "options": [
      "Plausible Option A",
      "Plausible Option B",
      "Plausible Option C",
      "Plausible Option D"
    ],
    "correctIndex": 0,
    "distractorRationales": {
      "0": "Detailed explanation of why this option is correct based on the mechanisms and principles.",
      "1": "Explanation of why Option B is an incorrect distractor.",
      "2": "Explanation of why Option C is an incorrect distractor.",
      "3": "Explanation of why Option D is an incorrect distractor."
    },
    "highYieldTakeaway": "1-2 sentence core high-yield takeaway grounded in the source study."
  }
]

Requirements:
1. Cover diverse angles: Mechanism, Diagnostic/Analytical Rule, Edge Case, and Gold-Standard/First-Line Protocol.
2. Ground options and rationales in the source text.
3. Return ONLY the JSON array (or object with 'questions' array).

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

        // Try gemini-2.5-flash first, then gemini-2.0-flash
        const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash"];
        for (const modelCandidate of modelsToTry) {
          try {
            const resp: any = await ai.models.generateContent({
              model: modelCandidate,
              contents: [{ role: "user", parts: userParts }],
              config: {
                responseMimeType: "application/json",
                temperature: 0.3,
              },
            });

            const text = resp.text?.trim() || "";
            if (text) {
              const parsed = JSON.parse(text);
              const questionsList = Array.isArray(parsed)
                ? parsed
                : Array.isArray(parsed.questions)
                ? parsed.questions
                : null;

              if (questionsList && questionsList.length > 0) {
                return NextResponse.json({
                  success: true,
                  questions: questionsList,
                  citedPages,
                  source: modelCandidate,
                });
              }
            }
          } catch (modelErr) {
            console.warn(`[QBank API] ${modelCandidate} failed, trying next:`, modelErr);
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
        topic: `Foundations of ${scopeLabel}`,
        difficulty: "medium",
        vignette: `A student reviewing ${scopeLabel} of "${bookTitle}" is asked to evaluate the primary principle: "${primaryConcept.slice(0, 160)}...". What is the foundational invariant governing this behavior?`,
        options: [
          "Direct mechanistic dependency on specified initial boundary conditions",
          "Arbitrary fluctuation independent of domain constraints",
          "Secondary artifacts that can be safely disregarded in formal analysis",
          "Empirical anomalies with no underlying theoretical basis",
        ],
        correctIndex: 0,
        distractorRationales: {
          0: "Correct: The passage establishes that outcomes depend directly on verified initial boundary invariants.",
          1: "Incorrect: Physical, computational, and biological systems adhere to rigorous conservation laws.",
          2: "Incorrect: Core observations are functional invariants, not negligible artifacts.",
          3: "Incorrect: The text outlines a systematic theoretical framework.",
        },
        highYieldTakeaway: "Mastery begins with isolating primary boundary invariants before predicting system trajectories.",
      },
      {
        id: `qbank-p${pageNumber}-2`,
        examType: "Applied Examination",
        topic: `Operational Analysis of ${scopeLabel}`,
        difficulty: "hard",
        vignette: `In analyzing the core methodology presented in "${bookTitle}" for this section, how should conflicting assumptions be resolved according to the author?`,
        options: [
          "Strict verification against empirical baseline standards stated in the text",
          "Accepting speculative claims without baseline validation",
          "Defaulting to extraneous opinions from unrelated disciplines",
          "Ignoring observed discrepancies when applying formulas",
        ],
        correctIndex: 0,
        distractorRationales: {
          0: "Correct: The source text prioritizes baseline empirical validation as the gold standard.",
          1: "Incorrect: Unverified speculation introduces compounding errors.",
          2: "Incorrect: Cross-disciplinary contamination compromises rigorous grounding.",
          3: "Incorrect: Discrepancies must be reconciled against the source data.",
        },
        highYieldTakeaway: "Always reconcile conflicting assumptions against verified empirical baselines.",
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
