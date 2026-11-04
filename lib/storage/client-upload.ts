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
 * 1. Direct Browser XHR PUT to Cloudflare R2 (0 server load, 0 egress, global edge)
 * 2. Next.js Server Action direct R2 stream (resilient bypass of client CORS/firewalls)
 * 3. Server-side pipeline via /api/storage/upload (R2 -> Private Vercel Blob with proxy)
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
            reject(new Error("Direct R2 upload stalled (no progress for 35s)"));
          }, 35000);
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
          reject(new Error("Direct R2 network error"));
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
    console.warn("Direct R2 upload failed, switching to server R2 action:", r2Err);
  }

  // 2. Resilient Server Action to Cloudflare R2
  onStatus?.("Uploading via resilient server pipeline...");
  try {
    const { uploadFileToR2Action } = await import("@/lib/actions/storage.actions");
    const formData = new FormData();
    formData.append("file", file);

    const actionRes = await uploadFileToR2Action(formData);
    if (actionRes.success && actionRes.data?.url) {
      return {
        url: actionRes.data.url,
        key: actionRes.data.key,
        provider: "r2",
      };
    }
    console.warn("Server action upload warning:", actionRes.error);
  } catch (actErr) {
    console.warn("Server action upload failed, trying /api/storage/upload:", actErr);
  }

  // 3. Fallback to /api/storage/upload (Server R2 -> Server Vercel Blob with proxy)
  onStatus?.("Finalizing upload with secure storage route...");
  const serverResult = await new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let stallTimer: NodeJS.Timeout;

    const resetStallTimer = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        xhr.abort();
        reject(new Error("Server storage upload stalled"));
      }, 45000);
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
}
