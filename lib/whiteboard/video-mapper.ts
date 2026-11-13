import { IWhiteboardVideoDocument } from "@/database/models/whiteboard-video.model";
import {
  VoiceTrack,
  VoiceTrackBeat,
  WhiteboardVideoData,
  WhiteboardVideoStatus,
} from "@/types/whiteboard-video";
import { DEFAULT_WHITEBOARD_VOICE } from "./voices";

export const WHITEBOARD_PIPELINE_VERSION = 2;

export function buildEmptyVoiceTrack(voiceId: string, beatCount: number): VoiceTrack {
  const beats: VoiceTrackBeat[] = Array.from({ length: beatCount }, () => ({
    status: "planned",
  }));
  return {
    voiceId,
    status: "pending",
    beats,
    totalDurationMs: 0,
  };
}

export function normalizeVoiceTrackBeats(
  rawTrack: Partial<VoiceTrack> | undefined,
  voiceId: string,
  beatCount: number
): VoiceTrack {
  const normalizedBeats: VoiceTrackBeat[] = Array.from({ length: beatCount }, (_, idx) => {
    const rawBeats = rawTrack?.beats as VoiceTrackBeat[] | Record<string, VoiceTrackBeat> | undefined;
    const item = Array.isArray(rawBeats) ? rawBeats[idx] : rawBeats?.[String(idx)];
    if (!item) return { status: "planned" };
    return {
      status: item.status || "planned",
      audioUrl: item.audioUrl,
      audioDurationMs: item.audioDurationMs,
      error: item.error,
    };
  });

  const readyCount = normalizedBeats.filter((b) => b.status === "ready").length;
  const failedCount = normalizedBeats.filter((b) => b.status === "failed").length;
  const generatingCount = normalizedBeats.filter((b) => b.status === "generating").length;

  let status: VoiceTrack["status"] = "pending";
  if (readyCount === beatCount && beatCount > 0) status = "ready";
  else if (generatingCount > 0) status = "rendering";
  else if (failedCount === beatCount && beatCount > 0) status = "failed";
  else if (readyCount > 0 || failedCount > 0) status = "partial";

  const totalDurationMs = normalizedBeats.reduce(
    (sum, b) => sum + (b.status === "ready" ? b.audioDurationMs || 0 : 0),
    0
  );

  return {
    voiceId,
    pinnedModel: rawTrack?.pinnedModel,
    style: rawTrack?.style,
    status,
    beats: normalizedBeats,
    totalDurationMs,
  };
}

export function computeVideoStatus(doc: {
  beats: Array<{ vectorStatus: string }>;
  voiceTracks?: Record<string, Partial<VoiceTrack>>;
  activeVoiceId?: string;
}): WhiteboardVideoStatus {
  const total = doc.beats.length;
  if (total === 0) return "failed";
  const ready = doc.beats.filter((b) => b.vectorStatus === "ready").length;
  const failed = doc.beats.filter((b) => b.vectorStatus === "failed").length;
  const generating = doc.beats.filter((b) => b.vectorStatus === "generating").length;

  const activeVoice = doc.activeVoiceId || DEFAULT_WHITEBOARD_VOICE;
  const track = doc.voiceTracks?.[activeVoice];
  const audioBeats = (track?.beats || []) as Array<{ status?: string }>;
  const audioReady = audioBeats.filter((b) => b?.status === "ready").length;
  const audioFailed = audioBeats.filter((b) => b?.status === "failed").length;

  if (ready === total && audioReady === total && total > 0) return "completed";
  if (generating > 0) return "rendering";
  if (failed === total || (audioFailed === total && total > 0 && ready === 0)) return "failed";
  if (ready > 0 || failed > 0 || audioReady > 0 || audioFailed > 0) return "partial";
  return "planning";
}

export function serializeWhiteboardVideo(
  doc: IWhiteboardVideoDocument | Record<string, unknown>
): WhiteboardVideoData {
  const raw = doc as Record<string, unknown>;
  const beats = Array.isArray(raw.beats) ? (raw.beats as WhiteboardVideoData["beats"]) : [];
  const rawTracks = (raw.voiceTracks || {}) as Record<string, VoiceTrack>;
  const activeVoiceId = (raw.activeVoiceId as string) || DEFAULT_WHITEBOARD_VOICE;
  const voiceTracks: Record<string, VoiceTrack> = {};

  for (const [vId, rawTrack] of Object.entries(rawTracks)) {
    voiceTracks[vId] = normalizeVoiceTrackBeats(rawTrack, vId, beats.length);
  }

  return {
    id: String(raw._id),
    bookId: String(raw.bookId),
    bookTitle: String(raw.bookTitle || "Study Source"),
    scopeHash: String(raw.scopeHash),
    pipelineVersion: Number(raw.pipelineVersion || WHITEBOARD_PIPELINE_VERSION),
    scope: raw.scope as WhiteboardVideoData["scope"],
    language: (raw.language as WhiteboardVideoData["language"]) || "en",
    pacing: (raw.pacing as WhiteboardVideoData["pacing"]) || "auto",
    title: String(raw.title || "Whiteboard Explanation"),
    summary: String(raw.summary || ""),
    status: computeVideoStatus({ beats, voiceTracks, activeVoiceId }),
    styleAnchorUrl: raw.styleAnchorUrl as string | undefined,
    beats,
    voiceTracks,
    activeVoiceId,
    createdAt: raw.createdAt ? new Date(String(raw.createdAt)).toISOString() : new Date().toISOString(),
    updatedAt: raw.updatedAt ? new Date(String(raw.updatedAt)).toISOString() : new Date().toISOString(),
  };
}
