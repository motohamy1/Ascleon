import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import crypto from "crypto";
import { connectToDatabase } from "@/database/mongoose";
import MorphArtifact from "@/database/models/morph-artifact.model";
import { ContextEnvelope } from "@/types/morph";
import { synthesizeMorphBlocks } from "@/lib/morph/synthesizer";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenAI } from "@google/genai";

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
    } = body;

    const bookId = body.bookId || body.id || "default-book";
    const segmentIndex =
      typeof body.segmentIndex === "number"
        ? body.segmentIndex
        : typeof body.currentSegmentIndex === "number"
        ? body.currentSegmentIndex
        : 0;

    const focalText =
      body.focalText ||
      body.currentSegmentContent ||
      body.content ||
      selectedText ||
      "";

    const pageNumber =
      body.pageNumber ||
      body.currentPageNumber ||
      (typeof segmentIndex === "number" ? segmentIndex + 1 : 1);

    if (!focalText && !snippedDiagram) {
      return NextResponse.json(
        { error: "Missing focal reading text or diagram to morph" },
        { status: 400 },
      );
    }

    const { userId } = await auth();

    // Compute true content hash to prevent stale cache collisions
    const targetPassage = (selectedText || focalText).trim();
    const hashInput = `${targetPassage.slice(0, 1000)}_${snippedDiagram ? "img" : "noimg"}`;
    const selectionHash = crypto.createHash("sha256").update(hashInput).digest("hex").slice(0, 16);

    // 1. Build Context Envelope & Baseline Fallback
    const envelope: ContextEnvelope = {
      bookId: String(bookId),
      bookTitle: bookTitle || "Study Document",
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
        const prompt = `You are Ascleon's elite Multi-Modal Morph Engine.
Transform this study passage from "${bookTitle}" (Page ${pageNumber}) into interactive conceptual cards, a visual causal flow diagram, and a comparison contrast matrix for deep retention.

Source Text to Morph:
"""
${targetPassage.slice(0, 3000)}
"""

Instructions:
1. Ground every card, node, and matrix row strictly in this passage.
2. Produce:
   - "focalConcept": Punchy concept title (max 6 words).
   - "conceptMap": Hierarchical mind map of the core principles:
     - "root": Central topic title (max 5 words)
     - "pillars": Array of 3-4 key pillars/branches with:
       - "label": Pillar title (max 4 words)
       - "category": Category (e.g. "Hemodynamics", "Remodeling", "ECG", "Rule")
       - "details": 1-2 sentence core mechanism
       - "leafLabel": Concrete metric, rule or cutoff (max 5 words)
       - "leafDetails": Exact finding or clinical significance
   - "cards": 3-4 structured cards with:
     - "badge": e.g. "Core Invariant", "Key Mechanism", "Clinical Pearl", "Rule of Thumb", "Warning"
     - "badgeType": one of "accent-orange", "accent-teal", "accent-magenta", "accent-cream"
     - "title": Short title (max 5 words)
     - "subtitle": Concise 1-sentence insight
     - "bulletPoints": 3 high-yield bullet points directly from the text
   - "flowNodes": 3-4 causal nodes representing the process flow:
     - "id": "node-1", "node-2", etc.
     - "label": Short step label (max 3 words)
     - "sublabel": Brief context (max 4 words)
     - "category": "input" | "process" | "decision" | "output"
     - "details": Clear explanation of this step
   - "comparison": Contrast matrix comparing 2 key concepts or states mentioned in the passage:
     - "leftTitle": First concept title
     - "leftBadge": Badge text
     - "leftPoints": Array of 3 { "label": string, "value": string, "isPositive": boolean }
     - "rightTitle": Second concept title
     - "rightBadge": Badge text
     - "rightPoints": Array of 3 { "label": string, "value": string, "isPositive": boolean }

Return ONLY a JSON object matching this structure.`;

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
            temperature: 0.2,
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        });

        // 30-second timeout guard to ensure complex multi-card schemas never drop prematurely
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Gemini generation timed out after 30s")), 30000)
        );

        const response: any = await Promise.race([generatePromise, timeoutPromise]);

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
