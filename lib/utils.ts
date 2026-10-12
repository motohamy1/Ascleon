import { TextSegment } from "@/types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { DEFAULT_VOICE, voiceOptions } from "./constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Serialize Mongoose documents to plain JSON objects (strips ObjectId, Date, etc.)
export const serializeData = <T>(data: T): T =>
  JSON.parse(JSON.stringify(data));

// Auto generate slug
export function generateSlug(text: string): string {
  return text
    .replace(/\.[^/.]+$/, "") // Remove file extension (.pdf, .txt, etc.)
    .toLowerCase() // Convert to lowercase
    .trim() // Remove whitespace from both ends
    .replace(/[^\w\s-]/g, "") // Remove special characters (keep letters, numbers, spaces, hyphens)
    .replace(/[\s_]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

// Escape regex special characters to prevent ReDoS attacks
export const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Splits text content into segments for MongoDB storage and search
export const splitIntoSegments = (
  text: string,
  segmentSize: number = 500, // Maximum words per segment
  overlapSize: number = 50, // Words to overlap between segments for context
): TextSegment[] => {
  // Validate parameters to prevent infinite loops
  if (segmentSize <= 0) {
    throw new Error("segmentSize must be greater than 0");
  }
  if (overlapSize < 0 || overlapSize >= segmentSize) {
    throw new Error("overlapSize must be >= 0 and < segmentSize");
  }

  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const segments: TextSegment[] = [];

  let segmentIndex = 0;
  let startIndex = 0;

  while (startIndex < words.length) {
    const endIndex = Math.min(startIndex + segmentSize, words.length);
    const segmentWords = words.slice(startIndex, endIndex);
    const segmentText = segmentWords.join(" ");

    segments.push({
      text: segmentText,
      segmentIndex,
      wordCount: segmentWords.length,
    });

    segmentIndex++;

    if (endIndex >= words.length) break;
    startIndex = endIndex - overlapSize;
  }

  return segments;
};

// Get voice data by persona key or voice ID
export const getVoice = (persona?: string) => {
  if (!persona) return voiceOptions[DEFAULT_VOICE];

  // Find by voice ID
  const voiceEntry = Object.values(voiceOptions).find((v) => v.id === persona);
  if (voiceEntry) return voiceEntry;

  // Find by key
  const voiceByKey = voiceOptions[persona as keyof typeof voiceOptions];
  if (voiceByKey) return voiceByKey;

  // Default fallback
  return voiceOptions[DEFAULT_VOICE];
};

// Format duration in seconds to MM:SS format
export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export async function parsePDFFile(file: File) {
  // Guard against server-side execution
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("parsePDFFile can only be called in a browser environment");
  }

  try {
    const pdfjsLib = await import("pdfjs-dist");

    // Set worker source for browser environment
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();

    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDocument = await loadingTask.promise;

    // Render first page as cover image
    const firstPage = await pdfDocument.getPage(1);
    const viewport = firstPage.getViewport({ scale: 2 }); // 2x scale for better quality

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not get canvas context");
    }

    await firstPage.render({
      canvasContext: context,
      viewport: viewport,
      canvas: canvas,
    }).promise;

    // Convert canvas to data URL
    const coverDataURL = canvas.toDataURL("image/png");

    // Extract text from all pages
    let fullText = "";

    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .filter((item) => "str" in item)
        .map((item) => (item as { str: string }).str)
        .join(" ");
      fullText += pageText + "\n";
    }

    // Split text into segments for search
    const segments = splitIntoSegments(fullText);

    // Clean up PDF document resources
    await pdfDocument.destroy();

    return {
      content: segments,
      cover: coverDataURL,
    };
  } catch (error) {
    console.error("Error parsing PDF:", error);
    throw new Error(
      `Failed to parse PDF file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ============================================
// LIBRARY SPINE & PALETTE HELPERS (Gloss Style)
// ============================================

export const SPINE_PALETTES = [
  { bg: "#7A2E22", text: "#F7EDE2", border: "#581F17", accent: "#E59866" }, // Terracotta Oxblood
  { bg: "#1F3B2C", text: "#E8F5E9", border: "#14271D", accent: "#A3E4D7" }, // Deep Forest
  { bg: "#1D2D44", text: "#EDF2F4", border: "#111B29", accent: "#8ECAE6" }, // Vintage Navy
  { bg: "#7A5826", text: "#FEF9E7", border: "#523A17", accent: "#F9E79F" }, // Antique Ochre
  { bg: "#4A2B42", text: "#FADBD8", border: "#311B2C", accent: "#D7BDE2" }, // Mulberry Plum
  { bg: "#2B4049", text: "#E0F2F1", border: "#1A272D", accent: "#80CBC4" }, // Slate Teal
  { bg: "#6E3D1F", text: "#FBEEE6", border: "#492612", accent: "#EDBB99" }, // Cognac Amber
  { bg: "#323031", text: "#ECEBE4", border: "#1C1A1B", accent: "#D1C7BD" }, // Charcoal Leather
  { bg: "#3B5249", text: "#E9F5ED", border: "#24332D", accent: "#A2D2FF" }, // Sage Pine
  { bg: "#512E5F", text: "#F4ECF7", border: "#361D40", accent: "#BB8FCE" }, // Royal Violet
];

export function getBookSpinePalette(title: string, customColor?: string) {
  if (customColor) {
    return {
      bg: customColor,
      text: "#FFFFFF",
      border: "rgba(0,0,0,0.25)",
      accent: "#FFD700",
    };
  }
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % SPINE_PALETTES.length;
  return SPINE_PALETTES[index];
}

export function getBookReadingTime(book: {
  readingTimeMinutes?: number;
  totalSegments?: number;
}): number {
  if (book.readingTimeMinutes && book.readingTimeMinutes > 0) {
    return book.readingTimeMinutes;
  }
  return Math.max(5, (book.totalSegments || 1) * 3);
}

export function getBookYear(book: {
  year?: number;
  createdAt?: string | Date;
}): number {
  if (book.year && book.year > 0) return book.year;
  if (book.createdAt) return new Date(book.createdAt).getFullYear();
  return 2024;
}
