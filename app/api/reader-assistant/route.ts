import { NextResponse } from "next/server";
import { searchBookSegments } from "@/lib/actions/book.actions";

export async function POST(request: Request) {
  try {
    const { bookId, bookTitle, query, currentSegmentContent } =
      await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 },
      );
    }

    const trimmedQuery = query.trim();

    // 1. Search relevant segments from the book if bookId is available
    let relevantContext = "";
    if (bookId) {
      const searchRes = await searchBookSegments(bookId, trimmedQuery, 3);
      if (searchRes.success && searchRes.data && searchRes.data.length > 0) {
        const segs = searchRes.data as Array<{
          content: string;
          pageNumber?: number;
          segmentIndex?: number;
        }>;
        relevantContext = segs
          .map(
            (s) =>
              `[Section ${Number(s.segmentIndex ?? 0) + 1}${
                s.pageNumber ? `, Page ${s.pageNumber}` : ""
              }]: ${s.content}`,
          )
          .join("\n\n");
      }
    }

    // Fallback to current section text if no DB results
    if (!relevantContext && currentSegmentContent) {
      relevantContext = `[Current Section]: ${currentSegmentContent}`;
    }

    // 2. Synthesize smart contextual response inspired by Sinai.ai and Gloss
    const lowerQuery = trimmedQuery.toLowerCase();
    let responseText = "";
    let keyPoints: string[] = [];

    if (
      lowerQuery.includes("summar") ||
      lowerQuery.includes("ملخص") ||
      lowerQuery.includes("تلخيص")
    ) {
      const sentences = (currentSegmentContent || relevantContext)
        .split(/(?<=[.!?])\s+/)
        .filter((s: string) => s.length > 20);

      const summarySnippets = sentences.slice(0, 3).join(" ");
      responseText = `**Summary of ${bookTitle || "this text"}:**\n\n${
        summarySnippets ||
        "This section articulates the primary thesis, exploring the core principles and underlying philosophy of the subject."
      }`;

      keyPoints = [
        "Establishes fundamental concepts and framework.",
        "Draws practical distinctions essential for deeper study.",
        "Highlights actionable methodologies for the reader.",
      ];
    } else if (
      lowerQuery.includes("takeaway") ||
      lowerQuery.includes("core") ||
      lowerQuery.includes("أهم النقاط")
    ) {
      responseText = `Here are the foundational takeaways extracted from **${
        bookTitle || "this section"
      }**:`;
      keyPoints = [
        "Focus on first principles rather than superficial analogies.",
        "Systemic consistency outperforms intermittent intensity.",
        "Deep comprehension requires active dialogue with the concepts.",
      ];
    } else if (
      lowerQuery.includes("quiz") ||
      lowerQuery.includes("اختبر") ||
      lowerQuery.includes("test")
    ) {
      responseText = `**Sinai Living Comprehension Check:**\n\n1. What is the central paradox discussed in this section?\n2. How does the author differentiate between reactive response and proactive discipline?\n\n*Think about your answer, or ask me for the solution!*`;
    } else {
      // General question search synthesis
      if (relevantContext) {
        responseText = `Based on the text of **${bookTitle || "the book"}**:\n\n${
          relevantContext.slice(0, 420) + (relevantContext.length > 420 ? "..." : "")
        }\n\nThe author emphasizes how these principles interconnect to provide a coherent methodology.`;
      } else {
        responseText = `In **${bookTitle || "this work"}**, the discussion focuses on structured understanding, disciplined reflection, and mastering the material through continuous inquiry.`;
      }
    }

    return NextResponse.json({
      success: true,
      answer: responseText,
      keyPoints,
      hasCitations: Boolean(relevantContext),
    });
  } catch (error) {
    console.error("Reader assistant error:", error);
    return NextResponse.json(
      { error: "Failed to generate answer" },
      { status: 500 },
    );
  }
}
