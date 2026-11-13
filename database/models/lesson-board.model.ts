import { Document, model, models, Schema } from "mongoose";
import { StudyLanguage } from "@/lib/language";
import {
  DroppedFactNotice,
  LessonLink,
  LessonSection,
  LessonStatus,
  LessonVoiceTrack,
} from "@/types/lesson-board";
import { WhiteboardPacing, WhiteboardScopePayload } from "@/types/whiteboard-video";
import { DEFAULT_WHITEBOARD_VOICE } from "@/lib/whiteboard/voices";

export interface ILessonBoardDocument extends Document {
  clerkId?: string;
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
  createdAt: Date;
  updatedAt: Date;
}

const LessonBoardSchema = new Schema<ILessonBoardDocument>(
  {
    clerkId: { type: String, index: true },
    bookId: { type: String, required: true, index: true },
    bookTitle: { type: String, required: true },
    scopeHash: { type: String, required: true, index: true },
    pipelineVersion: { type: Number, required: true, default: 1 },
    scope: { type: Schema.Types.Mixed, required: true },
    language: { type: String, enum: ["en", "ar", "mixed"], default: "en", index: true },
    pacing: { type: String, enum: ["auto", "concise", "deep"], default: "auto" },
    title: { type: String, required: true },
    objective: { type: String, default: "" },
    sections: { type: Schema.Types.Mixed, default: [] },
    links: { type: Schema.Types.Mixed, default: [] },
    droppedFacts: { type: Schema.Types.Mixed, default: [] },
    status: {
      type: String,
      enum: ["planning", "rendering", "completed", "partial", "failed"],
      default: "planning",
    },
    voiceTracks: { type: Schema.Types.Mixed, default: {} },
    activeVoiceId: { type: String, default: DEFAULT_WHITEBOARD_VOICE },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

LessonBoardSchema.index(
  { bookId: 1, scopeHash: 1, language: 1, pacing: 1, pipelineVersion: 1 },
  { unique: true }
);

const LessonBoard =
  models.LessonBoard || model<ILessonBoardDocument>("LessonBoard", LessonBoardSchema);

export default LessonBoard;
