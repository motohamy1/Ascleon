import {
  MAX_FILE_SIZE,
  ACCEPTED_PDF_TYPES,
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_SIZE,
} from "@/lib/constants";
import z from "zod";

export const UploadSchema = z.object({
  pdfFile: z
    .instanceof(File, { message: "PDF file is required" })
    .refine((file) => file.size <= MAX_FILE_SIZE, {
      message: "PDF file must be less than 50MB",
    })
    .refine(
      (file) =>
        ACCEPTED_PDF_TYPES.includes(file.type) ||
        file.name.toLowerCase().endsWith(".pdf"),
      {
        message: "Only PDF files are accepted (.pdf)",
      },
    ),
  coverImage: z
    .instanceof(File)
    .optional()
    .refine((file) => !file || file.size <= MAX_IMAGE_SIZE, {
      message: "Cover image must be less than 10MB",
    })
    .refine(
      (file) =>
        !file ||
        ACCEPTED_IMAGE_TYPES.includes(file.type) ||
        /\.(jpe?g|png|webp)$/i.test(file.name),
      {
        message: "Only JPG, PNG, or WebP images are accepted",
      },
    ),
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be less than 200 characters"),
  author: z
    .string()
    .min(1, "Author name is required")
    .max(200, "Author name must be less than 200 characters"),
  persona: z.string().min(1, "Please select a voice"),
});
