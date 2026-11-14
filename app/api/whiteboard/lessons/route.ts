import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { connectToDatabase } from "@/database/mongoose";
import LessonBoard from "@/database/models/lesson-board.model";
import { StudyLanguage } from "@/lib/language";
import { generateLessonOutline } from "@/lib/board/outline";
import {
  buildEmptyLessonVoiceTrack,
  LESSON_PIPELINE_VERSION,
  serializeLessonBoard,
} from "@/lib/board/mapper";
import { resolveWhiteboardSource } from "@/lib/whiteboard/source";
import {
  DEFAULT_WHITEBOARD_VOICE,
  isValidWhiteboardVoice,
} from "@/lib/whiteboard/voices";
import { AI_CREDIT_COSTS } from "@/lib/subscription-constants";
import { consumeCredits } from "@/lib/usage.server";

export const maxDuration = 60;

const CreateLessonRequestSchema = z.object({
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
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required. Please sign in to generate lessons." },
        { status: 401 }
      );
    }
    const rawBody = await req.json();
    const parsed = CreateLessonRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid whiteboard lesson request parameters",
          details: parsed.error.flatten(),
        },
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

    const safeVoiceId = isValidWhiteboardVoice(voiceId)
      ? voiceId
      : DEFAULT_WHITEBOARD_VOICE;

    const resolvedSource = await resolveWhiteboardSource({
      bookId,
      bookTitle,
      scope,
      fallbackPageText,
      pacing,
    });

    await connectToDatabase();

    if (!forceRefresh) {
      const existing = await LessonBoard.findOne({
        bookId: resolvedSource.bookId,
        scopeHash: resolvedSource.scopeHash,
        language,
        pacing,
        pipelineVersion: LESSON_PIPELINE_VERSION,
        status: { $ne: "failed" },
      }).lean<Record<string, unknown>>();

      if (existing) {
        const secCount = Array.isArray(existing.sections)
          ? existing.sections.length
          : 0;
        const existingTracks = (existing.voiceTracks || {}) as Record<
          string,
          unknown
        >;
        const updates: Record<string, unknown> = { activeVoiceId: safeVoiceId };

        if (!existingTracks[safeVoiceId]) {
          updates[`voiceTracks.${safeVoiceId}`] = buildEmptyLessonVoiceTrack(
            safeVoiceId,
            secCount,
            language as StudyLanguage
          );
        }

        const updatedDoc = await LessonBoard.findByIdAndUpdate(
          existing._id,
          { $set: updates },
          { returnDocument: "after" }
        ).lean<Record<string, unknown>>();

        return NextResponse.json({
          success: true,
          cached: true,
          lesson: serializeLessonBoard(updatedDoc || existing),
        });
      }
    }

    const creditCheck = await consumeCredits(
      userId,
      AI_CREDIT_COSTS.WHITEBOARD_LESSON
    );
    if (!creditCheck.allowed) {
      return NextResponse.json(
        {
          error: creditCheck.error,
          isBillingError: true,
          plan: creditCheck.plan,
          creditsUsed: creditCheck.used,
          creditLimit: creditCheck.limit,
        },
        { status: 402 }
      );
    }

    const outline = await generateLessonOutline({
      source: resolvedSource,
      language: language as StudyLanguage,
    });

    const initialVoiceTracks = {
      [safeVoiceId]: buildEmptyLessonVoiceTrack(
        safeVoiceId,
        outline.sections.length,
        language as StudyLanguage
      ),
    };

    const doc = await LessonBoard.findOneAndUpdate(
      {
        bookId: resolvedSource.bookId,
        scopeHash: resolvedSource.scopeHash,
        language,
        pacing,
        pipelineVersion: LESSON_PIPELINE_VERSION,
      },
      {
        $set: {
          clerkId: userId || undefined,
          bookId: resolvedSource.bookId,
          bookTitle: resolvedSource.bookTitle,
          scopeHash: resolvedSource.scopeHash,
          pipelineVersion: LESSON_PIPELINE_VERSION,
          scope: resolvedSource.scope,
          language,
          pacing,
          title: outline.title,
          objective: outline.objective,
          sections: outline.sections,
          links: outline.links,
          droppedFacts: outline.droppedFacts,
          status: "rendering",
          voiceTracks: initialVoiceTracks,
          activeVoiceId: safeVoiceId,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    ).lean<Record<string, unknown>>();

    return NextResponse.json({
      success: true,
      cached: false,
      lesson: serializeLessonBoard(doc || {}),
    });
  } catch (error) {
    console.error("[POST /api/whiteboard/lessons] error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to plan whiteboard lesson",
      },
      { status: 500 }
    );
  }
}
