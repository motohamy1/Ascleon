import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { list } from "@vercel/blob";
import { callGeminiTtsAudio } from "@/lib/whiteboard/ai-client";
import { uploadWhiteboardAsset } from "@/lib/whiteboard/blob";
import { isValidWhiteboardVoice, WHITEBOARD_NARRATOR_VOICES } from "@/lib/whiteboard/voices";
import { StudyLanguage } from "@/lib/language";
import { buildSafeErrorResponse } from "@/lib/security/error-handler";

export const maxDuration = 30;

const PreviewVoiceSchema = z.object({
  voiceId: z.string().trim().min(1),
  language: z.enum(["en", "ar", "mixed"]).optional().default("en"),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsed = PreviewVoiceSchema.safeParse(rawBody);
    if (!parsed.success || !isValidWhiteboardVoice(parsed.data.voiceId)) {
      return NextResponse.json({ error: "Unknown narrator voice" }, { status: 400 });
    }

    const voiceId = parsed.data.voiceId;
    const language = parsed.data.language as StudyLanguage;
    const voiceMeta = WHITEBOARD_NARRATOR_VOICES.find((v) => v.id === voiceId)!;
    const langBucket = language === "ar" || language === "mixed" ? "ar" : "en";
    const pathname = `whiteboard/voice-previews/v2-${voiceId}-${langBucket}.wav`;

    // Return cached voice audition if already stored in Vercel Blob
    const token =
      process.env.BLOB_READ_WRITE_TOKEN ||
      process.env.BLOB_ASCLEON_READ_WRITE_TOKEN;
    if (token) {
      try {
        const { blobs } = await list({ prefix: pathname, limit: 1, token });
        const existing = blobs.find((b) => b.pathname === pathname);
        if (existing?.url) {
          const proxyUrl = existing.url.includes(".public.blob.vercel-storage.com")
            ? existing.url
            : `/api/storage/file?url=${encodeURIComponent(existing.url)}`;
          return NextResponse.json({ success: true, audioUrl: proxyUrl, cached: true });
        }
      } catch {
        // Not cached yet; generate below
      }
    }

    const sampleText = langBucket === "ar" ? voiceMeta.sampleLineAr : voiceMeta.sampleLineEn;
    const style =
      langBucket === "ar"
        ? "warm, clear Egyptian Arabic medical educator"
        : "clear, warm educational whiteboard narrator";

    const wavBuffer = await callGeminiTtsAudio({
      text: sampleText,
      style,
      voiceId,
      timeoutMs: 22_000,
    });

    const uploaded = await uploadWhiteboardAsset(pathname, wavBuffer, "audio/wav");

    return NextResponse.json({
      success: true,
      audioUrl: uploaded.url,
      cached: false,
    });
  } catch (error) {
    return buildSafeErrorResponse("POST /api/whiteboard/voices/preview", error, {
      fallbackMessage: "Voice preview is temporarily unavailable.",
    });
  }
}
