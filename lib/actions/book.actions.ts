"use server";

import { CreateBook, ReadingStatus, TextSegment, IBookSegmentData } from "@/types";
import { connectToDatabase } from "@/database/mongoose";
import { escapeRegex, generateSlug, serializeData } from "@/lib/utils";
import Book from "@/database/models/book.model";
import BookSegment from "@/database/models/book-segment.model";
import mongoose from "mongoose";
import { getUserPlan } from "@/lib/subscription.server";
import { PLAN_LIMITS } from "@/lib/subscription-constants";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

export const getAllBooks = async (search?: string) => {
  try {
    await connectToDatabase();

    let query = {};

    if (search) {
      const escapedSearch = escapeRegex(search);
      const regex = new RegExp(escapedSearch, "i");
      query = {
        $or: [{ title: { $regex: regex } }, { author: { $regex: regex } }],
      };
    }

    const books = await Book.find(query).sort({ createdAt: -1 }).lean();

    return {
      success: true,
      data: serializeData(books),
    };
  } catch (e) {
    console.error("Error connecting to database", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to fetch books",
    };
  }
};

// Fetches the signed-in user's books, newest first
export const getUserBooks = async (search?: string) => {
  try {
    await connectToDatabase();

    const { userId } = await auth();

    let query: Record<string, unknown> = {};
    if (userId) {
      query.clerkId = userId;
    }

    if (search) {
      const escapedSearch = escapeRegex(search);
      const regex = new RegExp(escapedSearch, "i");
      query = {
        ...query,
        $or: [{ title: { $regex: regex } }, { author: { $regex: regex } }],
      };
    }

    const books = await Book.find(query).sort({ createdAt: -1 }).lean();

    return {
      success: true,
      data: serializeData(books),
    };
  } catch (e) {
    console.error("Error fetching user books", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to fetch books",
    };
  }
};

export const checkBookExists = async (title: string) => {
  try {
    await connectToDatabase();

    const slug = generateSlug(title);

    const existingBook = await Book.findOne({ slug }).lean();

    if (existingBook) {
      return {
        exists: true,
        book: serializeData(existingBook),
      };
    }

    return {
      exists: false,
    };
  } catch (e) {
    console.error("Error checking book exists", e);
    return {
      exists: false,
      error: e instanceof Error ? e.message : "Failed to check book",
    };
  }
};

export const createBook = async (data: CreateBook) => {
  try {
    await connectToDatabase();

    const slug = generateSlug(data.title);

    const existingBook = await Book.findOne({ slug }).lean();

    if (existingBook) {
      return {
        success: true,
        data: serializeData(existingBook),
        alreadyExists: true,
      };
    }

    const { userId } = await auth();

    if (!userId || userId !== data.clerkId) {
      return { success: false, error: "Unauthorized" };
    }

    const plan = await getUserPlan();
    const limits = PLAN_LIMITS[plan];

    const bookCount = await Book.countDocuments({ clerkId: userId });

    if (bookCount >= limits.maxBooks) {
      revalidatePath("/");

      return {
        success: false,
        error: `You have reached the maximum number of books allowed for your ${plan} plan (${limits.maxBooks}). Please upgrade to add more books.`,
        isBillingError: true,
      };
    }

    const book = await Book.create({
      ...data,
      clerkId: userId,
      slug,
      totalSegments: 0,
    });

    return {
      success: true,
      data: serializeData(book),
    };
  } catch (e) {
    console.error("Error creating a book", e);

    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to create book",
    };
  }
};

export const getBookBySlug = async (slug: string) => {
  try {
    await connectToDatabase();

    const book = await Book.findOne({ slug }).lean();

    if (!book) {
      return { success: false, error: "Book not found" };
    }

    return {
      success: true,
      data: serializeData(book),
    };
  } catch (e) {
    console.error("Error fetching book by slug", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to fetch book",
    };
  }
};

