import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { buildLanguageDirective, StudyLanguage } from "@/lib/language";
import { retrieveFromBookRAG } from "@/lib/ai/rag/book-rag-retriever";

function shuffleQuestionOptions(q: any) {
  if (!q || !Array.isArray(q.options) || q.options.length < 2) return q;

  const originalOptions: string[] = [...q.options];
  const originalCorrectIdx =
    typeof q.correctIndex === "number" && q.correctIndex >= 0 && q.correctIndex < originalOptions.length
      ? q.correctIndex
      : 0;
  const originalRationales: Record<string, string> = q.distractorRationales || {};

  const indexed = originalOptions.map((opt, idx) => ({
    text: opt,
    originalIdx: idx,
    rationale:
      originalRationales[String(idx)] ||
      originalRationales[idx] ||
      (idx === originalCorrectIdx
        ? "Correct: Directly verified by the primary source mechanisms."
        : "Incorrect distractor based on the provided material."),
  }));

  // Fisher-Yates shuffle
  for (let i = indexed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
  }

  const newOptions = indexed.map((item) => item.text);
  const newCorrectIdx = indexed.findIndex((item) => item.originalIdx === originalCorrectIdx);
  const newRationales: Record<string, string> = {};
  indexed.forEach((item, newIdx) => {
    newRationales[String(newIdx)] = item.rationale;
  });

  return {
    ...q,
    options: newOptions,
    correctIndex: newCorrectIdx >= 0 ? newCorrectIdx : 0,
    distractorRationales: newRationales,
  };
}

