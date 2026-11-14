"use server";

import { EndSessionResult, StartSessionResult } from "@/types";
import { connectToDatabase } from "@/database/mongoose";
import VoiceSession from "@/database/models/voice-session.model";
import getCurrentBillingPeriodStart from "@/lib/subscription-constants";
import { checkVoiceBudget, recordVoiceMinutes } from "@/lib/usage.server";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import Book from "@/database/models/book.model";
import { serializeData } from "@/lib/utils";

export interface SessionHistoryItem {
  _id: string;
  bookId: string;
  bookTitle: string;
  bookSlug: string;
  bookCoverURL: string;
  startedAt: string;
  durationSeconds: number;
}

// Fetches the signed-in user's voice session history with the book's details
export const getUserSessions = async (limit: number = 40) => {
  try {
    await connectToDatabase();

    const { userId } = await auth();

    if (!userId) {
      return { success: true, data: [] as SessionHistoryItem[] };
    }

    const sessions = await VoiceSession.find({ clerkId: userId })
      .sort({ startedAt: -1 })
      .limit(limit)
      .lean();

    const bookIds = [...new Set(sessions.map((s) => String(s.bookId)))];

    const books = bookIds.length
      ? await Book.find({ _id: { $in: bookIds } })
          .select("_id title slug coverURL")
          .lean()
      : [];

    const bookMap = new Map(
      books.map((b) => [
        String(b._id),
        { title: b.title, slug: b.slug, coverURL: b.coverURL },
      ]),
    );

    const items: SessionHistoryItem[] = serializeData(sessions)
      .map((s) => {
        const book = bookMap.get(String(s.bookId)) ?? {
          title: "Removed book",
          slug: "",
          coverURL: "",
        };
        return {
          _id: String(s._id),
          bookId: String(s.bookId),
          bookTitle: book.title,
          bookSlug: book.slug,
          bookCoverURL: book.coverURL,
          startedAt: s.startedAt as string,
          durationSeconds: s.durationSeconds ?? 0,
        };
      })
      .filter((s) => Boolean(s.bookSlug));

    return {
      success: true,
      data: items,
    };
  } catch (e) {
    console.error("Error fetching user sessions", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to fetch sessions",
      data: [] as SessionHistoryItem[],
    };
  }
};

export const startVoiceSession = async (
  clerkId: string,
  bookId: string,
): Promise<StartSessionResult> => {
  try {
    await connectToDatabase();

    const billingPeriodStart = getCurrentBillingPeriodStart();
    const voiceBudget = await checkVoiceBudget(clerkId);

    if (!voiceBudget.allowed) {
      revalidatePath("/");

      return {
        success: false,
        error: voiceBudget.error,
        isBillingError: true,
      };
    }

    const session = await VoiceSession.create({
      clerkId,
      bookId,
      startedAt: new Date(),
      billingPeriodStart,
      durationSeconds: 0,
    });

    return {
      success: true,
      sessionId: session._id.toString(),
      maxDurationMinutes: voiceBudget.maxDurationPerSession,
    };
  } catch (e) {
    console.error("Error starting voice session", e);
    return {
      success: false,
      error: "Failed to start voice session. Please try again later.",
    };
  }
};

export const endVoiceSession = async (
  sessionId: string,
  durationSeconds: number,
): Promise<EndSessionResult> => {
  try {
    await connectToDatabase();

    const result = await VoiceSession.findByIdAndUpdate(sessionId, {
      endedAt: new Date(),
      durationSeconds,
    });

    if (!result) return { success: false, error: "Voice session not found." };

    if (result.clerkId && durationSeconds > 0) {
      await recordVoiceMinutes(result.clerkId, durationSeconds);
    }

    return { success: true };
  } catch (e) {
    console.error("Error ending voice session", e);
    return {
      success: false,
      error: "Failed to end voice session. Please try again later.",
    };
  }
};
