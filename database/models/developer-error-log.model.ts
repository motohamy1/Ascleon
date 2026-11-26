import { model, models, Schema } from "mongoose";

export type DeveloperErrorCategory =
  | "ai_overloaded"
  | "ai_quota"
  | "ai_unavailable"
  | "auth"
  | "validation"
  | "database"
  | "storage"
  | "internal";

export interface IDeveloperErrorLog {
  errorId: string;
  context: string;
  category: DeveloperErrorCategory;
  statusCode: number;
  message: string;
  stack?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const DeveloperErrorLogSchema = new Schema<IDeveloperErrorLog>(
  {
    errorId: { type: String, required: true, index: true },
    context: { type: String, required: true, index: true },
    category: {
      type: String,
      enum: [
        "ai_overloaded",
        "ai_quota",
        "ai_unavailable",
        "auth",
        "validation",
        "database",
        "storage",
        "internal",
      ],
      default: "internal",
      index: true,
    },
    statusCode: { type: Number, default: 500 },
    message: { type: String, required: true },
    stack: { type: String },
    meta: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now, expires: "30d" },
  },
  { versionKey: false }
);

const DeveloperErrorLog =
  models.DeveloperErrorLog ||
  model<IDeveloperErrorLog>("DeveloperErrorLog", DeveloperErrorLogSchema);

export default DeveloperErrorLog;
