import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/database/mongoose";
import WhiteboardVideo from "@/database/models/whiteboard-video.model";
import { generateAndVectorizeBeatSketch } from "@/lib/whiteboard/sketch";
import { synthesizeBeatNarration } from "@/lib/whiteboard/voice";
import { readWhiteboardAssetBuffer } from "@/lib/whiteboard/blob";
import {
  buildEmptyVoiceTrack,
  computeVideoStatus,
  normalizeVoiceTrackBeats,
  serializeWhiteboardVideo,
} from "@/lib/whiteboard/video-mapper";
import { DEFAULT_WHITEBOARD_VOICE, isValidWhiteboardVoice } from "@/lib/whiteboard/voices";
import { StudyLanguage } from "@/lib/language";
import { VoiceTrack, WhiteboardBeat } from "@/types/whiteboard-video";

export const maxDuration = 60;

interface StoredWhiteboardVideo {
  _id: unknown;
  clerkId?: string;
  language?: StudyLanguage;
  activeVoiceId?: string;
  styleAnchorRawUrl?: string;
  beats?: WhiteboardBeat[];
  voiceTracks?: Record<string, Partial<VoiceTrack>>;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  const { id, index: indexStr } = await params;
  const beatIndex = Number(indexStr);

  if (!mongoose.Types.ObjectId.isValid(id) || !Number.isInteger(beatIndex) || beatIndex < 0) {
    return NextResponse.json({ error: "Invalid video ID or beat index" }, { status: 400 });
  }

  let requestedVoiceId: string | undefined;
  let forceVector = false;
  let forceAudio = false;
  try {
    const body = await req.json();
    requestedVoiceId = body?.voiceId;
    forceVector = Boolean(body?.forceVector);
    forceAudio = Boolean(body?.forceAudio);
  } catch {
    // Optional JSON body
  }

