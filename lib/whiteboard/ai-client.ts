const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

const COOLDOWN_MS = 180_000;
const DAILY_QUOTA_COOLDOWN_MS = 1_800_000;
const modelCooldownUntil = new Map<string, number>();

export function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    throw new Error("GEMINI_API_KEY is missing or unconfigured on the server.");
  }
  return apiKey;
}

/**
 * Strips markdown code fences and extracts the top-level JSON payload.
 */
export function parseJsonStrict(raw: string): unknown {
  let clean = raw.trim();
  clean = clean.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
  clean = clean.replace(/\s*```$/i, "").trim();

  try {
    return JSON.parse(clean);
  } catch {
    const objStart = clean.indexOf("{");
    const objEnd = clean.lastIndexOf("}");
    if (objStart !== -1 && objEnd > objStart) {
      return JSON.parse(clean.slice(objStart, objEnd + 1));
    }
    throw new Error("Model output did not contain valid JSON.");
  }
}

interface InteractionOutputPart {
  type?: string;
  text?: string;
  data?: string;
}

interface InteractionStep {
  type?: string;
  content?: InteractionOutputPart[];
}

interface InteractionRestResponse {
  output_text?: string;
  output_audio?: { data?: string };
  outputs?: InteractionOutputPart[];
  steps?: InteractionStep[];
  error?: { message?: string; code?: number };
}

function findInteractionPart(
  payload: InteractionRestResponse | undefined,
  partType: "text" | "audio"
): InteractionOutputPart | undefined {
  if (!payload) return undefined;
  const fromSteps = payload.steps
    ?.flatMap((step) => step.content || [])
    .find((part) => part?.type === partType);
  if (fromSteps) return fromSteps;
  return payload.outputs?.find((part) => part?.type === partType);
}

interface GenerateContentRestResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string; code?: number };
}

function isCoolingDown(key: string): boolean {
  const until = modelCooldownUntil.get(key);
  return typeof until === "number" && until > Date.now();
}

function markCooldown(key: string, durationMs = COOLDOWN_MS): void {
  modelCooldownUntil.set(key, Date.now() + durationMs);
}

function markCooldownFromError(key: string, errMsg: string): void {
  const lower = errMsg.toLowerCase();
  if (lower.includes("perday") || lower.includes("per_day") || lower.includes("limit: 20") || lower.includes("limit: 0")) {
    markCooldown(key, DAILY_QUOTA_COOLDOWN_MS);
  } else if (
    lower.includes("429") ||
    lower.includes("503") ||
    lower.includes("500") ||
    lower.includes("timeout") ||
    lower.includes("aborted")
  ) {
    markCooldown(key, COOLDOWN_MS);
  }
}

function clearCooldown(key: string): void {
  modelCooldownUntil.delete(key);
}

async function callGeminiGenerateContentJson(params: {
  apiKey: string;
  model: string;
  prompt: string;
  schema: Record<string, unknown>;
  temperature: number;
  timeoutMs: number;
}): Promise<string> {
  const { apiKey, model, prompt, schema, temperature, timeoutMs } = params;
  const resp = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const payload = (await resp.json().catch(() => ({}))) as GenerateContentRestResponse;
  if (!resp.ok) {
    if (resp.status === 429 || resp.status === 503 || resp.status === 500) {
      markCooldown(`gc:${model}`);
    }
    const msg = payload?.error?.message || `HTTP ${resp.status}`;
    throw new Error(`Gemini ${model} failed (${resp.status}): ${msg}`);
  }

  clearCooldown(`gc:${model}`);
  const text =
    payload?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("")
      .trim() || "";
  if (!text) {
    throw new Error(`Gemini ${model} returned empty text.`);
  }
  return text;
}

async function callGeminiInteractionJson(params: {
  apiKey: string;
  model: string;
  prompt: string;
  schema: Record<string, unknown>;
  timeoutMs: number;
}): Promise<string> {
  const { apiKey, model, prompt, schema, timeoutMs } = params;
  const resp = await fetch(`${GEMINI_BASE}/interactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      input: prompt,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema,
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const payload = (await resp.json().catch(() => ({}))) as InteractionRestResponse;
  if (!resp.ok) {
    if (resp.status === 429 || resp.status === 503 || resp.status === 500) {
      markCooldown(`ix:${model}`);
    }
    const msg = payload?.error?.message || `HTTP ${resp.status}`;
    throw new Error(`Gemini interaction ${model} failed (${resp.status}): ${msg}`);
  }

  clearCooldown(`ix:${model}`);
  const fromParts = findInteractionPart(payload, "text")?.text || "";
  const text = (payload?.output_text || fromParts).trim();
  if (!text) {
    throw new Error(`Gemini interaction ${model} returned empty text.`);
  }
  return text;
}

async function callGroqJson(params: {
  apiKey: string;
  model: string;
  prompt: string;
  schema: Record<string, unknown>;
  temperature: number;
  timeoutMs: number;
}): Promise<string> {
  const { apiKey, model, prompt, schema, temperature, timeoutMs } = params;
  const resp = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Return ONLY valid JSON conforming strictly to this JSON Schema:\n${JSON.stringify(schema)}`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const payload = (await resp.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!resp.ok) {
    if (resp.status === 429 || resp.status >= 500) {
      markCooldown(`groq:${model}`);
    }
    const msg = payload?.error?.message || `HTTP ${resp.status}`;
    throw new Error(`Groq ${model} failed (${resp.status}): ${msg}`);
  }

  clearCooldown(`groq:${model}`);
  const text = (payload?.choices?.[0]?.message?.content || "").trim();
  if (!text) {
    throw new Error(`Groq ${model} returned empty JSON.`);
  }
  return text;
}

type ProviderAttempt = {
  key: string;
  run: () => Promise<string>;
};

/**
 * Runs a structured JSON completion across Gemini REST + Groq with bounded per-provider timeouts
 * (avoiding @google/genai's silent 300s backoff hangs on transient 429/503 responses).
 */
export async function callStructuredJson<T>(params: {
  prompt: string;
  schema: Record<string, unknown>;
  validate: (parsed: unknown) => T;
  temperature?: number;
  timeoutMs?: number;
}): Promise<{ data: T; model: string }> {
  const { prompt, schema, validate, temperature = 0.25, timeoutMs = 18_000 } = params;
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const hasGemini = Boolean(geminiKey && geminiKey !== "your_gemini_api_key_here");
  const hasGroq = Boolean(groqKey && groqKey.trim().length > 0);
  if (!hasGemini && !hasGroq) {
    throw new Error("Neither GEMINI_API_KEY nor GROQ_API_KEY is configured on the server.");
  }

  const attempts: ProviderAttempt[] = [];
  if (hasGemini && geminiKey) {
    for (const model of ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]) {
      attempts.push({
        key: `gc:${model}`,
        run: () =>
          callGeminiGenerateContentJson({
            apiKey: geminiKey,
            model,
            prompt,
            schema,
            temperature,
            timeoutMs,
          }),
      });
    }
  }

  if (hasGroq && groqKey) {
    for (const model of ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]) {
      attempts.push({
        key: `groq:${model}`,
        run: () =>
          callGroqJson({
            apiKey: groqKey,
            model,
            prompt,
            schema,
            temperature,
            timeoutMs,
          }),
      });
    }
  }

  if (hasGemini && geminiKey) {
    for (const model of ["gemini-3.6-flash", "gemini-3.5-flash"]) {
      attempts.push({
        key: `gc:${model}`,
        run: () =>
          callGeminiGenerateContentJson({
            apiKey: geminiKey,
            model,
            prompt,
            schema,
            temperature,
            timeoutMs: Math.min(timeoutMs, 12_000),
          }),
      });
    }
    attempts.push({
      key: "ix:gemini-3.8-flash",
      run: () =>
        callGeminiInteractionJson({
          apiKey: geminiKey,
          model: "gemini-3.8-flash",
          prompt,
          schema,
          timeoutMs: Math.min(timeoutMs, 12_000),
        }),
    });
  }

  // Try non-cooled candidates first, then cooled ones if every model hit recent 429/503
  const ordered = [
    ...attempts.filter((a) => !isCoolingDown(a.key)),
    ...attempts.filter((a) => isCoolingDown(a.key)),
  ];

  const errors: string[] = [];
  for (const candidate of ordered) {
    try {
      const raw = await candidate.run();
      const parsed = parseJsonStrict(raw);
      const validated = validate(parsed);
      clearCooldown(candidate.key);
      return { data: validated, model: candidate.key };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      markCooldownFromError(candidate.key, msg);
      errors.push(`${candidate.key}: ${msg}`);
    }
  }

  throw new Error(`All AI JSON providers failed (${errors.slice(0, 3).join(" | ")})`);
}

async function requestGeminiTtsModel(params: {
  apiKey: string;
  model: string;
  text: string;
  style: string;
  voiceId: string;
  timeoutMs: number;
}): Promise<Buffer> {
  const { apiKey, model, text, style, voiceId, timeoutMs } = params;
  const resp = await fetch(`${GEMINI_BASE}/interactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          type: "user_input",
          content: [
            {
              type: "text",
              text,
              annotations: [{ type: "speech_metadata", style }],
            },
          ],
        },
      ],
      response_format: {
        type: "audio",
        mime_type: "audio/wav",
        sample_rate: 24000,
      },
      generation_config: {
        speech_config: [{ voice: voiceId }],
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const payload = (await resp.json().catch(() => ({}))) as InteractionRestResponse;
  if (!resp.ok) {
    const msg = payload?.error?.message || `HTTP ${resp.status}`;
    if (resp.status === 503 || resp.status === 500) {
      markCooldown(`tts:${model}`, 35_000);
    }
    throw new Error(`HTTP ${resp.status}: ${msg}`);
  }

  clearCooldown(`tts:${model}`);
  const base64 =
    payload?.output_audio?.data ||
    findInteractionPart(payload, "audio")?.data;

  if (!base64) {
    throw new Error("TTS response contained no audio payload.");
  }

  const wavBuffer = Buffer.from(base64, "base64");
  if (wavBuffer.length <= 44) {
    throw new Error("TTS returned an empty WAV payload.");
  }
  return wavBuffer;
}

