import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Modality } from "@google/genai";
import { auth } from "@clerk/nextjs/server";
import { buildLanguageDirective, StudyLanguage } from "@/lib/language";
import { DEFAULT_LIVE_VOICE } from "@/lib/voice-config";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    // Allow demo/guest mode if needed or enforce auth
    const body = await req.json().catch(() => ({}));
    const {
      bookTitle = "Medical Study Document",
      pageNumber = 1,
      pageText = "",
      selectedText = "",
      authoritativeReferences = [],
      language = "en",
      voiceName = DEFAULT_LIVE_VOICE,
      resumptionHandle = null,
      isResuming = false,
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

    const referencesContext = Array.isArray(authoritativeReferences) && authoritativeReferences.length > 0
      ? `\nCanonical Textbook References: ${authoritativeReferences
          .map((r: any) => (typeof r === "string" ? r : r.source || r.title))
          .filter(Boolean)
          .join(", ")}`
      : "";

    const activeText = (selectedText || pageText || "").slice(0, 3000);

    const langDirective = buildLanguageDirective(language as StudyLanguage, "voice");

    const systemInstructionText = `You are Ascleon's elite 1-on-1 AI Live Oral Mentor. You are conducting an interactive, natural, humanoid clinical oral tutorial with a student who is actively reading Page ${pageNumber} of "${bookTitle}".

ACTIVE PAGE PASSAGE:
"""
${activeText}
"""${referencesContext}

${langDirective}

PEDAGOGICAL & ORAL CONVERSATION RULES:
1. Short, Dynamic Turns: Keep every spoken response concise (2-4 sentences max, ~15-25 seconds of speech). Never deliver a monologue or lecture wall of text.
2. Socratic & Interactive: Always finish your turn with an engaging follow-up question or clinical check ("What do you think is the next step?", "Notice why that happens?").
3. Grounding: Rely strictly on the active page facts and gold-standard surgical/medical principles. Never hallucinate fake clinical findings.
4. Spoken delivery:
   - Speak naturally like a brilliant senior clinician sitting next to the student.
   - Use warm, engaging inflection.
   - NO markdown asterisks (*), hashtags (#), brackets, or emojis in your speech — your output is directly streamed as native voice!
5. Visual Grounding ("Show while explaining"):
   - When introducing a pivotal mechanism, anatomical structure, or diagnostic pathway, you can invoke the 'show_concept_on_page' tool.
   - This sends a visual signal to the student's screen in the background while you continue speaking seamlessly.`;

    const liveConfig: any = {
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
      // Real-time voice activity detection & barge-in tuning (tuned for clear voice isolation)
      realtimeInputConfig: {
        automaticActivityDetection: {
          startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
          endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
          prefixPaddingMs: 250,
          silenceDurationMs: 900,
        },
      },
      // Enable seamless session resumption when pausing & resuming calls
      sessionResumption: resumptionHandle ? { handle: resumptionHandle } : {},
      // Authorize both incoming student speech and AI speech transcriptions in the constrained token
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      tools: [
        {
          functionDeclarations: [
            {
              name: "show_concept_on_page",
              description:
                "Displays a visual concept card or highlights a concept on the student's study reader in the background without interrupting speech.",
              behavior: "NON_BLOCKING",
              parameters: {
                type: "OBJECT",
                properties: {
                  conceptName: {
                    type: "STRING",
                    description: "Name of the clinical concept or structure to highlight",
                  },
                  action: {
                    type: "STRING",
                    enum: ["highlight_concept", "open_morph"],
                    description: "Whether to highlight the concept or open Morph view",
                  },
                  explanation: {
                    type: "STRING",
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

    try {
      const token = await ai.authTokens.create({
        config: {
          uses: 1,
          expireTime,
          newSessionExpireTime,
          liveConnectConstraints: {
            model: "gemini-3.8-live",
            config: liveConfig,
          },
        },
      });

      return NextResponse.json({
        token: token.name,
        model: "gemini-3.8-live",
        expiresAt: expireTime,
        voiceName,
        language,
        systemInstruction: systemInstructionText,
      });
    } catch (tokenErr: any) {
      console.warn("Live ephemeral token constraint creation note:", tokenErr?.message);
      // Fallback: create unconstrained ephemeral token if fine-grained constraints fail on tier
      try {
        const simpleToken = await ai.authTokens.create({
          config: {
            uses: 1,
            expireTime,
            newSessionExpireTime,
          },
        });
        return NextResponse.json({
          token: simpleToken.name,
          model: "gemini-3.8-live",
          expiresAt: expireTime,
          voiceName,
          language,
          systemInstruction: systemInstructionText,
        });
      } catch (fallbackErr: any) {
        console.error("Ephemeral token creation failed:", fallbackErr?.message);
        return NextResponse.json(
          {
            error: "Unable to create ephemeral live session token",
            details: fallbackErr?.message || tokenErr?.message,
          },
          { status: 500 }
        );
      }
    }
  } catch (error: any) {
    console.error("Voice token generation error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to initialize live voice session" },
      { status: 500 }
    );
  }
}
