import { Document, model, models, Schema } from "mongoose";
import { StudyLanguage } from "@/lib/language";
import {
  StudyPlanChatMessage,
  StudyPlanSection,
  StudyPlanStatus,
} from "@/types/study-plan";

export interface IStudyPlanDocument extends Document {
  clerkId: string;
  bookId: Schema.Types.ObjectId;
  bookSlug: string;
  bookTitle: string;
  title: string;
  subject: string;
  examDate: Date | null;
  targetGrade: string;
  confidenceLevel: number;
  language: StudyLanguage;
  status: StudyPlanStatus;
  readinessScore: number;
  sections: StudyPlanSection[];
  chatHistory: StudyPlanChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const StudyPlanStepSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    type: {
      type: String,
      enum: ["summary", "quiz", "flashcards", "reading"],
      required: true,
    },
    startPage: { type: Number, required: true, min: 1 },
    endPage: { type: Number, required: true, min: 1 },
    estimatedMinutes: { type: Number, default: 20, min: 5 },
    status: {
      type: String,
      enum: ["pending", "ready", "completed", "deferred"],
      default: "pending",
    },
    generatedContent: { type: Schema.Types.Mixed, default: null },
    completedAt: { type: Date, default: null },
  },
  { _id: false }
);

const StudyPlanSectionSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    dayNumber: { type: Number, required: true, min: 1 },
    scheduledDate: { type: String, required: true },
    topics: { type: [String], default: [] },
    steps: { type: [StudyPlanStepSchema], default: [] },
  },
  { _id: false }
);

const StudyPlanChatMessageSchema = new Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    text: { type: String, required: true },
    diffSummary: {
      type: {
        added: { type: [String], default: [] },
        changed: { type: [String], default: [] },
        removed: { type: [String], default: [] },
      },
      default: null,
      _id: false,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const StudyPlanSchema = new Schema<IStudyPlanDocument>(
  {
    clerkId: { type: String, required: true, index: true },
    bookId: { type: Schema.Types.ObjectId, ref: "Book", required: true },
    bookSlug: { type: String, required: true },
    bookTitle: { type: String, required: true },
    title: { type: String, required: true },
    subject: { type: String, default: "General" },
    examDate: { type: Date, default: null },
    targetGrade: { type: String, default: "A" },
    confidenceLevel: { type: Number, min: 1, max: 5, default: 3 },
    language: { type: String, enum: ["en", "ar", "mixed"], default: "en" },
    status: {
      type: String,
      enum: ["active", "completed", "archived"],
      default: "active",
    },
    readinessScore: { type: Number, min: 0, max: 100, default: 0 },
    sections: { type: [StudyPlanSectionSchema], default: [] },
    chatHistory: { type: [StudyPlanChatMessageSchema], default: [] },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

StudyPlanSchema.index({ clerkId: 1, updatedAt: -1 });

const StudyPlan =
  models.StudyPlan || model<IStudyPlanDocument>("StudyPlan", StudyPlanSchema);

export default StudyPlan;
