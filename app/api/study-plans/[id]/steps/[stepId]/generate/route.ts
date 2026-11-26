import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { connectToDatabase } from "@/database/mongoose";
import StudyPlan from "@/database/models/study-plan.model";
import { generateStudyPlanStep } from "@/lib/study-plan/generator";
import { computeReadinessScore, serializeStudyPlan } from "@/lib/study-plan/utils";
import { buildSafeErrorResponse } from "@/lib/security/error-handler";

const GenerateStepSchema = z.object({
  force: z.boolean().optional().default(false),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, stepId } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid study plan ID" }, { status: 400 });
    }

    let force = false;
    try {
      const raw = await req.json();
      const parsed = GenerateStepSchema.safeParse(raw);
      if (parsed.success) force = parsed.data.force;
    } catch {
      // Allow empty POST body
    }

    await connectToDatabase();
    const doc = await StudyPlan.findById(id);
    if (!doc) {
      return NextResponse.json({ error: "Study plan not found" }, { status: 404 });
    }
    if (doc.clerkId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let targetStep: any = null;
    for (const sec of doc.sections) {
      const found = sec.steps.find((st: any) => st.id === stepId);
      if (found) {
        targetStep = found;
        break;
      }
    }

    if (!targetStep) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }

    // Return cached step content if already generated and not forced
    if (!force && targetStep.generatedContent && (targetStep.status === "ready" || targetStep.status === "completed")) {
      return NextResponse.json({
        success: true,
        cached: true,
        step: targetStep,
        plan: serializeStudyPlan(doc),
      });
    }

    const generated = await generateStudyPlanStep({
      bookId: String(doc.bookId),
      bookTitle: doc.bookTitle,
      language: doc.language || "en",
      step: targetStep,
    });

    targetStep.generatedContent = generated;
    if (targetStep.status === "pending" || targetStep.status === "deferred") {
      targetStep.status = "ready";
    }

    doc.readinessScore = computeReadinessScore(doc.sections);
    doc.markModified("sections");
    await doc.save();

    return NextResponse.json({
      success: true,
      cached: false,
      step: targetStep,
      plan: serializeStudyPlan(doc),
    });
  } catch (error) {
    return buildSafeErrorResponse(
      "POST /api/study-plans/[id]/steps/[stepId]/generate",
      error,
      { fallbackMessage: "Failed to generate study step." }
    );
  }
}
