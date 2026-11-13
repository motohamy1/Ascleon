import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/database/mongoose";
import LessonBoard from "@/database/models/lesson-board.model";
import {
  buildEmptyLessonVoiceTrack,
  serializeLessonBoard,
} from "@/lib/board/mapper";
import { StudyLanguage } from "@/lib/language";
import { isValidWhiteboardVoice } from "@/lib/whiteboard/voices";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid lesson ID" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const voiceId = body?.voiceId as string | undefined;
    if (!isValidWhiteboardVoice(voiceId)) {
      return NextResponse.json(
        { error: "Unsupported narrator voice selected" },
        { status: 400 }
      );
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

    const sectionCount = Array.isArray(doc.sections) ? doc.sections.length : 0;
    const language = (doc.language as StudyLanguage) || "en";
    const rawTracks = (doc.voiceTracks || {}) as Record<string, unknown>;
    const updates: Record<string, unknown> = { activeVoiceId: voiceId };

    if (!rawTracks[voiceId]) {
      updates[`voiceTracks.${voiceId}`] = buildEmptyLessonVoiceTrack(
        voiceId,
        sectionCount,
        language
      );
    }

    const updated = await LessonBoard.findByIdAndUpdate(
      id,
      { $set: updates },
      { returnDocument: "after" }
    ).lean<Record<string, unknown>>();

    return NextResponse.json({
      success: true,
      lesson: serializeLessonBoard(updated || doc),
    });
  } catch (error) {
    console.error("[POST /api/whiteboard/lessons/[id]/voice] error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to switch narrator voice",
      },
      { status: 500 }
    );
  }
}
