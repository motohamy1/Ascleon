import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/database/mongoose";
import WhiteboardVideo from "@/database/models/whiteboard-video.model";
import { serializeWhiteboardVideo } from "@/lib/whiteboard/video-mapper";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid whiteboard video ID" }, { status: 400 });
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

    return NextResponse.json({
      success: true,
      video: serializeWhiteboardVideo(doc),
    });
  } catch (error) {
    console.error("[GET /api/whiteboard/videos/[id]] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load whiteboard video" },
      { status: 500 }
    );
  }
}
