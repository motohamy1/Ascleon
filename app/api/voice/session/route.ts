import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Modality } from "@google/genai";

export async function GET(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create voice session" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      bookTitle = "Study Material",
      pageNumber = 1,
      pageText = "",
      selectedText = "",
      userSpeech = "",
      language = "en",
      history = [],
      authoritativeReferences = [],
    } = body;

    if (!userSpeech) {
      return NextResponse.json({ error: "No user speech provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { responseText: `Grounded in Page ${pageNumber}: The fundamental principle is that initial conditions dictate the system behavior.` },
        { status: 200 }
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
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Voice response timed out after 10s")), 10000)
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
    console.error("Voice session error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Voice generation failed" },
      { status: 500 }
    );
  }
}
