import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/database/mongoose";
import LessonBoard from "@/database/models/lesson-board.model";
import { serializeLessonBoard } from "@/lib/board/mapper";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid lesson ID" }, { status: 400 });
    }

    const { userId } = await auth();
    await connectToDatabase();

    const doc = await LessonBoard.findById(id).lean<Record<string, unknown>>();
    if (!doc) {
      return NextResponse.json(
        { error: "Whiteboard lesson not found" },
        { status: 404 }
      );
    }

    if (doc.clerkId && doc.clerkId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      lesson: serializeLessonBoard(doc),
    });
  } catch (error) {
    console.error("[GET /api/whiteboard/lessons/[id]] error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load whiteboard lesson",
      },
      { status: 500 }
    );
  }
}
