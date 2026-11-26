import { GoogleGenAI } from "@google/genai";
import { connectToDatabase } from "@/database/mongoose";
import Book from "@/database/models/book.model";
import BookSegment from "@/database/models/book-segment.model";
import { ReferenceResource } from "@/types/knowledge";
import {
  clearModelCooldown,
  FAST_GEMINI_MODEL_CHAIN,
  markModelCooldownFromError,
  orderModelsByHealth,
} from "@/lib/ai/model-cooldown";
import { extractDeterministicPageMetadata } from "@/lib/ai/rag/chunker";
import { sanitizeTopicCandidates } from "@/lib/ai/rag/topic-resolution";

export interface DigestionStatusUpdate {
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  stage: string;
  digestedPages: number;
  totalPages: number;
}

function parseJsonSafe(rawText: string): any | null {
  if (!rawText) return null;
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function generateJsonWithFallbackChain(
  ai: GoogleGenAI,
  prompt: string,
  timeoutMs: number = 15_000
): Promise<any | null> {
  const models = orderModelsByHealth(FAST_GEMINI_MODEL_CHAIN);
  for (const modelName of models) {
    const abortCtrl = new AbortController();
    const timer = setTimeout(() => abortCtrl.abort(), timeoutMs);
    try {
      const resp: any = await Promise.race([
        ai.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            responseMimeType: "application/json",
            temperature: 0.1,
            abortSignal: abortCtrl.signal,
          },
        }),
        new Promise<never>((_, reject) =>
          abortCtrl.signal.addEventListener("abort", () =>
            reject(new Error(`Digestion ${modelName} timed out after ${timeoutMs}ms`))
          )
        ),
      ]);
      const parsed = parseJsonSafe(resp?.text || "");
      if (parsed) {
        clearModelCooldown(`gemini:${modelName}`);
        return parsed;
      }
    } catch (err) {
      markModelCooldownFromError(`gemini:${modelName}`, err);
      console.warn(`[digestion-engine] ${modelName} note:`, err instanceof Error ? err.message : err);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/**
 * Selects up to `maxCount` evenly-spaced segments across the entire book for batched LLM enrichment.
 */
function selectSampledSegments<T>(items: T[], maxCount: number): T[] {
  if (items.length <= maxCount) return items;
  const result: T[] = [];
  const step = (items.length - 1) / Math.max(1, maxCount - 1);
  const usedIndices = new Set<number>();
  for (let i = 0; i < maxCount; i++) {
    const idx = Math.min(items.length - 1, Math.round(i * step));
    if (!usedIndices.has(idx)) {
      usedIndices.add(idx);
      result.push(items[idx]);
    }
  }
  return result;
}

/**
 * Universal RAG Digestion Engine
 * Runs fast deterministic bulk indexing across 100% of pages first, then enriches
 * domain profile, continuous multi-page topicMap, and batched page concepts via Gemini.
 */
export async function runUniversalRagDigestion(bookId: string): Promise<boolean> {
  await connectToDatabase();
  const book = await Book.findById(bookId);
  if (!book) return false;

  const apiKey = process.env.GEMINI_API_KEY;
  const hasGeminiKey = Boolean(apiKey && apiKey !== "your_gemini_api_key_here");
  const ai = hasGeminiKey ? new GoogleGenAI({ apiKey: apiKey! }) : null;

  try {
    book.ingestionStatus = "processing";
    book.ingestionProgress = 10;
    book.ingestionStage = "Indexing page structure & profiling discipline...";
    await book.save();

    const segments = (await BookSegment.find({ bookId })
      .select("_id pageNumber content segmentIndex headings keyTerms clinicalEntities goldStandards summary")
      .sort({ pageNumber: 1, segmentIndex: 1 })
      .lean()) as any[];

    const totalPages = book.totalPages || segments.length || 1;
    book.totalPages = totalPages;

    // ------------------------------------------------------------------------
    // STAGE 1: Deterministic Metadata Indexing across ALL pages (<500ms, 100% reliable)
    // ------------------------------------------------------------------------
    const deterministicBySegId = new Map<string, ReturnType<typeof extractDeterministicPageMetadata>>();
    const deterministicOps: any[] = [];

    for (const seg of segments) {
      const pNum = seg.pageNumber || seg.segmentIndex + 1;
      const meta = extractDeterministicPageMetadata(pNum, String(seg.content || ""));
      deterministicBySegId.set(String(seg._id), meta);

      const updates: Record<string, unknown> = {};
      if (!Array.isArray(seg.headings) || seg.headings.length === 0) {
        updates.headings = meta.headings;
      }
      if (!Array.isArray(seg.keyTerms) || seg.keyTerms.length === 0) {
        updates.keyTerms = meta.keyTerms;
      }
      if (!seg.summary) {
        updates.summary = meta.summary;
      }

      if (Object.keys(updates).length > 0) {
        deterministicOps.push({
          updateOne: {
            filter: { _id: seg._id },
            update: { $set: updates },
          },
        });
      }
    }

    if (deterministicOps.length > 0) {
      await BookSegment.bulkWrite(deterministicOps, { ordered: false });
    }

    book.ingestionProgress = 30;
    book.digestedPages = segments.length;
    book.ingestionStage = "Profiling discipline & domain boundaries...";
    await book.save();

    // ------------------------------------------------------------------------
    // STAGE 2: Domain Profile & Canonical Reference Foundation (30% -> 45%)
    // ------------------------------------------------------------------------
    const sampleIndices = [
      0,
      Math.floor(segments.length * 0.25),
      Math.floor(segments.length * 0.5),
      Math.floor(segments.length * 0.75),
      Math.max(0, segments.length - 1),
    ].filter((v, i, a) => a.indexOf(v) === i && segments[v]);

    const sampledSnippets = sampleIndices
      .map(
        (idx) =>
          `[Page ${segments[idx].pageNumber || idx + 1}]:\n${String(segments[idx].content || "").slice(0, 450)}`
      )
      .join("\n\n");

    let profileResult: any = null;
    if (ai && sampledSnippets) {
      const profilePrompt = `You are Ascleon's Universal Academic & Scientific Curriculum Architect.
Analyze the source study below and construct a strict discipline profile and dynamic canonical reference foundation.

Source Title: "${book.title}"
Author: "${book.author || "Unknown"}"
Document Topic/Category: "${book.topic || book.sourceCategory || "General Academic"}"

Excerpts across the document:
"""
${sampledSnippets}
"""

Task:
1. Determine the EXACT academic/professional discipline ("primaryField") and specific area ("subField").
2. Define "domainBoundaries": list 3-5 adjacent fields or sub-specialties that must NEVER pollute or cross into this book's explanations unless explicitly requested by the student.
3. Provide "pedagogicalStyle": one of ["clinical_diagnostic", "software_architecture_code", "formal_stem_proofs", "legal_statute_precedent", "empirical_science", "humanities_critical_analysis"].
4. Generate 2-4 "dynamicCanonicalReferences": authentic, recognized gold-standard textbooks, authoritative specifications, clinical guidelines, or seminal academic treatises specific to THIS EXACT subField.

Return ONLY a JSON object:
{
  "primaryField": string,
  "subField": string,
  "domainBoundaries": string[],
  "pedagogicalStyle": string,
  "dynamicCanonicalReferences": [
    {
      "id": string,
      "source": string,
      "type": "textbook" | "guideline" | "specification" | "treatise",
      "title": string,
      "chapterOrSection": string,
      "excerpt": string,
      "clinicalPearls": string[],
      "relevanceTag": string
    }
  ]
}`;
      profileResult = await generateJsonWithFallbackChain(ai, profilePrompt, 15_000);
    }

    const primaryField =
      profileResult?.primaryField || book.domain || book.topic || "General Academic";
    const subField = profileResult?.subField || book.subspecialty || primaryField;
    const domainBoundaries = profileResult?.domainBoundaries || [];
    const pedagogicalStyle =
      profileResult?.pedagogicalStyle || book.pedagogicalStyle || "empirical_science";
    const dynamicCanonicalReferences: ReferenceResource[] =
      Array.isArray(profileResult?.dynamicCanonicalReferences) &&
      profileResult.dynamicCanonicalReferences.length > 0
        ? profileResult.dynamicCanonicalReferences
        : Array.isArray(book.blueprint?.dynamicCanonicalReferences) &&
            book.blueprint.dynamicCanonicalReferences.length > 0
          ? book.blueprint.dynamicCanonicalReferences
          : [
              {
                id: `ref-canon-1`,
                source: `Authoritative Canon for ${subField}`,
                type: "textbook",
                title: `Foundations of ${subField}`,
                chapterOrSection: `Canonical Principles of ${book.title}`,
                excerpt: `Primary foundational principles and invariant rules in ${subField}.`,
                clinicalPearls: [
                  `Ground all mechanisms in established principles of ${subField}.`,
                  `Verify core assertions against the source study before extrapolating.`,
                ],
                relevanceTag: subField.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
              },
            ];

    book.domain = primaryField;
    book.subspecialty = subField;
    book.pedagogicalStyle = pedagogicalStyle;
    book.blueprint = {
      ...(book.blueprint || {}),
      primaryField,
      subField,
      domainBoundaries,
      fieldPedagogyStyle: pedagogicalStyle,
      dynamicCanonicalReferences,
      authoritativeReferences: dynamicCanonicalReferences,
    };

    book.ingestionProgress = 45;
    book.ingestionStage = "Building continuous multi-page topic map...";
    await book.save();

    // ------------------------------------------------------------------------
    // STAGE 3: Multi-Page Topic Map Construction (45% -> 65%)
    // ------------------------------------------------------------------------
    const compressedStep = segments.length > 220 ? Math.ceil(segments.length / 200) : 1;
    const pageIndexSummaries = segments
      .filter((_, idx) => idx % compressedStep === 0 || idx === segments.length - 1)
      .map((s) => {
        const meta = deterministicBySegId.get(String(s._id));
        const headings = (s.headings?.length ? s.headings : meta?.headings || []).join(" / ");
        const snippet = String(s.content || "").slice(0, 180).replace(/\s+/g, " ").trim();
        return {
          page: s.pageNumber || s.segmentIndex + 1,
          heading: headings || undefined,
          snippet,
        };
      });

    let topicMapResult: any = null;
    if (ai && pageIndexSummaries.length > 0) {
      const topicPrompt = `You are Ascleon's Whole-Source Curriculum Architect.
Analyze the document page index and construct a complete, continuous "topicMap" dividing the source into contiguous, pedagogically coherent multi-page topics.

Document: "${book.title}" (${totalPages} total pages)
Discipline: ${primaryField} (${subField})

Page Index:
${JSON.stringify(pageIndexSummaries, null, 2).slice(0, 42000)}

Requirements:
1. Divide the document into focused, cohesive single-lecture or single-subtopic sections covering pages 1 to ${totalPages}.
2. Keep each topic range focused (typically 2 to 12 pages per topic; NEVER bundle 20+ pages into one giant bucket). Aim for up to 24 cohesive topics.
3. For each topic:
   - "id": lowercase slug e.g. "intro-to-concurrency"
   - "title": Specific canonical academic or clinical title anchored to the real section headings (NEVER use generic titles like "General" or "Overview")
   - "startPage": 1-based integer (<= endPage)
   - "endPage": 1-based integer (>= startPage)
   - "keyConcepts": 2-4 primary concepts/theorems/entities
   - "subtopics": 1-3 specific sections or nuances
4. Specify "recommendedStartingTopicId".

Return ONLY JSON:
{
  "totalDetectedTopics": number,
  "topics": [
    {
      "id": string,
      "title": string,
      "startPage": number,
      "endPage": number,
      "keyConcepts": string[],
      "subtopics": string[]
    }
  ],
  "recommendedStartingTopicId": string
}`;
      topicMapResult = await generateJsonWithFallbackChain(ai, topicPrompt, 20_000);
    }

    const sanitizedTopics = sanitizeTopicCandidates(topicMapResult?.topics).map((t, idx) => ({
      id: t.id || `topic-${idx + 1}`,
      title: t.title,
      startPage: t.startPage,
      endPage: t.endPage,
      keyConcepts: t.keyConcepts || [],
      subtopics: Array.isArray((topicMapResult?.topics?.[idx] as any)?.subtopics)
        ? (topicMapResult.topics[idx] as any).subtopics
        : [],
    }));

    if (sanitizedTopics.length > 0) {
      topicMapResult = {
        totalDetectedTopics: sanitizedTopics.length,
        topics: sanitizedTopics,
        recommendedStartingTopicId:
          topicMapResult?.recommendedStartingTopicId || sanitizedTopics[0].id,
      };
    } else {
      const MAX_FALLBACK_SPAN = 8;
      const fallbackTopics: Array<{
        id: string;
        title: string;
        startPage: number;
        endPage: number;
        keyConcepts: string[];
        subtopics: string[];
      }> = [];
      let i = 0;
      while (i < segments.length) {
        const startSeg = segments[i];
        const startP = startSeg.pageNumber || i + 1;
        const meta = deterministicBySegId.get(String(startSeg._id));
        const inferredHeading = meta?.headings?.[0] || startSeg.headings?.[0];

        let endIdx = i;
        while (endIdx + 1 < segments.length && endIdx - i + 1 < MAX_FALLBACK_SPAN) {
          const nextSeg = segments[endIdx + 1];
          const nextMeta = deterministicBySegId.get(String(nextSeg._id));
          const nextHeading = nextMeta?.headings?.[0] || nextSeg.headings?.[0];
          if (
            nextHeading &&
            inferredHeading &&
            nextHeading.toLowerCase() !== inferredHeading.toLowerCase() &&
            endIdx > i
          ) {
            break;
          }
          endIdx++;
        }

        const endP = segments[endIdx].pageNumber || startP;
        const topicNum = fallbackTopics.length + 1;
        fallbackTopics.push({
          id: `topic-${topicNum}`,
          title: inferredHeading
            ? `${inferredHeading} (Pages ${Math.min(startP, endP)}–${Math.max(startP, endP)})`
            : `Section ${topicNum} (Pages ${Math.min(startP, endP)}–${Math.max(startP, endP)})`,
          startPage: Math.min(startP, endP),
          endPage: Math.max(startP, endP),
          keyConcepts: meta?.keyTerms?.slice(0, 4) || [book.title, subField],
          subtopics: [],
        });
        i = endIdx + 1;
      }
      topicMapResult = {
        totalDetectedTopics: fallbackTopics.length,
        topics: fallbackTopics,
        recommendedStartingTopicId: fallbackTopics[0]?.id,
      };
    }

    book.blueprint = {
      ...(book.blueprint || {}),
      topicMap: topicMapResult,
    };

    book.ingestionProgress = 65;
    book.ingestionStage = "Enriching key pages, entities & gold standards...";
    await book.save();

    // ------------------------------------------------------------------------
    // STAGE 4: Batched LLM Enrichment across up to 120 pages (12 pages/call, max 10 batches)
    // ------------------------------------------------------------------------
    if (ai && segments.length > 0) {
      const pendingSegs = segments.filter(
        (s) => !Array.isArray(s.clinicalEntities) || s.clinicalEntities.length === 0
      );
      const sampledForLlm = selectSampledSegments(pendingSegs, 120);
      const BATCH_SIZE = 12;

      for (let i = 0; i < sampledForLlm.length; i += BATCH_SIZE) {
        const batch = sampledForLlm.slice(i, i + BATCH_SIZE);
        const batchInput = batch.map((seg) => ({
          id: String(seg._id),
          page: seg.pageNumber || seg.segmentIndex + 1,
          text: String(seg.content || "").slice(0, 1400),
        }));

        const batchPrompt = `Extract concise RAG metadata for each page of "${book.title}" (${subField}).
Pages:
${JSON.stringify(batchInput)}

Return ONLY JSON:
{
  "pages": [
    {
      "id": string,
      "headings": string[],
      "keyTerms": string[],
      "clinicalOrCoreEntities": string[],
      "goldStandards": string[],
      "summary": string
    }
  ]
}`;

        const parsedBatch = await generateJsonWithFallbackChain(ai, batchPrompt, 18_000);
        if (parsedBatch && Array.isArray(parsedBatch.pages)) {
          const ops: any[] = [];
          for (const item of parsedBatch.pages) {
            if (!item?.id) continue;
            const setFields: Record<string, unknown> = {};
            if (Array.isArray(item.headings) && item.headings.length > 0) {
              setFields.headings = item.headings.map(String).slice(0, 4);
            }
            if (Array.isArray(item.keyTerms) && item.keyTerms.length > 0) {
              setFields.keyTerms = item.keyTerms.map(String).slice(0, 8);
            }
            if (Array.isArray(item.clinicalOrCoreEntities) && item.clinicalOrCoreEntities.length > 0) {
              setFields.clinicalEntities = item.clinicalOrCoreEntities.map(String).slice(0, 6);
            }
            if (Array.isArray(item.goldStandards)) {
              setFields.goldStandards = item.goldStandards.map(String).slice(0, 4);
            }
            if (typeof item.summary === "string" && item.summary.trim()) {
              setFields.summary = item.summary.trim().slice(0, 400);
            }
            if (Object.keys(setFields).length > 0) {
              ops.push({
                updateOne: {
                  filter: { _id: item.id },
                  update: { $set: setFields },
                },
              });
            }
          }
          if (ops.length > 0) {
            await BookSegment.bulkWrite(ops, { ordered: false });
          }
        }

        const doneBatches = Math.min(sampledForLlm.length, i + BATCH_SIZE);
        const progressVal =
          65 + Math.round((doneBatches / Math.max(1, sampledForLlm.length)) * 30);
        book.ingestionProgress = progressVal;
        book.ingestionStage = `Enriching key pages (${doneBatches}/${sampledForLlm.length})...`;
        await book.save();
      }
    }

    // ------------------------------------------------------------------------
    // STAGE 5: Completion (100%)
    // ------------------------------------------------------------------------
    book.ingestionStatus = "completed";
    book.ingestionProgress = 100;
    book.ingestionStage = "completed";
    book.digestedPages = segments.length;
    await book.save();

    return true;
  } catch (fatalErr) {
    console.error("Fatal error during Universal RAG digestion:", fatalErr);
    book.ingestionStatus = "failed";
    book.ingestionStage = "Failed to complete indexing";
    await book.save();
    return false;
  }
}
