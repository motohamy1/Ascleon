import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserUsageSummary } from "@/lib/usage.server";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const summary = await getUserUsageSummary(userId);
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    console.error("Failed to fetch usage summary:", err);
    return NextResponse.json(
      { error: "Failed to fetch usage summary" },
      { status: 500 },
    );
  }
}
