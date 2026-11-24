import mongoose from "mongoose";
import { after, NextRequest, NextResponse } from "next/server";
import { runUniversalRagDigestion } from "@/lib/ai/rag/digestion-engine";

export const maxDuration = 300; // 5 minute max runtime for full document digestion

export async function POST(req: NextRequest) {
  try {
    const { bookId } = await req.json();

    if (!bookId || !mongoose.Types.ObjectId.isValid(String(bookId))) {
      return NextResponse.json({ error: "Valid bookId is required" }, { status: 400 });
    }

    const cleanBookId = String(bookId);

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
    console.error("[ingest-background] API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to initiate ingestion" },
      { status: 500 }
    );
  }
}
