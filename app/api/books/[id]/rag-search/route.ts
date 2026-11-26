import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { connectToDatabase } from "@/database/mongoose";
import Book from "@/database/models/book.model";
import { retrieveFromBookRAG } from "@/lib/ai/rag/book-rag-retriever";
import { buildSafeErrorResponse } from "@/lib/security/error-handler";
import { sanitizePlainText } from "@/lib/security/sanitize";

const RagSearchSchema = z.object({
  query: z.string().max(400).optional().default(""),
  scope: z
    .object({
      type: z.enum(["selection", "page", "range", "topic"]).optional(),
      startPage: z.number().int().min(1).max(10000).optional(),
      endPage: z.number().int().min(1).max(10000).optional(),
      topicTitle: z.string().max(200).optional(),
      topicId: z.string().max(100).optional(),
      selectedText: z.string().max(4000).optional(),
    })
    .optional(),
  activePage: z.number().int().min(1).max(10000).optional().default(1),
  topK: z.number().int().min(1).max(12).optional().default(4),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const rawBody = await req.json().catch(() => ({}));
    const bookId = String(rawBody?.bookId || id || "").trim();

    if (!bookId || !mongoose.Types.ObjectId.isValid(bookId)) {
      return NextResponse.json({ error: "Invalid bookId" }, { status: 400 });
    }

    const parsed = RagSearchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid search parameters" },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const book = await Book.findById(bookId)
      .select("clerkId")
      .lean<{ clerkId?: string }>();
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }
    if (book.clerkId && book.clerkId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ragResult = await retrieveFromBookRAG({
      bookId,
      query: sanitizePlainText(parsed.data.query, 400),
      scope: parsed.data.scope as never,
      activePage: parsed.data.activePage,
      topK: parsed.data.topK,
    });

    return NextResponse.json({
      success: true,
      ...ragResult,
    });
  } catch (error) {
    return buildSafeErrorResponse("POST /api/books/[id]/rag-search", error, {
      fallbackMessage: "Failed to search study material.",
    });
  }
}
