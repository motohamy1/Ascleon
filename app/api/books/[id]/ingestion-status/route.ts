import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/database/mongoose";
import Book from "@/database/models/book.model";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing book ID" }, { status: 400 });
    }

    await connectToDatabase();
    const book = await Book.findById(id).select(
      "ingestionStatus ingestionProgress ingestionStage digestedPages totalPages domain subspecialty blueprint"
    ).lean();

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      status: book.ingestionStatus || "completed",
      progress: typeof book.ingestionProgress === "number" ? book.ingestionProgress : 100,
      stage: book.ingestionStage || "completed",
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
