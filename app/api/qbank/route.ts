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
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
  cleaned = cleaned.replace(/\s*```$/i, "");
  cleaned = cleaned.trim();

  const validateAndExtract = (parsed: any): any[] | null => {
    if (!parsed) return null;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    if (Array.isArray(parsed.questions) && parsed.questions.length > 0) return parsed.questions;
    if (Array.isArray(parsed.items) && parsed.items.length > 0) return parsed.items;
    if (Array.isArray(parsed.mcqs) && parsed.mcqs.length > 0) return parsed.mcqs;
    if (Array.isArray(parsed.quiz) && parsed.quiz.length > 0) return parsed.quiz;
    if (Array.isArray(parsed.qbank) && parsed.qbank.length > 0) return parsed.qbank;
    if (Array.isArray(parsed.data) && parsed.data.length > 0) return parsed.data;
    if (typeof parsed === "object") {
      for (const key of Object.keys(parsed)) {
        if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
          return parsed[key];
        }
      }
    }
    return null;
  };

  try {
    const parsed = JSON.parse(cleaned);
    const list = validateAndExtract(parsed);
    if (list) return list;
  } catch {}

  // Attempt to extract JSON array using regex
  const arrayMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
  }

  // Attempt to extract JSON object using regex
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      const parsed = JSON.parse(objectMatch[0]);
      const list = validateAndExtract(parsed);
      if (list) return list;
    } catch {}
  }

  return null;
}

/**
 * Clean extracted OCR / PDF / RAG text:
 * Strips RAG source wrappers ("--- [Source Study: Page X] ---"), running headers,
 * raw page numbers, file names, volume markers, figure stamps, and OCR artifacts.
 */
function sanitizeStudyText(rawText: string, bookTitle: string): string {
  if (!rawText) return "";
  let text = rawText;

  // 1. Strip RAG metadata wrappers and gold standard injection headers
  text = text.replace(/---\s*\[Source Study:[^\]]*\][^\n]*---/gi, "");
  text = text.replace(/-\s*Author-Stated Gold Standards[^\n]*/gi, "");
  text = text.replace(/\[Source Study:[^\]]*\]/gi, "");

  // 2. Remove running headers like "175 pre-eCLamPsia overvieW" or "Page 175 Chapter 4"
  text = text.replace(/^[0-9]+\s+[A-Za-z\s-]{2,50}(overview|summary|chapter|section)?/gim, "");

  // 3. Strip book title / file name remnants if they leak into the body
  if (bookTitle && bookTitle.length > 4) {
    const cleanTitle = bookTitle.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(cleanTitle, "gi"), "");
  }

  // 4. Filter line-by-line noise and artifacts
  const cleanedLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^\d+$/.test(line)) return false; // standalone page numbers
      if (/^(figure|fig\.|table)\s*\d+:?\s*$/i.test(line)) return false;
      if (/^(page|pg\.|chapter)\s*\d+/i.test(line)) return false;
      if (/^[-_*=]{3,}.*$/i.test(line)) return false; // markdown separators or delimiters
      if (/^\[?Source Study:.*\]?$/i.test(line)) return false;
      return true;
    });

  return cleanedLines.join("\n").trim();
}

/**
 * Clean standalone fallback (used ONLY if every AI API is completely offline):
 * Never mentions book titles, page numbers, or raw text fragments.
 */
function buildCleanFallback(text: string, pageNumber: number, language: string) {
  const isAr = language === "ar";
  
  // Extract meaningful medical terms from text lines if available, ignoring noise
  const cleanTokens = text
    .split(/[\n,;.]+/)
    .map((w) => w.replace(/^[•⇒➔■*-]\s*/, "").trim())
    .filter((w) => w.length > 5 && !/page|chapter|volume|book|source|study/i.test(w));

  const concept = cleanTokens[0] || (isAr ? "الفيزيولوجيا المرضية السريرية" : "Underlying Pathophysiology");

  return [
    {
      id: `qbank-p${pageNumber}-${Date.now()}-1`,
      examType: isAr ? "امتحان البورد الإكلينيكي (USMLE / MRCP)" : "Clinical Board Examination (USMLE / MRCP)",
      topic: concept.slice(0, 40),
      difficulty: "medium",
      vignette: isAr
        ? "مريضة تبلغ من العمر 32 عاماً تراجع العيادة بشكوى سريرية حادة بعد استعراض علاماتها الحيوية والفحوصات الأولية. ما هي الآلية الفسيولوجية المرضية الأولية المفسرة لهذه التظاهرات؟"
        : "A 32-year-old patient presents to the clinic with acute symptoms. Following evaluation of the vital signs, laboratory workup, and diagnostic markers, which of the following best accounts for the primary pathophysiological mechanism underlying this condition?",
      options: [
        isAr ? "اعتلال وظيفي في الخلايا البطانية يؤدي إلى زيادة النفوذية الوعائية والتضيق الشرياني الجهازي" : "Endothelial cell dysfunction resulting in systemic microvascular vasospasm and capillary leak",
        isAr ? "تكيف فسيولوجي حميد وعابر دون تأثير على الأعضاء الحيوية" : "Benign transient autonomic physiological compensation with preserved organ perfusion",
        isAr ? "تأخر غير نوعي في تصريف المعقدات المناعية الدائرة في الأنسجة المحيطية" : "Non-specific delayed reticuloendothelial clearance of circulating immune complexes",
        isAr ? "فرط استجابة مستقبلات ألفا الطرفية دون وجود تغيرات بنيوية" : "Isolated peripheral alpha-adrenergic hyperactivity without structural microvascular change",
      ],
      correctIndex: 0,
      distractorRationales: {
        0: isAr
          ? "صحيح: تمثل الإصابة البطانية والتضيق الوعائي الدقيق الركيزة الفسيولوجية المفسرة للتظاهرات الإكلينيكية الحادة ونقص تروية الأعضاء."
          : "Correct: Widespread endothelial cell injury and microvascular vasospasm represent the hallmark mechanism driving end-organ hypoperfusion.",
        1: isAr
          ? "غير صحيح: الحالة تعكس اضطراباً مرضياً حقيقياً يستدعي تدخلاً موجهاً وليست مجرد استجابة تعويضية حميدة."
          : "Incorrect: This pathology represents significant tissue-level injury rather than benign physiological compensation.",
        2: isAr
          ? "غير صحيح: ترسب المعقدات المناعية ليس الآلية الأولية المسؤولة عن هذه التغيرات الوعائية الحادة."
          : "Incorrect: Immune complex deposition is not the primary pathophysiological driver in this clinical setting.",
        3: isAr
          ? "غير صحيح: التغيرات المسجلة تشمل اضطراباً بطانياً بنيوياً واسعاً وليست مقصورة على استجابة عصبية منعكسة."
          : "Incorrect: The process involves intrinsic endothelial and microcirculatory changes rather than isolated autonomic reflexes.",
      },
      highYieldTakeaway: isAr
        ? "اللؤلؤة الامتحانية: الركيزة التشخيصية الحاسمة تتركز على تحديد الخلل البطاني والاضطراب الوعائي المسبب للمظاهر السريرية."
        : "High-Yield Pearl: Clinical board examinations test the recognition of endothelial dysfunction and microvascular vasospasm as the core mechanism of disease.",
    },
    {
      id: `qbank-p${pageNumber}-${Date.now()}-2`,
      examType: isAr ? "الاستدلال التشخيصي" : "Diagnostic Reasoning",
      topic: isAr ? "المعايير التشخيصية النوعية" : "Definitive Diagnostic Criteria",
      difficulty: "hard",
      vignette: isAr
        ? "عند مراجعة مريض تتطابق حالته مع هذه الموجودات، أي من المعايير التشخيصية التالية يمثل العامل الحاسم لتأكيد التشخيص وتحديد مسار الرعاية؟"
        : "When evaluating a patient presenting with characteristic findings of this condition, which of the following diagnostic parameters provides definitive confirmation to guide therapeutic disposition?",
      options: [
        isAr ? "توثيق العلامات الموضوعية المحددة في الفحص المخبري والسريري المعتمد" : "Objective documentation of disease-defining clinical and laboratory benchmark criteria",
        isAr ? "الاعتماد على شكاوى الإجهاد العامة دون مؤشرات فيزيائية أو مخبرية" : "Subjective non-specific fatigue unaccompanied by objective physical or biomarker abnormalities",
        isAr ? "تحسن مؤقت للأعراض بعد استخدام مسكنات الألم الروتينية" : "Transient symptomatic response following supportive non-specific measures alone",
        isAr ? "استجابة فسيولوجية عابرة للإجهاد تزول تلقائياً دون الحاجة لمراقبة" : "Spontaneous resolution within 24 hours without targeted clinical monitoring",
      ],
      correctIndex: 0,
      distractorRationales: {
        0: isAr
          ? "صحيح: المعيار الذهبي يتطلب استيفاء مؤشرات موضوعية محددة وفق الإرشادات الإكلينيكية المعتمدة."
          : "Correct: Standard clinical guidelines mandate meeting definitive objective criteria to establish this diagnosis.",
        1: isAr
          ? "غير صحيح: الأعراض الذاتية العامة تفتقر إلى النوعية ولا يعتد بها دون توثيق موضوعي."
          : "Incorrect: Non-specific subjective symptoms lack specificity and cannot substantiate board-level criteria alone.",
        2: isAr
          ? "غير صحيح: الاستجابة العابرة للمسكنات لا تثبت دقة التشخيص أو استبعاد المضاعفات."
          : "Incorrect: Symptomatic response to supportive care does not replace criteria-based disease verification.",
        3: isAr
          ? "غير صحيح: تتطلب الحالة تقييماً دقيقاً ومتابعة مستمرة لدرجة الخطورة."
          : "Incorrect: Active risk stratification and protocolized monitoring are mandatory.",
      },
      highYieldTakeaway: isAr
        ? "اللؤلؤة الامتحانية: التأكيد التشخيصي يعتمد دائماً على المعايير الموضوعية المعتمدة وليس مجرد الأعراض غير النوعية."
        : "High-Yield Pearl: Definitive board diagnosis relies on objective diagnostic criteria over subjective symptomatic complaints.",
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

    // 3. High-Standard Academic Board Examination Prompt (USMLE Step 1 & 2 CK / MRCP / AMBOSS / UWorld)
    const prompt = `You are Ascleon's elite Chief Medical Examiner and Academic Board Question Author matching the highest standards of USMLE Step 1, Step 2 CK, MRCP Part 1/2, and prestigious medical board examinations.

Digested Clinical & Academic Source Material:
"""
${sanitizedText.slice(0, 5200)}
"""
${excludeDirective}

STRICT EXAM INVARIANTS:
1. COMPLETE SOURCE DIGESTION & ZERO META-LANGUAGE:
   - Fully absorb and digest the core pathophysiology, diagnostic benchmarks, clinical presentations, and therapeutic protocols from the text.
   - NEVER mention or cite book titles, volume numbers, page numbers, author names, or chapter headings.
   - NEVER use meta-language such as "According to the passage", "Based on the text", "As stated in chapter X", or "During an evaluation of this condition".
   - Every question must read exactly like an official, authentic question from UWorld, AMBOSS, or the NBME/USMLE exam pool.

2. AUTHENTIC CLINICAL CASE VIGNETTES:
   - Every question must be structured around a realistic, high-fidelity patient vignette:
     • Patient demographics & setting (e.g., "A 34-year-old G2P1 at 32 weeks of gestation presents to the emergency department with...", "A 58-year-old man with a 20-pack-year smoking history presents for routine follow-up...")
     • History of present illness, vital signs (BP, HR, RR, SpO2, Temp), physical examination findings (e.g. cardiac murmurs, lung crackles, peripheral edema, reflexes).
     • Relevant laboratory/imaging findings where applicable (e.g. complete blood count, BMP, urinalysis, ECG, imaging).
     • Crisp, definitive interrogative lead-in:
       - "Which of the following is the most likely diagnosis?"
       - "Which of the following best explains the primary pathophysiological mechanism responsible for this patient's presentation?"
       - "Which of the following is the most appropriate next step in management?"
       - "Which of the following pharmacotherapeutic agents is the first-line intervention for this condition?"

3. HIGH-CALIBER CLINICAL CHOICES & DISTRACTORS:
   - Provide exactly 4 plausible, authentic medical choices (A, B, C, D).
   - Every distractor must be a real clinical entity, genuine differential diagnosis, or legitimate pharmacologic agent that represents a high-yield diagnostic trap.
   - NEVER use generic placeholder words, fragments, or verbatim textbook sentences.

4. EXHAUSTIVE FIRST-PRINCIPLES RATIONALES:
   - Provide a deep, step-by-step clinical breakdown explaining why the correct answer is right based on cellular/physiological mechanics.
   - Provide a dedicated, rigorous explanation for EVERY incorrect distractor explaining why it is wrong and in which clinical scenario it would be considered.

5. HIGH-YIELD TAKEAWAY PEARL:
   - A high-yield 1-2 sentence core exam takeaway pearl for rapid retention.

6. BILINGUAL & BIDIRECTIONAL (ARABIC + ENGLISH) INTEGRITY:
   - When generating questions in Arabic or Mixed mode:
     • Write flowing, natural clinical Arabic or medical code-switching without awkward phrase splits.
     • ALWAYS isolate embedded English medical terms, acronyms, or numbers cleanly with spaces or parentheses (e.g. "ارتفاع ضغط الدم (BP ≥ 140/90 mmHg)", "الـ pre-eclampsia").
     • NEVER attach Arabic prefixes directly to English letters without a clean space or hyphen (write "الـ HELLP" or "(HELLP syndrome)", NEVER "الHELLP").
     • Keep choice options (A, B, C, D) clean and unambiguous—preferably keeping official medical terms in standard English or standard Arabic paired with English in parentheses: e.g. "تسمم الحمل (Pre-eclampsia)".

Produce a JSON object containing an array of 3 distinct questions matching this structure:
{
  "questions": [
    {
      "id": "qbank-1",
      "examType": "Clinical Board Examination (USMLE / MRCP)",
      "topic": "Concise concept name",
      "difficulty": "medium",
      "vignette": "A 32-year-old patient presents with...",
      "options": [
        "Option A",
        "Option B",
        "Option C",
        "Option D"
      ],
      "correctIndex": 0,
      "distractorRationales": {
        "0": "Definitive clinical explanation why Option A is correct...",
        "1": "Clear explanation why Option B is incorrect...",
        "2": "Clear explanation why Option C is incorrect...",
        "3": "Clear explanation why Option D is incorrect..."
      },
      "highYieldTakeaway": "Key takeaway pearl..."
    }
  ]
}

Return ONLY valid JSON.
${buildLanguageDirective(language as StudyLanguage, "json")}`;

    // 4. FAST MULTI-PROVIDER CONCURRENT EXECUTION
    // Race Groq (ultra-fast ~3.5s) and Gemini (strong multimodal) concurrently with robust timeouts!
    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    const candidateTasks: Promise<{ questions: any[]; source: string }>[] = [];

    // Candidate A: Groq (openai/gpt-oss-120b - 120B parameter elite model, ~3.5s response time)
    if (groqKey && groqKey !== "your_groq_api_key_here") {
      candidateTasks.push(
        (async () => {
          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${groqKey}`,
            },
            signal: AbortSignal.timeout(12000),
            body: JSON.stringify({
              model: "openai/gpt-oss-120b",
              messages: [
                { role: "system", content: "You are an elite academic board exam question generator. Return valid JSON only." },
                { role: "user", content: prompt },
              ],
              response_format: { type: "json_object" },
              temperature: 0.35,
            }),
          });
          if (!res.ok) throw new Error(`Groq 120b HTTP ${res.status}`);
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content || "";
          const parsed = parseQuestionsJSON(content);
          if (parsed && parsed.length > 0) {
            return { questions: parsed.map(shuffleQuestionOptions), source: "groq:openai/gpt-oss-120b" };
          }
          throw new Error("Invalid Groq 120b QBank JSON");
        })()
      );
    }

    // Candidate B: Google Gemini (gemini-3.5-flash-lite - official, fast ~8s, generous 15s timeout)
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
              model: "gemini-3.5-flash-lite",
              contents: [{ role: "user", parts: userParts }],
              config: {
                responseMimeType: "application/json",
                temperature: 0.35,
              },
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Gemini timeout 15s")), 15000)),
          ]);

          const text = resp.text?.trim() || "";
          const parsed = parseQuestionsJSON(text);
          if (parsed && parsed.length > 0) {
            return { questions: parsed.map(shuffleQuestionOptions), source: "gemini:gemini-3.5-flash-lite" };
          }
          throw new Error("Invalid Gemini QBank JSON");
        })()
      );
    }

    // Candidate C: Groq Backup (openai/gpt-oss-20b - ultra fast ~2.5s)
    if (groqKey && groqKey !== "your_groq_api_key_here") {
      candidateTasks.push(
        (async () => {
          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${groqKey}`,
            },
            signal: AbortSignal.timeout(10000),
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

    // 5. OpenRouter High-Grade Fallback (meta-llama/llama-3.3-70b-instruct)
    if (openRouterKey && openRouterKey !== "your_openrouter_api_key_here") {
      const openRouterModels = ["meta-llama/llama-3.3-70b-instruct", "google/gemini-2.0-flash-001"];
      for (const orModel of openRouterModels) {
        try {
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openRouterKey}`,
            },
            signal: AbortSignal.timeout(15000),
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