export const saveBookSegments = async (
  bookId: string,
  clerkId: string,
  segments: TextSegment[],
) => {
  try {
    await connectToDatabase();

    console.log("Saving book segments...");

    const segmentsToInsert = segments.map(
      ({ text, segmentIndex, pageNumber, wordCount }) => ({
        clerkId,
        bookId,
        content: text,
        segmentIndex,
        pageNumber,
        wordCount,
      }),
    );

    await BookSegment.insertMany(segmentsToInsert);

    const totalWords = segments.reduce((sum, s) => sum + (s.wordCount || 0), 0);
    const estimatedMinutes = Math.max(5, Math.round(totalWords / 200));

    await Book.findByIdAndUpdate(bookId, {
      totalSegments: segments.length,
      readingTimeMinutes: estimatedMinutes,
    });

    console.log("Book segments saved successfully.");

    return {
      success: true,
      data: { segmentsCreated: segments.length },
    };
  } catch (e) {
    console.error("Error saving book segments", e);

    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to save segments",
    };
  }
};

// Searches book segments using MongoDB text search with regex fallback
export const searchBookSegments = async (
  bookId: string,
  query: string,
  limit: number = 5,
) => {
  try {
    await connectToDatabase();

    console.log(`Searching for: "${query}" in book ${bookId}`);

    const bookObjectId = new mongoose.Types.ObjectId(bookId);

    // Try MongoDB text search first (requires text index)
    let segments: Record<string, unknown>[] = [];
    try {
      segments = await BookSegment.find({
        bookId: bookObjectId,
        $text: { $search: query },
      })
        .select("_id bookId content segmentIndex pageNumber wordCount")
        .sort({ score: { $meta: "textScore" } })
        .limit(limit)
        .lean();
    } catch {
      // Text index may not exist — fall through to regex fallback
      segments = [];
    }

    // Fallback: regex search matching ANY keyword
    if (segments.length === 0) {
      const keywords = query.split(/\s+/).filter((k) => k.length > 2);
      const pattern = keywords.map(escapeRegex).join("|");

      segments = await BookSegment.find({
        bookId: bookObjectId,
        content: { $regex: pattern, $options: "i" },
      })
        .select("_id bookId content segmentIndex pageNumber wordCount")
        .sort({ segmentIndex: 1 })
        .limit(limit)
        .lean();
    }

    console.log(`Search complete. Found ${segments.length} results`);

    return {
      success: true,
      data: serializeData(segments),
    };
  } catch (error) {
    console.error("Error searching segments:", error);
    return {
      success: false,
      error: (error as Error).message,
      data: [],
    };
  }
};

// Fetches all segments of a book ordered by segmentIndex
export const getBookSegments = async (bookId: string) => {
  try {
    await connectToDatabase();

    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      return { success: true, data: [] as IBookSegmentData[] };
    }

    const segments = await BookSegment.find({
      bookId: new mongoose.Types.ObjectId(bookId),
    })
      .sort({ segmentIndex: 1 })
      .lean();

    return {
      success: true,
      data: serializeData(segments) as IBookSegmentData[],
    };
  } catch (error) {
    console.error("Error fetching book segments:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch segments",
      data: [] as IBookSegmentData[],
    };
  }
};

// Toggle favorite state of a book
export const toggleBookFavorite = async (bookId: string) => {
  try {
    await connectToDatabase();

    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      return { success: true, isFavorite: true };
    }

    const book = await Book.findById(bookId);
    if (!book) {
      return { success: false, error: "Book not found" };
    }

    const newFav = !book.isFavorite;
    book.isFavorite = newFav;
    await book.save();

    revalidatePath("/");
    return { success: true, isFavorite: newFav };
  } catch (error) {
    console.error("Error toggling book favorite:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to toggle favorite",
    };
  }
};

// Update reading status of a book
export const updateBookReadingStatus = async (
  bookId: string,
  status: ReadingStatus,
) => {
  try {
    await connectToDatabase();

    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      return { success: true, status };
    }

    await Book.findByIdAndUpdate(bookId, { readingStatus: status });

    revalidatePath("/");
    return { success: true, status };
  } catch (error) {
    console.error("Error updating reading status:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update status",
    };
  }
};
