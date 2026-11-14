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
import { buildLanguageDirective, StudyLanguage } from "@/lib/language";
import { DEFAULT_LIVE_VOICE } from "@/lib/voice-config";
import { checkVoiceBudget } from "@/lib/usage.server";

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

    const body = await req.json().catch(() => ({}));
    const {
      bookTitle = "Medical Study Document",
      pageNumber = 1,
      pageText = "",
      selectedText = "",
      authoritativeReferences = [],
      language = "en",
      voiceName = DEFAULT_LIVE_VOICE,
      noisyPlace = false,
      resumptionHandle = null,
    } = body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY on server environment" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();

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
4. Visual Grounding & Page Highlights:
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
              name: "show_concept_on_page",
              description:
                "Displays a visual concept card or highlights a concept on the student's study reader in the background without interrupting speech.",
              behavior: Behavior.NON_BLOCKING,
              parameters: {
                type: Type.OBJECT,
                properties: {
                  conceptName: {
                    type: Type.STRING,
                    description: "Name of the clinical concept or structure to highlight",
                  },
                  action: {
                    type: Type.STRING,
                    enum: ["highlight_concept", "open_morph"],
                    description: "Whether to highlight the concept or open Morph view",
                  },
                  explanation: {
                    type: Type.STRING,
                    description: "One short sentence explaining why this is highlighted",
                  },
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
          uses: 1,
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
      const msg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
      console.error("[voice/token] Ephemeral token creation failed:", msg);
      return NextResponse.json(
        {
          error: "Could not initialize secure live voice session token. Please try again.",
        },
        { status: 502 }
      );
    }
  } catch (error: unknown) {
    console.error("[voice/token] Unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to initialize live voice session." },
      { status: 500 }
    );
  }
}
