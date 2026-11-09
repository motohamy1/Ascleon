import { model, Schema, models, Document } from "mongoose";
import { WhiteboardDeck } from "@/types/whiteboard";

export interface IWhiteboardArtifactDocument extends WhiteboardDeck, Document {
  clerkId?: string;
  bookId: Schema.Types.ObjectId | string;
  selectionHash: string;
  createdAt: string;
  updatedAt: string;
}

const WhiteboardArtifactSchema = new Schema(
  {
    clerkId: { type: String, index: true },
    bookId: {
      type: Schema.Types.ObjectId,
      ref: "Book",
      required: true,
      index: true,
    },
    pageNumber: { type: Number, required: true, index: true },
    selectionHash: { type: String, required: true, index: true },
    topicTitle: { type: String, required: true },
    language: { type: String, default: "en" },
    scenes: { type: Array, required: true },
  },
  { timestamps: true }
);

WhiteboardArtifactSchema.index(
  { bookId: 1, pageNumber: 1, selectionHash: 1, language: 1 },
  { unique: true }
);

const WhiteboardArtifact =
  models.WhiteboardArtifact ||
  model<IWhiteboardArtifactDocument>("WhiteboardArtifact", WhiteboardArtifactSchema);

export default WhiteboardArtifact;
