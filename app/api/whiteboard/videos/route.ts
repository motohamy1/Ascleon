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
import {
  calculateDynamicCreditCost,
  getScopePageSpan,
} from "@/lib/subscription-constants";
import { buildBillingErrorResponse, consumeCredits, refundCredits } from "@/lib/usage.server";
import { buildSafeErrorResponse } from "@/lib/security/error-handler";
import { sanitizePlainText, sanitizeRichText } from "@/lib/security/sanitize";

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
  let chargedUserId: string | null = null;
  let chargedCredits = 0;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required. Please sign in to generate whiteboard videos." },
        { status: 401 }
      );
    }
    const rawBody = await req.json().catch(() => null);
    const parsed = CreateVideoRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid whiteboard request parameters" },
        { status: 400 }
      );
    }

    const {
      bookId,
      language,
      pacing,
      voiceId,
      forceRefresh,
      scope,
    } = parsed.data;
    const bookTitle = sanitizePlainText(parsed.data.bookTitle, 240) || "Study Document";
    const fallbackPageText = sanitizeRichText(parsed.data.fallbackPageText, 25000);

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
          creditsCharged: 0,
          video: serializeWhiteboardVideo(updatedDoc || existing),
        });
      }
    }

    const dynamicCost = calculateDynamicCreditCost({
      feature: "whiteboard_video",
      scopeType: scope.type,
      pageSpan: getScopePageSpan(scope),
      pacing,
      forceRefresh,
    });
    const creditCheck = await consumeCredits(userId, dynamicCost.total);
    if (!creditCheck.allowed) {
      return buildBillingErrorResponse(creditCheck, dynamicCost.total);
    }
    chargedUserId = userId;
    chargedCredits = dynamicCost.total;

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
      creditsCharged: dynamicCost.total,
      creditsRemaining: creditCheck.remaining,
      creditBreakdown: dynamicCost.summary,
      video: serializeWhiteboardVideo(doc || {}),
    });
  } catch (error) {
    if (chargedUserId && chargedCredits > 0) {
      await refundCredits(chargedUserId, chargedCredits).catch(() => {});
    }
    return buildSafeErrorResponse("POST /api/whiteboard/videos", error, {
      fallbackMessage: "Failed to plan whiteboard video.",
      creditsRefunded: chargedCredits > 0,
    });
  }
}
