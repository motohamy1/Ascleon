import { GoogleGenAI } from "@google/genai";
import { connectToDatabase } from "@/database/mongoose";
import Book from "@/database/models/book.model";
import BookSegment from "@/database/models/book-segment.model";
import { ReferenceResource } from "@/types/knowledge";

export interface DigestionStatusUpdate {
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  stage: string;
  digestedPages: number;
  totalPages: number;
}

/**
 * Universal RAG Digestion Engine
 * Operates across any academic, professional, or scientific discipline:
 * - Software Engineering, Computer Science
 * - Medicine, Surgery, Life Sciences
 * - Mathematics, Physics, Engineering
 * - Law, Philosophy, Economics, Business
 * - Humanities, History, Literature
 */
export async function runUniversalRagDigestion(bookId: string): Promise<boolean> {
  await connectToDatabase();
  const book = await Book.findById(bookId);
  if (!book) return false;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY missing during RAG digestion; marking fallback completion.");
    book.ingestionStatus = "completed";
    book.ingestionProgress = 100;
    book.ingestionStage = "completed";
    await book.save();
    return true;
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    // ------------------------------------------------------------------------
    // STAGE 1: Profile Field, Anti-Pollution Domain Boundaries & Canonical Refs (0% -> 25%)
    // ------------------------------------------------------------------------
    book.ingestionStatus = "processing";
    book.ingestionProgress = 10;
    book.ingestionStage = "Profiling discipline & domain boundaries...";
    await book.save();

    const segments = await BookSegment.find({ bookId })
      .select("pageNumber content segmentIndex")
      .sort({ pageNumber: 1 })
      .lean();

    const totalPages = book.totalPages || segments.length || 1;
    book.totalPages = totalPages;

    // Sample broad sections from start, middle, and end
    const sampleIndices = [
      0,
      Math.floor(segments.length * 0.25),
      Math.floor(segments.length * 0.5),
      Math.floor(segments.length * 0.75),
      Math.max(0, segments.length - 1),
    ].filter((v, i, a) => a.indexOf(v) === i && segments[v]);

    const sampledSnippets = sampleIndices
      .map((idx) => `[Page ${segments[idx].pageNumber || idx + 1}]:\n${segments[idx].content.slice(0, 450)}`)
      .join("\n\n");

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
   Examples:
   - "Computer Science", subField: "Distributed Systems & Concurrency"
   - "Internal Medicine", subField: "Endocrinology & Diabetes"
   - "General Surgery", subField: "Abdominal & Gastrointestinal Surgery"
   - "Law", subField: "Constitutional & Civil Rights Law"
   - "Physics", subField: "Thermodynamics & Statistical Mechanics"
2. Define "domainBoundaries": list 3-5 adjacent fields or sub-specialties that must NEVER pollute or cross into this book's explanations unless explicitly requested by the student.
   (e.g., for Internal Medicine: ["General Surgery", "Pediatric Surgery", "Cosmetic Surgery"])
   (e.g., for Frontend Web Dev: ["Embedded Firmware", "Kernel Architecture"])
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

    let profileResult: any = null;
    try {
      const profileResp: any = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: profilePrompt }] }],
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });
      const txt = profileResp.text?.trim() || "";
      if (txt) profileResult = JSON.parse(txt);
    } catch (profErr) {
      console.warn("Domain profiling LLM note:", profErr);
    }

    const primaryField = profileResult?.primaryField || book.domain || book.topic || "General Academic";
    const subField = profileResult?.subField || book.subspecialty || primaryField;
    const domainBoundaries = profileResult?.domainBoundaries || [];
    const pedagogicalStyle = profileResult?.pedagogicalStyle || "empirical_science";
    const dynamicCanonicalReferences: ReferenceResource[] = Array.isArray(profileResult?.dynamicCanonicalReferences) && profileResult.dynamicCanonicalReferences.length > 0
      ? profileResult.dynamicCanonicalReferences
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

    book.ingestionProgress = 30;
    book.ingestionStage = "Building continuous multi-page topic map...";
    await book.save();

    // ------------------------------------------------------------------------
    // STAGE 2: Multi-Page Topic Map Construction (30% -> 60%)
    // ------------------------------------------------------------------------
    const pageIndexSummaries = segments.map((s) => ({
      page: s.pageNumber || s.segmentIndex + 1,
      snippet: s.content.slice(0, 260).replace(/\s+/g, " ").trim(),
    }));

    const topicPrompt = `You are Ascleon's Whole-Source Curriculum Architect.
Analyze the document page index and construct a complete, continuous "topicMap" dividing the source into contiguous, pedagogically coherent multi-page topics.

Document: "${book.title}" (${totalPages} total pages)
Discipline: ${primaryField} (${subField})

Page Index:
${JSON.stringify(pageIndexSummaries, null, 2)}

Requirements:
1. Divide the whole document into sequential, non-overlapping multi-page topics covering all pages from 1 to ${totalPages}.
2. For each topic:
   - "id": lowercase slug e.g. "intro-to-concurrency"
   - "title": Canonical academic or clinical title
   - "startPage": 1-based integer
   - "endPage": 1-based integer
   - "keyConcepts": 2-4 primary concepts/theorems/entities
   - "subtopics": 1-3 specific sections or nuances
3. Specify "recommendedStartingTopicId".

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

    let topicMapResult: any = null;
    try {
      const topicResp: any = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: topicPrompt }] }],
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });
      const tText = topicResp.text?.trim() || "";
      if (tText) topicMapResult = JSON.parse(tText);
    } catch (topErr) {
      console.warn("Topic map LLM note:", topErr);
    }

    if (!topicMapResult?.topics?.length) {
      // Deterministic fallback partition
      const chunkSize = Math.max(1, Math.ceil(segments.length / 5));
      const fallbackTopics = [];
      for (let i = 0; i < segments.length; i += chunkSize) {
        const startP = segments[i].pageNumber || i + 1;
        const endP = segments[Math.min(i + chunkSize - 1, segments.length - 1)].pageNumber || startP;
        fallbackTopics.push({
          id: `topic-${Math.floor(i / chunkSize) + 1}`,
          title: `Section ${Math.floor(i / chunkSize) + 1} (Pages ${startP}–${endP})`,
          startPage: startP,
          endPage: endP,
          keyConcepts: [book.title, subField],
          subtopics: [],
        });
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

    book.ingestionProgress = 60;
    book.ingestionStage = "Extracting page concepts, key terms & gold standards...";
    await book.save();

    // ------------------------------------------------------------------------
    // STAGE 3: Page-by-Page Concept, Heading & Gold-Standard Indexing (60% -> 95%)
    // ------------------------------------------------------------------------
    // Process pages in parallel batches of 5 to remain ultra-fast
    const BATCH_SIZE = 5;
    for (let i = 0; i < segments.length; i += BATCH_SIZE) {
      const batch = segments.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (seg) => {
          // If segment already has extracted metadata, skip
          if (seg.headings?.length && seg.goldStandards?.length) return;

          const extractPrompt = `Extract key RAG metadata from this page of "${book.title}" in ${subField}.
