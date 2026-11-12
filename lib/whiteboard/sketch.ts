import { z } from "zod";
import { BeatVectorData } from "@/types/whiteboard-video";
import { callStructuredJson } from "./ai-client";
import {
  SVG_CANVAS_HEIGHT,
  SVG_CANVAS_WIDTH,
  validateAndBuildBeatVectorData,
} from "./svg-paths";

const ScribeStrokeSchema = z.object({
  d: z.string().min(6).max(2000),
  color: z.enum(["#18181B", "#2563EB", "#DC2626"]),
  strokeWidth: z.number().min(2).max(10).optional(),
});

const VectorScribeResponseSchema = z.object({
  strokes: z.array(ScribeStrokeSchema).min(6).max(55),
});

const VECTOR_SCRIBE_JSON_SCHEMA = {
  type: "object",
  properties: {
    strokes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          d: { type: "string" },
          color: { type: "string", enum: ["#18181B", "#2563EB", "#DC2626"] },
          strokeWidth: { type: "number" },
        },
        required: ["d", "color", "strokeWidth"],
      },
    },
  },
  required: ["strokes"],
};

function buildVectorScribePrompt(params: {
  sketchPrompt: string;
  accentOrder: "black-blue-red" | "black-red-blue";
  beatIndex: number;
  hasPreviousAnchor: boolean;
}): string {
  const { sketchPrompt, accentOrder, beatIndex, hasPreviousAnchor } = params;
  const orderRule =
    accentOrder === "black-red-blue"
      ? "Sequence strokes logically: first primary black (#18181B) outlines, next red (#DC2626) pathology/insult/spike, finally blue (#2563EB) rescue/normal correction."
      : "Sequence strokes logically: first primary black (#18181B) anatomy/structures/axes, next blue (#2563EB) normal baseline/flow/therapy, finally red (#DC2626) lesion/obstruction/pathology.";

  const continuityNote =
    hasPreviousAnchor || beatIndex > 0
      ? "Maintain consistent minimalist medical textbook dry-erase whiteboard line weight (strokeWidth 4.5-6.5) matching earlier slides in this lecture."
      : "Establish a crisp minimalist medical textbook dry-erase whiteboard line aesthetic (strokeWidth 4.5-6.5).";

  return `You are Ascleon's Master Whiteboard Vector Illustrator.
Compose ONE clean, expressive, hand-drawn whiteboard marker diagram as an ordered list of SVG path strokes inside a ${SVG_CANVAS_WIDTH}x${SVG_CANVAS_HEIGHT} viewport.

DIAGRAM SUBJECT:
${sketchPrompt}

DRAWING ARCHITECTURE RULES:
1. VIEWPORT & COMPOSITION: Fill the ${SVG_CANVAS_WIDTH}x${SVG_CANVAS_HEIGHT} canvas generously (occupy roughly x: 100..1100, y: 80..816) with clear breathing room. Keep focal elements bold and legible, not tiny.
2. STROKE-BY-STROKE CLARITY: Return 14 to 38 discrete, purposeful SVG path strokes using smooth Bezier curves (C, Q) and clean segments (M, L, H, V, Z). Each path should represent a distinct recognizable line, contour, vessel wall, cellular boundary, organ outline, valve, curve, or arrow.
3. THREE-COLOR MARKER PALETTE ONLY:
   - "#18181B" (Black ink): main anatomical outlines, containers, axes, membranes, structural dividers, neutral pointers.
   - "#2563EB" (Blue ink): normal healthy flow, physiological arrows, protective pathways, therapeutic intervention.
   - "#DC2626" (Red ink): pathology, thrombus/plaque rupture, ischemia, blockage, inflammatory wave, damage highlights, danger markers.
4. COLOR & STROKE SEQUENCING: ${orderRule}
5. ${continuityNote}
6. STROKE WEIGHT: Use strokeWidth 5.5–7 for main structural boundaries, 4–5 for internal details and arrowheads.
7. STRICTLY ZERO EMBEDDED TEXT: NEVER draw letters, words, digits, equations, or handwritten glyphs as paths! Conceptual labels are overlaid separately outside the sketch.
8. Keep every path command strictly standard SVG path syntax (M, L, H, V, Q, C, A, Z). Do NOT return <svg> tags or HTML — ONLY JSON matching the schema.`;
}

export interface GeneratedBeatSketch {
  vectorData: BeatVectorData;
  anchorUpload?: { url: string; rawUrl: string };
  anchorBase64?: string;
}

/**
 * Generates clean 3-color whiteboard marker vector strokes for a beat via Ascleon's AI Vector Scribe
 * and computes exact Bezier arc lengths for real-time pen animation.
 */
export async function generateAndVectorizeBeatSketch(params: {
  videoId: string;
  beatIndex: number;
  sketchPrompt: string;
  accentOrder: "black-blue-red" | "black-red-blue";
  styleAnchorBase64?: string;
}): Promise<GeneratedBeatSketch> {
  const { beatIndex, sketchPrompt, accentOrder, styleAnchorBase64 } = params;
  const prompt = buildVectorScribePrompt({
    sketchPrompt,
    accentOrder,
    beatIndex,
    hasPreviousAnchor: Boolean(styleAnchorBase64),
  });

  const { data } = await callStructuredJson({
    prompt,
    schema: VECTOR_SCRIBE_JSON_SCHEMA,
    temperature: 0.3,
    timeoutMs: 14_000,
    validate: (parsed) => {
      const checked = VectorScribeResponseSchema.parse(parsed);
      return validateAndBuildBeatVectorData(checked.strokes, accentOrder);
    },
  });

  return {
    vectorData: data,
  };
}
