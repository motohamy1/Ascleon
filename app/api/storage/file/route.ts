import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get("url") || searchParams.get("key");

    if (!targetUrl) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    // If it's a private Vercel Blob URL, stream it securely using the server token
    if (targetUrl.includes(".blob.vercel-storage.com")) {
      const token =
        process.env.BLOB_READ_WRITE_TOKEN ||
        process.env.BLOB_ASCLEON_READ_WRITE_TOKEN;

      const blobRes = await get(targetUrl, {
        access: "private",
        token,
      });

      if (!blobRes || !blobRes.stream) {
        return NextResponse.json({ error: "File not found in store" }, { status: 404 });
      }

      // Return streaming response with appropriate media headers
      const headers = new Headers();
      headers.set("Content-Type", blobRes.headers.get("content-type") || "application/pdf");
      headers.set("Accept-Ranges", "bytes");
      if (blobRes.headers.get("content-length")) {
        headers.set("Content-Length", blobRes.headers.get("content-length")!);
      }
      headers.set("Cache-Control", "public, max-age=31536000, immutable");

      return new Response(blobRes.stream as any, {
        status: 200,
        headers,
      });
    }

    // If it's already a public URL (e.g. Cloudflare R2), redirect to it directly
    return NextResponse.redirect(targetUrl, 302);
  } catch (error) {
    console.error("Storage proxy error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load storage file" },
      { status: 500 }
    );
  }
}
