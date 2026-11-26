import { NextResponse } from "next/server";
import { handleUpload, HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@clerk/nextjs/server";
import { getPlanLimits } from "@/lib/subscription.server";
import { logServerError } from "@/lib/security/error-handler";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      token:
        process.env.BLOB_READ_WRITE_TOKEN ||
        process.env.BLOB_ASCLEON_READ_WRITE_TOKEN,
      body,
      request,
      onBeforeGenerateToken: async () => {
        const { userId } = await auth();
        if (!userId) {
          throw new Error("Unauthorized: User not authenticated");
        }
        const limits = await getPlanLimits();
        return {
          allowedContentTypes: [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/webp",
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: limits.maxFileSizeMb * 1024 * 1024,
          tokenPayload: JSON.stringify({ userId }),
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "An unknown error occurred";
    const isUnauthorized = message.includes("Unauthorized");
    const status = isUnauthorized ? 401 : 500;
    const errorId = logServerError("POST /api/upload", e, undefined, {
      category: isUnauthorized ? "auth" : "storage",
      statusCode: status,
    });
    const clientMessage = isUnauthorized ? "Unauthorized" : "Upload failed";
    return NextResponse.json({ error: clientMessage, errorId }, { status });
  }
}
