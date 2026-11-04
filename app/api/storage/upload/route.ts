import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { uploadToR2 } from "@/lib/storage";
import { put } from "@vercel/blob";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const cleanFilename = file.name
      .replace(/[^\w.-]/g, "_")
      .replace(/\s+/g, "_")
      .toLowerCase();

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = file.type || "application/pdf";

    // 1. Try Cloudflare R2 (Primary Storage - 100% Free, Zero Egress)
    try {
      const r2Result = await uploadToR2(buffer, cleanFilename, contentType);
      if (r2Result && r2Result.url) {
        return NextResponse.json({
          success: true,
          data: {
            url: r2Result.url,
            key: r2Result.key,
            provider: "r2",
          },
        });
      }
    } catch (r2Err) {
      console.warn("Direct server-to-R2 upload failed, trying server-side Vercel Blob fallback:", r2Err);
    }

    // 2. Fallback to Server-Side Vercel Blob put()
    const token =
      process.env.BLOB_READ_WRITE_TOKEN ||
      process.env.BLOB_ASCLEON_READ_WRITE_TOKEN;

    if (!token) {
      throw new Error("No cloud storage provider configured or available.");
    }

    // Attempt upload with private access compatible with private stores
    let finalUrl = "";
    let finalKey = "";

    try {
      const blob = await put(`books/${cleanFilename}`, buffer, {
        access: "private",
        contentType,
        token,
      });
      // Route private blobs through local secure streaming proxy so reader gets 200 OK
      finalUrl = `/api/storage/file?url=${encodeURIComponent(blob.url)}`;
      finalKey = blob.pathname;
    } catch (privErr) {
      // If store happens to be public, try public fallback
      const blob = await put(`books/${cleanFilename}`, buffer, {
        access: "public",
        contentType,
        token,
      });
      finalUrl = blob.url;
      finalKey = blob.pathname;
    }

    return NextResponse.json({
      success: true,
      data: {
        url: finalUrl,
        key: finalKey,
        provider: "vercel-blob",
      },
    });
  } catch (error) {
    console.error("Storage upload API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal storage upload failed",
      },
      { status: 500 }
    );
  }
}
