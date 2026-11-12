import { z } from "zod";
import { buildLanguageDirective, StudyLanguage } from "@/lib/language";
import { BeatLabel, BoardSlot, WhiteboardBeat } from "@/types/whiteboard-video";
import { callStructuredJson } from "./ai-client";
import { ResolvedWhiteboardSource } from "./source";

const BeatLabelSchema = z.object({
  id: z.string(),
  text: z.string().min(1).max(60),
  tone: z.enum(["neutral", "pathology", "normal"]),
  x: z.number().min(6).max(94),
  y: z.number().min(10).max(90),
  align: z.enum(["start", "center", "end"]).optional(),
});

const PlannedBeatSchema = z.object({
  title: z.string().min(2).max(120),
  narration: z.string().min(20).max(900),
  spokenStyleHint: z.string().min(3).max(120),
  sourceQuote: z.string().min(8).max(360),
  sourcePage: z.number().int().min(1),
  sketchPrompt: z.string().min(20).max(600),
  accentOrder: z.enum(["black-blue-red", "black-red-blue"]),
  labels: z.array(BeatLabelSchema).min(1).max(4),
});

const PlannedScriptSchema = z.object({
  videoTitle: z.string().min(3).max(120),
  summary: z.string().min(10).max(320),
  beats: z.array(PlannedBeatSchema).min(2).max(14),
});

type PlannedBeat = z.infer<typeof PlannedBeatSchema>;

const BEAT_ITEM_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    narration: { type: "string" },
    spokenStyleHint: { type: "string" },
    sourceQuote: { type: "string" },
    sourcePage: { type: "integer" },
    sketchPrompt: { type: "string" },
    accentOrder: { type: "string", enum: ["black-blue-red", "black-red-blue"] },
    labels: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          tone: { type: "string", enum: ["neutral", "pathology", "normal"] },
          x: { type: "number" },
          y: { type: "number" },
          align: { type: "string", enum: ["start", "center", "end"] },
        },
        required: ["id", "text", "tone", "x", "y"],
      },
    },
  },
  required: [
    "title",
    "narration",
    "spokenStyleHint",
    "sourceQuote",
    "sourcePage",
    "sketchPrompt",
    "accentOrder",
    "labels",
  ],
};

function buildScriptJsonSchema(minBeats: number, maxBeats: number) {
  return {
    type: "object",
    properties: {
      videoTitle: { type: "string" },
      summary: { type: "string" },
      beats: {
        type: "array",
        minItems: minBeats,
        maxItems: maxBeats,
        items: BEAT_ITEM_SCHEMA,
      },
    },
    required: ["videoTitle", "summary", "beats"],
  };
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Verifies that a beat's sourceQuote exists verbatim or with strong phrase overlap in the resolved source.
 */
export function isQuoteGrounded(quote: string, sourceText: string): boolean {
  const normQuote = normalizeForMatch(quote);
  const normSource = normalizeForMatch(sourceText);
  if (!normQuote || !normSource) return false;

  if (normSource.includes(normQuote)) return true;

  // Fallback: verify contiguous 4-word anchor or >= 65% content-word presence
  const tokens = normQuote.split(" ").filter((t) => t.length >= 3);
  if (tokens.length === 0) return false;

  if (tokens.length >= 4) {
    for (let i = 0; i <= tokens.length - 4; i++) {
      const windowPhrase = tokens.slice(i, i + 4).join(" ");
      if (normSource.includes(windowPhrase)) return true;
    }
  }

  let matched = 0;
  for (const token of tokens) {
    if (normSource.includes(token)) matched++;
  }
  return matched / tokens.length >= 0.65;
}

/**
 * Arranges beat frames on an infinite virtual 2D board with generous spacing so camera pans never clip neighbors.
 */
export function computeBoardSlots(count: number): BoardSlot[] {
  const cols = count <= 3 ? count : Math.min(4, Math.ceil(Math.sqrt(count * 1.4)));
  const cellW = 2120;
  const cellH = 1280;
  const slots: BoardSlot[] = [];

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    slots.push({
      x: col * cellW,
      y: row * cellH,
      width: 1920,
      height: 1080,
    });
  }
  return slots;
}

/**
 * Clamps label anchors onto clean board margins around the central 4:3 sketch zone so labels never collide.
 */
