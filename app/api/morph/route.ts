import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import crypto from "crypto";
import { connectToDatabase } from "@/database/mongoose";
import MorphArtifact from "@/database/models/morph-artifact.model";
import { ContextEnvelope } from "@/types/morph";
import { synthesizeMorphBlocks } from "@/lib/morph/synthesizer";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenAI } from "@google/genai";
import { buildLanguageDirective, StudyLanguage } from "@/lib/language";
import { getBookSegmentsByRange } from "@/lib/actions/book.actions";

export async function POST(req: NextRequest) {
  try {
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

    // Ground via Universal Book RAG if bookId is available
    if (bookId && bookId !== "default-book") {
      try {
        const { retrieveFromBookRAG } = await import("@/lib/ai/rag/book-rag-retriever");
        const ragRes = await retrieveFromBookRAG({
          bookId,
          query: customTopic || (studyScope?.topicTitle) || selectedText || focalText.slice(0, 300),
          scope: studyScope,
          activePage: pageNumber,
          topK: 5,
        });
        if (ragRes.combinedContext) {
          focalText = ragRes.combinedContext;
        }
      } catch (ragErr) {
        console.warn("[/api/morph] Book RAG retrieval fallback:", ragErr);
      }
    } else if (studyScope && studyScope.startPage && studyScope.endPage && bookId) {
      if (studyScope.startPage !== studyScope.endPage || studyScope.type === "topic" || studyScope.type === "range") {
        const segRes = await getBookSegmentsByRange(bookId, studyScope.startPage, studyScope.endPage);
        if (segRes.success && segRes.data && segRes.data.length > 0) {
          focalText = segRes.data
            .map((s) => `--- PAGE ${s.pageNumber || "?"} ---\n${s.content}`)
            .join("\n\n");
        }
      }
    }

    if (!focalText && !snippedDiagram && !customTopic) {
      return NextResponse.json(
        { error: "Missing focal reading text, topic, or diagram to morph" },
        { status: 400 },
      );
    }

    const { userId } = await auth();

    // Compute true content hash to prevent stale cache collisions
    const targetPassage = customTopic
      ? `FOCUS TOPIC: "${customTopic}"\n\n${(selectedText || focalText).trim()}`
      : (selectedText || focalText).trim();
    const hashInput = `${language}_${customTopic || ""}_${targetPassage.slice(0, 1000)}_${snippedDiagram ? "img" : "noimg"}`;
    const selectionHash = crypto.createHash("sha256").update(hashInput).digest("hex").slice(0, 16);

    // 1. Build Context Envelope & Baseline Fallback
    const envelope: ContextEnvelope = {
      bookId: String(bookId),
      bookTitle: bookTitle || "Study Document",
      customTopic: customTopic || undefined,
      segmentIndex,
      pageNumber,
      focalText,
      selectedText,
      precedingSegments,
      subsequentSegments,
    };

    let artifactData = synthesizeMorphBlocks(envelope);

    // 2. Check Database Cache (unless forceRefresh requested)
    const isMongoId = mongoose.Types.ObjectId.isValid(String(bookId));
    if (isMongoId && !forceRefresh) {
      try {
        await connectToDatabase();
        const cachedDoc = await MorphArtifact.findOne({
          bookId,
          selectionHash,
        }).lean();

        if (cachedDoc) {
          return NextResponse.json({
            success: true,
            artifact: cachedDoc,
            data: cachedDoc,
            cached: true,
          });
        }
      } catch (cacheCheckErr) {
        console.warn("Morph cache lookup warning:", cacheCheckErr);
      }
    }

    // 3. Live AI Synthesis via Gemini 3.8 Flash
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
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
          const cleanBase64 = snippedDiagram.replace(/^data:image\/\w+;base64,/, "");
          userParts.push({
            inlineData: {
              mimeType: "image/png",
              data: cleanBase64,
            },
          });
        }

        let response: any = null;
        try {
          const generatePromise = ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [{ role: "user", parts: userParts }],
            config: {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
          });

          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Gemini generation timed out after 28s")), 28000)
          );

          response = await Promise.race([generatePromise, timeoutPromise]);
        } catch (primaryErr) {
          console.warn("Primary Gemini 3 Flash morph generation failed, attempting gemini-3.8-flash fallback:", primaryErr);
          response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [{ role: "user", parts: userParts }],
            config: {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
          });
        }

        const responseText = response.text?.trim() || "";
        if (responseText) {
          const parsed = JSON.parse(responseText);

          if (parsed && Array.isArray(parsed.cards) && parsed.cards.length > 0) {
            artifactData.focalConcept = parsed.focalConcept || artifactData.focalConcept;

            // Map AI Cards
            const cardBadgeTypes = ["accent-orange", "accent-teal", "accent-magenta", "accent-cream"];
            const roadmapCards = parsed.cards.map((c: any, i: number) => ({
              id: `card-ai-${i + 1}`,
              badge: c.badge || "Core Concept",
              badgeType: c.badgeType || cardBadgeTypes[i % cardBadgeTypes.length],
              title: c.title || `Concept ${i + 1}`,
              subtitle: c.subtitle || "",
              bulletPoints: Array.isArray(c.bulletPoints) && c.bulletPoints.length > 0
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
            const rootLabel = parsed.conceptMap?.root || artifactData.focalConcept;
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

            // Assemble new clean blocks
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

            newBlocks.push({
              id: "block-ai-roadmap",
              type: "roadmap_cards",
              title: "Synthesized Concept Breakdown",
              subtitle: `Structured takeaways synthesized directly from Page ${pageNumber}`,
              badge: `Grounded in Page ${pageNumber}`,
              roadmapCards,
            });

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

            if (parsed.journey && Array.isArray(parsed.journey.stages) && parsed.journey.stages.length > 0) {
              artifactData.journey = parsed.journey;
            }

            artifactData.blocks = newBlocks;
          }
        }
      } catch (aiErr) {
        console.warn("Gemini Morph synthesis failed, using dynamic local synthesis:", aiErr);
      }
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
