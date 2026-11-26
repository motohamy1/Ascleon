import mongoose from "mongoose";
import { after, NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { connectToDatabase } from "@/database/mongoose";
import Book from "@/database/models/book.model";
import { runUniversalRagDigestion } from "@/lib/ai/rag/digestion-engine";
import { buildSafeErrorResponse } from "@/lib/security/error-handler";

export const maxDuration = 300; // 5 minute max runtime for full document digestion

const IngestBackgroundSchema = z.object({
  bookId: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json().catch(() => null);
    const parsed = IngestBackgroundSchema.safeParse(rawBody);
    if (!parsed.success || !mongoose.Types.ObjectId.isValid(parsed.data.bookId)) {
      return NextResponse.json({ error: "Valid bookId is required" }, { status: 400 });
    }

    const cleanBookId = parsed.data.bookId;

    await connectToDatabase();
    const book = await Book.findById(cleanBookId)
      .select("clerkId")
      .lean<{ clerkId?: string }>();
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }
    if (book.clerkId && book.clerkId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Keep serverless execution alive after sending response via Next.js after()
    after(async () => {
      try {
        await runUniversalRagDigestion(cleanBookId);
      } catch (err) {
        console.error("[ingest-background] Background digestion error:", err);
      }
    });

    return NextResponse.json(
      {
        success: true,
        message: "Universal RAG digestion scheduled in background",
        bookId: cleanBookId,
      },
      { status: 202 }
    );
  } catch (error) {
    return buildSafeErrorResponse("POST /api/books/ingest-background", error, {
      fallbackMessage: "Failed to initiate background indexing.",
    });
  }
}
