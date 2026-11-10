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
        ? "Correct: Directly verified by the primary pathophysiological mechanisms."
        : "Incorrect distractor based on standard clinical evidence."),
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

/**
 * Clean extracted OCR / PDF text:
 * Strips running headers (e.g. "175 pre-eCLamPsia overvieW"), raw page numbers,
 * file names, volume markers, figure stamps, and OCR artifacts.
 */
function sanitizeStudyText(rawText: string, bookTitle: string): string {
  if (!rawText) return "";
  let text = rawText;

  // 1. Remove running headers like "175 pre-eCLamPsia overvieW" or "Page 175 Chapter 4"
  text = text.replace(/^[0-9]+\s+[A-Za-z\s-]{2,50}(overview|summary|chapter|section)?/gim, "");

  // 2. Strip book title / file name remnants if they leak into the body
  if (bookTitle && bookTitle.length > 5) {
    const cleanTitle = bookTitle.slice(0, 35).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(cleanTitle, "gi"), "");
  }

  // 3. Filter line-by-line noise
  const cleanedLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^\d+$/.test(line)) return false; // standalone page numbers
      if (/^(figure|fig\.|table)\s*\d+:?\s*$/i.test(line)) return false;
      if (/^(page|pg\.)\s*\d+$/i.test(line)) return false;
      if (/^(\.\.\.|\*\*\*|---|___)$/.test(line)) return false;
      return true;
    });

  return cleanedLines.join("\n").trim();
}

/**
 * Resilient, clean standalone fallback (used ONLY if every AI API is completely offline):
 * Never mentions book titles, page numbers, or robotic placeholder words.
 */
