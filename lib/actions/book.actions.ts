"use server";

import { CreateBook, ReadingStatus, TextSegment, IBookSegmentData, SourceCategoryType } from "@/types";
import { connectToDatabase } from "@/database/mongoose";
import { escapeRegex, generateSlug, serializeData } from "@/lib/utils";
import Book from "@/database/models/book.model";
import BookSegment from "@/database/models/book-segment.model";
import mongoose from "mongoose";
import { consumePages } from "@/lib/usage.server";
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

    const books = await Book.find(query)
      .select("-blueprint -initialQBank")
      .sort({ createdAt: -1 })
      .lean();

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

    if (!userId) {
      return {
        success: true,
        data: [],
      };
    }

    let query: Record<string, unknown> = {
      clerkId: userId,
    };

    if (search) {
      const escapedSearch = escapeRegex(search);
      const regex = new RegExp(escapedSearch, "i");
      query = {
        ...query,
        $or: [{ title: { $regex: regex } }, { author: { $regex: regex } }],
      };
    }

    const books = await Book.find(query)
      .select("-blueprint -initialQBank")
      .sort({ createdAt: -1 })
      .lean();

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

    const pageCount = data.totalPages || data.totalSegments || 1;
    const pageCheck = await consumePages(userId, pageCount);

    if (!pageCheck.allowed) {
      revalidatePath("/");

      return {
        success: false,
        error: pageCheck.error,
        isBillingError: true,
      };
    }

    const book = await Book.create({
      ...data,
      clerkId: userId,
      slug,
      totalSegments: data.totalSegments || 0,
      totalPages: data.totalPages || data.totalSegments || 0,
      blueprint: data.blueprint || {},
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
  options?: { isAppend?: boolean; totalExpectedSegments?: number },
) => {
  try {
    await connectToDatabase();

    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      return { success: false, error: "Invalid bookId provided" };
    }

    const bookObjectId = new mongoose.Types.ObjectId(bookId);

    // If starting fresh (not an append chunk), clear any previous/stale segments for this book
    if (!options?.isAppend) {
      await BookSegment.deleteMany({ bookId: bookObjectId });
    }

    const segmentsToInsert = segments.map(
      ({ text, segmentIndex, pageNumber, wordCount }) => ({
        clerkId,
        bookId: bookObjectId,
        content: text,
        segmentIndex,
        pageNumber,
        wordCount: wordCount || 500,
      }),
    );

    // Insert in batches of 100 to ensure fast and resilient ingestion in MongoDB
    const BATCH_SIZE = 100;
    for (let i = 0; i < segmentsToInsert.length; i += BATCH_SIZE) {
      const batch = segmentsToInsert.slice(i, i + BATCH_SIZE);
      await BookSegment.insertMany(batch, { ordered: false });
    }

    // Determine current total saved segments
    const currentTotalSegments = await BookSegment.countDocuments({
      bookId: bookObjectId,
    });

    const totalSegments = options?.totalExpectedSegments || currentTotalSegments;
    const estimatedMinutes = Math.max(5, Math.round((totalSegments * 450) / 200));

    await Book.findByIdAndUpdate(bookId, {
      totalSegments,
      totalPages: totalSegments,
      readingTimeMinutes: estimatedMinutes,
    });

    return {
      success: true,
      data: {
        segmentsCreated: segments.length,
        totalSegments: currentTotalSegments,
      },
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

    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      return { success: true, data: [] };
    }

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

// Fetches initial segments of a book for instant reader bootstrap (e.g. limit = 3)
export const getInitialBookSegments = async (bookId: string, limit: number = 3) => {
  try {
    await connectToDatabase();

    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      return { success: true, data: [] as IBookSegmentData[] };
    }

    const segments = await BookSegment.find({
      bookId: new mongoose.Types.ObjectId(bookId),
    })
      .sort({ segmentIndex: 1 })
      .limit(limit)
      .lean();

    return {
      success: true,
      data: serializeData(segments) as IBookSegmentData[],
    };
  } catch (error) {
    console.error("Error fetching initial book segments:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch initial segments",
      data: [] as IBookSegmentData[],
    };
  }
};

// Fast single-query lookup for the user's most recent book slug
export const getMostRecentBookSlug = async (clerkId: string): Promise<string | null> => {
  try {
    await connectToDatabase();
    const book = await Book.findOne({ clerkId })
      .select("slug")
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();
    return book?.slug || null;
  } catch {
    return null;
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

// Fetches segments for a specific range of pages (inclusive)
export const getBookSegmentsByRange = async (
  bookId: string,
  startPage: number,
  endPage: number
) => {
  try {
    await connectToDatabase();

    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      return { success: true, data: [] as IBookSegmentData[] };
    }

    const segments = await BookSegment.find({
      bookId: new mongoose.Types.ObjectId(bookId),
      pageNumber: { $gte: startPage, $lte: endPage },
    })
      .sort({ pageNumber: 1, segmentIndex: 1 })
      .lean();

    return {
      success: true,
      data: serializeData(segments) as IBookSegmentData[],
    };
  } catch (error) {
    console.error("Error fetching book segments by range:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch segments by range",
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

// Permanently delete a book, its segments and related session records
export const deleteBook = async (bookId: string) => {
  try {
    await connectToDatabase();

    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      // If it's a sample/mock book not in DB, allow graceful client removal
      return { success: true };
    }

    const book = await Book.findById(bookId);
    if (!book) {
      return { success: false, error: "Book not found" };
    }

    if (book.clerkId !== userId) {
      return { success: false, error: "You can only delete your own books" };
    }

    // Delete segments and the book
    await BookSegment.deleteMany({ bookId: book._id });
    await Book.findByIdAndDelete(bookId);

    revalidatePath("/library");
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    console.error("Error deleting book:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete book",
    };
  }
};

// Update shelf placement and custom section of a book
export const updateBookShelfPlacement = async (
  bookId: string,
  payload: {
    sourceCategory?: SourceCategoryType;
    topic?: string;
    customSection?: string | null;
  },
) => {
  try {
    await connectToDatabase();

    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      return { success: true };
    }

    const book = await Book.findById(bookId);
    if (!book) {
      return { success: false, error: "Book not found" };
    }

    if (book.clerkId !== userId) {
      return { success: false, error: "Unauthorized to modify this book" };
    }

    const updates: Record<string, unknown> = {};
    if (payload.sourceCategory !== undefined) {
      updates.sourceCategory = payload.sourceCategory;
    }
    if (payload.topic !== undefined) {
      updates.topic = payload.topic;
    }
    if (payload.customSection !== undefined) {
      updates.customSection = payload.customSection ? payload.customSection.trim() : null;
    }

    const updated = await Book.findByIdAndUpdate(bookId, updates, { returnDocument: "after" }).lean();

    revalidatePath("/library");
    revalidatePath("/");

    return {
      success: true,
      data: serializeData(updated),
    };
  } catch (error) {
    console.error("Error updating book shelf placement:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update shelf placement",
    };
  }
};
