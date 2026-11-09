import { NextRequest, NextResponse } from "next/server";
import { retrieveFromBookRAG } from "@/lib/ai/rag/book-rag-retriever";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { bookId, query, scope, activePage, topK } = body;

    if (!bookId) {
      return NextResponse.json({ error: "Missing bookId" }, { status: 400 });
    }

    const ragResult = await retrieveFromBookRAG({
      bookId,
      query,
      scope,
      activePage: activePage || 1,
      topK: topK || 4,
    });

    return NextResponse.json({
      success: true,
      ...ragResult,
    });
  } catch (error) {
    console.error("[rag-search] API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to retrieve from RAG" },
      { status: 500 }
    );
  }
}