  try {
    const { userId } = await auth();
    await connectToDatabase();

    const doc = await WhiteboardVideo.findById(id).lean<StoredWhiteboardVideo>();
    if (!doc) {
      return NextResponse.json({ error: "Whiteboard video not found" }, { status: 404 });
    }
    if (doc.clerkId && doc.clerkId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const beats = doc.beats || [];
    const beat = beats[beatIndex];
    if (!beat) {
      return NextResponse.json({ error: `Beat ${beatIndex} not found` }, { status: 404 });
    }

    const voiceId = isValidWhiteboardVoice(requestedVoiceId)
      ? requestedVoiceId
      : isValidWhiteboardVoice(doc.activeVoiceId)
      ? doc.activeVoiceId
      : DEFAULT_WHITEBOARD_VOICE;

    const rawTracks = doc.voiceTracks || {};
    if (!rawTracks[voiceId]) {
      await WhiteboardVideo.findByIdAndUpdate(id, {
        $set: { [`voiceTracks.${voiceId}`]: buildEmptyVoiceTrack(voiceId, beats.length) },
      });
    }

    const normalizedTrack = normalizeVoiceTrackBeats(rawTracks[voiceId], voiceId, beats.length);
    const existingVoiceBeat = normalizedTrack.beats[beatIndex];
    const pinnedModel = normalizedTrack.pinnedModel;

    const needsVector = forceVector || beat.vectorStatus !== "ready" || !beat.vectorData;
    const needsAudio =
      forceAudio || existingVoiceBeat?.status !== "ready" || !existingVoiceBeat?.audioUrl;

    // Fetch Beat 0 style anchor image if rendering beat > 0
    let styleAnchorBase64: string | undefined;
    if (needsVector && beatIndex > 0 && doc.styleAnchorRawUrl) {
      try {
        const anchorBuf = await readWhiteboardAssetBuffer(doc.styleAnchorRawUrl);
        styleAnchorBase64 = anchorBuf.toString("base64");
      } catch (anchorErr) {
        console.warn("[whiteboard/beat] Could not load style anchor, continuing cleanly:", anchorErr);
      }
    }

    const [sketchResult, audioResult] = await Promise.allSettled([
      needsVector
        ? generateAndVectorizeBeatSketch({
            videoId: id,
            beatIndex,
            sketchPrompt: beat.sketchPrompt,
            accentOrder: beat.accentOrder || "black-blue-red",
            styleAnchorBase64,
          })
        : Promise.resolve(null),
      needsAudio
        ? synthesizeBeatNarration({
            videoId: id,
            beatIndex,
            narration: beat.narration,
            spokenStyleHint: beat.spokenStyleHint,
            language: (doc.language || "en") as StudyLanguage,
            voiceId,
            preferredModel: pinnedModel,
            strictPin: Boolean(pinnedModel),
          })
        : Promise.resolve(null),
    ]);

    const atomicSet: Record<string, unknown> = {};

    if (needsVector) {
      if (sketchResult.status === "fulfilled" && sketchResult.value) {
        atomicSet[`beats.${beatIndex}.vectorStatus`] = "ready";
        atomicSet[`beats.${beatIndex}.vectorData`] = sketchResult.value.vectorData;
        atomicSet[`beats.${beatIndex}.vectorError`] = null;
        if (sketchResult.value.anchorUpload) {
          atomicSet.styleAnchorRawUrl = sketchResult.value.anchorUpload.rawUrl;
          atomicSet.styleAnchorUrl = sketchResult.value.anchorUpload.url;
          atomicSet[`beats.${beatIndex}.styleAnchorUrl`] = sketchResult.value.anchorUpload.url;
        }
      } else {
        const errMsg =
          sketchResult.status === "rejected"
            ? sketchResult.reason instanceof Error
              ? sketchResult.reason.message
              : "Sketch failed"
            : "Sketch failed";
        atomicSet[`beats.${beatIndex}.vectorStatus`] = "failed";
        atomicSet[`beats.${beatIndex}.vectorError`] = errMsg;
      }
    }

    if (needsAudio) {
      if (audioResult.status === "fulfilled" && audioResult.value) {
        if (!pinnedModel && audioResult.value.model) {
          atomicSet[`voiceTracks.${voiceId}.pinnedModel`] = audioResult.value.model;
        }
        atomicSet[`voiceTracks.${voiceId}.beats.${beatIndex}`] = {
          status: "ready",
          audioUrl: audioResult.value.audioUrl,
          audioDurationMs: audioResult.value.audioDurationMs,
        };
      } else {
        const errMsg =
          audioResult.status === "rejected"
            ? audioResult.reason instanceof Error
              ? audioResult.reason.message
              : "Audio synthesis failed"
            : "Audio synthesis failed";
        atomicSet[`voiceTracks.${voiceId}.beats.${beatIndex}`] = {
          status: "failed",
          error: errMsg,
        };
      }
    }

    const updated = await WhiteboardVideo.findByIdAndUpdate(
      id,
      { $set: atomicSet },
      { returnDocument: "after" }
    ).lean<StoredWhiteboardVideo>();

    if (!updated) {
      return NextResponse.json({ error: "Video disappeared during update" }, { status: 404 });
    }

    const updatedBeats = updated.beats || [];
    const recomputedStatus = computeVideoStatus({
      beats: updatedBeats,
      voiceTracks: updated.voiceTracks,
      activeVoiceId: voiceId,
    });
    const recomputedTrack = normalizeVoiceTrackBeats(
      (updated.voiceTracks || {})[voiceId],
      voiceId,
      updatedBeats.length
    );

    const finalized = await WhiteboardVideo.findByIdAndUpdate(
      id,
      {
        $set: {
          status: recomputedStatus,
          [`voiceTracks.${voiceId}.status`]: recomputedTrack.status,
          [`voiceTracks.${voiceId}.totalDurationMs`]: recomputedTrack.totalDurationMs,
        },
      },
      { returnDocument: "after" }
    ).lean<Record<string, unknown>>();

    return NextResponse.json({
      success: true,
      beatIndex,
      video: serializeWhiteboardVideo(finalized || (updated as unknown as Record<string, unknown>)),
    });
  } catch (error) {
    console.error(`[POST /api/whiteboard/videos/${id}/beats/${beatIndex}/generate] error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate whiteboard beat" },
      { status: 500 }
    );
  }
}
