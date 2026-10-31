import { model, Schema, models, Document } from "mongoose";
import { MorphArtifactData } from "@/types/morph";

export interface IMorphArtifactDocument extends MorphArtifactData, Document {
  clerkId?: string;
  createdAt: string;
  updatedAt: string;
}

const MorphArtifactSchema = new Schema(
  {
    clerkId: { type: String, index: true },
    bookId: {
      type: Schema.Types.ObjectId,
      ref: "Book",
      required: true,
      index: true,
    },
    segmentIndex: { type: Number, required: true, index: true },
    selectionHash: { type: String, default: "default", index: true },
    focalConcept: { type: String, required: true },
    contextSummary: {
      precedingBridge: { type: String },
      subsequentBridge: { type: String },
    },
    blocks: { type: Array, required: true },
  },
  { timestamps: true },
);

MorphArtifactSchema.index(
  { bookId: 1, segmentIndex: 1, selectionHash: 1 },
  { unique: true },
);

const MorphArtifact =
  models.MorphArtifact ||
  model<IMorphArtifactDocument>("MorphArtifact", MorphArtifactSchema);

export default MorphArtifact;
