import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenAI, Modality } from "@google/genai";
import { auth } from "@clerk/nextjs/server";
import { checkVoiceBudget } from "@/lib/usage.server";
import { buildSafeErrorResponse } from "@/lib/security/error-handler";
import { sanitizePlainText, sanitizeRichText } from "@/lib/security/sanitize";

const VoiceSessionSchema = z.object({
  bookTitle: z.string().max(240).optional().default("Study Material"),
  pageNumber: z.number().int().min(1).max(10000).optional().default(1),
  pageText: z.string().max(30000).optional().default(""),
  selectedText: z.string().max(15000).optional().default(""),
  userSpeech: z.string().trim().min(1, "No user speech provided").max(4000),
  language: z.enum(["en", "ar", "mixed"]).optional().default("en"),
  history: z
    .array(
      z.object({
        role: z.string().max(30),
        content: z.string().max(4000),
      })
    )
    .max(20)
    .optional()
    .default([]),
  authoritativeReferences: z.array(z.unknown()).max(20).optional().default([]),
});

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const voiceBudget = await checkVoiceBudget(userId);
    if (!voiceBudget.allowed) {
      return NextResponse.json(
        { error: voiceBudget.error, isBillingError: true },
        { status: 402 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return buildSafeErrorResponse(
        "GET /api/voice/session",
        new Error("Missing GEMINI_API_KEY")
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    // Create ephemeral token for client-side Live API connections
    try {
      const token = await ai.authTokens.create({
        config: {
          uses: 1,
          expireTime,
          newSessionExpireTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          liveConnectConstraints: {
            model: "gemini-3.8-live",
            config: {
              responseModalities: [Modality.AUDIO],
            },
          },
        },
      });

      return NextResponse.json({
        token: token.name,
        model: "gemini-3.8-live",
        expiresAt: expireTime,
      });
    } catch (tokenErr) {
      // If ephemeral tokens preview is not enabled on this project tier, return fallback indicator
      return NextResponse.json({
        fallback: true,
        message: "Ephemeral token creation skipped, use turn-by-turn live speech engine.",
      });
    }
  } catch (error) {
    return buildSafeErrorResponse("GET /api/voice/session", error, {
      fallbackMessage: "Failed to create voice session.",
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const voiceBudget = await checkVoiceBudget(userId);
    if (!voiceBudget.allowed) {
      return NextResponse.json(
        { error: voiceBudget.error, isBillingError: true },
        { status: 402 }
      );
    }

    const rawBody = await req.json().catch(() => null);
    const parsedBody = VoiceSessionSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: parsedBody.error.issues[0]?.message || "Invalid voice session payload" },
        { status: 400 }
      );
    }

    const { pageNumber, history, authoritativeReferences } = parsedBody.data;
    const bookTitle = sanitizePlainText(parsedBody.data.bookTitle, 240) || "Study Material";
    const pageText = sanitizeRichText(parsedBody.data.pageText, 25000);
    const selectedText = sanitizeRichText(parsedBody.data.selectedText, 12000);
    const userSpeech = sanitizeRichText(parsedBody.data.userSpeech, 4000);

    if (!userSpeech) {
      return NextResponse.json({ error: "No user speech provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return buildSafeErrorResponse(
        "POST /api/voice/session",
        new Error("Missing GEMINI_API_KEY")
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const referencesContext = authoritativeReferences.length > 0
      ? `Authoritative References: ${authoritativeReferences.map((r: any) => typeof r === "string" ? r : r.source || r.title).join(", ")}`
      : "";

    const systemPrompt = `You are Ascleon's elite AI Live Oral Mentor. You are conducting an interactive, spoken voice tutorial with a student who is actively reading Page ${pageNumber} of "${bookTitle}".

Active Study Page Text:
"""
${(selectedText || pageText).slice(0, 2500)}
"""
${referencesContext}

Spoken Dialogue Rules:
1. Speak warmly, clearly, and concisely as an expert 1-on-1 human mentor. Keep each spoken turn to 2-4 sentences maximum so the student can respond easily.
2. Bilingual Mastery (English & Arabic):
   - You seamlessly understand and speak English and Arabic.
   - If the student speaks Arabic, respond in articulate, natural Arabic.
   - If the student speaks English, respond in articulate English.
   - If the student mixes English and Arabic (medical Arabizi or bilingual code-switching, e.g. "يا دكتور إيه الـ mechanism بتاع الـ murmur ده؟"), understand it effortlessly and respond naturally in the same friendly, bilingual clinical tone.
3. Grounding: Every answer must reflect the verified facts on Page ${pageNumber} and gold-standard canon. If the student asks about a concept not on the page, connect it back to the page's core invariants.
4. Socratic ending: Conclude with a brief, friendly oral check or question to keep the conversation flowing.
5. No markdown asterisks, no bullet symbols, no emojis — this text will be read aloud to the user!`;

    // Build dialogue turns
    const contents: any[] = [];
    contents.push({ role: "user", parts: [{ text: systemPrompt }] });
    contents.push({ role: "model", parts: [{ text: "Understood. I am ready to converse live as Ascleon's oral mentor, fully bilingual in English and Arabic." }] });

    for (const h of history.slice(-6)) {
      contents.push({
        role: h.role === "user" ? "user" : "model",
        parts: [{ text: h.content }],
      });
    }

    contents.push({
      role: "user",
      parts: [{ text: userSpeech }],
    });

    const generatePromise = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents,
      config: {
        temperature: 0.35,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Voice response timed out after 25s")), 25000)
    );

    const response: any = await Promise.race([generatePromise, timeoutPromise]);

    const spokenText = response.text?.trim() || "Let's review the core invariant on this page together.";
    // Clean any remaining markdown symbols so TTS reads smoothly
    const cleanSpokenText = spokenText.replace(/[*#_~`>]/g, "").trim();

    return NextResponse.json({
      success: true,
      responseText: cleanSpokenText,
      model: "gemini-3.8-flash",
    });
  } catch (error) {
    return buildSafeErrorResponse("POST /api/voice/session", error, {
      fallbackMessage: "Voice mentor is temporarily unavailable.",
    });
  }
}
