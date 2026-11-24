import { buildLanguageDirective, StudyLanguage } from "@/lib/language";
import { callStructuredJson } from "@/lib/whiteboard/ai-client";
import { ResolvedWhiteboardSource } from "@/lib/whiteboard/source";
import {
  ALLOWED_LESSON_ICONS,
  ANATOMY_RIG_MODELS,
  BoardLimits,
  DroppedFactNotice,
  getBoardLimits,
  LessonLink,
  LessonSection,
  PROCEDURAL_3D_BLUEPRINTS,
} from "@/types/lesson-board";
import { resolveGuaranteedLabScene } from "./math-presets";
import {
  applySoftGroundingAndEnrich,
  healRawLessonOutline,
  isQuoteGroundedInSource,
  RawLessonOutline,
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
            ops: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  t: {
                    type: "string",
                    enum: [
                      "title",
                      "write",
                      "bullets",
                      "term",
                      "flow",
                      "compare",
                      "cycle",
                      "timeline",
                      "formula",
                      "function_plot",
                      "data_chart",
                      "source_figure",
                    ],
                  },
                  title: { type: "string" },
                  expr: { type: "string" },
                  xRange: { type: "array", items: { type: "number" } },
                  yRange: { type: "array", items: { type: "number" } },
                  xLabel: { type: "string" },
                  yLabel: { type: "string" },
                  highlightPoints: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        x: { type: "number" },
                        label: { type: "string" },
                      },
                    },
                  },
                  chartType: { type: "string", enum: ["bar", "pie"] },
                  chartItems: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string" },
                        value: { type: "number" },
                        tone: { type: "string" },
                      },
                    },
                  },
                  unit: { type: "string" },
                  caption: { type: "string" },
                  page: { type: "integer" },
                  callouts: { type: "array", items: { type: "string" } },
                  text: { type: "string" },
                  subtitle: { type: "string" },
                  heading: { type: "string" },
                  items: { type: "array", items: { type: "string" } },
                  term: { type: "string" },
                  definition: { type: "string" },
                  tex: { type: "string" },
                  label: { type: "string" },
                  leftTitle: { type: "string" },
                  rightTitle: { type: "string" },
                  rows: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        left: { type: "string" },
                        right: { type: "string" },
                      },
                    },
                  },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string" },
                        sub: { type: "string" },
                        tone: { type: "string" },
                        nodeId: { type: "string" },
                      },
                    },
                  },
                  nodes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string" },
                        tone: { type: "string" },
                        nodeId: { type: "string" },
                      },
                    },
                  },
                  events: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        time: { type: "string" },
                        label: { type: "string" },
                        tone: { type: "string" },
                        nodeId: { type: "string" },
                      },
                    },
                  },
                  tone: { type: "string" },
                  wash: { type: "string" },
                  emphasis: { type: "string" },
                  nodeId: { type: "string" },
                },
                required: ["t"],
              },
            },
            labScene: {
              type: "object",
              properties: {
                tier: {
                  type: "string",
                  enum: [
                    "glb-anatomy",
                    "molecule-3d",
                    "anatomy-rig",
                    "procedural-3d",
                    "interactive-sim",
                    "smart-diagram-3d",
                    "none",
                  ],
                },
                title: { type: "string" },
                compoundName: { type: "string" },
                model: { type: "string", enum: [...ANATOMY_RIG_MODELS] },
                blueprint: { type: "string", enum: [...PROCEDURAL_3D_BLUEPRINTS] },
                cam: { type: "string", enum: ["front", "side", "iso", "top"] },
                presetId: { type: "string" },
                xLabel: { type: "string" },
                yLabel: { type: "string" },
                fxy: { type: "string" },
                readoutLabel: { type: "string" },
                highlight: { type: "array", items: { type: "string" } },
                labels: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      label: { type: "string" },
                      labelAr: { type: "string" },
                      tone: { type: "string" },
                    },
                  },
                },
              },
              required: ["tier", "title"],
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
 * Generates a single cohesive, connected clinical Living Board (2D handwritten ops + 4-tier 3D Lab + script).
 * Zero-throw auto-healing ensures minor LLM formatting hiccups never break generation.
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

  const prompt = `You are Ascleon's Master Clinical Whiteboard & 3D Lab Teacher.
Design ONE cohesive, connected whiteboard + 3D interactive lesson teaching the study material below step by step.

BOOK: "${source.bookTitle}"
SCOPE: ${source.scope.type.toUpperCase()} (Pages ${source.scope.startPage}–${source.scope.endPage}${source.scope.topicTitle ? `, Topic: "${source.scope.topicTitle}"` : ""})

SOURCE TEXT:
"""
${source.combinedText}
"""

${langDirective}

BOARD & 3D LAB RULES:
1. OVERALL FRAME: Crisp lesson "title" (<= ${limits.maxTitleWords} words) and 1-sentence "objective" (<= ${limits.maxObjectiveWords} words).
2. SECTIONS (${limits.minSections} to ${limits.maxSections}): Clear clinical teaching progression. Each section needs "id", "title" (<= ${limits.maxSectionTitleWords} words), "kind", "nodes", "ops", "labScene", and "script".
3. NODES (${limits.minNodesPerSection} to ${limits.maxNodesPerSection} per section):
   - "id", "text" (<= ${limits.maxNodeTextWords} words), optional "detail" (<= 5 words), "kind", "tone" ("normal"|"pathology"|"neutral"), "icon" (${ALLOWED_LESSON_ICONS.join(", ")}), "trend", and "source" ({ "page": integer, "quote": exact 6–25 word substring from SOURCE TEXT }).
4. HANDWRITTEN OPS ("ops"): Emit 2 to 4 visual drawing operations per section using the best layout for the concept:
   - { "t": "title", "text": "...", "subtitle": "...", "tone": "..." }
   - { "t": "flow", "steps": [{ "label": "...", "sub": "...", "tone": "...", "nodeId": "..." }] } (for causal mechanisms)
   - { "t": "compare", "leftTitle": "...", "rightTitle": "...", "rows": [{ "left": "...", "right": "..." }] } (for differentials or normal vs abnormal)
   - { "t": "cycle", "title": "...", "nodes": [{ "label": "...", "tone": "...", "nodeId": "..." }] } (for physiological loops)
   - { "t": "term", "term": "...", "definition": "...", "tone": "...", "wash": "sky|mint|sand|coral|lilac", "nodeId": "..." }
   - { "t": "bullets", "heading": "...", "items": ["..."], "wash": "sky|mint|sand|coral" }
   - { "t": "formula", "tex": "LaTeX equation if relevant", "label": "..." }
   - { "t": "function_plot", "title": "...", "expr": "sin(x)", "xRange": [0, 6.28], "yRange": [-1.2, 1.2], "xLabel": "x", "yLabel": "y", "highlightPoints": [{ "x": 1.57, "label": "Peak" }] } (for quantitative curves/functions)
   - { "t": "data_chart", "title": "...", "chartType": "bar"|"pie", "chartItems": [{ "label": "...", "value": 45, "tone": "normal|pathology|neutral" }], "unit": "%" } (for statistics/comparisons/proportions)
   - { "t": "source_figure", "caption": "...", "page": 1, "callouts": ["..."] } (to reference a figure or diagram from the PDF page)
5. SYNCHRONIZED 3D / LAB SCENE ("labScene") — pick the BEST matching tier (use "none" if the section has no physical 3D object):
   - "anatomy-rig": model in [${ANATOMY_RIG_MODELS.join(", ")}], optional cam ("front"|"side"|"iso"|"top"), highlight, labels.
   - "molecule-3d": set "compoundName" (e.g. "aspirin", "dopamine", "glucose") when teaching a specific small-molecule drug or metabolite.
   - "procedural-3d": blueprint in [${PROCEDURAL_3D_BLUEPRINTS.join(", ")}] for salivary/exocrine glands (glandular-acinus), neoplasia/invasion (tumor-architecture), inflammation/autoimmunity (immune-cascade), vessels/plaques, receptors/membranes, axons, compartment diffusion, molecular binding, 3D math fields, or biomechanics.
   - "interactive-sim": for physiological/PK curves (use presetId in [frank_starling, michaelis_menten, dose_response, oxyhemoglobin, pk_washout, action_potential] or valid xLabel/yLabel).
   - "none": for pure conceptual text, history, classification tables, or policies where 2D whiteboard alone is clearest.
6. LINKS: Connect nodes meaningfully with "links" ({ "from", "to", "kind": "leads_to"|"causes"|"contrasts"|"treats", "label"? }) both within and across sections.
7. TEACHER SCRIPT (${limits.minSegmentsPerSection} to ${limits.maxSegmentsPerSection} segments): Natural spoken teaching sentences (10–28 words each, ZERO markdown, NO emojis) referencing "nodeId" for live pen tracking.

Return ONLY valid JSON matching the schema.`;

  const jsonSchema = buildOutlineJsonSchema(limits);

  const { data: rawOutline } = await callStructuredJson({
    prompt,
    schema: jsonSchema,
    temperature: 0.2,
    timeoutMs: 24_000,
    validate: (raw) => healRawLessonOutline(raw, limits, source.scope.startPage),
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
    failedNodeIds.length > 0 && failedNodeIds.length <= 8
      ? await repairUngroundedNodes({
          source,
          language,
          outline: rawOutline,
          failedNodeIds,
        })
      : rawOutline;

  const validPages = new Set(source.chunks.map((c) => c.pageNumber));
  const { outline: enrichedOutline, droppedFacts } = applySoftGroundingAndEnrich({
    outline: repairedOutline,
    sourceText: source.combinedText,
    validPages,
    defaultPage: source.scope.startPage,
    resolveLabScene: (sec, title) => resolveGuaranteedLabScene(sec, title),
  });

  return {
    title: enrichedOutline.title,
    objective: enrichedOutline.objective,
    sections: enrichedOutline.sections,
    links: enrichedOutline.links,
    droppedFacts,
    limits,
  };
}
