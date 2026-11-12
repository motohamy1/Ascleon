import { get, put } from "@vercel/blob";

function getBlobToken(): string {
  const token =
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.BLOB_ASCLEON_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error("Vercel Blob storage token is not configured in environment.");
  }
  return token;
}

export interface UploadedWhiteboardAsset {
  /** Browser-accessible URL (proxy path for private stores, direct URL for public stores) */
  url: string;
  /** Raw blob URL stored for server-side fetches */
  rawUrl: string;
}

/**
 * Uploads a whiteboard PNG or WAV buffer to Vercel Blob, supporting both private and public stores.
 */
export async function uploadWhiteboardAsset(
  pathname: string,
  buffer: Buffer,
  contentType: string
): Promise<UploadedWhiteboardAsset> {
  const token = getBlobToken();
  const cleanPath = pathname.replace(/^\/+/, "");

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
  } catch {
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
  }
}

/**
 * Reads an image/asset buffer from a raw Vercel Blob URL directly on the server.
 */
export async function readWhiteboardAssetBuffer(rawOrProxyUrl: string): Promise<Buffer> {
  let targetUrl = rawOrProxyUrl;
  if (rawOrProxyUrl.startsWith("/api/storage/file")) {
    const parsed = new URL(rawOrProxyUrl, "http://localhost");
    const inner = parsed.searchParams.get("url");
    if (inner) targetUrl = inner;
  }

  if (targetUrl.includes(".blob.vercel-storage.com")) {
    const token = getBlobToken();
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
      // Fall through to direct fetch for public blobs
    }
  }

  const resp = await fetch(targetUrl);
  if (!resp.ok) {
    throw new Error(`Failed to fetch whiteboard asset (${resp.status})`);
  }
  const arr = await resp.arrayBuffer();
  return Buffer.from(arr);
}
