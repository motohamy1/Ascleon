import { buildLanguageDirective, StudyLanguage } from "@/lib/language";
import { callStructuredJson } from "@/lib/whiteboard/ai-client";
import { ResolvedWhiteboardSource } from "@/lib/whiteboard/source";
import {
  ALLOWED_LESSON_ICONS,
  BoardLimits,
  DroppedFactNotice,
  getBoardLimits,
  LessonLink,
  LessonSection,
} from "@/types/lesson-board";
import {
  applyGroundingAndPrune,
  buildLessonOutlineZodSchema,
  isQuoteGroundedInSource,
  RawLessonOutline,
  validateRawLessonOutline,
} from "./validate";

function buildOutlineJsonSchema(limits: BoardLimits) {
  return {
    type: "object",
    properties: {
      title: { type: "string" },
      objective: { type: "string" },
      sections: {
        type: "array",
        minItems: limits.minSections,
        maxItems: limits.maxSections,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            kind: {
              type: "string",
              enum: [
                "concept",
                "mechanism",
                "clinical",
                "diagnosis",
                "management",
                "recap",
              ],
            },
            nodes: {
              type: "array",
              minItems: limits.minNodesPerSection,
              maxItems: limits.maxNodesPerSection,
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  text: { type: "string" },
                  detail: { type: "string" },
                  kind: {
                    type: "string",
                    enum: [
                      "structure",
                      "step",
                      "cause",
                      "effect",
                      "sign",
                      "test",
                      "treatment",
                      "pearl",
                    ],
                  },
                  tone: { type: "string", enum: ["neutral", "normal", "pathology"] },
                  icon: { type: "string", enum: [...ALLOWED_LESSON_ICONS] },
                  trend: { type: "string", enum: ["up", "down", "none"] },
                  source: {
                    type: "object",
                    properties: {
                      page: { type: "integer" },
                      quote: { type: "string" },
                    },
                    required: ["page", "quote"],
                  },
                },
                required: ["id", "text", "kind", "tone", "source"],
              },
            },
            script: {
              type: "array",
              minItems: limits.minSegmentsPerSection,
              maxItems: limits.maxSegmentsPerSection,
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  nodeId: { type: ["string", "null"] },
                  text: { type: "string" },
                },
                required: ["id", "nodeId", "text"],
              },
            },
          },
          required: ["id", "title", "kind", "nodes", "script"],
        },
      },
      links: {
        type: "array",
        maxItems: limits.maxLinks,
        items: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            kind: {
              type: "string",
              enum: ["leads_to", "causes", "contrasts", "treats"],
            },
            label: { type: "string" },
          },
          required: ["from", "to", "kind"],
        },
      },
    },
    required: ["title", "objective", "sections", "links"],
  };
}

async function repairUngroundedNodes(params: {
  source: ResolvedWhiteboardSource;
  language: StudyLanguage;
  outline: RawLessonOutline;
  failedNodeIds: string[];
}): Promise<RawLessonOutline> {
  const { source, language, outline, failedNodeIds } = params;
  if (failedNodeIds.length === 0) return outline;

  const failedSet = new Set(failedNodeIds);
  const badItems: Array<{
    nodeId: string;
    text: string;
    failedQuote: string;
    page: number;
  }> = [];

  for (const sec of outline.sections) {
    for (const node of sec.nodes) {
      if (failedSet.has(node.id)) {
        badItems.push({
          nodeId: node.id,
          text: node.text,
          failedQuote: node.source.quote,
          page: node.source.page,
        });
      }
    }
  }

  const langDirective = buildLanguageDirective(language, "json");
  const prompt = `You are repairing source quotes on a medical whiteboard lesson outline whose quotes did not match SOURCE TEXT verbatim.

BOOK: "${source.bookTitle}"
SOURCE TEXT:
"""
${source.combinedText}
"""

NODES NEEDING VERBATIM SOURCE REPAIR:
${JSON.stringify(badItems, null, 2)}

${langDirective}

REQUIREMENTS:
- Return JSON { "repairs": [ { "nodeId": string, "text": string, "page": number, "quote": string } ] }.
- Each "quote" MUST be copied verbatim (exact substring, 6–26 words) from SOURCE TEXT, and "page" MUST match its [PAGE N] number.
- If you rewrite "text" to stay truthful to the quote, keep it <= 8 words.`;

  const schema = {
    type: "object",
    properties: {
      repairs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nodeId: { type: "string" },
            text: { type: "string" },
            page: { type: "integer" },
            quote: { type: "string" },
          },
          required: ["nodeId", "text", "page", "quote"],
        },
      },
    },
    required: ["repairs"],
  };

  try {
    const { data } = await callStructuredJson({
      prompt,
      schema,
      temperature: 0.1,
      timeoutMs: 12_000,
      validate: (raw) =>
        raw as {
          repairs?: Array<{ nodeId: string; text: string; page: number; quote: string }>;
        },
    });

    if (!Array.isArray(data.repairs)) return outline;
    const repairMap = new Map(data.repairs.map((r) => [r.nodeId, r]));

    return {
      ...outline,
      sections: outline.sections.map((sec) => ({
        ...sec,
        nodes: sec.nodes.map((node) => {
          const rep = repairMap.get(node.id);
          if (!rep || !rep.quote) return node;
          return {
            ...node,
            text: rep.text?.trim() || node.text,
            source: {
              page: Number.isInteger(rep.page) && rep.page > 0 ? rep.page : node.source.page,
              quote: rep.quote.trim(),
            },
          };
        }),
      })),
    };
  } catch (err) {
    console.warn("[board/outline] Grounding repair pass skipped:", err);
    return outline;
  }
}