function parseQuestionsJSON(text: string): any[] | null {
  if (!text) return null;
  let cleaned = text.trim();
  // Strip markdown code fences if present
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.questions)
      ? parsed.questions
      : Array.isArray(parsed.items)
      ? parsed.items
      : null;
    return list;
  } catch {
    // Attempt to extract JSON array using regex
    const match = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
  }
  return null;
}

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

    // Ground via Universal Book RAG only for multi-page topics or when local page text is absent
    const isMultiPageScope =
      studyScope && (studyScope.type === "topic" || studyScope.type === "range");

    if (bookId && (isMultiPageScope || !focalText)) {
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

    const excludeDirective =
      Array.isArray(excludeTopics) && excludeTopics.length > 0
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
2. Ground options and rationales directly in the source text. Do NOT use generic placeholder words.
3. Return ONLY valid JSON array.

${buildLanguageDirective(language as StudyLanguage, "json")}`;

    // 1. Try Google Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && geminiKey !== "your_gemini_api_key_here") {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey });
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

        const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash"];
        for (const modelCandidate of modelsToTry) {
          try {
            const resp: any = await ai.models.generateContent({
              model: modelCandidate,
              contents: [{ role: "user", parts: userParts }],
              config: {
                responseMimeType: "application/json",
                temperature: 0.35,
              },
            });

            const text = resp.text?.trim() || "";
            const questionsList = parseQuestionsJSON(text);

            if (questionsList && questionsList.length > 0) {
              const shuffledQuestions = questionsList.map(shuffleQuestionOptions);
              return NextResponse.json({
                success: true,
                questions: shuffledQuestions,
                citedPages,
                source: modelCandidate,
              });
            }
          } catch (modelErr) {
            console.warn(`[QBank API] ${modelCandidate} failed, trying next:`, modelErr);
          }
        }
      } catch (aiErr) {
        console.warn("[QBank API] Gemini generation warning, trying fallback providers:", aiErr);
      }
    }

    // 2. Try Groq (openai/gpt-oss-120b or llama-3.3-70b-versatile)
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey && groqKey !== "your_groq_api_key_here") {
      try {
        const groqModels = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
        for (const gModel of groqModels) {
          try {
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${groqKey}`,
              },
              signal: AbortSignal.timeout(12000),
              body: JSON.stringify({
                model: gModel,
                messages: [
                  { role: "system", content: "You are an elite academic board exam question generator. Always return valid JSON." },
                  { role: "user", content: prompt },
                ],
                response_format: { type: "json_object" },
                temperature: 0.35,
              }),
            });

            if (res.ok) {
              const data = await res.json();
              const content = data.choices?.[0]?.message?.content || "";
              const questionsList = parseQuestionsJSON(content);
              if (questionsList && questionsList.length > 0) {
                const shuffledQuestions = questionsList.map(shuffleQuestionOptions);
                return NextResponse.json({
                  success: true,
                  questions: shuffledQuestions,
                  citedPages,
                  source: `groq:${gModel}`,
                });
              }
            }
          } catch (gErr) {
            console.warn(`[QBank API] Groq ${gModel} failed:`, gErr);
          }
        }
      } catch (groqErr) {
        console.warn("[QBank API] Groq provider failed, trying next:", groqErr);
      }
    }

    // 3. Try OpenRouter
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (openRouterKey && openRouterKey !== "your_openrouter_api_key_here") {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openRouterKey}`,
          },
          signal: AbortSignal.timeout(12000),
          body: JSON.stringify({
            model: "meta-llama/llama-3.3-70b-instruct:free",
            messages: [
              { role: "system", content: "You are an elite exam question bank generator. Always return valid JSON." },
              { role: "user", content: prompt },
            ],
            temperature: 0.35,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content || "";
          const questionsList = parseQuestionsJSON(content);
          if (questionsList && questionsList.length > 0) {
            const shuffledQuestions = questionsList.map(shuffleQuestionOptions);
            return NextResponse.json({
              success: true,
              questions: shuffledQuestions,
              citedPages,
              source: "openrouter",
            });
          }
        }
      } catch (orErr) {
        console.warn("[QBank API] OpenRouter provider failed:", orErr);
      }
    }

    // 4. Dynamic Resilient Fallback Synthesized from the Exact Active Text Sentences
    const rawSentences = focalText
      .split(/(?<=[.!?])\s+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 25);

    const s1 = rawSentences[0] || `Core mechanism of ${bookTitle}`;
    const s2 = rawSentences[1] || `Key diagnostic standard on ${scopeLabel}`;
    const s3 = rawSentences[2] || `Clinical implication outlined in this section`;
    const s4 = rawSentences[3] || `Protocol requirement for optimal management`;

    const rawFallbackQuestions = [
      {
        id: `qbank-p${pageNumber}-${Date.now()}-1`,
        examType: "Board Examination",
        topic: `Primary Mechanism (${scopeLabel})`,
        difficulty: "medium",
        vignette: `During an evaluation of ${scopeLabel} in "${bookTitle}", the following principle is analyzed: "${s1.slice(0, 150)}...". What is the foundational mechanism governing this outcome?`,
        options: [
          `Direct dependency on: ${s1.slice(0, 80)}`,
          `Unregulated fluctuation independent of ${bookTitle} baseline rules`,
          `Secondary transient artifact with negligible functional significance`,
          `Inversion of observed causal mechanisms described in the source passage`,
        ],
        correctIndex: 0,
        distractorRationales: {
          0: `Correct: The text explicitly states that "${s1.slice(0, 100)}..." represents the primary mechanism.`,
          1: "Incorrect: The system strictly adheres to the baseline constraints outlined in the chapter.",
          2: "Incorrect: This observation is a primary functional invariant, not a negligible artifact.",
          3: "Incorrect: Reversing the causal order contradicts the documented pathway.",
        },
        highYieldTakeaway: `Key Takeaway: Always trace downstream manifestations to "${s1.slice(0, 90)}...".`,
      },
      {
        id: `qbank-p${pageNumber}-${Date.now()}-2`,
        examType: "Applied Decision Analysis",
        topic: `Diagnostic Standard (${scopeLabel})`,
        difficulty: "hard",
        vignette: `In applying the recommendations of "${bookTitle}" to a student scenario, which statement best characterizes the core standard: "${s2.slice(0, 150)}..."?`,
        options: [
          `Gold standard alignment with: ${s2.slice(0, 80)}`,
          "Empirical observation that should be superseded by anecdotal intuition",
          "Non-specific finding that cannot guide clinical or analytical reasoning",
          "Outdated assumption explicitly contradicted by current guidelines",
        ],
        correctIndex: 0,
        distractorRationales: {
          0: `Correct: The passage establishes that "${s2.slice(0, 90)}..." is the verified standard.`,
          1: "Incorrect: Rigorous evidence-based standards must take precedence over subjective intuition.",
          2: "Incorrect: The documented criteria provide specific discriminatory value.",
          3: "Incorrect: Current reference literature confirms this invariant.",
        },
        highYieldTakeaway: `Key Takeaway: Rigorous grounding requires verification against "${s2.slice(0, 90)}...".`,
      },
      {
        id: `qbank-p${pageNumber}-${Date.now()}-3`,
        examType: "Clinical Protocol & Management",
        topic: `Actionable Management (${scopeLabel})`,
        difficulty: "hard",
        vignette: `When managing a case governed by the parameters on ${scopeLabel}, how should the student reconcile: "${s3.slice(0, 150)}..."?`,
        options: [
          `Prioritize direct targeted intervention addressing: ${s3.slice(0, 80)}`,
          "Withhold protocolized steps until secondary unverified complications manifest",
          "Apply generalized non-specific measures that disregard this finding",
          "Assume spontaneous resolution without monitoring baseline parameters",
        ],
        correctIndex: 0,
        distractorRationales: {
          0: `Correct: Management protocol directly targets the findings outlined in the primary text.`,
          1: "Incorrect: Delaying intervention introduces compounding risks.",
          2: "Incorrect: Targeted management based on source criteria yields superior outcomes.",
          3: "Incorrect: Active monitoring of boundary parameters is mandatory.",
        },
        highYieldTakeaway: `Key Takeaway: Immediate targeted management must address "${s3.slice(0, 90)}...".`,
      },
    ];

    const fallbackQuestions = rawFallbackQuestions.map(shuffleQuestionOptions);

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
