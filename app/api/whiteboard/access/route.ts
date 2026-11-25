import { NextResponse } from "next/server";
import { getWhiteboardAccess } from "@/lib/whiteboard/feature-gate";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getWhiteboardAccess();
  return NextResponse.json(access, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
