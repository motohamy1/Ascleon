import { StudyLanguage } from "@/lib/language";
import { WhiteboardPacing, WhiteboardScopePayload } from "./whiteboard-video";

export const ALLOWED_LESSON_ICONS = [
  "heart-pulse",
  "brain",
  "bone",
  "pill",
  "syringe",
  "droplet",
  "microscope",
  "activity",
  "stethoscope",
  "thermometer",
  "dna",
  "wind",
  "eye",
  "shield-check",
  "alert-triangle",
  "zap",
  "flame",
  "flask-conical",
  "git-branch",
  "check-circle",
  "circle-dot",
  "book-open",
] as const;

export type LessonIconId = (typeof ALLOWED_LESSON_ICONS)[number];

export type LessonSectionKind =
  | "concept"
  | "mechanism"
  | "clinical"
  | "diagnosis"
  | "management"
  | "recap";

export type LessonNodeKind =
  | "structure"
  | "step"
  | "cause"
  | "effect"
  | "sign"
  | "test"
  | "treatment"
  | "pearl";

export type LessonTone = "neutral" | "normal" | "pathology";

export type LessonLinkKind = "leads_to" | "causes" | "contrasts" | "treats";

export type LessonStatus = "planning" | "rendering" | "completed" | "partial" | "failed";
export type LessonSectionAudioStatus = "planned" | "generating" | "ready" | "failed";

export interface BoardLimits {
  minSections: number;
  maxSections: number;
  minNodesPerSection: number;
  maxNodesPerSection: number;
  minSegmentsPerSection: number;
  maxSegmentsPerSection: number;
  maxTitleWords: number;
  maxObjectiveWords: number;
  maxSectionTitleWords: number;
  maxNodeTextWords: number;
  maxSegmentWords: number;
  maxLinks: number;
}

export const DEFAULT_BOARD_LIMITS: BoardLimits = {
  minSections: 3,
  maxSections: 5,
  minNodesPerSection: 2,
  maxNodesPerSection: 4,
  minSegmentsPerSection: 2,
  maxSegmentsPerSection: 6,
  maxTitleWords: 10,
  maxObjectiveWords: 20,
  maxSectionTitleWords: 6,
  maxNodeTextWords: 9,
  maxSegmentWords: 45,
  maxLinks: 18,
};

/**
 * Single source of truth for board limits shared by prompt generation, Zod validation, and sanitization.
 */
export function getBoardLimits(
  scopeType: WhiteboardScopePayload["type"],
  wordCount: number,
  pacing: WhiteboardPacing = "auto"
): BoardLimits {
  let minSections = 3;
  let maxSections = 5;

  if (scopeType === "selection" && wordCount < 150) {
    minSections = 2;
    maxSections = 3;
  } else if (pacing === "concise") {
    minSections = 3;
    maxSections = 4;
  } else if (pacing === "deep") {
    minSections = 4;
    maxSections = 5;
  }

  return {
    ...DEFAULT_BOARD_LIMITS,
    minSections,
    maxSections,
  };
}

export interface LessonNodeSource {
  page: number;
  quote: string;
}

export interface LessonNode {
  id: string;
  text: string;
  detail?: string;
  kind: LessonNodeKind;
  tone: LessonTone;
  icon?: LessonIconId;
  trend?: "up" | "down" | "none";
  source: LessonNodeSource;
}

export interface LessonSegment {
  id: string;
  nodeId: string | null;
  text: string;
}

export interface LessonSection {
  id: string;
  title: string;
  kind: LessonSectionKind;
  nodes: LessonNode[];
  script: LessonSegment[];
}

export interface LessonLink {
  from: string;
  to: string;
  kind: LessonLinkKind;
  label?: string;
}

export interface DroppedFactNotice {
  text: string;
  reason: string;
}

export interface LessonCue {
  segmentId: string;
  nodeId: string | null;
  text: string;
  startMs: number;
  endMs: number;
}

export interface LessonVoiceSectionTrack {
  status: LessonSectionAudioStatus;
  audioUrl?: string;
  audioDurationMs?: number;
  cues: LessonCue[];
  error?: string;
}

export interface LessonVoiceTrack {
  voiceId: string;
  pinnedModel?: string;
  style: string;
  status: "pending" | "rendering" | "ready" | "partial" | "failed";
  sections: LessonVoiceSectionTrack[];
  totalDurationMs: number;
}

export interface LessonBoardData {
  id: string;
  bookId: string;
  bookTitle: string;
  scopeHash: string;
  pipelineVersion: number;
  scope: WhiteboardScopePayload;
  language: StudyLanguage;
  pacing: WhiteboardPacing;
  title: string;
  objective: string;
  sections: LessonSection[];
  links: LessonLink[];
  droppedFacts: DroppedFactNotice[];
  status: LessonStatus;
  voiceTracks: Record<string, LessonVoiceTrack>;
  activeVoiceId: string;
  createdAt: string;
  updatedAt: string;
}
