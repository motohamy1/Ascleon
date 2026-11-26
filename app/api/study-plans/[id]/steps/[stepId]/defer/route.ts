import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { connectToDatabase } from "@/database/mongoose";
import StudyPlan from "@/database/models/study-plan.model";
import {
  computeReadinessScore,
  deferStepInSections,
  serializeStudyPlan,
} from "@/lib/study-plan/utils";
import { buildSafeErrorResponse } from "@/lib/security/error-handler";

const DeferSchema = z.object({
  moveToNextSession: z.boolean().optional().default(true),
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

    let moveToNextSession = true;
    try {
      const raw = await req.json();
      const parsed = DeferSchema.safeParse(raw);
      if (parsed.success) moveToNextSession = parsed.data.moveToNextSession;
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

    const serialized = serializeStudyPlan(doc);
    const { sections: updatedSections, found } = deferStepInSections(
      serialized.sections,
      stepId,
      moveToNextSession
    );

    if (!found) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }

    doc.sections = updatedSections;
    doc.readinessScore = computeReadinessScore(updatedSections);
    doc.markModified("sections");
    await doc.save();

    return NextResponse.json({
      success: true,
      plan: serializeStudyPlan(doc),
    });
  } catch (error) {
    return buildSafeErrorResponse(
      "POST /api/study-plans/[id]/steps/[stepId]/defer",
      error,
      { fallbackMessage: "Failed to defer study step." }
    );
  }
}
