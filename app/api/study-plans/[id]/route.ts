import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/database/mongoose";
import StudyPlan from "@/database/models/study-plan.model";
import { serializeStudyPlan } from "@/lib/study-plan/utils";
import { buildSafeErrorResponse } from "@/lib/security/error-handler";

export async function GET(
  _req: NextRequest,
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

    await connectToDatabase();
    const doc = await StudyPlan.findById(id).lean();
    if (!doc) {
      return NextResponse.json({ error: "Study plan not found" }, { status: 404 });
    }
    if ((doc as any).clerkId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      plan: serializeStudyPlan(doc),
    });
  } catch (error) {
    return buildSafeErrorResponse("GET /api/study-plans/[id]", error, {
      fallbackMessage: "Failed to fetch study plan.",
    });
  }
}

export async function DELETE(
  _req: NextRequest,
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

    await connectToDatabase();
    const doc = await StudyPlan.findById(id);
    if (!doc) {
      return NextResponse.json({ error: "Study plan not found" }, { status: 404 });
    }
    if (doc.clerkId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await StudyPlan.deleteOne({ _id: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    return buildSafeErrorResponse("DELETE /api/study-plans/[id]", error, {
      fallbackMessage: "Failed to delete study plan.",
    });
  }
}
