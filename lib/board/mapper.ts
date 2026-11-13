import { StudyLanguage } from "@/lib/language";
import {
  DEFAULT_WHITEBOARD_VOICE,
  getLessonTeachingStyle,
} from "@/lib/whiteboard/voices";
import {
  DroppedFactNotice,
  LessonBoardData,
  LessonLink,
  LessonSection,
  LessonStatus,
  LessonVoiceSectionTrack,
  LessonVoiceTrack,
} from "@/types/lesson-board";

export const LESSON_PIPELINE_VERSION = 1;

export function buildEmptyLessonVoiceTrack(
  voiceId: string,
  sectionCount: number,
  language: StudyLanguage
): LessonVoiceTrack {
  const sections: LessonVoiceSectionTrack[] = Array.from(
    { length: sectionCount },
    () => ({
      status: "planned",
      cues: [],
    })
  );

  return {
    voiceId,
    style: getLessonTeachingStyle(language),
    status: "pending",
    sections,
    totalDurationMs: 0,
  };
}

export function normalizeLessonVoiceTrack(
  rawTrack: Partial<LessonVoiceTrack> | undefined,
  voiceId: string,
  sectionCount: number,
  language: StudyLanguage
): LessonVoiceTrack {
  const normalizedSections: LessonVoiceSectionTrack[] = Array.from(
    { length: sectionCount },
    (_, idx) => {
      const rawSecs = rawTrack?.sections as
        | LessonVoiceSectionTrack[]
        | Record<string, LessonVoiceSectionTrack>
        | undefined;
      const item = Array.isArray(rawSecs) ? rawSecs[idx] : rawSecs?.[String(idx)];
      if (!item) {
        return { status: "planned", cues: [] };
      }
      return {
        status: item.status || "planned",
        audioUrl: item.audioUrl,
        audioDurationMs: item.audioDurationMs,
        cues: Array.isArray(item.cues) ? item.cues : [],
        error: item.error,
      };
    }
  );

  const readyCount = normalizedSections.filter((s) => s.status === "ready").length;
  const failedCount = normalizedSections.filter((s) => s.status === "failed").length;
  const generatingCount = normalizedSections.filter(
    (s) => s.status === "generating"
  ).length;

  let status: LessonVoiceTrack["status"] = "pending";
  if (readyCount === sectionCount && sectionCount > 0) status = "ready";
  else if (generatingCount > 0) status = "rendering";
  else if (failedCount === sectionCount && sectionCount > 0) status = "failed";
  else if (readyCount > 0 || failedCount > 0) status = "partial";

  const totalDurationMs = normalizedSections.reduce(
    (sum, s) => sum + (s.status === "ready" ? s.audioDurationMs || 0 : 0),
    0
  );

  return {
    voiceId,
    pinnedModel: rawTrack?.pinnedModel,
    style: rawTrack?.style || getLessonTeachingStyle(language),
    status,
    sections: normalizedSections,
    totalDurationMs,
  };
}

export function computeLessonStatus(doc: {
  sections: LessonSection[];
  voiceTracks?: Record<string, Partial<LessonVoiceTrack>>;
  activeVoiceId?: string;
  language?: StudyLanguage;
}): LessonStatus {
  const total = doc.sections.length;
  if (total === 0) return "failed";

  const activeVoice = doc.activeVoiceId || DEFAULT_WHITEBOARD_VOICE;
  const track = normalizeLessonVoiceTrack(
    doc.voiceTracks?.[activeVoice],
    activeVoice,
    total,
    doc.language || "en"
  );

  if (track.status === "ready") return "completed";
  if (track.status === "rendering") return "rendering";
  if (track.status === "failed") return "failed";
  if (track.status === "partial") return "partial";
  return "rendering";
}

export function serializeLessonBoard(
  doc: Record<string, unknown>
): LessonBoardData {
  const sections = Array.isArray(doc.sections)
    ? (doc.sections as LessonSection[])
    : [];
  const links = Array.isArray(doc.links) ? (doc.links as LessonLink[]) : [];
  const droppedFacts = Array.isArray(doc.droppedFacts)
    ? (doc.droppedFacts as DroppedFactNotice[])
    : [];
  const language = (doc.language as StudyLanguage) || "en";
  const activeVoiceId =
    (doc.activeVoiceId as string) || DEFAULT_WHITEBOARD_VOICE;
  const rawTracks = (doc.voiceTracks || {}) as Record<
    string,
    Partial<LessonVoiceTrack>
  >;

  const voiceTracks: Record<string, LessonVoiceTrack> = {};
  for (const [vId, rawTrack] of Object.entries(rawTracks)) {
    voiceTracks[vId] = normalizeLessonVoiceTrack(
      rawTrack,
      vId,
      sections.length,
      language
    );
  }

  return {
    id: String(doc._id),
    bookId: String(doc.bookId),
    bookTitle: String(doc.bookTitle || "Study Source"),
    scopeHash: String(doc.scopeHash || ""),
    pipelineVersion: Number(doc.pipelineVersion || LESSON_PIPELINE_VERSION),
    scope: doc.scope as LessonBoardData["scope"],
    language,
    pacing: (doc.pacing as LessonBoardData["pacing"]) || "auto",
    title: String(doc.title || "Clinical Whiteboard Lesson"),
    objective: String(doc.objective || ""),
    sections,
    links,
    droppedFacts,
    status: computeLessonStatus({
      sections,
      voiceTracks,
      activeVoiceId,
      language,
    }),
    voiceTracks,
    activeVoiceId,
    createdAt: doc.createdAt
      ? new Date(String(doc.createdAt)).toISOString()
      : new Date().toISOString(),
    updatedAt: doc.updatedAt
      ? new Date(String(doc.updatedAt)).toISOString()
      : new Date().toISOString(),
  };
}