function sanitizeLabels(rawLabels: BeatLabel[]): BeatLabel[] {
  // Keep sketch centered left/center-ish (approx x: 8..68%, y: 14..88%) and callout column/anchors crisp
  const slots: Array<{ x: number; y: number; align: "start" | "center" | "end" }> = [
    { x: 73, y: 20, align: "start" },
    { x: 73, y: 40, align: "start" },
    { x: 73, y: 60, align: "start" },
    { x: 73, y: 80, align: "start" },
  ];

  return rawLabels.slice(0, 4).map((lbl, idx) => {
    // Allow model x/y if placed in right rail or top/bottom border, otherwise snap cleanly to right-rail slots
    const inRightRail = lbl.x >= 68 && lbl.x <= 92 && lbl.y >= 14 && lbl.y <= 88;
    const inTopOrBottom = lbl.x >= 10 && lbl.x <= 64 && (lbl.y <= 16 || lbl.y >= 84);
    const fallback = slots[idx] || slots[0];
    return {
      id: lbl.id || `lbl-${idx + 1}`,
      text: lbl.text.trim(),
      tone: lbl.tone,
      x: inRightRail || inTopOrBottom ? lbl.x : fallback.x,
      y: inRightRail || inTopOrBottom ? lbl.y : fallback.y,
      align: lbl.align || (inRightRail ? "start" : inTopOrBottom ? "center" : fallback.align),
    };
  });
}

