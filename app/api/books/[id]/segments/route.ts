import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/database/mongoose";
import BookSegment from "@/database/models/book-segment.model";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const startPage = parseInt(searchParams.get("startPage") || "1", 10);
    const endPage = parseInt(searchParams.get("endPage") || "500", 10);

    if (!id) {
      return NextResponse.json({ error: "Missing book ID" }, { status: 400 });
    }

    await connectToDatabase();
    const query: any = { bookId: id };
    if (!isNaN(startPage) && !isNaN(endPage)) {
      query.pageNumber = { $gte: startPage, $lte: endPage };
    }

    const segments = await BookSegment.find(query)
      .sort({ pageNumber: 1, segmentIndex: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      segments: segments.map((s) => ({
        _id: String(s._id),
        bookId: String(s.bookId),
        content: s.content,
        segmentIndex: s.segmentIndex,
        pageNumber: s.pageNumber,
        wordCount: s.wordCount,
        headings: s.headings || [],
        keyTerms: s.keyTerms || [],
        clinicalEntities: s.clinicalEntities || [],
        goldStandards: s.goldStandards || [],
        summary: s.summary || "",
      })),
    });
  } catch (error) {
    console.error("[get-book-segments] API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch segments" },
      { status: 500 }
    );
  }
}
