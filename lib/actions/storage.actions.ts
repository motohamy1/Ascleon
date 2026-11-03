"use server";

import { auth } from "@clerk/nextjs/server";
import { getR2PresignedUploadUrl, uploadCoverImage, uploadToR2 } from "@/lib/storage";

export async function requestPresignedUpload(filename: string, contentType: string = "application/pdf") {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const data = await getR2PresignedUploadUrl(filename, contentType);
    return { success: true, data };
  } catch (err) {
    console.error("Error generating presigned URL:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to generate upload URL",
    };
  }
}

export async function uploadFileToR2Action(formData: FormData) {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const file = formData.get("file") as File | null;
    if (!file) {
      return { success: false, error: "No file provided" };
    }
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const result = await uploadToR2(buffer, file.name, file.type || "application/pdf");
    return { success: true, data: result };
  } catch (err) {
    console.error("Error in server-side R2 upload:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to upload file to R2",
    };
  }
}

export async function saveCoverImageAction(dataUrl: string, filename: string) {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const result = await uploadCoverImage(dataUrl, filename);
    return { success: true, data: result };
  } catch (err) {
    console.error("Error saving cover image:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save cover image",
    };
  }
}

