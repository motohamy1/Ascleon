"use server";

import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/database/mongoose";
import StudyProgress from "@/database/models/study-progress.model";
import Book from "@/database/models/book.model";
import { UserStudyProgressData } from "@/types";
import { serializeData } from "@/lib/utils";

/**
 * Persists the user's study progress and studio state.
 * Gracefully handles unauthenticated / local study by returning success with localOnly flag.
 */
export async function saveUserStudyProgress(data: UserStudyProgressData) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: true, localOnly: true };
    }

    await connectToDatabase();

    const {
      bookSlug,
      bookId,
      lastStudiedPage,
      totalPages,
      progressPercent,
      readingStatus,
      studioState,
    } = data;

    const updatePayload: Record<string, any> = {
      lastStudiedPage: Math.max(1, lastStudiedPage || 1),
      totalPages: Math.max(1, totalPages || 1),
      progressPercent: Math.min(100, Math.max(0, progressPercent || 0)),
      readingStatus: readingStatus || "in_progress",
      lastStudiedAt: new Date(),
    };

    if (bookId) {
      updatePayload.bookId = bookId;
    }

    if (studioState) {
      if (studioState.activeIntent) updatePayload.activeIntent = studioState.activeIntent;
      if (studioState.studyLanguage) updatePayload.studyLanguage = studioState.studyLanguage;
      if (studioState.studyScope) updatePayload.studyScope = studioState.studyScope;
      if (studioState.morphActiveTopic !== undefined) updatePayload.morphActiveTopic = studioState.morphActiveTopic;
      if (Array.isArray(studioState.chatMessages)) {
        // Keep up to 50 latest messages to prevent document size explosion
        updatePayload.chatMessages = studioState.chatMessages.slice(-50);
      }
      if (studioState.activeQBankIdx !== undefined) updatePayload.activeQBankIdx = studioState.activeQBankIdx;
      if (studioState.scrollOrientation) updatePayload.scrollOrientation = studioState.scrollOrientation;
      if (studioState.readerViewMode) updatePayload.readerViewMode = studioState.readerViewMode;
      if (studioState.fitMode) updatePayload.fitMode = studioState.fitMode;
      if (studioState.zoomLevel) updatePayload.zoomLevel = studioState.zoomLevel;
      updatePayload.studioState = studioState;
    }

    const savedDoc = await StudyProgress.findOneAndUpdate(
      { clerkId: userId, bookSlug },
      { $set: updatePayload },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    // Also synchronize the Book document reading status if owned by this user
    try {
      await Book.findOneAndUpdate(
        { slug: bookSlug, clerkId: userId },
        {
          readingStatus: readingStatus || "in_progress",
        }
      );
    } catch {
      // Non-fatal if Book record doesn't match or is sample
    }

    return {
      success: true,
      data: serializeData(formatStudyProgressDoc(savedDoc)),
    };
  } catch (error) {
    console.error("Error saving study progress:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save study progress",
    };
  }
}

/**
 * Normalizes raw Mongoose document into a complete UserStudyProgressData with fully structured studioState.
 */
function formatStudyProgressDoc(doc: any): UserStudyProgressData {
  const rawStudio = doc.studioState || {};
  return {
    bookSlug: doc.bookSlug,
    bookId: doc.bookId ? String(doc.bookId) : undefined,
    lastStudiedPage: Math.max(1, doc.lastStudiedPage || 1),
    totalPages: Math.max(1, doc.totalPages || 1),
    progressPercent: Math.min(100, Math.max(0, doc.progressPercent || 0)),
    readingStatus: doc.readingStatus || "in_progress",
    lastStudiedAt: doc.lastStudiedAt ? new Date(doc.lastStudiedAt).toISOString() : new Date().toISOString(),
    studioState: {
      activeIntent: doc.activeIntent || rawStudio.activeIntent || "chat",
      studyLanguage: doc.studyLanguage || rawStudio.studyLanguage || "en",
      studyScope: doc.studyScope || rawStudio.studyScope,
      morphActiveTopic: doc.morphActiveTopic !== undefined ? doc.morphActiveTopic : rawStudio.morphActiveTopic ?? null,
      chatMessages: doc.chatMessages || rawStudio.chatMessages || [],
      activeQBankIdx: doc.activeQBankIdx !== undefined ? doc.activeQBankIdx : rawStudio.activeQBankIdx ?? 0,
      lastActiveSnippet: rawStudio.lastActiveSnippet,
      scrollOrientation: doc.scrollOrientation || rawStudio.scrollOrientation || "vertical",
      readerViewMode: doc.readerViewMode || rawStudio.readerViewMode || "original_pdf",
      fitMode: doc.fitMode || rawStudio.fitMode || "fit-width",
      zoomLevel: doc.zoomLevel || rawStudio.zoomLevel || 100,
    },
  };
}

/**
 * Retrieves the saved study progress for a specific book.
 */
export async function getUserStudyProgress(bookSlug: string) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: true, data: null };
    }

    await connectToDatabase();

    const progress = await StudyProgress.findOne({
      clerkId: userId,
      bookSlug,
    }).lean();

    if (!progress) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: serializeData(formatStudyProgressDoc(progress)) as UserStudyProgressData,
    };
  } catch (error) {
    console.error("Error fetching study progress:", error);
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Failed to fetch study progress",
    };
  }
}

/**
 * Retrieves the user's most recently active study progress across all books.
 */
export async function getLatestUserStudyProgress() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: true, data: null };
    }

    await connectToDatabase();

    const latest = await StudyProgress.findOne({ clerkId: userId })
      .sort({ lastStudiedAt: -1 })
      .lean();

    if (!latest) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: serializeData(formatStudyProgressDoc(latest)) as UserStudyProgressData,
    };
  } catch (error) {
    console.error("Error fetching latest study progress:", error);
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Failed to fetch latest study progress",
    };
  }
}

/**
 * Resets user study progress for a book.
 * - 'studio_only': clears studio chat, active topics, quiz state, while leaving reading position intact.
 * - 'full': resets page to 1, reading status to 'not_started', progress to 0, and clears studio state.
 */
export async function resetUserStudyProgress(
  bookSlug: string,
  resetScope: "studio_only" | "full" = "studio_only"
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: true, localOnly: true };
    }

    await connectToDatabase();

    if (resetScope === "studio_only") {
      await StudyProgress.findOneAndUpdate(
        { clerkId: userId, bookSlug },
        {
          $set: {
            activeIntent: "chat",
            chatMessages: [],
            morphActiveTopic: null,
            activeQBankIdx: 0,
            lastStudiedAt: new Date(),
          },
        }
      );
    } else {
      await StudyProgress.findOneAndUpdate(
        { clerkId: userId, bookSlug },
        {
          $set: {
            lastStudiedPage: 1,
            progressPercent: 0,
            readingStatus: "not_started",
            activeIntent: "chat",
            chatMessages: [],
            morphActiveTopic: null,
            activeQBankIdx: 0,
            lastStudiedAt: new Date(),
          },
        }
      );

      try {
        await Book.findOneAndUpdate(
          { slug: bookSlug, clerkId: userId },
          { readingStatus: "not_started" }
        );
      } catch {
        // Non-fatal
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Error resetting study progress:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to reset study progress",
    };
  }
}
