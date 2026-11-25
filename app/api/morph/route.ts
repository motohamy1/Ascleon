import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import crypto from "crypto";
import { connectToDatabase } from "@/database/mongoose";
import MorphArtifact from "@/database/models/morph-artifact.model";
import { MorphArtifactData } from "@/types/morph";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenAI } from "@google/genai";
import { buildLanguageDirective, StudyLanguage } from "@/lib/language";
import {
  clearModelCooldown,
  GEMINI_MODEL_CHAIN,
  markModelCooldownFromError,
  orderModelsByHealth,
  PRIMARY_GEMINI_MODEL,
} from "@/lib/ai/model-cooldown";

export const maxDuration = 60;
import { getBookSegmentsByRange } from "@/lib/actions/book.actions";
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

function unwrapMorphObject(val: any): any | null {
  if (!val) return null;
  if (Array.isArray(val)) return unwrapMorphObject(val[0]);
  if (typeof val !== "object") return null;
  if (val.cards || val.journey || val.conceptMap || val.focalConcept) return val;
  if (val.morph && typeof val.morph === "object") return unwrapMorphObject(val.morph);
  if (val.data && typeof val.data === "object") return unwrapMorphObject(val.data);
  return val;
}

function parseMorphJson(raw: string): any | null {
  if (!raw || typeof raw !== "string") return null;
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  const tryParse = (str: string): any | null => {
    try {
      return unwrapMorphObject(JSON.parse(str));
    } catch {
      // Repair trailing commas and stray ASCII control chars
      const repaired = str
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
      try {
        return unwrapMorphObject(JSON.parse(repaired));
      } catch {
        return null;
      }
    }
  };

  const direct = tryParse(cleaned);
  if (direct) return direct;

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return tryParse(cleaned.slice(start, end + 1));
  }
  return null;
}

function normalizeJourney(rawJourney: any, focalConcept: string): any | undefined {
  if (!rawJourney || !Array.isArray(rawJourney.stages) || rawJourney.stages.length === 0) {
    return undefined;
  }
  const stages = rawJourney.stages.slice(0, 4).map((s: any, idx: number) => {
    const sim = s?.interactiveSimulation || {};
    const rawHotspots = Array.isArray(sim.hotspots) ? sim.hotspots : [];
    const hotspots = rawHotspots
      .filter((h: any) => h && (h.label || h.description))
      .map((h: any, hIdx: number) => ({
        id: String(h.id || `hs-${hIdx + 1}`),
        label: String(h.label || `Point ${hIdx + 1}`),
        description: String(h.description || ""),
        xPercent: typeof h.xPercent === "number" ? h.xPercent : 28 + hIdx * 40,
        yPercent: typeof h.yPercent === "number" ? h.yPercent : 45,
      }));
    const cp = s?.checkpoint || {};
    const options =
      Array.isArray(cp.options) && cp.options.length >= 2
        ? cp.options.map(String)
        : [
            "Identify the primary mechanism described in this stage",
            "Ignore the underlying pathophysiology",
            "Delay diagnostic confirmation",
            "Treat without clinical correlation",
          ];
    const correctIdx =
      typeof cp.correctOptionIndex === "number" &&
      cp.correctOptionIndex >= 0 &&
      cp.correctOptionIndex < options.length
        ? cp.correctOptionIndex
        : 0;
    return {
      id: String(s?.id || `stage-${idx + 1}`),
      stageNumber: typeof s?.stageNumber === "number" ? s.stageNumber : idx + 1,
      title: String(s?.title || `Stage ${idx + 1}`),
      phase: s?.phase || "cellular_pathology",
      description: String(s?.description || ""),
      keyPathologyPoints: Array.isArray(s?.keyPathologyPoints)
        ? s.keyPathologyPoints.map(String)
        : [],
      interactiveSimulation: {
        simulationType: sim.simulationType || "generic_dynamic_flow",
        primaryMetricLabel: String(sim.primaryMetricLabel || "Severity / Load"),
        defaultMetricValue:
          typeof sim.defaultMetricValue === "number" ? sim.defaultMetricValue : 50,
        metricUnit: String(sim.metricUnit || "%"),
        hotspots,
      },
      checkpoint: {
        prompt: String(cp.prompt || `Clinical check for ${s?.title || focalConcept}`),
        options,
        correctOptionIndex: correctIdx,
        explanation: String(cp.explanation || s?.description || ""),
      },
      visualPrompt: String(s?.visualPrompt || ""),
    };
  });

  return {
    title: String(rawJourney.title || `Clinical Journey: ${focalConcept}`),
    topic: String(rawJourney.topic || focalConcept),
    summary: String(rawJourney.summary || ""),
    stages,
  };
}