export interface GeneratedLessonOutline {
  title: string;
  objective: string;
  sections: LessonSection[];
  links: LessonLink[];
  droppedFacts: DroppedFactNotice[];
  limits: BoardLimits;
}

/**
 * Generates a single cohesive, connected clinical LessonBoard outline from resolved book pages.
 * The AI supplies structured language, concepts, links, and teacher script; our code owns all coordinates and timing.
 */
export async function generateLessonOutline(params: {
  source: ResolvedWhiteboardSource;
  language: StudyLanguage;
}): Promise<GeneratedLessonOutline> {
  const { source, language } = params;
  const limits = getBoardLimits(
    source.scope.type,
    source.wordCount,
    source.scope.type === "selection" ? "concise" : "auto"
  );
  const langDirective = buildLanguageDirective(language, "json");

  const prompt = `You are Ascleon's Master Clinical Whiteboard Teacher.
Design ONE cohesive, connected whiteboard lesson map (NOT isolated flashcards) teaching the study material below step by step.

BOOK: "${source.bookTitle}"
SCOPE: ${source.scope.type.toUpperCase()} (Pages ${source.scope.startPage}–${source.scope.endPage}${source.scope.topicTitle ? `, Topic: "${source.scope.topicTitle}"` : ""})

SOURCE TEXT:
"""
${source.combinedText}
"""

${langDirective}

BOARD STRUCTURE & HIERARCHY RULES:
1. OVERALL FRAME: Write a crisp lesson "title" (<= ${limits.maxTitleWords} words) and a 1-sentence learning "objective" (<= ${limits.maxObjectiveWords} words).
2. SECTIONS (${limits.minSections} to ${limits.maxSections}): Organize the topic into a clear clinical teaching progression (e.g., Mechanism -> Clinical Signs -> Diagnosis -> Management, or Concept -> Cause -> Effect -> Pearl). Each section needs a short "id" ("s1", "s2", ...), a short "title" (<= ${limits.maxSectionTitleWords} words), and a "kind".
3. NODES (${limits.minNodesPerSection} to ${limits.maxNodesPerSection} per section): Each node is ONE crisp board point:
   - "id": unique short id like "n1", "n2", ...
   - "text": <= ${limits.maxNodeTextWords} words (scannable board phrase, never a full paragraph!).
   - "detail": optional <= 5-word clinical nuance (e.g. "ST elevation >= 2mm", "1st-line therapy").
   - "kind": "structure" | "step" | "cause" | "effect" | "sign" | "test" | "treatment" | "pearl"
   - "tone": "normal" (blue ink: healthy physiology / normal baseline / treatment), "pathology" (red ink: lesion / abnormal / danger), or "neutral" (black ink: structure / general step).
   - "icon": choose the best clinical icon from: ${ALLOWED_LESSON_ICONS.join(", ")}.
   - "trend": "up", "down", or "none" (use "up"/"down" when showing elevated/decreased lab values, pressure, or biomarkers).
   - "source": { "page": [PAGE N] integer, "quote": EXACT verbatim 6–25 word substring copied directly from SOURCE TEXT }.
4. LINKS (CRITICAL — NO UNRELATED CARDS): Connect nodes meaningfully with "links" ({ "from": nodeId, "to": nodeId, "kind": "leads_to" | "causes" | "contrasts" | "treats", "label"?: 1-2 word verb }). Include links both WITHIN sections AND bridging from the end of one section into the next so the entire board forms one continuous clinical reasoning chain. Every node must participate in the flow.
5. TEACHER SCRIPT (SPOKEN LECTURE, NOT BOOK READING): Inside each section's "script" array (${limits.minSegmentsPerSection} to ${limits.maxSegmentsPerSection} segments):
   - Write natural spoken teaching sentences (10–30 words each, ZERO markdown symbols *, #, \`, NO emojis).
   - Use real teacher signposting ("First, look at...", "Notice how this arrow triggers...", "Compare that with...", "Here's the exam takeaway...").
   - Set "nodeId" to the exact node ID in that section being drawn and explained during that sentence, or "null" for a brief section intro or closing takeaway. Cover every node in the section cleanly!

Return ONLY valid JSON matching the schema.`;

  const jsonSchema = buildOutlineJsonSchema(limits);
  const zodSchema = buildLessonOutlineZodSchema(limits);

  const { data: rawOutline } = await callStructuredJson({
    prompt,
    schema: jsonSchema,
    temperature: 0.2,
    timeoutMs: 20_000,
    validate: (raw) => {
      zodSchema.parse(raw);
      return validateRawLessonOutline(raw, limits);
    },
  });

  // Identify nodes needing verbatim quote repair
  const failedNodeIds: string[] = [];
  for (const sec of rawOutline.sections) {
    for (const node of sec.nodes) {
      if (!isQuoteGroundedInSource(node.source.quote, source.combinedText)) {
        failedNodeIds.push(node.id);
      }
    }
  }

  const repairedOutline =
    failedNodeIds.length > 0
      ? await repairUngroundedNodes({
          source,
          language,
          outline: rawOutline,
          failedNodeIds,
        })
      : rawOutline;

  const validPages = new Set(source.chunks.map((c) => c.pageNumber));
  const { outline: groundedOutline, droppedFacts } = applyGroundingAndPrune({
    outline: repairedOutline,
    sourceText: source.combinedText,
    validPages,
    defaultPage: source.scope.startPage,
  });

  return {
    title: groundedOutline.title,
    objective: groundedOutline.objective,
    sections: groundedOutline.sections,
    links: groundedOutline.links,
    droppedFacts,
    limits,
  };
}
