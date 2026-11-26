import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { connectToDatabase } from "@/database/mongoose";
import Book from "@/database/models/book.model";
import StudyPlan from "@/database/models/study-plan.model";
import { generateStudyPlanSkeleton } from "@/lib/study-plan/generator";
import { computeReadinessScore, serializeStudyPlan } from "@/lib/study-plan/utils";
import { buildSafeErrorResponse } from "@/lib/security/error-handler";
import { sanitizePlainText } from "@/lib/security/sanitize";

const CreateStudyPlanSchema = z.object({
  bookId: z.string().min(1),
  title: z.string().trim().max(140).optional(),
  examDate: z.string().nullable().optional(),
  targetGrade: z.string().trim().max(30).default("A"),
  confidenceLevel: z.number().int().min(1).max(5).default(3),
  topics: z.array(z.string().trim().min(1).max(100)).max(15).default([]),
  language: z.enum(["en", "ar", "mixed"]).default("en"),
});

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const docs = await StudyPlan.find({ clerkId: userId })
      .sort({ updatedAt: -1 })
      .limit(30)
      .lean();

    return NextResponse.json({
      success: true,
      plans: docs.map(serializeStudyPlan),
    });
  } catch (error) {
    return buildSafeErrorResponse("GET /api/study-plans", error, {
      fallbackMessage: "Failed to load study plans.",
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json().catch(() => null);
    const parsed = CreateStudyPlanSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid study plan parameters." },
        { status: 400 }
      );
    }

    const { bookId, examDate, confidenceLevel, language } = parsed.data;
    const title = parsed.data.title ? sanitizePlainText(parsed.data.title, 140) : undefined;
    const targetGrade = sanitizePlainText(parsed.data.targetGrade, 30) || "A";
    const topics = parsed.data.topics.map((t) => sanitizePlainText(t, 100)).filter(Boolean);

    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      return NextResponse.json({ error: "Invalid bookId" }, { status: 400 });
    }

    await connectToDatabase();

    const book = await Book.findById(bookId).select("clerkId").lean<{ clerkId?: string }>();
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }
    if (book.clerkId && book.clerkId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const skeleton = await generateStudyPlanSkeleton({
      bookId,
      examDate,
      targetGrade,
      confidenceLevel,
      topics,
      language,
      customTitle: title,
    });

    const parsedExamDate =
      examDate && Number.isFinite(Date.parse(examDate)) ? new Date(examDate) : null;

    const readinessScore = computeReadinessScore(skeleton.sections);

    const created = await StudyPlan.create({
      clerkId: userId,
      bookId,
      bookSlug: skeleton.bookSlug,
      bookTitle: skeleton.bookTitle,
      title: skeleton.title,
      subject: skeleton.subject,
      examDate: parsedExamDate,
      targetGrade,
      confidenceLevel,
      language,
      status: "active",
      readinessScore,
      sections: skeleton.sections,
      chatHistory: [],
    });

    return NextResponse.json(
      {
        success: true,
        plan: serializeStudyPlan(created),
      },
      { status: 201 }
    );
  } catch (error) {
    return buildSafeErrorResponse("POST /api/study-plans", error, {
      fallbackMessage: "Failed to create study plan.",
    });
  }
}