Passage:
"""
${seg.content.slice(0, 3000)}
"""

Extract:
1. "headings": Primary headings or section titles found or inferred (1-3)
2. "keyTerms": Core terms, definitions, laws, or theorems introduced (3-6)
3. "clinicalOrCoreEntities": Diagnostic criteria, diseases, architectures, data structures, or formal mechanisms (2-5)
4. "goldStandards": Gold-standard investigations, first-line treatments, definitive algorithms, or foundational axioms explicitly stated in the text (1-3). If none explicitly stated, return empty array.
5. "summary": 1-2 sentence core thesis of this page.

Return ONLY JSON:
{
  "headings": string[],
  "keyTerms": string[],
  "clinicalOrCoreEntities": string[],
  "goldStandards": string[],
  "summary": string
}`;

          try {
            const extResp: any = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: [{ role: "user", parts: [{ text: extractPrompt }] }],
              config: {
                responseMimeType: "application/json",
                temperature: 0.1,
              },
            });
            const parsed = JSON.parse(extResp.text?.trim() || "{}");
            await BookSegment.updateOne(
              { _id: seg._id },
              {
                $set: {
                  headings: parsed.headings || [],
                  keyTerms: parsed.keyTerms || [],
                  clinicalEntities: parsed.clinicalOrCoreEntities || [],
                  goldStandards: parsed.goldStandards || [],
                  summary: parsed.summary || "",
                },
              }
            );
          } catch {
            // Local fallback extraction based on text heuristics
            const firstLine = seg.content.split("\n")[0]?.slice(0, 80) || `Page ${seg.pageNumber}`;
            await BookSegment.updateOne(
              { _id: seg._id },
              {
                $set: {
                  headings: [firstLine],
                  summary: seg.content.slice(0, 160) + "...",
                },
              }
            );
          }
        })
      );

      const currentDigested = Math.min(segments.length, i + BATCH_SIZE);
      const progressVal = 60 + Math.round((currentDigested / segments.length) * 35);
      book.ingestionProgress = progressVal;
      book.digestedPages = currentDigested;
      book.ingestionStage = `Indexing page concepts (${currentDigested}/${segments.length})...`;
      await book.save();
    }

    // ------------------------------------------------------------------------
    // STAGE 4: Completion (100%)
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