function cleanSpokenText(text: string): string {
  return text
    .replace(/[*_`#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function repairUngroundedBeats(
  source: ResolvedWhiteboardSource,
  language: StudyLanguage,
  allBeats: PlannedBeat[],
  ungroundedIndices: number[]
): Promise<PlannedBeat[]> {
  const langDirective = buildLanguageDirective(language, "json");
  const badList = ungroundedIndices.map((idx) => ({
    index: idx,
    title: allBeats[idx].title,
    failedQuote: allBeats[idx].sourceQuote,
  }));

  const prompt = `You are repairing specific beats in a whiteboard video script whose sourceQuote did not match the source text verbatim.

BOOK: "${source.bookTitle}"
SOURCE TEXT:
"""
${source.combinedText}
"""

BEATS NEEDING GROUNDED REPAIR:
${JSON.stringify(badList, null, 2)}

${langDirective}

REQUIREMENTS:
- Return JSON { "repaired": [ { "index": number, ...same beat fields... } ] }.
- Each "sourceQuote" MUST be copied verbatim (exact substring) from SOURCE TEXT above, and "sourcePage" MUST match its [PAGE N] number.
- Keep "narration" faithful to that quote, with zero markdown symbols (*, #, \`).
- Keep "sketchPrompt" strictly visual (no text inside the image, black ink + blue normal + red pathology).`;

  const repairSchema = {
    type: "object",
    properties: {
      repaired: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" },
            ...BEAT_ITEM_SCHEMA.properties,
          },
          required: ["index", ...BEAT_ITEM_SCHEMA.required],
        },
      },
    },
    required: ["repaired"],
  };

  try {
    const { data: parsed } = await callStructuredJson({
      prompt,
      schema: repairSchema,
      timeoutMs: 12_000,
      validate: (raw) =>
        raw as { repaired?: Array<PlannedBeat & { index: number }> },
    });
    if (Array.isArray(parsed.repaired)) {
      const next = [...allBeats];
      for (const item of parsed.repaired) {
        if (
          typeof item.index === "number" &&
          item.index >= 0 &&
          item.index < next.length &&
          PlannedBeatSchema.safeParse(item).success
        ) {
          next[item.index] = item;
        }
      }
      return next;
    }
  } catch (err) {
    console.warn("[whiteboard/script] Grounding repair pass skipped:", err);
  }
  return allBeats;
}

/**
 * Generates a grounded, multi-beat whiteboard video storyboard from resolved study source text.
 */
export async function generateWhiteboardScript(params: {
  source: ResolvedWhiteboardSource;
  language: StudyLanguage;
}): Promise<{
  videoTitle: string;
  summary: string;
  beats: WhiteboardBeat[];
}> {
  const { source, language } = params;
  const langDirective = buildLanguageDirective(language, "json");
  const { minBeats, maxBeats, recommendedBeats } = source.beatBudget;

  const prompt = `You are Ascleon's Whiteboard Video Director.
Transform the study material below into a cohesive whiteboard explainer storyboard consisting of ${minBeats} to ${maxBeats} sequential visual beats (aim near ${recommendedBeats} beats unless the text genuinely needs fewer or more within [${minBeats}, ${maxBeats}]).

BOOK: "${source.bookTitle}"
SCOPE: ${source.scope.type.toUpperCase()} (Pages ${source.scope.startPage}–${source.scope.endPage}${source.scope.topicTitle ? `, Topic: "${source.scope.topicTitle}"` : ""})

SOURCE TEXT:
"""
${source.combinedText}
"""

${langDirective}

STRICT SCRIPT & VISUAL RULES:
1. GROUNDING: Every beat MUST correspond directly to facts in SOURCE TEXT. "sourceQuote" MUST be an exact verbatim substring from SOURCE TEXT (8–28 words) and "sourcePage" MUST be its [PAGE N] integer.
2. NARRATION: Write natural spoken narration (25–55 words per beat, ~10–18 seconds spoken) matching the language directive above. Use plain spoken prose ONLY — NO markdown (*, #, \`), NO bullet symbols, NO emojis. Transitions between beats should flow smoothly like one continuous lecture.
3. SPOKEN STYLE HINT: Write a concise 3–6 word English delivery note for TTS prosody (e.g. "warm, clear teaching cadence").
4. SKETCH PROMPT (CRITICAL): Describe ONE clean, concrete educational whiteboard drawing for the illustrator in English. Specify what is drawn with:
   - black marker (primary anatomy, structures, vessels, arrows, graphs),
   - blue marker ONLY for normal physiology / healthy baseline / treatment,
   - red marker ONLY for pathology / damage / obstruction / abnormal spike.
   NEVER ask for any words, letters, numbers, captions, or labels inside the illustration!
5. ACCENT ORDER: Use "black-blue-red" if normal baseline precedes pathology, or "black-red-blue" if pathology/insult comes first before treatment/resolution.
6. LABELS (1–4 per beat): Short handwritten callout labels (1–4 words each, localized cleanly in the target study language; keep medical terms crisp). Set "tone" to "neutral", "pathology", or "normal". Place labels cleanly in the right callout column (x: 70–88, y: 18–84) so they never overlap the sketch.
7. ARRAY LENGTH REQUIREMENT: "beats" MUST contain AT LEAST ${minBeats} and AT MOST ${maxBeats} beat items (NEVER return fewer than ${minBeats} beats). Aim near ${recommendedBeats} beats.

Return ONLY valid JSON matching the schema.`;

  const { data: validated } = await callStructuredJson({
    prompt,
    schema: buildScriptJsonSchema(minBeats, maxBeats),
    temperature: 0.2,
    timeoutMs: 15_000,
    validate: (raw) => PlannedScriptSchema.parse(raw),
  });

  // Verify quote grounding and repair any ungrounded beats once
  const ungroundedIndices: number[] = [];
  validated.beats.forEach((beat, idx) => {
    if (!isQuoteGrounded(beat.sourceQuote, source.combinedText)) {
      ungroundedIndices.push(idx);
    }
  });

  const finalPlannedBeats =
    ungroundedIndices.length > 0
      ? await repairUngroundedBeats(source, language, validated.beats, ungroundedIndices)
      : validated.beats;

  const validPages = new Set(source.chunks.map((c) => c.pageNumber));
  const defaultPage = source.scope.startPage;
  const slots = computeBoardSlots(finalPlannedBeats.length);

  const beats: WhiteboardBeat[] = finalPlannedBeats.map((b, index) => ({
    index,
    title: b.title.trim(),
    narration: cleanSpokenText(b.narration),
    spokenStyleHint: b.spokenStyleHint.trim(),
    sourceQuote: b.sourceQuote.trim(),
    sourcePage: validPages.has(b.sourcePage) ? b.sourcePage : defaultPage,
    sketchPrompt: b.sketchPrompt.trim(),
    accentOrder: b.accentOrder,
    labels: sanitizeLabels(b.labels),
    boardSlot: slots[index],
    vectorStatus: "planned",
  }));

  return {
    videoTitle: validated.videoTitle.trim(),
    summary: validated.summary.trim(),
    beats,
  };
}
