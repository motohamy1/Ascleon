import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/database/mongoose";
import WhiteboardVideo from "@/database/models/whiteboard-video.model";
import { buildEmptyVoiceTrack, serializeWhiteboardVideo } from "@/lib/whiteboard/video-mapper";
import { isValidWhiteboardVoice } from "@/lib/whiteboard/voices";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid video ID" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const voiceId = body?.voiceId as string | undefined;
    if (!isValidWhiteboardVoice(voiceId)) {
      return NextResponse.json({ error: "Unsupported narrator voice selected" }, { status: 400 });
    }

    const { userId } = await auth();
    await connectToDatabase();

    const doc = await WhiteboardVideo.findById(id).lean<Record<string, unknown>>();
    if (!doc) {
      return NextResponse.json({ error: "Whiteboard video not found" }, { status: 404 });
    }
    if (doc.clerkId && doc.clerkId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const beatCount = Array.isArray(doc.beats) ? doc.beats.length : 0;
    const rawTracks = (doc.voiceTracks || {}) as Record<string, unknown>;
    const updates: Record<string, unknown> = { activeVoiceId: voiceId };

    if (!rawTracks[voiceId]) {
      updates[`voiceTracks.${voiceId}`] = buildEmptyVoiceTrack(voiceId, beatCount);
    }

    const updated = await WhiteboardVideo.findByIdAndUpdate(
      id,
      { $set: updates },
      { returnDocument: "after" }
    ).lean<Record<string, unknown>>();

    return NextResponse.json({
      success: true,
      video: serializeWhiteboardVideo(updated || doc),
    });
  } catch (error) {
    console.error("[POST /api/whiteboard/videos/[id]/voice] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to switch narrator voice" },
      { status: 500 }
    );
  }
}