function isLegacyOrPoisonedMorph(doc: any): boolean {
  if (!doc || typeof doc !== "object") return true;
  const focal = String(doc.focalConcept || "");
  if (focal.includes("[Source Study:") || focal.includes("---")) return true;
  if (!doc.journey || !Array.isArray(doc.journey.stages) || doc.journey.stages.length === 0) {
    return true;
  }
  const serialized = JSON.stringify(doc.blocks || []);
  if (
    serialized.includes("Etiological Driver") ||
    serialized.includes("Physiological / Baseline State") ||
    serialized.includes("Clinical Action Rule Finding")
  ) {
    return true;
  }
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAuthAndCredits(0);
    if (!authCheck.ok) return authCheck.response;

    const body = await req.json();
    const {
      bookTitle = "Study Document",
      selectedText = "",
      precedingSegments = [],
      subsequentSegments = [],
      forceRefresh = false,
      snippedDiagram = null,
      language = "en",
      studyScope,
      customTopic,
    } = body;

    const bookId = body.bookId || body.id || "default-book";
    const segmentIndex =
      typeof body.segmentIndex === "number"
        ? body.segmentIndex
        : typeof body.currentSegmentIndex === "number"
        ? body.currentSegmentIndex
        : 0;

    let focalText =
      body.focalText ||
      body.currentSegmentContent ||
      body.content ||
      selectedText ||
      "";

    const pageNumber =
      body.pageNumber ||
      body.currentPageNumber ||
      (typeof segmentIndex === "number" ? segmentIndex + 1 : 1);

    const livePageText = String(focalText || "").trim();
    const hasRealLiveText = Boolean(livePageText) && !isPlaceholderPageText(livePageText);
    const isMultiPageScope =
      Boolean(customTopic) ||
      studyScope?.type === "topic" ||
      studyScope?.type === "range" ||
      (studyScope?.startPage && studyScope?.endPage && studyScope.startPage !== studyScope.endPage);

    // Only expand via Book RAG for multi-page scopes, custom topics, or when live page text is missing/placeholder
    if (bookId && bookId !== "default-book" && (isMultiPageScope || !hasRealLiveText || livePageText.length < 120)) {
      try {
        const { retrieveFromBookRAG } = await import("@/lib/ai/rag/book-rag-retriever");
        const ragRes = await retrieveFromBookRAG({
          bookId,
          query: customTopic || (studyScope?.topicTitle) || selectedText || livePageText.slice(0, 300),
          scope: studyScope,
          activePage: pageNumber,
          livePageText,
          topK: 5,
        });
        if (ragRes.combinedContext) {
          if (!isMultiPageScope && hasRealLiveText) {
            focalText = livePageText;
          } else {
            focalText = hasRealLiveText && ragRes.alignmentStatus !== "verified"
              ? `${livePageText}\n\n${ragRes.combinedContext}`
              : ragRes.combinedContext;
          }
        }
      } catch (ragErr) {
        console.warn("[/api/morph] Book RAG retrieval fallback:", ragErr);
      }
    } else if (isMultiPageScope && studyScope?.startPage && studyScope?.endPage && bookId) {
      const segRes = await getBookSegmentsByRange(bookId, studyScope.startPage, studyScope.endPage);
      if (segRes.success && segRes.data && segRes.data.length > 0) {
        focalText = segRes.data
          .map((s) => `--- PAGE ${s.pageNumber || "?"} ---\n${s.content}`)
          .join("\n\n");
      }
    }

    if (!focalText && !snippedDiagram && !customTopic) {
      return NextResponse.json(
        { error: "Missing focal reading text, topic, or diagram to morph" },
        { status: 400 },
      );
    }

    const { userId } = await auth();

    // Compute true content hash to prevent stale cache collisions (v2 invalidates legacy stub cache)
    const targetPassage = customTopic
      ? `FOCUS TOPIC: "${customTopic}"\n\n${(selectedText || focalText).trim()}`
      : (selectedText || focalText).trim();
    const hashInput = `v2_${language}_${pageNumber}_${customTopic || ""}_${targetPassage.slice(0, 1000)}_${snippedDiagram ? "img" : "noimg"}`;
    const selectionHash = crypto.createHash("sha256").update(hashInput).digest("hex").slice(0, 16);

    // 1. Check Database Cache (unless forceRefresh requested); reject any legacy/poisoned fallback docs
    const isMongoId = mongoose.Types.ObjectId.isValid(String(bookId));
    if (isMongoId && !forceRefresh) {
      try {
        await connectToDatabase();
        const cachedDoc = await MorphArtifact.findOne({
          bookId,
          selectionHash,
        }).lean();

        if (cachedDoc && !isLegacyOrPoisonedMorph(cachedDoc)) {
          return NextResponse.json({
            success: true,
            artifact: cachedDoc,
            data: cachedDoc,
            cached: true,
            creditsCharged: 0,
          });
        }
      } catch (cacheCheckErr) {
        console.warn("Morph cache lookup warning:", cacheCheckErr);
      }
    }

    // 2. Live AI Synthesis via Premium Gemini Model Chain (NO generic local stub fallback)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "your_gemini_api_key_here") {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured for Morph synthesis." },
        { status: 503 },
      );
    }

    const dynamicCost = calculateDynamicCreditCost({
      feature: "morph",
      scopeType: studyScope?.type,
      pageSpan: getScopePageSpan(studyScope),
      hasVisionInput: Boolean(snippedDiagram),
      forceRefresh: Boolean(forceRefresh),
    });
    const creditCheck = await consumeCredits(authCheck.userId, dynamicCost.total);
    if (!creditCheck.allowed) {
      return buildBillingErrorResponse(creditCheck, dynamicCost.total);
    }

    let artifactData: MorphArtifactData | null = null;
    let lastGeminiError: string = "Gemini Morph synthesis failed";

    {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = customTopic
          ? `You are Ascleon's elite Multi-Modal Morph Engine.
Transform the comprehensive topic "${customTopic}" from "${bookTitle}" into an end-to-end interactive conceptual learning micro-site featuring structured roadmap cards, an interactive concept mind map, and a living multi-stage journey.

Target Topic: "${customTopic}"
Book: "${bookTitle}"
Source Reference Text:
"""
${targetPassage.slice(0, 5000)}
"""

Instructions:
1. Ground every card, node, checkpoint, and simulation strictly in this topic and study material.
2. Select the simulationType that best represents this topic:
   - "ecg_rhythm" if topic involves ECG leads, rhythm, electrical conduction, myocardial infarction, or electrophysiology.
   - "cellular_cascade" if topic involves cellular receptors, molecular pathways, hormones, enzymes, pharmacology, or genetics.
   - "treatment_tree" if topic involves clinical decision pathways, guidelines, triage, diagnostic steps, or management algorithms.
   - "flow_pressure" if topic involves vascular hemodynamics, pressures, stenosis, fluid mechanics, or respiratory flow.
   - "generic_dynamic_flow" for other systems.
3. Produce a JSON object matching this schema:
   - "focalConcept": "${customTopic}"
   - "conceptMap": Hierarchical mind map:
     - "root": Central topic title (max 5 words)
     - "pillars": Array of 3-4 key pillars with "label", "category", "details", "leafLabel", "leafDetails"
   - "cards": 3-4 structured cards with "badge", "badgeType", "title", "subtitle", "bulletPoints" (3 points)
   - "flowNodes": 3-4 causal nodes with "id", "label", "sublabel", "category", "details"
   - "journey": A multi-stage interactive clinical journey:
     - "title": "Clinical Journey: ${customTopic}"
     - "topic": "${customTopic}"
     - "summary": 1-2 sentence overview
     - "stages": Array of 3 sequential stages:
       - "id": "stage-1", "stage-2", "stage-3"
       - "stageNumber": 1, 2, 3
       - "title": Milestone title
       - "phase": "etiology_triggers" | "cellular_pathology" | "clinical_presentation" | "treatment_algorithm"
       - "description": Comprehensive clinical explanation
       - "keyPathologyPoints": 2-3 key pathological/physiological mechanisms
       - "interactiveSimulation": {
           "simulationType": "ecg_rhythm" | "cellular_cascade" | "flow_pressure" | "plaque_rupture" | "treatment_tree" | "generic_dynamic_flow",
           "primaryMetricLabel": string,
           "defaultMetricValue": number,
           "metricUnit": string,
           "hotspots": [
             { "id": "hs-1", "label": string, "description": string, "xPercent": number, "yPercent": number },
             { "id": "hs-2", "label": string, "description": string, "xPercent": number, "yPercent": number }
           ]
         }
       - "checkpoint": {
           "prompt": "Clinical decision question to advance to the next step",
           "options": ["Option A", "Option B", "Option C", "Option D"],
           "correctOptionIndex": number,
           "explanation": "Detailed clinical rationale"
         }
       - "visualPrompt": "Visual panel description"

Return ONLY a valid JSON object matching this structure.

${buildLanguageDirective(language as StudyLanguage, "json")}`
          : `You are Ascleon's elite Multi-Modal Morph Engine.
Transform this study material from "${bookTitle}" (Page ${pageNumber}${studyScope?.endPage && studyScope.endPage > pageNumber ? ` to ${studyScope.endPage}` : ""}) into an interactive conceptual learning micro-site featuring structured roadmap cards, an interactive concept mind map, and a living multi-stage journey.

Source Text to Morph:
"""
${targetPassage.slice(0, 5000)}
"""

Instructions:
1. Ground every card, node, checkpoint, and simulation strictly in this study material.
2. Select the simulationType that best represents this topic:
   - "ecg_rhythm" if topic involves ECG leads, rhythm, electrical conduction, myocardial infarction, or electrophysiology.
   - "cellular_cascade" if topic involves cellular receptors, molecular pathways, hormones, enzymes, pharmacology, or genetics.
   - "treatment_tree" if topic involves clinical decision pathways, guidelines, triage, diagnostic steps, or management algorithms.
   - "flow_pressure" if topic involves vascular hemodynamics, pressures, stenosis, fluid mechanics, or respiratory flow.
   - "generic_dynamic_flow" for other systems.
3. Produce a JSON object with:
   - "focalConcept": Punchy concept title (max 6 words).
   - "conceptMap": Hierarchical mind map:
     - "root": Central topic title (max 5 words)
     - "pillars": Array of 3-4 key pillars with "label", "category", "details", "leafLabel", "leafDetails"
   - "cards": 3-4 structured cards with "badge", "badgeType", "title", "subtitle", "bulletPoints" (3 points)
   - "flowNodes": 3-4 causal nodes with "id", "label", "sublabel", "category", "details"
   - "journey": A multi-stage interactive clinical journey:
     - "title": Canonical journey title
     - "topic": Topic name
     - "summary": 1-2 sentence overview
     - "stages": Array of 3 sequential stages:
       - "id": "stage-1", "stage-2", "stage-3"
       - "stageNumber": 1, 2, 3
       - "title": Milestone title
       - "phase": "etiology_triggers" | "cellular_pathology" | "clinical_presentation" | "treatment_algorithm"
       - "description": Comprehensive clinical explanation of this milestone
       - "keyPathologyPoints": 2-3 key pathological/physiological mechanisms
       - "interactiveSimulation": {
           "simulationType": "ecg_rhythm" | "cellular_cascade" | "flow_pressure" | "plaque_rupture" | "treatment_tree" | "generic_dynamic_flow",
           "primaryMetricLabel": string,
           "defaultMetricValue": number,
           "metricUnit": string,
           "hotspots": [
             { "id": "hs-1", "label": string, "description": string, "xPercent": number, "yPercent": number },
             { "id": "hs-2", "label": string, "description": string, "xPercent": number, "yPercent": number }
           ]
         }
       - "checkpoint": {
           "prompt": "Clinical decision question to advance to the next step",
           "options": ["Option A", "Option B", "Option C", "Option D"],
           "correctOptionIndex": number,
           "explanation": "Detailed clinical rationale"
         }
       - "visualPrompt": "Visual panel description"

Return ONLY a valid JSON object matching this structure.

${buildLanguageDirective(language as StudyLanguage, "json")}`;

        const userParts: any[] = [{ text: prompt }];

        if (snippedDiagram && typeof snippedDiagram === "string" && snippedDiagram.startsWith("data:image")) {
          const mimeMatch = snippedDiagram.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
          const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
          const cleanBase64 = snippedDiagram.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
          userParts.push({
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          });
        }

        let parsed: any = null;
        let usedModel = "";
        const morphModels = orderModelsByHealth(GEMINI_MODEL_CHAIN);
        for (let idx = 0; idx < morphModels.length; idx++) {
          const candidateModel = morphModels[idx];
          const isLastModel = idx === morphModels.length - 1;
          const maxAttempts = isLastModel ? 2 : 1;

          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const timeoutMs = idx === 0 ? 16_000 : 11_000;
            const supportsThinking = !candidateModel.includes("lite");
            const thinkingBudget = candidateModel === PRIMARY_GEMINI_MODEL ? 128 : 0;
            const abortCtrl = new AbortController();
            const timer = setTimeout(() => abortCtrl.abort(), timeoutMs);
            try {
              const generatePromise = ai.models.generateContent({
                model: candidateModel,
                contents: [{ role: "user", parts: userParts }],
                config: {
                  responseMimeType: "application/json",
                  temperature: attempt === 0 ? 0.2 : 0.1,
                  maxOutputTokens: 8192,
                  abortSignal: abortCtrl.signal,
                  ...(supportsThinking ? { thinkingConfig: { thinkingBudget } } : {}),
                },
              });

              const timeoutPromise = new Promise<never>((_, reject) =>
                abortCtrl.signal.addEventListener("abort", () =>
                  reject(new Error(`Morph ${candidateModel} timed out after ${timeoutMs}ms`))
                )
              );

              const response: any = await Promise.race([generatePromise, timeoutPromise]);
              const responseText = response?.text?.trim() || "";
              const candidateParsed = parseMorphJson(responseText);
              const hasContent =
                candidateParsed &&
                ((Array.isArray(candidateParsed.cards) && candidateParsed.cards.length > 0) ||
                  (Array.isArray(candidateParsed.journey?.stages) &&
                    candidateParsed.journey.stages.length > 0) ||
                  (Array.isArray(candidateParsed.conceptMap?.pillars) &&
                    candidateParsed.conceptMap.pillars.length > 0));

              if (!hasContent) {
                console.warn(
                  `[Morph] ${candidateModel} attempt ${attempt + 1} invalid JSON (len=${responseText.length}):`,
                  responseText.slice(0, 180)
                );
                throw new Error(`Morph ${candidateModel} returned invalid or incomplete JSON`);
              }

              parsed = candidateParsed;
              usedModel = candidateModel;
              clearModelCooldown(`gemini:${candidateModel}`);
              break;
            } catch (modelErr: any) {
              lastGeminiError = modelErr?.message || String(modelErr);
              if (attempt === maxAttempts - 1) {
                markModelCooldownFromError(`gemini:${candidateModel}`, modelErr);
              }
              console.warn(`[Morph] ${candidateModel} failed:`, lastGeminiError);
            } finally {
              clearTimeout(timer);
            }
          }
          if (parsed) break;
        }

        if (parsed) {
          const focalConcept =
            String(parsed.focalConcept || customTopic || `Page ${pageNumber} Study Concept`).trim();

          // Map AI Cards
          const cardBadgeTypes = ["accent-orange", "accent-teal", "accent-magenta", "accent-cream"] as const;
          const roadmapCards = (Array.isArray(parsed.cards) ? parsed.cards : []).map((c: any, i: number) => ({
            id: `card-ai-${i + 1}`,
            badge: c.badge || "Core Concept",
            badgeType: c.badgeType || cardBadgeTypes[i % cardBadgeTypes.length],
            title: c.title || `Concept ${i + 1}`,
            subtitle: c.subtitle || "",
            bulletPoints:
              Array.isArray(c.bulletPoints) && c.bulletPoints.length > 0
                ? c.bulletPoints
                : [c.subtitle || "Key takeaway from passage"],
            contextLink: {
              targetPageOrSegment: pageNumber,
              label: `Source Page ${pageNumber}`,
              rationale: "Grounded directly in active passage.",
            },
          }));

          // Map AI Flow Nodes
          const colors = ["#43a08f", "#ff4c00", "#e0459a", "#7fd8c9"];
          const xPositions = [50, 190, 330, 470];
          const flowNodes = (parsed.flowNodes || []).slice(0, 4).map((fn: any, idx: number) => ({
            id: fn.id || `node-${idx + 1}`,
            label: fn.label || `Stage ${idx + 1}`,
            sublabel: fn.sublabel || "",
            category: fn.category || (idx === 0 ? "input" : idx === parsed.flowNodes.length - 1 ? "output" : "process"),
            color: colors[idx % colors.length],
            x: xPositions[idx] || (50 + idx * 130),
            y: 75,
            details: fn.details || fn.sublabel || "",
          }));

          const flowEdges = [];
          for (let i = 0; i < flowNodes.length - 1; i++) {
            flowEdges.push({
              from: flowNodes[i].id,
              to: flowNodes[i + 1].id,
              animated: true,
            });
          }

          // Map AI Comparison Matrix
          let comparisonBlock: any = null;
          if (parsed.comparison?.leftTitle && parsed.comparison?.rightTitle) {
            comparisonBlock = {
              id: "block-ai-comparison",
              type: "comparison_matrix",
              title: `${parsed.comparison.leftTitle} vs ${parsed.comparison.rightTitle}`,
              subtitle: "Differential comparison grounded in your source",
              badge: "Comparative Matrix",
              comparisonData: {
                left: {
                  title: parsed.comparison.leftTitle,
                  badge: parsed.comparison.leftBadge || "Category A",
                  badgeType: "accent-teal",
                  characteristics: parsed.comparison.leftPoints || [],
                },
                right: {
                  title: parsed.comparison.rightTitle,
                  badge: parsed.comparison.rightBadge || "Category B",
                  badgeType: "accent-magenta",
                  characteristics: parsed.comparison.rightPoints || [],
                },
              },
            };
          }

          // Map AI Concept Mind Map
          const mindMapPillars = Array.isArray(parsed.conceptMap?.pillars) ? parsed.conceptMap.pillars : [];
          const pillarColors = ["#ff4c00", "#43a08f", "#7fd8c9", "#e0459a"];
          const rootLabel = parsed.conceptMap?.root || focalConcept;
          const aiMindMapNodes: any[] = [
            {
              id: "root-1",
              label: rootLabel,
              sublabel: `Source: Page ${pageNumber}`,
              category: "root",
              color: "#ff4c00",
              details: `Core conceptual foundation extracted from Page ${pageNumber}.`,
              level: 0,
              x: 30,
              y: 110,
            },
          ];
          const aiMindMapEdges: any[] = [];

          mindMapPillars.slice(0, 4).forEach((pillar: any, pIdx: number) => {
            const pillarId = `pillar-${pIdx + 1}`;
            const pColor = pillarColors[pIdx % pillarColors.length];
            aiMindMapNodes.push({
              id: pillarId,
              label: pillar.label || `Pillar ${pIdx + 1}`,
              sublabel: pillar.category || "Principle",
              category: "pillar",
              color: pColor,
              details: pillar.details || "",
              parent: "root-1",
              level: 1,
              x: 250,
              y: 25 + pIdx * 94,
            });

            aiMindMapEdges.push({
              from: "root-1",
              to: pillarId,
              label: pIdx === 0 ? "Drives" : pIdx === 1 ? "Adapts" : pIdx === 2 ? "Manifests" : "Rule",
            });

            if (pillar.leafLabel) {
              const leafId = `leaf-${pIdx + 1}-1`;
              aiMindMapNodes.push({
                id: leafId,
                label: pillar.leafLabel,
                sublabel: "Mechanism",
                category: "mechanism",
                color: pColor,
                details: pillar.leafDetails || pillar.details || "",
                parent: pillarId,
                level: 2,
                x: 480,
                y: 25 + pIdx * 94,
              });

              aiMindMapEdges.push({
                from: pillarId,
                to: leafId,
              });
            }
          });

          const newBlocks: any[] = [];

          if (aiMindMapNodes.length >= 2) {
            newBlocks.push({
              id: "block-ai-mindmap",
              type: "mind_map",
              title: "Core Principles Concept Map",
              subtitle: `Hierarchical mental model extracted from Page ${pageNumber}`,
              badge: "Concept Map",
              mindMapData: {
                rootLabel,
                nodes: aiMindMapNodes,
                edges: aiMindMapEdges,
              },
            });
          }

          if (roadmapCards.length > 0) {
            newBlocks.push({
              id: "block-ai-roadmap",
              type: "roadmap_cards",
              title: "Synthesized Concept Breakdown",
              subtitle: `Structured takeaways synthesized directly from Page ${pageNumber}`,
              badge: `Grounded in Page ${pageNumber}`,
              roadmapCards,
            });
          }

          if (flowNodes.length >= 2) {
            newBlocks.push({
              id: "block-ai-flow-diagram",
              type: "interactive_diagram",
              title: "Causal Flow Mechanism",
              subtitle: "Visual causal chain extracted from your reading passage",
              badge: "Interactive Graph",
              diagramData: { nodes: flowNodes, edges: flowEdges },
            });
          }

          if (comparisonBlock) {
            newBlocks.push(comparisonBlock);
          }

          artifactData = {
            bookId: String(bookId),
            segmentIndex,
            focalConcept,
            selectionHash,
            contextSummary: {
              precedingBridge: `Grounded in Page ${pageNumber} of ${bookTitle}.`,
              subsequentBridge: parsed.journey?.summary || `Synthesized via ${usedModel}.`,
            },
            blocks: newBlocks,
            journey: normalizeJourney(parsed.journey, focalConcept),
            createdAt: new Date().toISOString(),
          };
        }
      } catch (aiErr: any) {
        lastGeminiError = aiErr?.message || String(aiErr);
        console.error("[/api/morph] Gemini Morph synthesis error:", lastGeminiError);
      }
    }

    if (!artifactData) {
      return NextResponse.json(
        {
          error: `Morph synthesis failed (${lastGeminiError}). Please click Re-morph to retry.`,
        },
        { status: 503 },
      );
    }

    // 4. Save to MongoDB with true content hash
    if (isMongoId) {
      try {
        await connectToDatabase();
        await MorphArtifact.findOneAndUpdate(
          { bookId, selectionHash },
          {
            ...artifactData,
            bookId,
            segmentIndex,
            selectionHash,
            clerkId: userId || undefined,
          },
          { upsert: true, returnDocument: "after" },
        ).lean();
      } catch (dbErr) {
        console.warn("MongoDB caching skipped for morph artifact:", dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      artifact: artifactData,
      data: artifactData,
      cached: false,
      creditsCharged: dynamicCost.total,
      creditsRemaining: creditCheck.remaining,
      creditBreakdown: dynamicCost.summary,
    });
  } catch (error) {
    console.error("Error in /api/morph:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to synthesize morph",
      },
      { status: 500 },
    );
  }
}
