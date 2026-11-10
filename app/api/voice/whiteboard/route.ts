import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import crypto from "crypto";
import dns from "node:dns";
import { connectToDatabase } from "@/database/mongoose";
import WhiteboardArtifact from "@/database/models/whiteboard-artifact.model";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenAI } from "@google/genai";
import { buildLanguageDirective, StudyLanguage } from "@/lib/language";
import { getBookSegmentsByRange } from "@/lib/actions/book.actions";
import { WhiteboardDeck, WhiteboardScene } from "@/types/whiteboard";
import { compilePageToWhiteboardDeck } from "@/components/reader/whiteboard/page-sketch-compiler";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

function buildDeterministicFallbackDeck(
  topicTitle: string,
  pageNumber: number,
  bookTitle: string,
  language: "en" | "ar" | "mixed"
): WhiteboardDeck {
  const isAr = language === "ar";
  const isMixed = language === "mixed";

  const scene1Title = isAr
    ? "مسار الفسيولوجيا المرضية والمحفزات الأساسية"
    : isMixed
    ? "Pathophysiology & Trigger Cascade"
    : "Pathophysiology & Trigger Cascade";

  const scene2Title = isAr
    ? "محاكي التغيرات الفسيولوجية والاستجابة العلاجية"
    : isMixed
    ? "Interactive Hemodynamic & Receptor Simulator"
    : "Interactive Hemodynamic & Receptor Simulator";

  const scene3Title = isAr
    ? "مصفوفة التشخيص التفريقي والعلامات الحاسمة"
    : isMixed
    ? "Differential Diagnosis Matrix & High-Yield Pearls"
    : "Differential Diagnosis Matrix & High-Yield Pearls";

  const scenes: WhiteboardScene[] = [
    {
      id: "scene-1-cascade",
      sceneNumber: 1,
      title: scene1Title,
      durationSecondsEstimate: 20,
      spokenScriptHint: isAr
        ? "أهلاً بك يا دكتور، بص معايا على البورد هنا هنبدأ بالمحفز الأساسي وتأثيره المباشر على الأنسجة المستهدفة."
        : isMixed
        ? "Welcome Dr! Let's trace the pathophysiological cascade step-by-step starting from initial insult to organ decompensation."
        : "Welcome Dr! Let us trace the primary pathophysiological cascade from initial insult to target organ decompensation.",
      illustration: {
        title: topicTitle,
        totalSteps: 3,
        nodes: [
          {
            id: "node-trigger",
            x: 20,
            y: 45,
            label: isAr ? "المحفز الأولي / Insult" : "Primary Trigger / Insult",
            subtext: isAr ? "نقص التروية أو الإجهاد الخلوي" : "Ischemia or cellular stress",
            type: "trigger",
            revealedInStep: 0,
          },
          {
            id: "node-mediator",
            x: 50,
            y: 45,
            label: isAr ? "الوسائط الالتهابية والهرمونية" : "Cellular & Neurohormonal Mediators",
            subtext: isAr ? "تنشيط مستقبلات الغشاء الخلوي" : "Receptor cascade activation",
            type: "mediator",
            revealedInStep: 1,
          },
          {
            id: "node-outcome",
            x: 80,
            y: 45,
            label: isAr ? "القصور العضوي والنتيجة السريرية" : "End-Organ Decompensation",
            subtext: isAr ? "الأعراض السريرية للعيادة" : "Clinical presentation in clinic",
            type: "outcome",
            revealedInStep: 2,
          },
        ],
        edges: [
          {
            id: "edge-1",
            from: "node-trigger",
            to: "node-mediator",
            label: isAr ? "تفعيل سريع" : "Rapid activation",
            style: "arrow",
            revealedInStep: 1,
          },
          {
            id: "edge-2",
            from: "node-mediator",
            to: "node-outcome",
            label: isAr ? "فشل المعاوضة" : "Decompensation",
            style: "arrow",
            revealedInStep: 2,
          },
        ],
        chalkNotes: [
          isAr
            ? "تلميح سريري: المعاوضة المبكرة قد تخفي تدهور الوظائف الحيوية"
            : "Clinical pearl: Early compensation can mask sudden hemodynamic collapse",
        ],
      },
      widget: {
        type: "clinical_algorithm",
        clinicalAlgorithm: {
          title: isAr ? "خوارزمية التدخل السريري السريع" : "Clinical Decision Workup",
          chiefComplaintOrScenario: topicTitle,
          firstStepId: "step-1",
          steps: [
            {
              id: "step-1",
              stepNumber: 1,
              stageName: isAr ? "التقييم الأولي والـ ABC" : "Initial Assessment & Triage",
              actionText: isAr
                ? "تأمين مجرى الهواء وتقييم العلامات الحيوية فوراً"
                : "Secure airway, check vitals, and establish dual large-bore IV access",
              branches: [
                {
                  choiceLabel: isAr ? "المريض غير مستقر" : "Hemodynamically Unstable",
                  nextStepId: "step-urgent",
                  isUrgent: true,
                },
                {
                  choiceLabel: isAr ? "المريض مستقر" : "Hemodynamically Stable",
                  nextStepId: "step-workup",
                },
              ],
            },
            {
              id: "step-urgent",
              stepNumber: 2,
              stageName: isAr ? "تدخل إسعافي عاجل" : "Urgent Stabilization",
              actionText: isAr
                ? "إنعاش بالسوائل الوريدية أو الدواعم الوعائية مع فحص عاجل بجانب السرير"
                : "Initiate targeted fluid resuscitation / vasopressor support & bedside ultrasound",
              evidenceLevel: "Class I",
            },
            {
              id: "step-workup",
              stepNumber: 2,
              stageName: isAr ? "الفحوصات التأكيدية" : "Definitive Diagnostic Workup",
              actionText: isAr
                ? "طلب التحاليل المخبرية النوعية والتصوير الشعاعي الموجه"
                : "Order targeted biomarkers, serial labs, and protocolized cross-sectional imaging",
              evidenceLevel: "Class I",
            },
          ],
        },
      },
    },
    {
      id: "scene-2-simulator",
      sceneNumber: 2,
      title: scene2Title,
      durationSecondsEstimate: 25,
      spokenScriptHint: isAr
        ? "شوف يا دكتور على المحاكي اليمين، جرب تفعّل الدواء الأول ولاحظ ازاي البارامترات الحيوية بتتغير في ثواني."
        : isMixed
        ? "Observe the interactive simulator on the right. Notice what happens to perfusion and vascular resistance when we toggle the intervention."
        : "Observe the interactive simulator on the right. Notice how vascular resistance and organ perfusion shift upon intervention.",
      illustration: {
        title: isAr ? "توازن المقاومة والتروية" : "Hemodynamic & Cellular Homeostasis",
        totalSteps: 2,
        nodes: [
          {
            id: "node-vessel",
            x: 35,
            y: 40,
            label: isAr ? "المقاومة الوعائية الجهازية (SVR)" : "Systemic Vascular Resistance",
            subtext: isAr ? "انقباض مقابل انبساط" : "Vasoconstriction vs Vasodilation",
            type: "mediator",
            revealedInStep: 0,
          },
          {
            id: "node-organ",
            x: 65,
            y: 40,
            label: isAr ? "التروية الكلوية والأكسجة" : "End-Organ Perfusion & Oxygen Delivery",
            subtext: isAr ? "معدل الترشيح ومؤشرات التروية" : "GFR & Tissue clearance",
            type: "outcome",
            revealedInStep: 1,
          },
        ],
        edges: [
          {
            id: "edge-svr-perf",
            from: "node-vessel",
            to: "node-organ",
            label: isAr ? "تأثير ضغط التروية" : "Perfusion Pressure",
            style: "curved",
            revealedInStep: 1,
          },
        ],
        chalkNotes: [
          isAr
            ? "قاعدة ذهبية: حماية الأعضاء الحيوية تتطلب توازن دقيق بين الضغط وحجم الدم"
            : "Rule of thumb: Maintain adequate mean arterial pressure without excessive afterload",
        ],
      },
      widget: {
        type: "physiology_simulator",
        physiologySimulator: {
          title: isAr ? "محاكي التغيرات الدوائية والديناميكية" : "Hemodynamic & Pharmacological Simulator",
          organSystem: isAr ? "الجهاز القلبي الوعائي والكلوي" : "Cardiovascular & Renal Axis",
          clinicalTakeaway: isAr
            ? "التدخل الدوائي الصحيح يعيد التوازن القلبي والكلوي دون التسبب في تسمم أو هبوط حاد"
            : "Targeted therapy restores organ perfusion while preventing iatrogenic decompensation",
          parameters: [
            {
              id: "param-map",
              name: isAr ? "متوسط الضغط الشرياني (MAP)" : "Mean Arterial Pressure (MAP)",
              unit: "mmHg",
              baseValue: 65,
              currentValue: 65,
              min: 40,
              max: 120,
              normalRange: [65, 90],
              direction: "stable",
              clinicalSignificance: isAr ? "الحد الأدنى لتروية الكلى والدماغ" : "Target for vital organ perfusion",
            },
            {
              id: "param-gfr",
              name: isAr ? "معدل الترشيح الكبيبي (eGFR)" : "Glomerular Filtration Rate",
              unit: "mL/min",
              baseValue: 55,
              currentValue: 55,
              min: 10,
              max: 120,
              normalRange: [60, 120],
              direction: "stable",
              clinicalSignificance: isAr ? "مؤشر التروية الكلوية الحادة" : "Direct indicator of renal reserve",
            },
            {
              id: "param-resistance",
              name: isAr ? "المقاومة الوعائية (SVR)" : "Systemic Vascular Resistance",
              unit: "dynes",
              baseValue: 1200,
              currentValue: 1200,
              min: 600,
              max: 2200,
              normalRange: [800, 1400],
              direction: "stable",
            },
          ],
          interventions: [
            {
              id: "rx-first-line",
              label: isAr ? "علاج الخط الأول الموجه" : "First-Line Targeted Therapy",
              active: false,
              effectDescription: isAr
                ? "يقلل الحمل البعدي ويزيد التروية الكلوية بنسبة 20%"
                : "Reduces afterload and optimizes renal microcirculation (+15 mmHg MAP reserve)",
              parameterImpacts: {
                "param-map": 12,
                "param-gfr": 18,
                "param-resistance": -250,
              },
            },
            {
              id: "rx-adjunct",
              label: isAr ? "دواعم تروية تكميلية" : "Inotropic / Vasopressor Support",
              active: false,
              effectDescription: isAr
                ? "دعم عضلة القلب وتحسين النتاج القلبي المباشر"
                : "Inotropic boost to elevate cardiac index under hypoperfusion",
              parameterImpacts: {
                "param-map": 18,
                "param-gfr": 8,
                "param-resistance": 150,
              },
            },
          ],
        },
      },
    },
    {
      id: "scene-3-ddx",
      sceneNumber: 3,
      title: scene3Title,
      durationSecondsEstimate: 20,
      spokenScriptHint: isAr
        ? "ودلوقتي عشان امتحان البورد والراوند، ركز معايا في مصفوفة التشخيص التفريقي دي."
        : isMixed
        ? "For the clinical round and board exams, examine this differential diagnosis matrix with high-yield discriminators."
        : "Now for clinical rounds and board exams, review this differential matrix highlighting pathognomonic discriminators.",
      illustration: {
        title: isAr ? "مقارنة الحالات المتشابهة" : "Differential Workup Map",
        totalSteps: 2,
        nodes: [
          {
            id: "node-ddx-a",
            x: 30,
            y: 45,
            label: topicTitle,
            subtext: isAr ? "الحالة المستهدفة" : "Target Pathology",
            type: "outcome",
            revealedInStep: 0,
          },
          {
            id: "node-ddx-b",
            x: 70,
            y: 45,
            label: isAr ? "المقلد الأقرب سريرياً" : "Primary Mimic Condition",
            subtext: isAr ? "يتشابه في البداية ويختلف في العلاج" : "Similar onset, opposing therapy",
            type: "trap",
            revealedInStep: 1,
          },
        ],
        edges: [
          {
            id: "edge-vs",
            from: "node-ddx-a",
            to: "node-ddx-b",
            label: isAr ? "مقارنة تفريقية" : "Differentiating feature",
            style: "dotted",
            revealedInStep: 1,
          },
        ],
        chalkNotes: [
          isAr
            ? "نصيحة الامتحان: انتبه دائماً للعلامة الحاسمة (Pathognomonic sign) قبل بدء العلاج"
            : "Exam Pearl: Look for the single distinguishing biomarker before initiating invasive therapy",
        ],
      },
      widget: {
        type: "differential_matrix",
        differentialMatrix: {
          title: isAr ? "مصفوفة التفريق السريري والنتائج الحاسمة" : "Differential Diagnosis Matrix",
          clinicalPresentation: topicTitle,
          keyDifferentiators: [
            isAr ? "سرعة البدء والأعراض الباكرة" : "Onset & Chronicity",
            isAr ? "المؤشرات الحيوية والتحاليل" : "Specific Biomarkers",
            isAr ? "الاستجابة للعلاج الأولي" : "Response to Trial",
          ],
          conditions: [
            {
              id: "cond-primary",
              conditionName: topicTitle,
              probability: "High",
              hallmarkFeatures: [
                isAr ? "بداية حادة مع علامات حيوية نوعية" : "Acute progressive presentation",
                isAr ? "استجابة ممتازة للعلاج المستهدف" : "Rapid response to protocolized therapy",
              ],
              pathognomonicSign: isAr ? "علامة الفحص السريري الموجهة" : "Target physical / laboratory sign",
              treatmentClue: isAr ? "بدء البروتوكول القياسي فوراً" : "Initiate standard guideline protocol",
            },
            {
              id: "cond-mimic",
              conditionName: isAr ? "المتلازمة المشابهة (Mimic)" : "Clinical Mimic / Alternative",
              probability: "Rule Out",
              hallmarkFeatures: [
                isAr ? "أعراض عامة متداخلة لكن بدون المؤشر النوعي" : "Overlapping symptoms lacking key biomarker",
                isAr ? "عدم استجابة أو تفاقم مع العلاج العادي" : "Refractory to empirical therapy",
              ],
              redFlags: [
                isAr ? "خطأ تشخيصي يهدد حياة المريض" : "Misdiagnosis risks inappropriate intervention",
              ],
              treatmentClue: isAr ? "تعديل الخطة والتوجه للعلاج البديل" : "Requires alternate specialist protocol",
            },
          ],
        },
      },
    },
  ];

  return {
    id: `deck-${pageNumber}-${Date.now()}`,
    bookTitle,
    pageNumber,
    topicTitle,
    language,
    scenes,
    createdAt: new Date().toISOString(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      bookTitle = "Medical Study Document",
      selectedText = "",
      snippedDiagram = null,
      language = "en",
      studyScope,
      customFocus,
      forceRefresh = false,
    } = body;

    const bookId = body.bookId || body.id || "default-book";
    const pageNumber = Number(body.pageNumber || body.currentPageNumber || 1);

    let focalText = (body.focalText || body.currentSectionText || body.pageText || selectedText || "").trim();

    // 1. Resolve multi-page range if requested
    if (studyScope && studyScope.startPage && studyScope.endPage && bookId && bookId !== "default-book") {
      if (studyScope.startPage !== studyScope.endPage || studyScope.type === "topic" || studyScope.type === "range") {
        try {
          const segRes = await getBookSegmentsByRange(bookId, studyScope.startPage, studyScope.endPage);
          if (segRes.success && segRes.data && segRes.data.length > 0) {
            focalText = segRes.data
              .map((s) => `--- PAGE ${s.pageNumber || "?"} ---\n${s.content}`)
              .join("\n\n");
          }
        } catch (rangeErr) {
          console.warn("[voice/whiteboard] Failed to load multi-page segments:", rangeErr);
        }
      }
    }

    const topicTitle =
      customFocus ||
      studyScope?.topicTitle ||
      (selectedText ? selectedText.slice(0, 60) + "..." : `Clinical Topic (Page ${pageNumber})`);

    // 2. Cache Lookup
    const targetPassage = `${customFocus || ""}_${(selectedText || focalText).slice(0, 1000)}`;
    const hashInput = `${language}_${pageNumber}_${targetPassage}_${snippedDiagram ? "img" : "noimg"}`;
    const selectionHash = crypto.createHash("sha256").update(hashInput).digest("hex").slice(0, 16);

    const isMongoId = mongoose.Types.ObjectId.isValid(String(bookId));
    if (isMongoId && !forceRefresh) {
      try {
        const cacheLookup = async () => {
          await connectToDatabase();
          return await WhiteboardArtifact.findOne({
            bookId,
            pageNumber,
            selectionHash,
            language,
          }).lean();
        };

        const cachedDoc = await Promise.race([
          cacheLookup(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
        ]);

        if (cachedDoc) {
          return NextResponse.json({
            success: true,
            deck: {
              ...cachedDoc,
              id: (cachedDoc as any)._id?.toString() || `deck-${pageNumber}`,
            },
            cached: true,
          });
        }
      } catch (cacheErr) {
        console.warn("[voice/whiteboard] Fast cache read warning:", cacheErr);
      }
    }

    // 3. Grounded VideoScribe Deck compiled from the exact active page
    const langKey = language === "ar" ? "ar" : language === "mixed" ? "mixed" : "en";
    let deck: WhiteboardDeck = compilePageToWhiteboardDeck({
      bookTitle,
      pageNumber,
      pageText: focalText,
      selectedText,
      customFocus,
      language: langKey,
    });

    const apiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    // Fast Parallel AI Enrichment Race (max 6 seconds timeout so UI never hangs)
    if ((apiKey || groqKey) && (focalText || snippedDiagram || customFocus)) {
      try {
        const langDirective = buildLanguageDirective(langKey as StudyLanguage, "json");
        const prompt = `You are Ascleon's elite Visual Chalkboard & VideoScribe Whiteboard Mentor Generator.
Transform this medical reading material into a rich, synchronized 3-to-4 scene "Whiteboard Video Illustration Deck".

BOOK: "${bookTitle}"
PAGE: ${pageNumber}
FOCUS TOPIC: "${topicTitle}"
ACTIVE PASSAGE:
"""
${focalText.slice(0, 3500)}
"""

${langDirective}

REQUIREMENTS:
Generate 3 to 4 scenes telling a complete clinical story:
1. Scene 1: Etiology & Vascular/Cellular Trigger (nodes with sketchType e.g. "vessel_occlusion", "brain_territories", "heart_coronary", "lungs_alveoli", "kidney_nephron", "cell_receptor").
2. Scene 2: Pathophysiological Cascade & Homeostasis (nodes + "physiology_simulator" widget with MAP/Perfusion parameters).
3. Scene 3: Clinical Presentation, FAST Signs & Decision Protocol (nodes + "differential_matrix" or "clinical_algorithm" widget).
4. For nodes, pick appropriate sketchType from: "brain_territories", "vessel_occlusion", "vessel_rupture", "heart_coronary", "lungs_alveoli", "kidney_nephron", "cell_receptor", "patient_droop", "syringe_tpa", "warning_stamp".
5. Return ONLY valid raw JSON with { "topicTitle": "...", "scenes": [...] }.`;

        const userParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: prompt }];
        if (snippedDiagram && typeof snippedDiagram === "string" && snippedDiagram.startsWith("data:image")) {
          const cleanBase64 = snippedDiagram.replace(/^data:image\/\w+;base64,/, "");
          userParts.push({
            inlineData: {
              mimeType: "image/png",
              data: cleanBase64,
            },
          });
        }

        const candidateTasks: Promise<any>[] = [];

        // Candidate A: Gemini 2.5 Flash
        if (apiKey && apiKey !== "your_gemini_api_key_here") {
          const ai = new GoogleGenAI({ apiKey });
          candidateTasks.push(
            (async () => {
              const resp: any = await ai.models.generateContent({
                model: "gemini-3.5-flash-lite",
                contents: [{ role: "user", parts: userParts }],
                config: {
                  responseMimeType: "application/json",
                  temperature: 0.25,
                },
              });
              const text = resp.text?.trim() || "";
              let clean = text;
              if (clean.startsWith("```json")) clean = clean.slice(7);
              else if (clean.startsWith("```")) clean = clean.slice(3);
              if (clean.endsWith("```")) clean = clean.slice(0, -3);
              const parsed = JSON.parse(clean.trim());
              if (parsed && Array.isArray(parsed.scenes) && parsed.scenes.length > 0) return parsed;
              throw new Error("Invalid Gemini deck JSON");
            })()
          );
        }

        // Candidate B: Groq Fast
        if (groqKey && groqKey !== "your_groq_api_key_here") {
          candidateTasks.push(
            (async () => {
              const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${groqKey}`,
                },
                signal: AbortSignal.timeout(5500),
                body: JSON.stringify({
                  model: "openai/gpt-oss-120b",
                  messages: [
                    { role: "system", content: "You are an elite clinical whiteboard synthesizer. Return only valid JSON." },
                    { role: "user", content: prompt },
                  ],
                  response_format: { type: "json_object" },
                  temperature: 0.25,
                }),
              });
              if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
              const data = await res.json();
              const content = data.choices?.[0]?.message?.content || "";
              let clean = content.trim();
              if (clean.startsWith("```json")) clean = clean.slice(7);
              else if (clean.startsWith("```")) clean = clean.slice(3);
              if (clean.endsWith("```")) clean = clean.slice(0, -3);
              const parsed = JSON.parse(clean.trim());
              if (parsed && Array.isArray(parsed.scenes) && parsed.scenes.length > 0) return parsed;
              throw new Error("Invalid Groq deck JSON");
            })()
          );
        }

        if (candidateTasks.length > 0) {
          const timeoutRace = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("AI enrichment 6s cap reached")), 6000)
          );

          const fastestEnriched: any = await Promise.race([
            Promise.any(candidateTasks),
            timeoutRace,
          ]);

          if (fastestEnriched && Array.isArray(fastestEnriched.scenes) && fastestEnriched.scenes.length > 0) {
            deck = {
              id: `deck-${pageNumber}-${Date.now()}`,
              bookTitle,
              pageNumber,
              topicTitle: fastestEnriched.topicTitle || topicTitle,
              language: langKey,
              scenes: fastestEnriched.scenes.map((s: Partial<WhiteboardScene>, idx: number) => {
                const fallbackScene = deck.scenes[idx] || deck.scenes[0];
                const hasValidNodes = s.illustration && Array.isArray(s.illustration.nodes) && s.illustration.nodes.length > 0;
                return {
                  id: s.id || `scene-${idx + 1}`,
                  sceneNumber: s.sceneNumber || idx + 1,
                  title: s.title || fallbackScene?.title || `Scene ${idx + 1}`,
                  durationSecondsEstimate: s.durationSecondsEstimate || 20,
                  spokenScriptHint: s.spokenScriptHint || fallbackScene?.spokenScriptHint || "",
                  illustration: hasValidNodes ? s.illustration! : fallbackScene?.illustration,
                  widget: s.widget || fallbackScene?.widget || {
                    type: "clinical_algorithm",
                  },
                };
              }),
              createdAt: new Date().toISOString(),
            };
          }
        }
      } catch (raceErr) {
        console.warn("[voice/whiteboard] Fast AI race note (using page-grounded compiled deck):", raceErr);
      }
    }

    // 4. Non-blocking Cache Save in Background
    if (isMongoId) {
      (async () => {
        try {
          const { userId } = await auth();
          await connectToDatabase();
          await WhiteboardArtifact.findOneAndUpdate(
            { bookId, pageNumber, selectionHash, language: langKey },
            {
              clerkId: userId || undefined,
              bookId,
              pageNumber,
              selectionHash,
              topicTitle: deck.topicTitle,
              language: langKey,
              scenes: deck.scenes,
            },
            { upsert: true, returnDocument: "after" }
          );
        } catch (cacheSaveErr) {
          console.warn("[voice/whiteboard] Background cache save warning:", cacheSaveErr);
        }
      })().catch(() => {});
    }

    return NextResponse.json({
      success: true,
      deck,
      cached: false,
    });
  } catch (error: unknown) {
    console.error("[voice/whiteboard] Unexpected endpoint error:", error);
    return NextResponse.json(
      {
        error: (error as Error)?.message || "Failed to generate whiteboard mentor deck",
      },
      { status: 500 }
    );
  }
}
