import { model, Schema, models, Document } from "mongoose";

export interface IStudyProgressDocument extends Document {
  clerkId: string;
  bookSlug: string;
  bookId?: Schema.Types.ObjectId;
  lastStudiedPage: number;
  totalPages: number;
  progressPercent: number;
  readingStatus: "not_started" | "in_progress" | "read";
  activeIntent: "chat" | "morph" | "voice" | "summary" | "quiz";
  studyLanguage?: string;
  studyScope?: any;
  morphActiveTopic?: string | null;
  chatMessages?: any[];
  activeQBankIdx?: number;
  lastStudiedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StudyProgressSchema = new Schema(
  {
    clerkId: { type: String, required: true, index: true },
    bookSlug: { type: String, required: true, index: true },
    bookId: { type: Schema.Types.ObjectId, ref: "Book" },
    lastStudiedPage: { type: Number, default: 1 },
    totalPages: { type: Number, default: 1 },
    progressPercent: { type: Number, default: 0 },
    readingStatus: {
      type: String,
      enum: ["not_started", "in_progress", "read"],
      default: "in_progress",
    },
    activeIntent: {
      type: String,
      enum: ["chat", "morph", "voice", "summary", "quiz"],
      default: "chat",
    },
    studyLanguage: { type: String, default: "en" },
    studyScope: { type: Schema.Types.Mixed },
    morphActiveTopic: { type: String, default: null },
    chatMessages: { type: Array, default: [] },
    activeQBankIdx: { type: Number, default: 0 },
    lastStudiedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

StudyProgressSchema.index({ clerkId: 1, bookSlug: 1 }, { unique: true });
StudyProgressSchema.index({ clerkId: 1, lastStudiedAt: -1 });

const StudyProgress =
  models.StudyProgress ||
  model<IStudyProgressDocument>("StudyProgress", StudyProgressSchema);

export default StudyProgress;
