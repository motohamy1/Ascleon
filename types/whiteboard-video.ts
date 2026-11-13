import { StudyLanguage } from "@/lib/language";

export type WhiteboardScopeType = "selection" | "page" | "range" | "topic";
export type WhiteboardPacing = "auto" | "concise" | "deep";
export type WhiteboardInkColor = "#18181B" | "#DC2626" | "#2563EB";
export type WhiteboardBeatStatus = "planned" | "generating" | "ready" | "failed";
export type WhiteboardVideoStatus = "planning" | "rendering" | "completed" | "partial" | "failed";

export interface VectorStrokePath {
  d: string;
  color: WhiteboardInkColor;
  strokeWidth: number;
  length: number;
  order: number;
}

export interface BeatVectorData {
  width: number;
  height: number;
  totalLength: number;
  paths: VectorStrokePath[];
}

export interface BeatLabel {
  id: string;
  text: string;
  tone: "neutral" | "pathology" | "normal";
  /** Percentage 6..94 within the 1920x1080 beat frame */
  x: number;
  /** Percentage 10..90 within the 1920x1080 beat frame */
  y: number;
  align?: "start" | "center" | "end";
}

export interface BoardSlot {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WhiteboardBeat {
  index: number;
  title: string;
  narration: string;
  spokenStyleHint: string;
  sourceQuote: string;
  sourcePage: number;
  sketchPrompt: string;
  accentOrder: "black-blue-red" | "black-red-blue";
  labels: BeatLabel[];
  boardSlot: BoardSlot;
  vectorStatus: WhiteboardBeatStatus;
  vectorError?: string;
  vectorData?: BeatVectorData;
  styleAnchorUrl?: string;
}

export interface VoiceTrackBeat {
  status: WhiteboardBeatStatus;
  audioUrl?: string;
  audioDurationMs?: number;
  error?: string;
}

export interface VoiceTrack {
  voiceId: string;
  pinnedModel?: string;
  style?: string;
  status: "pending" | "rendering" | "ready" | "partial" | "failed";
  beats: VoiceTrackBeat[];
  totalDurationMs: number;
}

export interface WhiteboardScopePayload {
  type: WhiteboardScopeType;
  startPage: number;
  endPage: number;
  topicTitle?: string;
  topicId?: string;
  selectedText?: string;
  selectedTextPreview?: string;
}

export interface WhiteboardVideoData {
  id: string;
  bookId: string;
  bookTitle: string;
  scopeHash: string;
  pipelineVersion: number;
  scope: WhiteboardScopePayload;
  language: StudyLanguage;
  pacing: WhiteboardPacing;
  title: string;
  summary: string;
  status: WhiteboardVideoStatus;
  styleAnchorRawUrl?: string;
  styleAnchorUrl?: string;
  beats: WhiteboardBeat[];
  voiceTracks: Record<string, VoiceTrack>;
  activeVoiceId: string;
  createdAt: string;
  updatedAt: string;
}
