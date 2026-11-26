import { NextRequest, NextResponse } from "next/server";
import {
  Behavior,
  EndSensitivity,
  GoogleGenAI,
  LiveConnectConfig,
  Modality,
  StartSensitivity,
  Type,
} from "@google/genai";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { buildLanguageDirective, StudyLanguage } from "@/lib/language";
import { DEFAULT_LIVE_VOICE } from "@/lib/voice-config";
import { checkVoiceBudget } from "@/lib/usage.server";
import { buildSafeErrorResponse, logServerError } from "@/lib/security/error-handler";
import { sanitizePlainText, sanitizeRichText } from "@/lib/security/sanitize";

const VoiceTokenRequestSchema = z.object({
  bookTitle: z.string().max(240).optional().default("Medical Study Document"),
  pageNumber: z.number().int().min(1).max(10000).optional().default(1),
  pageText: z.string().max(30000).optional().default(""),
  selectedText: z.string().max(15000).optional().default(""),
  authoritativeReferences: z.array(z.unknown()).max(20).optional().default([]),
  language: z.enum(["en", "ar", "mixed"]).optional().default("en"),
  voiceName: z.string().max(80).optional().default(DEFAULT_LIVE_VOICE),
  noisyPlace: z.boolean().optional().default(false),
  resumptionHandle: z.string().max(500).nullable().optional().default(null),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required. Please sign in to start a voice session." },
        { status: 401 }
      );
    }

    const voiceBudget = await checkVoiceBudget(userId);
    if (!voiceBudget.allowed) {
      return NextResponse.json(
        {
          error: voiceBudget.error,
          isBillingError: true,
          plan: voiceBudget.plan,
          voiceMinutesUsed: voiceBudget.voiceMinutesUsed,
          voiceMinutesLimit: voiceBudget.voiceMinutesLimit,
        },
        { status: 402 }
      );
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsedBody = VoiceTokenRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid voice session request parameters." },
        { status: 400 }
      );
    }

    const {
      pageNumber,
      authoritativeReferences,
      language,
      voiceName,
      noisyPlace,
      resumptionHandle,
    } = parsedBody.data;
    const bookTitle = sanitizePlainText(parsedBody.data.bookTitle, 240) || "Medical Study Document";
    const pageText = sanitizeRichText(parsedBody.data.pageText, 25000);
    const selectedText = sanitizeRichText(parsedBody.data.selectedText, 12000);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return buildSafeErrorResponse(
        "POST /api/voice/token",
        new Error("Missing GEMINI_API_KEY on server environment")
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: "v1alpha" },
    });
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const referencesContext =
      Array.isArray(authoritativeReferences) && authoritativeReferences.length > 0
        ? `\nCanonical Textbook References: ${authoritativeReferences
            .map((r: unknown) =>
              typeof r === "string"
                ? r
                : (r as { source?: string; title?: string })?.source ||
                  (r as { source?: string; title?: string })?.title
            )
            .filter(Boolean)
            .join(", ")}`
        : "";

    const activeText = (selectedText || pageText || "").slice(0, 3000);
    const langDirective = buildLanguageDirective(language as StudyLanguage, "voice");

    const systemInstructionText = `You are Ascleon's elite 1-on-1 AI Live Oral Mentor across all academic and scientific disciplines. You are conducting an interactive, natural, humanoid oral session with a student studying "${bookTitle}" (Page ${pageNumber}).

ACTIVE STUDY PASSAGE:
"""
${activeText}
"""${referencesContext}

${langDirective}

PEDAGOGICAL & ORAL INTERACTION DIRECTIVES:
1. USER INTENT & SCOPE SUPREMACY (CRITICAL):
   - ALWAYS listen carefully and adapt your speaking style, depth, and duration to EXACTLY what the student asks.
   - When the student asks you to explain, illustrate, or lecture on a topic (or section/page) as a mentor or editor:
     • Deliver a complete, cohesive, well-structured explanation covering definitions, mechanisms, and core takeaways.
     • DO NOT cut yourself off after 2 sentences!
     • DO NOT force a quiz question at the end when the user asked for an explanation.
   - When the student asks a quick, direct question: Give a crisp, direct, high-yield answer immediately.
   - When the student explicitly asks to be quizzed, tested, or examined: Switch into Socratic oral-examiner mode and challenge them with targeted questions.
2. DISCIPLINE & GROUNDING INTEGRITY:
   - Ground your explanations strictly in the author's primary text and stated invariants/gold standards.
   - Never inject distractor concepts from unrelated fields.
3. Spoken Delivery:
   - Speak with natural, warm, human inflection like a world-class scholar or mentor sitting next to the student.
   - NO markdown formatting (no asterisks, hashtags, or emojis) — your output streams directly as real-time audio!
4. Visual Grounding & Page Continuity:
   - Whenever the student says "كمل" ("continue"), asks about "this page" / "الصفحة دي", or moves to a new section, call 'get_current_study_page' so you stay grounded in their exact live page without stopping early.
   - When introducing a pivotal mechanism, structure, or formula, invoke 'show_concept_on_page' in the background to highlight concepts or open Morph view on the screen while you speak.`;

    const automaticActivityDetection = noisyPlace
      ? { disabled: true }
      : {
          disabled: false,
          startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
          endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
          prefixPaddingMs: 300,
          silenceDurationMs: 700,
        };

    const liveConfig: LiveConnectConfig = {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voiceName || DEFAULT_LIVE_VOICE,
          },
        },
      },
      systemInstruction: {
        parts: [{ text: systemInstructionText }],
      },
      realtimeInputConfig: {
        automaticActivityDetection,
      },
      contextWindowCompression: {
        slidingWindow: {},
      },
      sessionResumption: resumptionHandle ? { handle: resumptionHandle } : {},
      outputAudioTranscription: {},
      tools: [
        {
          functionDeclarations: [
            {
              name: "get_current_study_page",
              description:
                "Reads the student's current active page number, book title, and live extracted text. Call this whenever the student says continue / كمل or asks about the current page.",
              parameters: {
                type: Type.OBJECT,
                properties: {},
              },
            },
            {
              name: "show_concept_on_page",
              description:
                "Displays a visual concept card or highlights a concept on the student's study reader in the background without interrupting speech.",
              behavior: Behavior.NON_BLOCKING,
              parameters: {
                type: Type.OBJECT,
                properties: {
                  conceptName: { type: Type.STRING },
                  action: {
                    type: Type.STRING,
                    enum: ["highlight_concept", "open_morph"],
                  },
                  explanation: { type: Type.STRING },
                },
                required: ["conceptName", "action"],
              },
            },
          ],
        },
      ],
    };

    const liveModelName = "gemini-3.8-live";

    try {
      const token = await ai.authTokens.create({
        config: {
          uses: 6,
          expireTime,
          newSessionExpireTime,
          liveConnectConstraints: {
            model: liveModelName,
            config: liveConfig,
          },
        },
      });

      return NextResponse.json({
        token: token.name,
        model: `models/${liveModelName}`,
        expiresAt: expireTime,
        voiceName,
        language,
        noisyPlace: Boolean(noisyPlace),
        systemInstruction: systemInstructionText,
      });
    } catch (tokenErr: unknown) {
      return buildSafeErrorResponse("POST /api/voice/token:authTokens.create", tokenErr, {
        status: 502,
        fallbackMessage:
          "Could not initialize secure live voice session token. Please try again.",
      });
    }
  } catch (error: unknown) {
    logServerError("POST /api/voice/token", error);
    return buildSafeErrorResponse("POST /api/voice/token", error, {
      fallbackMessage: "Failed to initialize live voice session.",
    });
  }
}
