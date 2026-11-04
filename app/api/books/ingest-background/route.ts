import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/database/mongoose";
import Book from "@/database/models/book.model";
import BookSegment from "@/database/models/book-segment.model";
import { GoogleGenAI } from "@google/genai";
import { BookTopicMap } from "@/lib/ai/schemas/decision-models";

export async function POST(req: NextRequest) {
  try {
    const { bookId } = await req.json();

    if (!bookId) {
      return NextResponse.json({ error: "bookId is required" }, { status: 400 });
    }

    await connectToDatabase();
    const book = await Book.findById(bookId);
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Mark as processing
    book.ingestionStatus = "processing";
    await book.save();

    // Fetch all page segments to build whole-book topic map
    const segments = await BookSegment.find({ bookId })
      .select("pageNumber content")
      .sort({ pageNumber: 1 })
      .lean();

    if (segments.length === 0) {
      book.ingestionStatus = "completed";
      await book.save();
      return NextResponse.json({ success: true, message: "No segments to ingest" });
    }

    // Build condensed multi-page index (page number + first 250 characters of each page)
    const pageSummaries = segments.map((s) => ({
      page: s.pageNumber || 1,
      snippet: s.content.slice(0, 250).replace(/\s+/g, " ").trim(),
    }));

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Fallback topic map based on segment chunks
      const chunkSize = Math.max(1, Math.ceil(segments.length / 5));
      const fallbackTopics = [];
      for (let i = 0; i < segments.length; i += chunkSize) {
        const startP = segments[i].pageNumber || 1;
        const endP = segments[Math.min(i + chunkSize - 1, segments.length - 1)].pageNumber || startP;
        fallbackTopics.push({
          id: `topic-${i / chunkSize + 1}`,
          title: `Section ${Math.floor(i / chunkSize) + 1} (Pages ${startP}–${endP})`,
          startPage: startP,
          endPage: endP,
          keyConcepts: [book.title, book.topic || "Core Principles"],
          subtopics: [],
        });
      }

      book.blueprint = {
        ...(book.blueprint || {}),
        topicMap: {
          totalDetectedTopics: fallbackTopics.length,
          topics: fallbackTopics,
          recommendedStartingTopicId: fallbackTopics[0]?.id,
        },
      };
      book.ingestionStatus = "completed";
      await book.save();
      return NextResponse.json({ success: true, topicMap: book.blueprint.topicMap });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are Ascleon's Whole-Source Curriculum Architect.
Analyze the entire document index below and construct an exhaustive, continuous "topicMap" dividing the source into contiguous, pedagogically coherent multi-page topics.

Document: "${book.title}" (${book.totalPages || segments.length} total pages)
Field: ${book.domain || book.topic || "Medicine / Science"}

Page Index:
${JSON.stringify(pageSummaries, null, 2)}

Requirements:
1. Divide the whole document into distinct, non-overlapping or sequential topics.
2. For each topic, provide:
   - "id": a unique slug identifier, e.g. "acute-coronary-syndromes"
   - "title": Canonical clinical or scientific title of the topic
   - "startPage": 1-based integer where this topic begins
   - "endPage": 1-based integer where this topic concludes
   - "keyConcepts": 2-4 primary concepts covered in this span
   - "subtopics": 1-3 sub-themes or specific clinical entities within this topic
3. Identify "recommendedStartingTopicId".

Return ONLY a valid JSON object matching:
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

    const response: any = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const parsedTopicMap: BookTopicMap = JSON.parse(response.text?.trim() || "{}");

    book.blueprint = {
      ...(book.blueprint || {}),
      topicMap: parsedTopicMap,
    };
    book.ingestionStatus = "completed";
    await book.save();

    return NextResponse.json({
      success: true,
      topicMap: parsedTopicMap,
    });
  } catch (err) {
    console.error("Background ingestion worker error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ingestion worker failed" },
      { status: 500 }
    );
  }
}