/**
 * Synthesizes 24kHz mono WAV speech via Gemini TTS REST with fail-fast timeout,
 * model fallback, and a brief RPM-burst backoff retry on transient 429.
 */
export async function callGeminiTtsAudio(params: {
  text: string;
  style: string;
  voiceId: string;
  timeoutMs?: number;
}): Promise<Buffer> {
  const { text, style, voiceId, timeoutMs = 24_000 } = params;
  const apiKey = getGeminiApiKey();

  const models = ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"];
  const ordered = [
    ...models.filter((m) => !isCoolingDown(`tts:${m}`)),
    ...models.filter((m) => isCoolingDown(`tts:${m}`)),
  ];

  const errors: string[] = [];
  let sawRateLimit = false;
  for (const model of ordered) {
    try {
      return await requestGeminiTtsModel({ apiKey, model, text, style, voiceId, timeoutMs });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429")) sawRateLimit = true;
      errors.push(`${model}: ${msg}`);
    }
  }

  if (sawRateLimit) {
    await new Promise((r) => setTimeout(r, 3200));
    try {
      return await requestGeminiTtsModel({
        apiKey,
        model: ordered[0],
        text,
        style,
        voiceId,
        timeoutMs,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${ordered[0]}-retry: ${msg}`);
    }
  }

  throw new Error(`TTS synthesis failed (${errors.join(" | ")})`);
}
