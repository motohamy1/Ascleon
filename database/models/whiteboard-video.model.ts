import { model, Schema, models, Document } from "mongoose";
import {
  WhiteboardBeat,
  WhiteboardPacing,
  WhiteboardScopePayload,
  WhiteboardVideoStatus,
  VoiceTrack,
} from "@/types/whiteboard-video";
import { StudyLanguage } from "@/lib/language";

export interface IWhiteboardVideoDocument extends Document {
  clerkId?: string;
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
  createdAt: Date;
  updatedAt: Date;
}

const WhiteboardVideoSchema = new Schema<IWhiteboardVideoDocument>(
  {
    clerkId: { type: String, index: true },
    bookId: { type: String, required: true, index: true },
    bookTitle: { type: String, required: true },
    scopeHash: { type: String, required: true, index: true },
    pipelineVersion: { type: Number, required: true, default: 2 },
    scope: { type: Schema.Types.Mixed, required: true },
    language: { type: String, enum: ["en", "ar", "mixed"], default: "en", index: true },
    pacing: { type: String, enum: ["auto", "concise", "deep"], default: "auto" },
    title: { type: String, required: true },
    summary: { type: String, default: "" },
    status: {
      type: String,
      enum: ["planning", "rendering", "completed", "partial", "failed"],
      default: "planning",
    },
    styleAnchorRawUrl: { type: String },
    styleAnchorUrl: { type: String },
    beats: { type: Schema.Types.Mixed, default: [] },
    voiceTracks: { type: Schema.Types.Mixed, default: {} },
    activeVoiceId: { type: String, default: "Kore" },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

WhiteboardVideoSchema.index(
  { bookId: 1, scopeHash: 1, language: 1, pacing: 1, pipelineVersion: 1 },
  { unique: true }
);

const WhiteboardVideo =
  models.WhiteboardVideo ||
  model<IWhiteboardVideoDocument>("WhiteboardVideo", WhiteboardVideoSchema);

export default WhiteboardVideo;
