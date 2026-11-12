import crypto from "crypto";
import mongoose from "mongoose";
import { getBookSegmentsByRange } from "@/lib/actions/book.actions";
import { retrieveFromBookRAG } from "@/lib/ai/rag/book-rag-retriever";
import { WhiteboardPacing, WhiteboardScopePayload } from "@/types/whiteboard-video";

export interface GroundedSourceChunk {
  pageNumber: number;
  text: string;
}

export interface ResolvedWhiteboardSource {
  bookId: string;
  bookTitle: string;
  scope: WhiteboardScopePayload;
  scopeHash: string;
  chunks: GroundedSourceChunk[];
  combinedText: string;
  wordCount: number;
  beatBudget: {
    minBeats: number;
    maxBeats: number;
    recommendedBeats: number;
  };
}

const MAX_SOURCE_CHARS = 18000;

/**
 * Computes dynamic beat count range based on scope size, word density, and user pacing preference.
 */
export function computeDynamicBeatBudget(
  scopeType: WhiteboardScopePayload["type"],
  wordCount: number,
  pageSpan: number,
  pacing: WhiteboardPacing
): { minBeats: number; maxBeats: number; recommendedBeats: number } {
  let minBeats = 4;
  let maxBeats = 7;

  if (scopeType === "selection") {
    if (wordCount < 180) {
      minBeats = 2;
      maxBeats = 3;
    } else if (wordCount < 550) {
      minBeats = 3;
      maxBeats = 5;
    } else {
      minBeats = 4;
      maxBeats = 7;
    }
  } else if (scopeType === "page" || pageSpan <= 1) {
    if (wordCount < 220) {
      minBeats = 3;
      maxBeats = 4;
    } else {
      minBeats = 4;
      maxBeats = 7;
    }
  } else if (pageSpan <= 4) {
    minBeats = 6;
    maxBeats = 10;
  } else {
    minBeats = 8;
    maxBeats = 14;
  }

  if (pacing === "concise") {
    minBeats = Math.max(2, minBeats - 1);
    maxBeats = Math.max(minBeats + 1, Math.ceil((minBeats + maxBeats) * 0.65));
  } else if (pacing === "deep") {
    minBeats = Math.min(12, minBeats + 1);
    maxBeats = Math.min(14, maxBeats + 2);
  }

  const recommendedBeats = Math.round((minBeats + maxBeats) / 2);
  return { minBeats, maxBeats, recommendedBeats };
}

/**
 * Resolves the study scope (selection, page, range, or topic) into grounded page-labeled text
 * and computes a stable cache hash + dynamic beat budget.
 */
export async function resolveWhiteboardSource(params: {
  bookId: string;
  bookTitle: string;
  scope: WhiteboardScopePayload;
  fallbackPageText?: string;
  pacing?: WhiteboardPacing;
}): Promise<ResolvedWhiteboardSource> {
  const { bookId, bookTitle, scope, fallbackPageText = "", pacing = "auto" } = params;
  const startPage = Math.max(1, Number(scope.startPage) || 1);
  const endPage = Math.max(startPage, Number(scope.endPage) || startPage);
  const pageSpan = endPage - startPage + 1;
  const selectedText = (scope.selectedText || "").trim();

  const chunks: GroundedSourceChunk[] = [];

  if (scope.type === "selection" && selectedText.length > 0) {
    chunks.push({ pageNumber: startPage, text: selectedText });
    // Include light surrounding context if selection is very brief (< 40 words)
    if (selectedText.split(/\s+/).length < 40 && fallbackPageText.trim().length > 0) {
      chunks.push({
        pageNumber: startPage,
        text: `[Surrounding page context]\n${fallbackPageText.trim().slice(0, 1800)}`,
      });
    }
  } else {
    const isMongoId = mongoose.Types.ObjectId.isValid(String(bookId));
    if (isMongoId) {
      if (pageSpan > 12) {
        // Large chapter/topic: distill top high-yield segments across the span
        const ragRes = await retrieveFromBookRAG({
          bookId,
          query: scope.topicTitle || bookTitle,
          scope: {
            type: scope.type === "topic" ? "topic" : "range",
            startPage,
            endPage,
            topicTitle: scope.topicTitle,
            topicId: scope.topicId,
          },
          activePage: startPage,
          topK: 10,
        });
        for (const seg of ragRes.segments) {
          if (seg.content?.trim()) {
            chunks.push({
              pageNumber: seg.pageNumber || startPage,
              text: seg.content.trim(),
            });
          }
        }
      } else {
        const segRes = await getBookSegmentsByRange(bookId, startPage, endPage);
        if (segRes.success && Array.isArray(segRes.data) && segRes.data.length > 0) {
          for (const seg of segRes.data) {
            if (seg.content?.trim()) {
              chunks.push({
                pageNumber: seg.pageNumber || startPage,
                text: seg.content.trim(),
              });
            }
          }
        }
      }
    }

    if (chunks.length === 0 && fallbackPageText.trim().length > 0) {
      chunks.push({ pageNumber: startPage, text: fallbackPageText.trim() });
    }
  }

  let combinedText = chunks
    .map((c) => `[PAGE ${c.pageNumber}]\n${c.text}`)
    .join("\n\n");

  if (combinedText.length > MAX_SOURCE_CHARS) {
    combinedText = combinedText.slice(0, MAX_SOURCE_CHARS);
  }

  if (!combinedText.trim()) {
    throw new Error("No readable source text was found for this page, selection, or topic.");
  }

  const wordCount = combinedText.split(/\s+/).filter(Boolean).length;
  const beatBudget = computeDynamicBeatBudget(scope.type, wordCount, pageSpan, pacing);

  const hashPayload = JSON.stringify({
    type: scope.type,
    startPage,
    endPage,
    topicTitle: (scope.topicTitle || "").trim(),
    selectedSlice: selectedText.slice(0, 1200),
    textFingerprint: combinedText.slice(0, 1200),
  });
  const scopeHash = crypto.createHash("sha256").update(hashPayload).digest("hex").slice(0, 20);

  return {
    bookId: String(bookId),
    bookTitle,
    scope: {
      ...scope,
      startPage,
      endPage,
      selectedTextPreview: selectedText ? selectedText.slice(0, 140) : undefined,
    },
    scopeHash,
    chunks,
    combinedText,
    wordCount,
    beatBudget,
  };
}
