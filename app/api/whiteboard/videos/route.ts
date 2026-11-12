import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { connectToDatabase } from "@/database/mongoose";
import WhiteboardVideo from "@/database/models/whiteboard-video.model";
import { resolveWhiteboardSource } from "@/lib/whiteboard/source";
import { generateWhiteboardScript } from "@/lib/whiteboard/script";
import {
  buildEmptyVoiceTrack,
  serializeWhiteboardVideo,
  WHITEBOARD_PIPELINE_VERSION,
} from "@/lib/whiteboard/video-mapper";
import { DEFAULT_WHITEBOARD_VOICE, isValidWhiteboardVoice } from "@/lib/whiteboard/voices";
import { StudyLanguage } from "@/lib/language";

export const maxDuration = 60;

const CreateVideoRequestSchema = z.object({
  bookId: z.string().min(1),
  bookTitle: z.string().min(1).default("Study Document"),
  language: z.enum(["en", "ar", "mixed"]).default("en"),
  pacing: z.enum(["auto", "concise", "deep"]).default("auto"),
  voiceId: z.string().optional(),
  forceRefresh: z.boolean().optional().default(false),
  fallbackPageText: z.string().optional().default(""),
  scope: z.object({
    type: z.enum(["selection", "page", "range", "topic"]),
    startPage: z.number().int().min(1),
    endPage: z.number().int().min(1),
    topicTitle: z.string().optional(),
    topicId: z.string().optional(),
    selectedText: z.string().optional(),
  }),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    const rawBody = await req.json();
    const parsed = CreateVideoRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid whiteboard request parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      bookId,
      bookTitle,
      language,
      pacing,
      voiceId,
      forceRefresh,
      fallbackPageText,
      scope,
    } = parsed.data;

    const safeVoiceId = isValidWhiteboardVoice(voiceId) ? voiceId : DEFAULT_WHITEBOARD_VOICE;

    const resolvedSource = await resolveWhiteboardSource({
      bookId,
      bookTitle,
      scope,
      fallbackPageText,
      pacing,
    });

    await connectToDatabase();

    // 1. Check existing storyboard cache (only reuse completed/partial scripts; never cache failures)
    if (!forceRefresh) {
      const existing = await WhiteboardVideo.findOne({
        bookId: resolvedSource.bookId,
        scopeHash: resolvedSource.scopeHash,
        language,
        pacing,
        pipelineVersion: WHITEBOARD_PIPELINE_VERSION,
        status: { $ne: "failed" },
      }).lean<Record<string, unknown>>();

      if (existing) {
        const beatCount = Array.isArray(existing.beats) ? existing.beats.length : 0;
        const existingTracks = (existing.voiceTracks || {}) as Record<string, unknown>;
        const updates: Record<string, unknown> = { activeVoiceId: safeVoiceId };

        if (!existingTracks[safeVoiceId]) {
          updates[`voiceTracks.${safeVoiceId}`] = buildEmptyVoiceTrack(safeVoiceId, beatCount);
        }

        const updatedDoc = await WhiteboardVideo.findByIdAndUpdate(
          existing._id,
          { $set: updates },
          { returnDocument: "after" }
        ).lean<Record<string, unknown>>();

        return NextResponse.json({
          success: true,
          cached: true,
          video: serializeWhiteboardVideo(updatedDoc || existing),
        });
      }
    }

    // 2. Plan grounded script via gemini-3.8-flash
    const script = await generateWhiteboardScript({
      source: resolvedSource,
      language: language as StudyLanguage,
    });

    const initialVoiceTracks = {
      [safeVoiceId]: buildEmptyVoiceTrack(safeVoiceId, script.beats.length),
    };

    const doc = await WhiteboardVideo.findOneAndUpdate(
      {
        bookId: resolvedSource.bookId,
        scopeHash: resolvedSource.scopeHash,
        language,
        pacing,
        pipelineVersion: WHITEBOARD_PIPELINE_VERSION,
      },
      {
        $set: {
          clerkId: userId || undefined,
          bookId: resolvedSource.bookId,
          bookTitle: resolvedSource.bookTitle,
          scopeHash: resolvedSource.scopeHash,
          pipelineVersion: WHITEBOARD_PIPELINE_VERSION,
          scope: resolvedSource.scope,
          language,
          pacing,
          title: script.videoTitle,
          summary: script.summary,
          status: "rendering",
          styleAnchorRawUrl: undefined,
          styleAnchorUrl: undefined,
          beats: script.beats,
          voiceTracks: initialVoiceTracks,
          activeVoiceId: safeVoiceId,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    ).lean<Record<string, unknown>>();

    return NextResponse.json({
      success: true,
      cached: false,
      video: serializeWhiteboardVideo(doc || {}),
    });
  } catch (error) {
    console.error("[POST /api/whiteboard/videos] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to plan whiteboard video" },
      { status: 500 }
    );
  }
}
