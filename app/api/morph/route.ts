import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/database/mongoose";
import MorphArtifact from "@/database/models/morph-artifact.model";
import { ContextEnvelope } from "@/types/morph";
import { synthesizeMorphBlocks } from "@/lib/morph/synthesizer";
import { auth } from "@clerk/nextjs/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      bookTitle,
      selectedText,
      precedingSegments = [],
      subsequentSegments = [],
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

    if (!focalText) {
      return NextResponse.json(
        { error: "Missing focal reading text to morph" },
        { status: 400 },
      );
    }

    const { userId } = await auth();
    const selectionHash = selectedText
      ? String(selectedText.trim().length)
      : "default";

    // 1. Build Context Envelope
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

    // 2. Synthesize baseline structured morph blocks (includes diagrams, maps, matrices)
    let artifactData = synthesizeMorphBlocks(envelope);

    // 3. If Gemini API key is configured, enrich with live AI semantic synthesis
    if (process.env.GEMINI_API_KEY) {
      try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const targetPassage = (selectedText || focalText).slice(0, 1600);

        const prompt = `You are Ascleon's elite Multi-Modal Morph Engine. Transform this study passage from "${bookTitle}" into interactive conceptual cards and a visual causal flow diagram for deep retention.

Passage to Morph:
"${targetPassage}"

Respond with ONLY a JSON object with this exact shape:
{
  "focalConcept": "Punchy concept title (max 6 words)",
  "cards": [
    {
      "badge": "Short badge (e.g. Core Principle, Rule of Thumb, Key Invariant, Anti-Pattern, Memory Anchor)",
      "badgeType": "accent-orange" | "accent-teal" | "accent-magenta" | "accent-cream",
      "title": "Concise concept title (max 5 words)",
      "subtitle": "One sentence summary of the core insight",
      "bulletPoints": [
        "First actionable takeaway directly from the text",
        "Second actionable takeaway directly from the text",
        "Third actionable takeaway or practical heuristic"
      ]
    }
  ],
  "flowNodes": [
    {
      "id": "node-1",
      "label": "Short Step Label (max 3 words)",
      "sublabel": "Brief context (max 4 words)",
      "category": "input" | "process" | "decision" | "output",
      "details": "Clear explanation of how this step operates and leads to the next"
    },
    {
      "id": "node-2",
      "label": "Second Step",
      "sublabel": "Transformative mechanism",
      "category": "process",
      "details": "Explanation of the mechanism"
    },
    {
      "id": "node-3",
      "label": "Third Step",
      "sublabel": "Real-world outcome",
      "category": "output",
      "details": "Observable consequence"
    }
  ]
}`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        });

        if (response.text) {
          const parsed = JSON.parse(response.text);
          if (parsed && Array.isArray(parsed.cards) && parsed.cards.length > 0) {
            artifactData.focalConcept =
              parsed.focalConcept || artifactData.focalConcept;
            const roadmapBlock = artifactData.blocks.find(
              (b) => b.type === "roadmap_cards"
            );
            if (roadmapBlock) {
              roadmapBlock.roadmapCards = parsed.cards.map(
                (c: any, i: number) => ({
                  id: `card-ai-${i + 1}`,
                  badge: c.badge || "Key Concept",
                  badgeType:
                    c.badgeType ||
                    ["accent-orange", "accent-teal", "accent-magenta", "accent-cream"][
                      i % 4
                    ],
                  title: c.title || `Concept ${i + 1}`,
                  subtitle: c.subtitle || "",
                  bulletPoints: Array.isArray(c.bulletPoints)
                    ? c.bulletPoints
                    : [c.subtitle],
                })
              );
            }

            // Update or enrich visual flow diagram if AI returned flowNodes
            if (Array.isArray(parsed.flowNodes) && parsed.flowNodes.length >= 2) {
              const diagramBlock = artifactData.blocks.find(
                (b) => b.type === "interactive_diagram"
              );
              const xPositions = [50, 190, 330, 440];
              const colors = ["#43a08f", "#ff4c00", "#e0459a", "#7fd8c9"];

              const nodes = parsed.flowNodes.slice(0, 4).map((fn: any, idx: number) => ({
                id: fn.id || `node-${idx + 1}`,
                label: fn.label || `Stage ${idx + 1}`,
                sublabel: fn.sublabel || "",
                category: fn.category || (idx === 0 ? "input" : idx === parsed.flowNodes.length - 1 ? "output" : "process"),
                color: colors[idx % colors.length],
                x: xPositions[idx] || (50 + idx * 120),
                y: 75,
                details: fn.details || fn.sublabel || "",
              }));

              const edges = [];
              for (let i = 0; i < nodes.length - 1; i++) {
                edges.push({
                  from: nodes[i].id,
                  to: nodes[i + 1].id,
                  animated: true,
                });
              }

              if (diagramBlock) {
                diagramBlock.diagramData = { nodes, edges };
              } else {
                artifactData.blocks.splice(1, 0, {
                  id: "block-ai-flow-diagram",
                  type: "interactive_diagram",
                  title: "AI-Synthesized Causal Flow Map",
                  subtitle: "Visual chain of principles extracted from your passage",
                  badge: "Interactive Graph",
                  diagramData: { nodes, edges },
                });
              }
            }
          }
        }
      } catch (aiErr) {
        console.warn(
          "Gemini Morph enrichment failed, using deterministic synthesizer:",
          aiErr
        );
      }
    }

    // 4. Safe Database Caching (only if bookId is a valid Mongo ObjectId)
    const isMongoId = mongoose.Types.ObjectId.isValid(String(bookId));
    let cachedDoc = null;

    if (isMongoId) {
      try {
        await connectToDatabase();

        // Check if existing artifact exists
        cachedDoc = await MorphArtifact.findOne({
          bookId,
          segmentIndex,
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

        // Cache newly synthesized artifact
        await MorphArtifact.findOneAndUpdate(
          { bookId, segmentIndex, selectionHash },
          {
            ...artifactData,
            bookId,
            clerkId: userId || undefined,
          },
          { upsert: true, new: true },
        ).lean();
      } catch (dbErr) {
        console.warn("MongoDB caching skipped for morph artifact:", dbErr);
      }
    }

    // Return synthesized artifact
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
