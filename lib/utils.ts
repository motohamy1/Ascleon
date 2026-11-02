import { TextSegment } from "@/types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { DEFAULT_VOICE, voiceOptions, voiceLanguages, DEFAULT_VOICE_LANGUAGE, VoiceLanguage } from "./constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Serialize Mongoose documents to plain JSON objects (strips ObjectId, Date, etc.)
export const serializeData = <T>(data: T): T =>
  JSON.parse(JSON.stringify(data));

// Auto generate slug
export function generateSlug(text: string): string {
  return text
    .replace(/\.(pdf|epub|txt|docx?|mobi|azw3?|djvu|png|jpe?g|webp)$/i, "") // Remove document/image file extension
    .toLowerCase() // Convert to lowercase
    .trim() // Remove whitespace from both ends
    .replace(/[^\w\s-]/g, "") // Remove special characters (keep letters, numbers, spaces, hyphens)
    .replace(/[\s_]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/-+/g, "-") // Collapse consecutive hyphens
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
export const getVoice = (persona?: string, language?: VoiceLanguage) => {
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

// Exponential backoff retry utility for resilient network uploads and AI requests
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    delayMs?: number;
    backoffFactor?: number;
    onRetry?: (error: unknown, attempt: number) => void;
  } = {}
): Promise<T> {
  const { retries = 3, delayMs = 1000, backoffFactor = 2, onRetry } = options;
  let attempt = 0;
  let currentDelay = delayMs;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt > retries) {
        throw error;
      }
      if (onRetry) {
        onRetry(error, attempt);
      }
      await new Promise((resolve) => setTimeout(resolve, currentDelay));
      currentDelay *= backoffFactor;
    }
  }
}

export async function parsePDFFile(file: File) {
  // Guard against server-side execution
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("parsePDFFile can only be called in a browser environment");
  }

  try {
    const pdfjsLib = await import("pdfjs-dist");

    // Configure worker with unpkg CDN matching library version for stability
    const workerVersion = pdfjsLib.version || "5.5.207";
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${workerVersion}/build/pdf.worker.min.mjs`;

    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      useSystemFonts: true,
    });
    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;

    // Render first page as lightweight WebP cover image
    let coverDataURL = "";
    try {
      const firstPage = await pdfDocument.getPage(1);
      const viewport = firstPage.getViewport({ scale: 1.25 });

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");

      if (context) {
        await firstPage.render({
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        }).promise;
        try {
          coverDataURL = canvas.toDataURL("image/webp", 0.82);
        } catch {
          coverDataURL = canvas.toDataURL("image/jpeg", 0.8);
        }
      }
    } catch (coverErr) {
      console.warn("Cover extraction warning (fallback will be used):", coverErr);
    }

    // Extract text 1:1 per page to eliminate page count mismatches
    const segments: TextSegment[] = [];
    const previewTexts: string[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .filter((item) => "str" in item)
          .map((item) => (item as { str: string }).str)
          .join(" ")
          .trim();

        const words = pageText ? pageText.split(/\s+/).filter(Boolean) : [];
        const cleanContent = pageText || `[Page ${pageNum}: Visual diagram or scanned page]`;

        segments.push({
          text: cleanContent,
          segmentIndex: pageNum - 1,
          pageNumber: pageNum,
          wordCount: Math.max(words.length, 1),
        });

        if (pageNum <= 4 && pageText) {
          previewTexts.push(`--- PAGE ${pageNum} ---\n${pageText}`);
        }
      } catch (pageErr) {
        console.warn(`Error extracting text on page ${pageNum}:`, pageErr);
        segments.push({
          text: `[Page ${pageNum} content unavailable]`,
          segmentIndex: pageNum - 1,
          pageNumber: pageNum,
          wordCount: 1,
        });
      }
    }

    const textPreview = previewTexts.join("\n\n").slice(0, 4000);

    // Clean up PDF document resources
    await pdfDocument.destroy();

    return {
      content: segments,
      cover: coverDataURL,
      numPages,
      totalPages: numPages,
      textPreview,
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
// Map an Ascleon multilingual language to a voice preset
// Ascleon supports reading, listening, and chatting in multiple languages
// (English, Arabic, Spanish, German, French, Chinese, ...).
export const getVoiceByLanguage = (language?: VoiceLanguage) => {
  const lang = language || DEFAULT_VOICE_LANGUAGE;
  switch (lang.code) {
    case "ar":
      // Warm, clear female Arabic voice — calm & articulate
      return { id: "21m00Tcm4TlvDq8ikWAM", name: "Amira", description: "Female, Arabic, calm & clear" };
    case "es":
      // Friendly, natural female Spanish voice
      return { id: "EXAVITQu4vr4xnSDxMaL", name: "Sofia", description: "Female, Spanish, warm & natural" };
    case "de":
      // Clear, measured female German voice
      return { id: "iP95p4xoKVk53GoZ742B", name: "Ingrid", description: "Female, German, clear & measured" };
    case "fr":
      // Smooth, expressive female French voice
      return { id: "CYw3kZ02Hs0563khs1Fj", name: "Camille", description: "Female, French, smooth & expressive" };
    case "zh":
      // Measured, articulate female Mandarin voice
      return { id: "onwK4e9ZLuTAKqWW03F9", name: "Mei", description: "Female, Mandarin, measured & articulate" };
    case "en":
    default:
      return voiceOptions[DEFAULT_VOICE];
  }
};

// Resolve voice ID for a given persona key/ID, falling back to the
// language preset when no persona is supplied (Ascleon multilingual mode).
export const resolveVoiceId = (
  persona?: string,
  language?: VoiceLanguage
): string => {
  if (persona) {
    const voice = getVoice(persona);
    if (voice && voice.id) return voice.id;
  }
  return getVoiceByLanguage(language).id;
};
