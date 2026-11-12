import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get("url") || searchParams.get("key");

    if (!targetUrl) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    // If it's a Vercel Blob URL, stream it securely using the server token (private with public fallback)
    if (targetUrl.includes(".blob.vercel-storage.com")) {
      const token =
        process.env.BLOB_READ_WRITE_TOKEN ||
        process.env.BLOB_ASCLEON_READ_WRITE_TOKEN;

      let blobRes = null;
      try {
        blobRes = await get(targetUrl, {
          access: "private",
          token,
        });
      } catch {
        blobRes = await get(targetUrl, {
          access: "public",
          token,
        });
      }

      if (!blobRes || !blobRes.stream) {
        return NextResponse.json({ error: "File not found in store" }, { status: 404 });
      }

      // Return streaming or HTTP 206 Partial Content response so Chromium/Safari <audio> plays cleanly
      const contentType =
        blobRes.headers.get("content-type") ||
        blobRes.blob?.contentType ||
        "application/octet-stream";
      const rangeHeader = req.headers.get("range");

      if (rangeHeader) {
        const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
        const ab = await new Response(blobRes.stream as BodyInit).arrayBuffer();
        const total = ab.byteLength;
        const start = match ? Number(match[1]) : 0;
        const end =
          match && match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;

        if (!Number.isFinite(start) || start < 0 || start >= total || end < start) {
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${total}` },
          });
        }

        const slice = ab.slice(start, end + 1);
        const headers = new Headers();
        headers.set("Content-Type", contentType);
        headers.set("Accept-Ranges", "bytes");
        headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
        headers.set("Content-Length", String(slice.byteLength));
        headers.set("Cache-Control", "public, max-age=31536000, immutable");

        return new Response(slice, {
          status: 206,
          headers,
        });
      }

      const headers = new Headers();
      headers.set("Content-Type", contentType);
      headers.set("Accept-Ranges", "bytes");
      if (blobRes.headers.get("content-length")) {
        headers.set("Content-Length", blobRes.headers.get("content-length")!);
      }
      headers.set("Cache-Control", "public, max-age=31536000, immutable");

      return new Response(blobRes.stream as BodyInit, {
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
