import { model, Schema, models, Document } from "mongoose";

export interface IKnowledgeNodeDocument extends Document {
  domain: string;
  topic: string;
  source: string;
  type: "textbook" | "guideline" | "qbank" | "mnemonic";
  title: string;
  content: string;
  clinicalPearls?: string[];
  options?: string[];
  correctIndex?: number;
  distractorRationales?: Record<string, string>;
  sourceQBank?: string;
  difficulty?: string;
  createdAt: string;
  updatedAt: string;
}

const KnowledgeNodeSchema = new Schema(
  {
    domain: { type: String, required: true, index: true },
    topic: { type: String, required: true, index: true },
    source: { type: String, required: true },
    type: {
      type: String,
      enum: ["textbook", "guideline", "qbank", "mnemonic"],
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    content: { type: String, required: true },
    clinicalPearls: { type: [String], default: [] },
    options: { type: [String], default: [] },
    correctIndex: { type: Number },
    distractorRationales: { type: Map, of: String },
    sourceQBank: { type: String },
    difficulty: { type: String, default: "medium" },
  },
  { timestamps: true }
);

KnowledgeNodeSchema.index({ domain: 1, topic: 1 });
KnowledgeNodeSchema.index({ content: "text", title: "text" });

const KnowledgeNode =
  models.KnowledgeNode ||
  model<IKnowledgeNodeDocument>("KnowledgeNode", KnowledgeNodeSchema);

export default KnowledgeNode;
