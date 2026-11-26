import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { connectToDatabase } from "@/database/mongoose";
import StudyPlan from "@/database/models/study-plan.model";
import { computeReadinessScore, serializeStudyPlan } from "@/lib/study-plan/utils";
import { buildSafeErrorResponse } from "@/lib/security/error-handler";

const StepProgressSchema = z.object({
  status: z.enum(["completed", "pending", "ready"]),
});

export async function PATCH(
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

    const raw = await req.json().catch(() => null);
    const parsed = StepProgressSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid progress status" },
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

    let found = false;
    for (const sec of doc.sections) {
      const step = sec.steps.find((st: any) => st.id === stepId);
      if (step) {
        found = true;
        const targetStatus =
          parsed.data.status === "pending" && step.generatedContent
            ? "ready"
            : parsed.data.status;
        step.status = targetStatus;
        step.completedAt = targetStatus === "completed" ? new Date() : null;
        break;
      }
    }

    if (!found) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }

    const readiness = computeReadinessScore(doc.sections);
    doc.readinessScore = readiness;

    const allDone = doc.sections
      .flatMap((s: any) => s.steps)
      .filter((st: any) => st.status !== "deferred")
      .every((st: any) => st.status === "completed");
    doc.status = allDone ? "completed" : "active";

    doc.markModified("sections");
    await doc.save();

    return NextResponse.json({
      success: true,
      plan: serializeStudyPlan(doc),
    });
  } catch (error) {
    return buildSafeErrorResponse(
      "PATCH /api/study-plans/[id]/steps/[stepId]/progress",
      error,
      { fallbackMessage: "Failed to update step progress." }
    );
  }
}
