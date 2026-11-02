import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v2 as cloudinary } from "cloudinary";

// ---------------------------------------------------------------------------
// 1. Cloudflare R2 Setup (Primary Document Storage - 10GB Free, $0 Egress)
// ---------------------------------------------------------------------------
const isR2Configured = Boolean(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET
);

export const r2Client = isR2Configured
  ? new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

const R2_BUCKET = process.env.R2_BUCKET || "bookify-files";
const R2_PUBLIC_BASE =
  process.env.R2_PUBLIC_URL?.replace(/\/+$/, "") ||
  `https://pub-df301334814244229e232fdf0e0d3c5a.r2.dev`;

// ---------------------------------------------------------------------------
// 2. Cloudinary Setup (Cover Image Optimization & CDN)
// ---------------------------------------------------------------------------
const isCloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

// ---------------------------------------------------------------------------
// Storage Operations
// ---------------------------------------------------------------------------

/**
 * Generate a pre-signed PUT URL for direct client-to-R2 upload (avoids server bandwidth limits)
 */
export async function getR2PresignedUploadUrl(
  filename: string,
  contentType: string = "application/pdf"
) {
  if (!r2Client) {
    throw new Error("Cloudflare R2 is not configured.");
  }

  const cleanFilename = filename
    .replace(/[^\w.-]/g, "_")
    .replace(/\s+/g, "_")
    .toLowerCase();
  const timestamp = Date.now();
  const key = `books/${timestamp}_${cleanFilename}`;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  // Pre-signed URL valid for 15 minutes
  const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 900 });
  const publicUrl = `${R2_PUBLIC_BASE}/${key}`;

  return {
    uploadUrl,
    publicUrl,
    key,
  };
}

/**
 * Server-side upload to Cloudflare R2
 */
export async function uploadToR2(
  fileBuffer: Buffer | Uint8Array,
  filename: string,
  contentType: string = "application/pdf"
) {
  if (!r2Client) {
    throw new Error("Cloudflare R2 is not configured.");
  }

  const cleanFilename = filename
    .replace(/[^\w.-]/g, "_")
    .replace(/\s+/g, "_")
    .toLowerCase();
  const key = `books/${Date.now()}_${cleanFilename}`;

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    })
  );

  return {
    url: `${R2_PUBLIC_BASE}/${key}`,
    key,
    provider: "r2" as const,
  };
}

/**
 * Upload cover images to Cloudinary with automatic WebP compression & CDN distribution
 */
export async function uploadCoverImage(
  dataUrlOrBuffer: string | Buffer,
  filename: string
): Promise<{ url: string; key: string }> {
  // If Cloudinary is available, use it for optimal cover compression
  if (isCloudinaryConfigured) {
    try {
      let uploadPayload: string;
      if (typeof dataUrlOrBuffer === "string") {
        uploadPayload = dataUrlOrBuffer;
      } else {
        uploadPayload = `data:image/png;base64,${dataUrlOrBuffer.toString("base64")}`;
      }

      const res = await cloudinary.uploader.upload(uploadPayload, {
        folder: "ascleon/covers",
        resource_type: "image",
        format: "webp",
        quality: "auto",
        public_id: filename.replace(/\.[^/.]+$/, "").replace(/[^\w-]/g, "_"),
      });

      return {
        url: res.secure_url,
        key: res.public_id,
      };
    } catch (cldErr) {
      console.warn("Cloudinary upload failed, attempting R2 fallback:", cldErr);
    }
  }

  // Fallback to Cloudflare R2 for cover storage
  if (r2Client) {
    let buffer: Buffer;
    if (typeof dataUrlOrBuffer === "string" && dataUrlOrBuffer.startsWith("data:image")) {
      const base64Data = dataUrlOrBuffer.replace(/^data:image\/\w+;base64,/, "");
      buffer = Buffer.from(base64Data, "base64");
    } else if (Buffer.isBuffer(dataUrlOrBuffer)) {
      buffer = dataUrlOrBuffer;
    } else {
      buffer = Buffer.from(String(dataUrlOrBuffer));
    }

    const key = `covers/${Date.now()}_${filename.replace(/[^\w.-]/g, "_")}`;
    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: "image/png",
      })
    );

    return {
      url: `${R2_PUBLIC_BASE}/${key}`,
      key,
    };
  }

  throw new Error("No storage provider available for cover image.");
}