function buildCleanFallback(text: string, pageNumber: number, language: string) {
  const isAr = language === "ar";
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[•⇒➔■*-]\s*/, "").trim())
    .filter((l) => l.length > 25);

  const concept1 = lines[0] || "Primary clinical and pathophysiological mechanism outlined in the study text";
  const concept2 = lines[1] || "Core diagnostic criteria and defining clinical parameters";
  const concept3 = lines[2] || "First-line management protocol and targeted therapeutic intervention";

  return [
    {
      id: `qbank-p${pageNumber}-${Date.now()}-1`,
      examType: isAr ? "امتحان البورد الإكلينيكي" : "Clinical Board Examination",
      topic: isAr ? "الفسيولوجيا المرضية والآلية الأساسية" : "Pathophysiology & Core Mechanism",
      difficulty: "medium",
      vignette: isAr
        ? "مريضة تراجع العيادة بأعراض سريرية متوافقة مع هذه الحالة. ما هي الآلية الفسيولوجية المرضية الأولية المفسرة لهذه التغيرات؟"
        : "A patient presents with characteristic clinical findings consistent with this presentation. Which of the following best accounts for the primary pathophysiological mechanism underlying this condition?",
      options: [
        concept1.slice(0, 95),
        isAr ? "تكيف فسيولوجي حميد وعابر دون تأثير على الأعضاء الحيوية" : "Benign physiological adaptation with negligible end-organ consequences",
        isAr ? "فرط نشاط عصبي ذاتي موضعي دون اضطراب في الدورة الدموية الدقيقة" : "Isolated peripheral autonomic hyperactivity without microvascular endothelial involvement",
        isAr ? "تأخر غير نوعي في تصريف المعقدات المناعية الدائرة" : "Non-specific delayed clearance of circulating immune complexes",
      ],
      correctIndex: 0,
      distractorRationales: {
        0: isAr
          ? `صحيح: تؤكد الأدلة الإكلينيكية أن ${concept1.slice(0, 100)} تمثل الآلية الأولية المؤدية للمظاهر السريرية.`
          : `Correct: Clinical evidence establishes that ${concept1.slice(0, 100)} is the primary driver of this presentation.`,
        1: isAr
          ? "غير صحيح: تمثل هذه الحالة اعتلالاً وظيفياً خطيراً يتطلب المتابعة وليس مجرد تكيف حميد."
          : "Incorrect: This represents significant pathology requiring intervention rather than a benign variation.",
        2: isAr
          ? "غير صحيح: العملية المرضية تتضمن تغيرات بنيوية بطانية مباشرة وليست استجابة عصبية ذاتية معزولة."
          : "Incorrect: The process involves direct structural or endothelial alterations rather than isolated autonomic reflexes.",
        3: isAr
          ? "غير صحيح: لا يعتمد المسار المرضي الرئيسي على ترسب المعقدات المناعية هنا."
          : "Incorrect: Immune complex clearance is not the primary pathophysiological mechanism for this condition.",
      },
      highYieldTakeaway: isAr
        ? `اللؤلؤة الامتحانية: العامل الحاسم الموجه لهذا التشخيص يتركز حول: ${concept1.slice(0, 90)}.`
        : `High-Yield Pearl: The hallmark mechanism of this presentation is centered around: ${concept1.slice(0, 90)}.`,
    },
    {
      id: `qbank-p${pageNumber}-${Date.now()}-2`,
      examType: isAr ? "الاستدلال التشخيصي" : "Diagnostic Reasoning",
      topic: isAr ? "المعايير التشخيصية النوعية" : "Diagnostic Criteria & Recognition",
      difficulty: "hard",
      vignette: isAr
        ? "عند تقييم حالة مشتبه بإصابتها بهذا الاضطراب، أي من الموجودات التالية يقدم التأكيد التشخيصي الأقوى وفقاً للإرشادات المعتمدة؟"
        : "When evaluating an individual suspected of this condition, which of the following findings provides definitive diagnostic confirmation according to authoritative clinical guidelines?",
      options: [
        concept2.slice(0, 95),
        isAr ? "أعراض إجهاد غير نوعية دون وجود علامات موضوعية في الفحص السريري أو المختبري" : "Subjective generalized fatigue unaccompanied by objective physical or laboratory markers",
        isAr ? "تحسن مؤقت للأعراض بعد استخدام مسكنات الألم الروتينية" : "Transient symptomatic improvement following non-specific supportive measures alone",
        isAr ? "استجابة فسيولوجية عابرة للإجهاد تزول تلقائياً دون الحاجة لمراقبة" : "Transient physiological stress response that resolves spontaneously without monitoring",
      ],
      correctIndex: 0,
      distractorRationales: {
        0: isAr
          ? `صحيح: المعيار التشخيصي الحاسم يتطلب إثبات: ${concept2.slice(0, 100)}.`
          : `Correct: Definitive diagnostic criteria require demonstrating: ${concept2.slice(0, 100)}.`,
        1: isAr
          ? "غير صحيح: الأعراض العامة غير كافية للتشخيص بدون مؤشرات موضوعية ومحددة."
          : "Incorrect: Subjective non-specific symptoms are insufficient without meeting objective diagnostic benchmarks.",
        2: isAr
          ? "غير صحيح: التحسن السريري العابر لا يغني عن التوثيق المعياري للعلامات التشخيصية."
          : "Incorrect: Treatment response alone does not substitute for objective criteria-based confirmation.",
        3: isAr
          ? "غير صحيح: تتطلب الحالة استقصاءات دقيقة ومتابعة مستمرة لتقييم المخاطر."
          : "Incorrect: Active monitoring and objective verification are mandatory.",
      },
      highYieldTakeaway: isAr
        ? `اللؤلؤة الامتحانية: يرتكز التشخيص الدقيق على استيفاء: ${concept2.slice(0, 90)}.`
        : `High-Yield Pearl: Diagnostic confirmation relies on establishing objective evidence of: ${concept2.slice(0, 90)}.`,
    },
    {
      id: `qbank-p${pageNumber}-${Date.now()}-3`,
      examType: isAr ? "البروتوكول العلاجي" : "Clinical Management & Protocol",
      topic: isAr ? "الخط العلاجي الأول" : "First-Line Therapeutic Intervention",
      difficulty: "hard",
      vignette: isAr
        ? "في وضع الخطة العلاجية المبنية على الدليل لهذه الحالة، ما هي الخطوة الأكثر أهمية وإلحاحاً لضمان سلامة المريض؟"
        : "In formulating an evidence-based management plan for this presentation, which of the following represents the most appropriate initial priority?",
      options: [
        concept3.slice(0, 95),
        isAr ? "الانتظار والمراقبة السلبية مع تأجيل التدخل لحين حدوث مضاعفات متقدمة" : "Expectant observation with withholding of intervention until severe decompensation occurs",
        isAr ? "إعطاء جرعات تجريبية عشوائية دون مراعاة المسببات المحددة" : "Empirical high-dose monotherapy disregardful of the underlying etiology",
        isAr ? "تخريج المريض دون إجراء تصنيف دقيق لدرجة الخطورة السريرية" : "Discharge with routine outpatient follow-up without baseline risk stratification",
      ],
      correctIndex: 0,
      distractorRationales: {
        0: isAr
          ? `صحيح: توصي الإرشادات الحديثة بالبدء الفوري بـ: ${concept3.slice(0, 100)}.`
          : `Correct: Best clinical practice mandates targeted priority intervention: ${concept3.slice(0, 100)}.`,
        1: isAr
          ? "غير صحيح: تأخير التدخل العلاجي المناسب يعرض المريض لمخاطر التدهور الحاد."
          : "Incorrect: Delaying protocolized care risks irreversible organ impairment or acute decompensation.",
        2: isAr
          ? "غير صحيح: يجب توجيه العلاج نحو السبب المباشر وليس بصورة تجريبية غير مدروسة."
          : "Incorrect: Interventions must be etiology-specific rather than blind empirical monotherapy.",
        3: isAr
          ? "غير صحيح: تصنيف الخطورة وتحديد مكان الرعاية المناسب خطوة أساسية لا يمكن تجاوزها."
          : "Incorrect: Risk stratification and appropriate disposition are essential prior to discharge.",
      },
      highYieldTakeaway: isAr
        ? `اللؤلؤة الامتحانية: الإدارة العلاجية الناجحة تستوجب: ${concept3.slice(0, 90)}.`
        : `High-Yield Pearl: First-line clinical management requires immediate adherence to: ${concept3.slice(0, 90)}.`,
    },
  ];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      bookId,
      bookTitle = "Medical Study Material",
      pageNumber = 1,
      pageText = "",
      selectedText = "",
      snippedDiagram = null,
      language = "en",
      studyScope,
      excludeTopics = [],
    } = body;

    let focalText = (selectedText || pageText || "").trim();
    let citedPages: number[] = [pageNumber];

    // 1. RAG Digestion: Retrieve multi-page topic context if requested or if page text is empty
    const isMultiPageScope =
      studyScope && (studyScope.type === "topic" || studyScope.type === "range");

    if (bookId && (isMultiPageScope || !focalText)) {
      try {
        const ragRes = await retrieveFromBookRAG({
          bookId,
          query: studyScope?.topicTitle || selectedText || "high yield pathophysiology and clinical diagnosis",
          scope: studyScope,
          activePage: pageNumber,
          topK: 4,
        });

        if (ragRes.combinedContext) {
          focalText = ragRes.combinedContext;
          citedPages = ragRes.citedPages;
        }
      } catch (ragErr) {
        console.warn("[QBank API] RAG retrieval fallback:", ragErr);
      }
    }

    if (!focalText && !snippedDiagram) {
      return NextResponse.json({ error: "Missing text or diagram to generate questions" }, { status: 400 });
    }

    // 2. Sanitize extracted text: Strip OCR noise, page numbers, running headers, and raw file names
    const sanitizedText = sanitizeStudyText(focalText, bookTitle);

    const excludeDirective =
      Array.isArray(excludeTopics) && excludeTopics.length > 0
        ? `\nAvoid repeating these previously tested concepts: ${excludeTopics.join(", ")}.`
        : "";

    // 3. High-Standard Academic Board Examination Prompt (USMLE / MRCP / AMBOSS / UWorld)
    const prompt = `You are Ascleon's elite Question Bank (QBank) Examiner matching the gold standards of USMLE Step 1 & 2 CK, MRCP Part 1 / Part 2, and authoritative academic board examinations.

Clinical/Academic Source Material:
"""
${sanitizedText.slice(0, 5200)}
"""
${excludeDirective}

STRICT INVARIANTS:
1. FORBIDDEN META-LANGUAGE:
   - NEVER mention or cite book titles, file names, page numbers, or chapter headings.
   - NEVER use meta-phrases such as "According to the passage", "In this chapter", "On page X", or "During an evaluation of...".
   - The questions MUST be 100% standalone, immersive, and realistic.
2. CLINICAL CASE VIGNETTES:
   - For clinical, medical, or pathological topics, frame each question as a high-fidelity board-exam clinical vignette:
     • Patient demographics (e.g., "A 28-year-old primigravida at 34 weeks of gestation...")
     • Clinical presentation, vital signs (BP, HR, RR, temp), physical examination, or laboratory findings (e.g. urinalysis, platelets, LFTs).
     • Clear interrogative lead-in (e.g., "Which of the following is the most likely diagnosis?", "Which of the following is the primary pathophysiological mechanism underlying this condition?", "Which of the following is the most appropriate next step in management?").
   - For engineering/science/law topics, present concrete practical scenarios or design/troubleshooting constraints.
3. HIGH-CLASS CHOICES:
   - Provide exactly 4 plausible, distinct choices (A, B, C, D).
   - Every distractor must be a realistic, meaningful medical entity, differential diagnosis, or therapeutic agent.
   - NEVER use generic placeholder words or sentence fragments (e.g., NEVER use "Secondary transient artifact", "Direct dependency", or "Inversion of mechanisms").
4. FIRST-PRINCIPLE RATIONALES:
   - Provide clear, high-yield explanations for why the correct answer is right and why each specific distractor is incorrect.
5. HIGH-YIELD TAKEAWAY:
   - 1-2 sentence core exam pearl.

Produce a JSON array of 3 distinct multiple-choice questions matching this structure:
[
  {
    "id": "qbank-1",
    "examType": "Clinical Board Examination (USMLE / MRCP)",
    "topic": "Concise concept name",
    "difficulty": "medium",
    "vignette": "A 28-year-old patient presents with...",
    "options": [
      "Option A",
      "Option B",
      "Option C",
      "Option D"
    ],
    "correctIndex": 0,
    "distractorRationales": {
      "0": "Explanation why Option A is correct...",
      "1": "Explanation why Option B is incorrect...",
      "2": "Explanation why Option C is incorrect...",
      "3": "Explanation why Option D is incorrect..."
    },
    "highYieldTakeaway": "Key takeaway pearl..."
  }
]

Return ONLY the raw JSON array.
${buildLanguageDirective(language as StudyLanguage, "json")}`;

    // 4. FAST MULTI-PROVIDER CONCURRENT EXECUTION
    // Race Groq (ultra-fast ~1.5-3.5s) and Gemini (strong multimodal) concurrently!
    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    const candidateTasks: Promise<{ questions: any[]; source: string }>[] = [];

    // Candidate A: Groq (openai/gpt-oss-120b - verified working in ~3.5s)
    if (groqKey && groqKey !== "your_groq_api_key_here") {
      candidateTasks.push(
        (async () => {
          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${groqKey}`,
            },
            signal: AbortSignal.timeout(6000),
            body: JSON.stringify({
              model: "openai/gpt-oss-120b",
              messages: [
                { role: "system", content: "You are an elite academic board exam question generator. Always return valid JSON." },
                { role: "user", content: prompt },
              ],
              response_format: { type: "json_object" },
              temperature: 0.35,
            }),
          });
          if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content || "";
          const parsed = parseQuestionsJSON(content);
          if (parsed && parsed.length > 0) {
            return { questions: parsed.map(shuffleQuestionOptions), source: "groq:openai/gpt-oss-120b" };
          }
          throw new Error("Invalid Groq QBank JSON");
        })()
      );
    }

    // Candidate B: Google Gemini (models/gemini-3.5-flash - high-capacity official model)
    if (geminiKey && geminiKey !== "your_gemini_api_key_here") {
      candidateTasks.push(
        (async () => {
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

          const resp: any = await Promise.race([
            ai.models.generateContent({
              model: "models/gemini-3.5-flash",
              contents: [{ role: "user", parts: userParts }],
              config: {
                responseMimeType: "application/json",
                temperature: 0.35,
              },
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Gemini timeout 6s")), 6000)),
          ]);

          const text = resp.text?.trim() || "";
          const parsed = parseQuestionsJSON(text);
          if (parsed && parsed.length > 0) {
            return { questions: parsed.map(shuffleQuestionOptions), source: "gemini:gemini-3.5-flash" };
          }
          throw new Error("Invalid Gemini QBank JSON");
        })()
      );
    }

    // Candidate C: Groq Fast Backup (openai/gpt-oss-20b)
    if (groqKey && groqKey !== "your_groq_api_key_here") {
      candidateTasks.push(
        (async () => {
          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${groqKey}`,
            },
            signal: AbortSignal.timeout(6000),
            body: JSON.stringify({
              model: "openai/gpt-oss-20b",
              messages: [
                { role: "system", content: "You are an elite academic board exam question generator. Return valid JSON only." },
                { role: "user", content: prompt },
              ],
              response_format: { type: "json_object" },
              temperature: 0.35,
            }),
          });
          if (!res.ok) throw new Error(`Groq 20b HTTP ${res.status}`);
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content || "";
          const parsed = parseQuestionsJSON(content);
          if (parsed && parsed.length > 0) {
            return { questions: parsed.map(shuffleQuestionOptions), source: "groq:openai/gpt-oss-20b" };
          }
          throw new Error("Invalid Groq 20b JSON");
        })()
      );
    }

    // Execute fastest working candidate
    if (candidateTasks.length > 0) {
      try {
        const fastestResult = await Promise.any(candidateTasks);
        if (fastestResult && fastestResult.questions.length > 0) {
          return NextResponse.json({
            success: true,
            questions: fastestResult.questions,
            citedPages,
            source: fastestResult.source,
          });
        }
      } catch (raceErr) {
        console.warn("[QBank API] Primary fast race failed, trying OpenRouter fallback:", raceErr);
      }
    }

    // 5. OpenRouter Fallback
    if (openRouterKey && openRouterKey !== "your_openrouter_api_key_here") {
      const openRouterModels = ["google/gemma-4-31b-it:free", "nvidia/nemotron-3.5-lightning:free"];
      for (const orModel of openRouterModels) {
        try {
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openRouterKey}`,
            },
            signal: AbortSignal.timeout(5000),
            body: JSON.stringify({
              model: orModel,
              messages: [
                { role: "system", content: "You are an elite academic board exam question bank generator. Return ONLY valid JSON." },
                { role: "user", content: prompt },
              ],
              temperature: 0.35,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            const content = data.choices?.[0]?.message?.content || "";
            const parsed = parseQuestionsJSON(content);
            if (parsed && parsed.length > 0) {
              return NextResponse.json({
                success: true,
                questions: parsed.map(shuffleQuestionOptions),
                citedPages,
                source: `openrouter:${orModel}`,
              });
            }
          }
        } catch (orErr) {
          console.warn(`[QBank API] OpenRouter ${orModel} warning:`, orErr);
        }
      }
    }

    // 6. Resilient Standalone Clean Fallback
    // Guarantees clean, immersive clinical questions even during complete offline network outages
    const cleanFallback = buildCleanFallback(sanitizedText, pageNumber, language);
    return NextResponse.json({
      success: true,
      questions: cleanFallback.map(shuffleQuestionOptions),
      citedPages,
      source: "clean-offline-fallback",
    });
  } catch (error) {
    console.error("QBank API fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate QBank" },
      { status: 500 }
    );
  }
}
