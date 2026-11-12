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
      // Real-time voice activity detection tuned for clear voice isolation & instant barge-in
      realtimeInputConfig: {
        automaticActivityDetection: {
          startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
          endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
          prefixPaddingMs: 200,
          silenceDurationMs: 450,
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
          model: `models/${liveModelName}`,
          expiresAt: expireTime,
          voiceName,
          language,
          systemInstruction: systemInstructionText,
        });
      } catch (fallbackErr: any) {
        console.warn("Ephemeral token creation failed, using direct session key fallback:", fallbackErr?.message);
        // Direct key fallback for Google AI Studio keys that do not have authTokens IAM privilege
        return NextResponse.json({
          directApiKey: apiKey,
          model: `models/${liveModelName}`,
          expiresAt: expireTime,
          voiceName,
          language,
          systemInstruction: systemInstructionText,
        });
      }
    }
  } catch (error: any) {
    console.error("Voice token generation error:", error);
    return NextResponse.json(
      {
        fallbackSpeech: true,
        message: "Live WebSocket initialization deferred; browser speech fallback active.",
      },
      { status: 200 }
    );
  }
}
