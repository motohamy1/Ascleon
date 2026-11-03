export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResult {
  url: string;
  key: string;
  provider?: string;
}

/**
 * Robust, resilient PDF uploader with live upload progress tracking and smart stall detection.
 * Pipeline:
 * 1. Direct Browser XHR PUT to Cloudflare R2 (0 server load, 0 egress)
 * 2. If blocked by CORS or stalled for 8s: XHR POST to /api/storage/upload (Server R2 -> Server Vercel Blob)
 * 3. Final Fallback: Direct @vercel/blob/client upload
 */
export async function uploadPdfWithProgress(
  file: File,
  options?: {
    onProgress?: (progress: UploadProgress) => void;
    onStatus?: (status: string) => void;
  }
): Promise<UploadResult> {
  const { onProgress, onStatus } = options || {};

  // 1. Attempt Direct Browser XHR PUT to Cloudflare R2
  try {
    const { requestPresignedUpload } = await import("@/lib/actions/storage.actions");
    const presigned = await requestPresignedUpload(file.name, file.type || "application/pdf");

    if (presigned.success && presigned.data?.uploadUrl) {
      onStatus?.("Uploading directly to Cloudflare R2...");
      const result = await new Promise<UploadResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let stallTimer: NodeJS.Timeout;

        const resetStallTimer = () => {
          clearTimeout(stallTimer);
          stallTimer = setTimeout(() => {
            xhr.abort();
            reject(new Error("Direct R2 upload stalled (no progress for 8s)"));
          }, 8000);
        };

        xhr.upload.onprogress = (e) => {
          resetStallTimer();
          if (e.lengthComputable && onProgress) {
            onProgress({
              loaded: e.loaded,
              total: e.total,
              percentage: Math.round((e.loaded / e.total) * 100),
            });
          }
        };

        xhr.onload = () => {
          clearTimeout(stallTimer);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({
              url: presigned.data!.publicUrl,
              key: presigned.data!.key,
              provider: "r2",
            });
          } else {
            reject(new Error(`Direct R2 responded with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => {
          clearTimeout(stallTimer);
          reject(new Error("Direct R2 network / CORS error"));
        };

        xhr.onabort = () => {
          clearTimeout(stallTimer);
          reject(new Error("Direct R2 upload aborted"));
        };

        resetStallTimer();
        xhr.open("PUT", presigned.data!.uploadUrl, true);
        xhr.setRequestHeader("Content-Type", file.type || "application/pdf");
        xhr.send(file);
      });

      return result;
    }
  } catch (r2Err) {
    console.warn("Direct R2 upload failed, switching to /api/storage/upload:", r2Err);
  }

  // 2. Attempt Next.js Server-Side Upload via /api/storage/upload (Server R2 -> Server Vercel Blob)
  onStatus?.("Uploading to cloud via secure server pipeline...");
  try {
    const serverResult = await new Promise<UploadResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let stallTimer: NodeJS.Timeout;

      const resetStallTimer = () => {
        clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          xhr.abort();
          reject(new Error("Server upload stalled (no progress for 25s)"));
        }, 25000);
      };

      xhr.upload.onprogress = (e) => {
        resetStallTimer();
        if (e.lengthComputable && onProgress) {
          onProgress({
            loaded: e.loaded,
            total: e.total,
            percentage: Math.round((e.loaded / e.total) * 100),
          });
        }
      };

      xhr.onload = () => {
        clearTimeout(stallTimer);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const json = JSON.parse(xhr.responseText);
            if (json.success && json.data?.url) {
              resolve(json.data);
            } else {
              reject(new Error(json.error || "Server upload failed"));
            }
          } catch (parseErr) {
            reject(parseErr);
          }
        } else {
          reject(new Error(`Server upload responded with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        clearTimeout(stallTimer);
        reject(new Error("Server upload network error"));
      };

      xhr.onabort = () => {
        clearTimeout(stallTimer);
        reject(new Error("Server upload aborted"));
      };

      resetStallTimer();
      const formData = new FormData();
      formData.append("file", file);
      xhr.open("POST", "/api/storage/upload", true);
      xhr.send(formData);
    });

    return serverResult;
  } catch (srvErr) {
    console.warn("Server upload endpoint failed, falling back to client Vercel Blob:", srvErr);
  }

  // 3. Last-ditch Fallback: Direct @vercel/blob/client upload
  onStatus?.("Finishing upload with Vercel Blob fallback...");
  const { upload } = await import("@vercel/blob/client");
  const fileSlug = file.name.replace(/\s+/g, "-").toLowerCase();
  const uploadedBlob = await upload(fileSlug, file, {
    access: "public",
    handleUploadUrl: "/api/upload",
    contentType: file.type || "application/pdf",
    onUploadProgress: (p) => {
      if (onProgress) {
        onProgress({
          loaded: p.loaded,
          total: p.total,
          percentage: p.percentage,
        });
      }
    },
  });

  return {
    url: uploadedBlob.url,
    key: uploadedBlob.pathname,
    provider: "vercel-blob",
  };
}
