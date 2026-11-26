import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { connectToDatabase } from "@/database/mongoose";
import Book from "@/database/models/book.model";
import StudyPlan from "@/database/models/study-plan.model";
import { replanStudyPlanWithChat } from "@/lib/study-plan/generator";
import { computeReadinessScore, serializeStudyPlan } from "@/lib/study-plan/utils";
import { buildSafeErrorResponse } from "@/lib/security/error-handler";
import { sanitizePlainText } from "@/lib/security/sanitize";

const PlanChatSchema = z.object({
  message: z.string().trim().min(1).max(600),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid study plan ID" }, { status: 400 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = PlanChatSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }
    const cleanMessage = sanitizePlainText(parsed.data.message, 600);
    if (!cleanMessage) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const doc = await StudyPlan.findById(id);
    if (!doc) {
      return NextResponse.json({ error: "Study plan not found" }, { status: 404 });
    }
    if (doc.clerkId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const book = await Book.findById(doc.bookId)
      .select("totalPages totalSegments")
      .lean<{ totalPages?: number; totalSegments?: number }>();
    const totalPages = Math.max(1, Number(book?.totalPages || book?.totalSegments || 1));
    const current = serializeStudyPlan(doc);

    const replanned = await replanStudyPlanWithChat({
      bookTitle: doc.bookTitle,
      totalPages,
      language: doc.language || "en",
      currentSections: current.sections,
      userMessage: cleanMessage,
    });

    doc.sections = replanned.sections;
    doc.readinessScore = computeReadinessScore(replanned.sections);

    const now = new Date();
    doc.chatHistory.push(
      {
        role: "user",
        text: cleanMessage,
        diffSummary: null,
        createdAt: now.toISOString(),
      },
      {
        role: "assistant",
        text: replanned.assistantReply,
        diffSummary: replanned.diffSummary,
        createdAt: new Date(now.getTime() + 1).toISOString(),
      }
    );

    doc.markModified("sections");
    doc.markModified("chatHistory");
    await doc.save();

    return NextResponse.json({
      success: true,
      diffSummary: replanned.diffSummary,
      assistantReply: replanned.assistantReply,
      plan: serializeStudyPlan(doc),
    });
  } catch (error) {
    return buildSafeErrorResponse("POST /api/study-plans/[id]/chat", error, {
      fallbackMessage: "Failed to update study plan.",
    });
  }
}
