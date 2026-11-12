import { StudyLanguage } from "@/lib/language";
import { callGeminiTtsAudio } from "./ai-client";
import { uploadWhiteboardAsset } from "./blob";
import { DEFAULT_WHITEBOARD_VOICE, isValidWhiteboardVoice } from "./voices";

/**
 * Parses exact playback duration in milliseconds from a RIFF WAV buffer.
 */
export function parseWavDurationMs(wavBuffer: Buffer): number {
  if (wavBuffer.length < 44 || wavBuffer.toString("ascii", 0, 4) !== "RIFF") {
    // Fallback assume 24 kHz mono 16-bit PCM (48,000 bytes/sec)
    return Math.max(1000, Math.round((Math.max(0, wavBuffer.length - 44) / 48000) * 1000));
  }

  let byteRate = wavBuffer.readUInt32LE(28);
  if (!byteRate || byteRate < 8000) {
    byteRate = 48000;
  }

  let offset = 12;
  while (offset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.toString("ascii", offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      const actualBytes = Math.min(chunkSize, wavBuffer.length - (offset + 8));
      return Math.max(800, Math.round((actualBytes / byteRate) * 1000));
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  return Math.max(800, Math.round(((wavBuffer.length - 44) / byteRate) * 1000));
}

function resolveTtsStyleHint(language: StudyLanguage, beatHint?: string): string {
  const base = beatHint?.trim() || "clear, engaging medical educator";
  if (language === "ar") {
    return `${base}, warm natural Egyptian Arabic teaching tone`;
  }
  if (language === "mixed") {
    return `${base}, Egyptian Arabic with crisp English clinical terms`;
  }
  return base;
}

/**
 * Synthesizes a beat's narration WAV via Gemini 3.8 TTS REST and stores it in Vercel Blob.
 */
export async function synthesizeBeatNarration(params: {
  videoId: string;
  beatIndex: number;
  narration: string;
  spokenStyleHint?: string;
  language: StudyLanguage;
  voiceId: string;
}): Promise<{ audioUrl: string; audioDurationMs: number }> {
  const { videoId, beatIndex, narration, spokenStyleHint, language, voiceId } = params;
  const safeVoice = isValidWhiteboardVoice(voiceId) ? voiceId : DEFAULT_WHITEBOARD_VOICE;
  const style = resolveTtsStyleHint(language, spokenStyleHint);

  const wavBuffer = await callGeminiTtsAudio({
    text: narration,
    style,
    voiceId: safeVoice,
  });
  const audioDurationMs = parseWavDurationMs(wavBuffer);

  const uploaded = await uploadWhiteboardAsset(
    `whiteboard/${videoId}/audio/${safeVoice}/beat-${beatIndex}.wav`,
    wavBuffer,
    "audio/wav"
  );

  return {
    audioUrl: uploaded.url,
    audioDurationMs,
  };
}
