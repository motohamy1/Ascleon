import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/database/mongoose";
import Book from "@/database/models/book.model";
import BookSegment from "@/database/models/book-segment.model";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing book ID" }, { status: 400 });
    }

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    await connectToDatabase();
    const bookObjectId = new mongoose.Types.ObjectId(id);
    const [book, segCount, withHeadings] = await Promise.all([
      Book.findById(bookObjectId)
        .select(
          "ingestionStatus ingestionProgress ingestionStage digestedPages totalPages domain subspecialty blueprint updatedAt"
        )
        .lean(),
      BookSegment.countDocuments({ bookId: bookObjectId }),
      BookSegment.countDocuments({
        bookId: bookObjectId,
        headings: { $exists: true, $ne: [] },
      }),
    ]);

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const updatedMs = book.updatedAt ? new Date(book.updatedAt).getTime() : 0;
    const isStaleProcessing =
      (book.ingestionStatus === "processing" || book.ingestionStatus === "pending") &&
      updatedMs > 0 &&
      Date.now() - updatedMs > 90_000;
    const hasUnindexedSegments =
      segCount > 0 &&
      withHeadings === 0 &&
      (isStaleProcessing || (book.digestedPages || 0) === 0);

    const effectiveStatus = hasUnindexedSegments
      ? "stale"
      : book.ingestionStatus || "completed";

    return NextResponse.json({
      success: true,
      status: effectiveStatus,
      needsReindex: hasUnindexedSegments,
      segCount,
      withHeadings,
      progress:
        hasUnindexedSegments
          ? 0
          : typeof book.ingestionProgress === "number"
            ? book.ingestionProgress
            : 100,
      stage: hasUnindexedSegments
        ? "Pending background index repair"
        : book.ingestionStage || "completed",
      digestedPages: book.digestedPages || 0,
      totalPages: book.totalPages || 0,
      domain: book.domain || book.blueprint?.domain || "General Academic",
      subspecialty: book.subspecialty || book.blueprint?.subspecialty,
      blueprint: book.blueprint || {},
    });
  } catch (error) {
    console.error("[ingestion-status] API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch status" },
      { status: 500 }
    );
  }
}
