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

    // 1. Try Cloudflare R2
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

    const blob = await put(`books/${cleanFilename}`, buffer, {
      access: "public",
      contentType,
      token,
    });

    return NextResponse.json({
      success: true,
      data: {
        url: blob.url,
        key: blob.pathname,
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
