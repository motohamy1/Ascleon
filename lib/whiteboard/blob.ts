import { PutObjectCommand } from "@aws-sdk/client-s3";
import { get, put } from "@vercel/blob";
import { r2Client, R2_BUCKET, R2_PUBLIC_BASE } from "@/lib/storage";

function getBlobToken(): string | null {
  return (
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.BLOB_ASCLEON_READ_WRITE_TOKEN ||
    null
  );
}

export interface UploadedWhiteboardAsset {
  /** Browser-accessible URL (direct public R2 CDN, proxy path for private stores, or data URI) */
  url: string;
  /** Raw blob URL stored for server-side fetches */
  rawUrl: string;
}

/**
 * Uploads a whiteboard PNG or WAV buffer with multi-tier storage fallback:
 * 1. Cloudflare R2 (100% Free, Zero Egress, Public CDN with CORS, Zero Auth Issues)
 * 2. Vercel Blob (Public or Private store with token)
 * 3. Base64 Data URI (bulletproof fallback ensuring audio synthesis never fails due to storage)
 */
export async function uploadWhiteboardAsset(
  pathname: string,
  buffer: Buffer,
  contentType: string
): Promise<UploadedWhiteboardAsset> {
  const cleanPath = pathname.replace(/^\/+/, "");

  // 1. Primary: Cloudflare R2
  if (r2Client) {
    try {
      await r2Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: cleanPath,
          Body: buffer,
          ContentType: contentType,
        })
      );
      const publicUrl = `${R2_PUBLIC_BASE}/${cleanPath}`;
      return {
        url: publicUrl,
        rawUrl: publicUrl,
      };
    } catch (r2Err) {
      console.warn("[whiteboard/blob] R2 upload failed, trying Vercel Blob fallback:", r2Err);
    }
  }

  // 2. Secondary: Vercel Blob
  const token = getBlobToken();
  if (token) {
    try {
      const blob = await put(cleanPath, buffer, {
        access: "public",
        contentType,
        token,
        allowOverwrite: true,
      });
      return {
        url: blob.url,
        rawUrl: blob.url,
      };
    } catch {
      try {
        const blob = await put(cleanPath, buffer, {
          access: "private",
          contentType,
          token,
          allowOverwrite: true,
        });
        return {
          url: `/api/storage/file?url=${encodeURIComponent(blob.url)}`,
          rawUrl: blob.url,
        };
      } catch (blobErr) {
        console.warn("[whiteboard/blob] Vercel Blob upload failed:", blobErr);
      }
    }
  }

  // 3. Fallback: Base64 Data URI (guarantees browser audio playback even if all cloud storage fails)
  const dataUri = `data:${contentType};base64,${buffer.toString("base64")}`;
  return {
    url: dataUri,
    rawUrl: dataUri,
  };
}

/**
 * Reads an image or audio buffer from a raw/public/proxy URL or base64 data URI directly on the server.
 */
export async function readWhiteboardAssetBuffer(rawOrProxyUrl: string): Promise<Buffer> {
  if (rawOrProxyUrl.startsWith("data:")) {
    const base64Data = rawOrProxyUrl.replace(/^data:[^;]+;base64,/, "");
    return Buffer.from(base64Data, "base64");
  }

  let targetUrl = rawOrProxyUrl;
  if (rawOrProxyUrl.startsWith("/api/storage/file")) {
    const parsed = new URL(rawOrProxyUrl, "http://localhost");
    const inner = parsed.searchParams.get("url");
    if (inner) targetUrl = inner;
  }

  if (targetUrl.includes(".blob.vercel-storage.com")) {
    const token = getBlobToken();
    if (token) {
      try {
        const res = await get(targetUrl, { access: "private", token });
        if (res && res.stream) {
          const chunks: Uint8Array[] = [];
          const reader = res.stream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
          }
          return Buffer.concat(chunks);
        }
      } catch {
        // Fall through to direct fetch
      }
    }
  }

  const resp = await fetch(targetUrl);
  if (!resp.ok) {
    throw new Error(`Failed to fetch whiteboard asset (${resp.status})`);
  }
  const arr = await resp.arrayBuffer();
  return Buffer.from(arr);
}
