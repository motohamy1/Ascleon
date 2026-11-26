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
import {
  calculateDynamicCreditCost,
  getScopePageSpan,
} from "@/lib/subscription-constants";
import { buildBillingErrorResponse, consumeCredits, refundCredits } from "@/lib/usage.server";
import { buildSafeErrorResponse } from "@/lib/security/error-handler";
import { sanitizePlainText, sanitizeRichText } from "@/lib/security/sanitize";

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
  let chargedUserId: string | null = null;
  let chargedCredits = 0;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required. Please sign in to generate lessons." },
        { status: 401 }
      );
    }
    const rawBody = await req.json().catch(() => null);
    const parsed = CreateLessonRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid whiteboard lesson request parameters" },
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
          creditsCharged: 0,
          lesson: serializeLessonBoard(updatedDoc || existing),
        });
      }
    }

    const dynamicCost = calculateDynamicCreditCost({
      feature: "whiteboard_lesson",
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
      creditsCharged: dynamicCost.total,
      creditsRemaining: creditCheck.remaining,
      creditBreakdown: dynamicCost.summary,
      lesson: serializeLessonBoard(doc || {}),
    });
  } catch (error) {
    if (chargedUserId && chargedCredits > 0) {
      await refundCredits(chargedUserId, chargedCredits).catch(() => {});
    }
    return buildSafeErrorResponse("POST /api/whiteboard/lessons", error, {
      fallbackMessage: "Failed to plan whiteboard lesson.",
      creditsRefunded: chargedCredits > 0,
    });
  }
}
