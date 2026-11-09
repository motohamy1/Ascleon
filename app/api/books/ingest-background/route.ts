import { NextRequest, NextResponse } from "next/server";
import { runUniversalRagDigestion } from "@/lib/ai/rag/digestion-engine";

export const maxDuration = 300; // 5 minute max runtime for full document digestion

export async function POST(req: NextRequest) {
  try {
    const { bookId } = await req.json();

    if (!bookId) {
      return NextResponse.json({ error: "bookId is required" }, { status: 400 });
    }

    // Trigger universal multi-stage background digestion
    runUniversalRagDigestion(bookId).catch((err) => {
      console.error("[ingest-background] Background digestion error:", err);
    });

    return NextResponse.json({
      success: true,
      message: "Universal RAG digestion initiated in background",
      bookId,
    });
  } catch (error) {
    console.error("[ingest-background] API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to initiate ingestion" },
      { status: 500 }
    );
  }
}
