import { model, Schema, models } from "mongoose";
import { IBook } from "@/types";

const BookSchema = new Schema<IBook>(
  {
    clerkId: { type: String, required: true },
    title: { type: String, required: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    author: { type: String, required: true },
    persona: { type: String },
    fileURL: { type: String, required: true },
    fileBlobKey: { type: String, required: true },
    coverURL: { type: String },
    coverBlobKey: { type: String },
    fileSize: { type: Number, required: true },
    totalSegments: { type: Number, default: 0 },
    topic: { type: String, default: "General" },
    readingStatus: {
      type: String,
      enum: ["not_started", "in_progress", "read"],
      default: "not_started",
    },
    readingTimeMinutes: { type: Number, default: 15 },
    color: { type: String },
    isFavorite: { type: Boolean, default: false },
    year: { type: Number },
    summary: { type: String },
  },
  { timestamps: true },
);

const Book = models.Book || model<IBook>("Book", BookSchema);

export default Book;
