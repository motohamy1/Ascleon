import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/database/mongoose";
import LessonBoard from "@/database/models/lesson-board.model";
import {
  buildEmptyLessonVoiceTrack,
  computeLessonStatus,
  normalizeLessonVoiceTrack,
  serializeLessonBoard,
} from "@/lib/board/mapper";
import { computeSectionCues } from "@/lib/board/validate";
import { StudyLanguage } from "@/lib/language";
import { PinnedTtsModelError } from "@/lib/whiteboard/ai-client";
import { synthesizeLessonSectionNarration } from "@/lib/whiteboard/voice";
import {
  DEFAULT_WHITEBOARD_VOICE,
  getLessonTeachingStyle,
  isValidWhiteboardVoice,
} from "@/lib/whiteboard/voices";
import { LessonSection, LessonVoiceTrack } from "@/types/lesson-board";

export const maxDuration = 60;

interface StoredLessonBoard {
  _id: unknown;
  clerkId?: string;
  language?: StudyLanguage;
  activeVoiceId?: string;
  sections?: LessonSection[];
  voiceTracks?: Record<string, Partial<LessonVoiceTrack>>;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  const { id, index: indexStr } = await params;
  const sectionIndex = Number(indexStr);

  if (
    !mongoose.Types.ObjectId.isValid(id) ||
    !Number.isInteger(sectionIndex) ||
    sectionIndex < 0
  ) {
    return NextResponse.json(
      { error: "Invalid lesson ID or section index" },
      { status: 400 }
    );
  }

  let requestedVoiceId: string | undefined;
  let forceAudio = false;
  try {
    const body = await req.json();
    requestedVoiceId = body?.voiceId;
    forceAudio = Boolean(body?.forceAudio);
  } catch {
    // Optional JSON body
  }

  try {
    const { userId } = await auth();
    await connectToDatabase();

    const doc = await LessonBoard.findById(id).lean<StoredLessonBoard>();
    if (!doc) {
      return NextResponse.json(
        { error: "Whiteboard lesson not found" },
        { status: 404 }
      );
    }
    if (doc.clerkId && doc.clerkId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sections = doc.sections || [];
    const section = sections[sectionIndex];
    if (!section) {
      return NextResponse.json(
        { error: `Section ${sectionIndex} not found` },
        { status: 404 }
      );
    }

    const language = (doc.language || "en") as StudyLanguage;
    const voiceId = isValidWhiteboardVoice(requestedVoiceId)
      ? requestedVoiceId
      : isValidWhiteboardVoice(doc.activeVoiceId)
      ? doc.activeVoiceId
      : DEFAULT_WHITEBOARD_VOICE;

    const rawTracks = doc.voiceTracks || {};
    if (!rawTracks[voiceId]) {
      await LessonBoard.findByIdAndUpdate(id, {
        $set: {
          [`voiceTracks.${voiceId}`]: buildEmptyLessonVoiceTrack(
            voiceId,
            sections.length,
            language
          ),
        },
      });
    }

    const normalizedTrack = normalizeLessonVoiceTrack(
      rawTracks[voiceId],
      voiceId,
      sections.length,
      language
    );
    const existingSectionAudio = normalizedTrack.sections[sectionIndex];
    const needsAudio =
      forceAudio ||
      existingSectionAudio?.status !== "ready" ||
      !existingSectionAudio?.audioUrl;

    if (!needsAudio) {
      return NextResponse.json({
        success: true,
        sectionIndex,
        rePinned: false,
        lesson: serializeLessonBoard(doc as unknown as Record<string, unknown>),
      });
    }

    const combinedNarration = section.script.map((s) => s.text).join(" ");
    const pinnedModel = normalizedTrack.pinnedModel;
    const style = normalizedTrack.style || getLessonTeachingStyle(language);

    let result: { audioUrl: string; audioDurationMs: number; model: string };
    let rePinned = false;

    try {
      result = await synthesizeLessonSectionNarration({
        lessonId: id,
        sectionIndex,
        narration: combinedNarration,
        language,
        voiceId,
        style,
        preferredModel: pinnedModel,
        strictPin: Boolean(pinnedModel),
      });
    } catch (err) {
      if (err instanceof PinnedTtsModelError) {
        // Pinned model failed mid-lesson: fall back to a healthy model and re-pin the WHOLE track
        // so voice timbre never mixes across sections.
        result = await synthesizeLessonSectionNarration({
          lessonId: id,
          sectionIndex,
          narration: combinedNarration,
          language,
          voiceId,
          style,
          strictPin: false,
        });
        rePinned = result.model !== pinnedModel;
      } else {
        throw err;
      }
    }

    const cues = computeSectionCues(section.script, result.audioDurationMs);
    const atomicSet: Record<string, unknown> = {
      [`voiceTracks.${voiceId}.pinnedModel`]: result.model,
      [`voiceTracks.${voiceId}.style`]: style,
    };

    if (rePinned) {
      // Reset any other previously rendered sections on this track so they re-synthesize on the new pinned model
      for (let i = 0; i < sections.length; i++) {
        if (i !== sectionIndex) {
          atomicSet[`voiceTracks.${voiceId}.sections.${i}`] = {
            status: "planned",
            cues: [],
          };
        }
      }
    }

    atomicSet[`voiceTracks.${voiceId}.sections.${sectionIndex}`] = {
      status: "ready",
      audioUrl: result.audioUrl,
      audioDurationMs: result.audioDurationMs,
      cues,
    };

    const updated = await LessonBoard.findByIdAndUpdate(
      id,
      { $set: atomicSet },
      { returnDocument: "after" }
    ).lean<StoredLessonBoard>();

    if (!updated) {
      return NextResponse.json(
        { error: "Lesson disappeared during update" },
        { status: 404 }
      );
    }

    const recomputedTrack = normalizeLessonVoiceTrack(
      (updated.voiceTracks || {})[voiceId],
      voiceId,
      sections.length,
      language
    );
    const recomputedStatus = computeLessonStatus({
      sections: updated.sections || sections,
      voiceTracks: updated.voiceTracks,
      activeVoiceId: voiceId,
      language,
    });

    const finalized = await LessonBoard.findByIdAndUpdate(
      id,
      {
        $set: {
          status: recomputedStatus,
          [`voiceTracks.${voiceId}.status`]: recomputedTrack.status,
          [`voiceTracks.${voiceId}.totalDurationMs`]:
            recomputedTrack.totalDurationMs,
        },
      },
      { returnDocument: "after" }
    ).lean<Record<string, unknown>>();

    return NextResponse.json({
      success: true,
      sectionIndex,
      rePinned,
      lesson: serializeLessonBoard(
        finalized || (updated as unknown as Record<string, unknown>)
      ),
    });
  } catch (error) {
    console.error(
      `[POST /api/whiteboard/lessons/${id}/sections/${sectionIndex}/audio] error:`,
      error
    );

    try {
      await connectToDatabase();
      const doc = await LessonBoard.findById(id).lean<StoredLessonBoard>();
      if (doc) {
        const voiceId = isValidWhiteboardVoice(requestedVoiceId)
          ? requestedVoiceId
          : doc.activeVoiceId || DEFAULT_WHITEBOARD_VOICE;
        await LessonBoard.findByIdAndUpdate(id, {
          $set: {
            [`voiceTracks.${voiceId}.sections.${sectionIndex}`]: {
              status: "failed",
              cues: [],
              error:
                error instanceof Error
                  ? error.message
                  : "Audio synthesis failed",
            },
          },
        });
      }
    } catch {
      // Non-fatal error persistence failure
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to synthesize section audio",
      },
      { status: 500 }
    );
  }
}
