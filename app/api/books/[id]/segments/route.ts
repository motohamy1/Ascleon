import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/database/mongoose";
import Book from "@/database/models/book.model";
import BookSegment from "@/database/models/book-segment.model";
import { buildSafeErrorResponse } from "@/lib/security/error-handler";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const rawStart = parseInt(searchParams.get("startPage") || "1", 10);
    const rawEnd = parseInt(searchParams.get("endPage") || "500", 10);
    const startPage = Number.isFinite(rawStart) ? Math.max(1, Math.min(10000, rawStart)) : 1;
    const endPage = Number.isFinite(rawEnd)
      ? Math.max(startPage, Math.min(10000, rawEnd))
      : 500;

    await connectToDatabase();
    const bookObjectId = new mongoose.Types.ObjectId(id);

    const book = await Book.findById(bookObjectId)
      .select("clerkId")
      .lean<{ clerkId?: string }>();
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }
    if (book.clerkId && book.clerkId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const segments = await BookSegment.find({
      bookId: bookObjectId,
      pageNumber: { $gte: startPage, $lte: endPage },
    })
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
    return buildSafeErrorResponse("GET /api/books/[id]/segments", error, {
      fallbackMessage: "Failed to load book segments.",
    });
  }
}
