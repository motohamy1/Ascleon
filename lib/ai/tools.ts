import { searchBookSegments } from "@/lib/actions/book.actions";
import { connectToDatabase } from "@/database/mongoose";
import BookSegment from "@/database/models/book-segment.model";
import mongoose from "mongoose";
import { retrieveEnrichedContext } from "./knowledge/knowledge-retriever";

export type SchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "object"
  | "STRING"
  | "NUMBER"
  | "INTEGER"
  | "BOOLEAN"
  | "ARRAY"
  | "OBJECT";

export interface ToolPropertyDefinition {
  type: SchemaType | string;
  description?: string;
  items?: ToolPropertyDefinition | Record<string, any>;
  properties?: Record<string, ToolPropertyDefinition | any>;
  required?: string[];
  enum?: string[];
  [key: string]: any;
}

export interface AgentToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: SchemaType | string;
    properties: Record<string, ToolPropertyDefinition | any>;
    required: string[];
  };
}

/**
 * Recursively converts schema types to lowercase ('string', 'object', 'integer', 'number', 'boolean', 'array')
 * to ensure strict Groq / OpenAI JSON schema validation passes.
 */
export function convertSchemaToLowercase(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;

  if (Array.isArray(schema)) {
    return schema.map((item) => convertSchemaToLowercase(item));
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" && typeof value === "string") {
      result[key] = value.toLowerCase();
    } else if (value && typeof value === "object") {
      result[key] = convertSchemaToLowercase(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Recursively converts schema types to uppercase ('STRING', 'OBJECT', 'INTEGER', 'NUMBER', 'BOOLEAN', 'ARRAY')
 * for Google GenAI / Gemini schema requirements.
 */
export function convertSchemaToGemini(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;

  if (Array.isArray(schema)) {
    return schema.map((item) => convertSchemaToGemini(item));
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" && typeof value === "string") {
      result[key] = value.toUpperCase();
    } else if (value && typeof value === "object") {
      result[key] = convertSchemaToGemini(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Helper to produce OpenAI-compatible tool declarations with lowercase schema types.
 */
export function getOpenAIToolsSchema() {
  return AGENT_TOOLS_DEFINITIONS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object",
        properties: convertSchemaToLowercase(t.parameters.properties),
        required: t.parameters.required,
      },
    },
  }));
}

/**
 * Helper to produce Gemini tool declarations with uppercase schema types.
 */
export function getGeminiToolsDeclaration() {
  return [
    {
      functionDeclarations: AGENT_TOOLS_DEFINITIONS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: {
          type: (t.parameters.type || "OBJECT").toUpperCase(),
          properties: convertSchemaToGemini(t.parameters.properties),
          required: t.parameters.required,
        },
      })),
    },
  ];
}

export const AGENT_TOOLS_DEFINITIONS: AgentToolDeclaration[] = [
  {
    name: "search_book_context",
    description:
      "Search the book's indexed database for specific clinical, medical, or conceptual terms to ground your explanations in authoritative textbook passages.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: {
          type: "STRING",
          description: "Keyword or medical phrase to look up in the book segments.",
        },
        limit: {
          type: "INTEGER",
          description: "Maximum number of sections to retrieve (default: 3).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "inspect_current_page",
    description:
      "Inspect the full text of the student's active page along with the immediate preceding and subsequent pages for temporal and logical context.",
    parameters: {
      type: "OBJECT",
      properties: {
        segmentIndex: {
          type: "INTEGER",
          description: "The 0-based index of the active section being read.",
        },
      },
      required: ["segmentIndex"],
    },
  },
  {
    name: "fetch_authoritative_references",
    description:
      "Fetch deep excerpts and clinical criteria from gold-standard textbooks (Braunwald's Heart Disease, Oxford Handbook of Clinical Medicine, Harrison's) and guidelines (ESC/AHA/NICE) to strengthen explanations.",
    parameters: {
      type: "OBJECT",
      properties: {
        topic: {
          type: "STRING",
          description: "Specific medical topic or pathophysiological mechanism (e.g., 'S2 splitting', 'dynamic maneuvers', 'valvular heart disease').",
        },
      },
      required: ["topic"],
    },
  },
  {
    name: "query_qbank_repository",
    description:
      "Retrieve deep board-grade clinical vignettes and questions from premier question banks (Passmedicine, Pastest, USMLE Step 2 CK) with full distractor rationales.",
    parameters: {
      type: "OBJECT",
      properties: {
        topic: {
          type: "STRING",
          description: "Focus topic to retrieve exam questions for.",
        },
        difficulty: {
          type: "STRING",
          description: "Target difficulty: 'medium', 'hard', or 'expert'.",
        },
      },
      required: ["topic"],
    },
  },
  {
    name: "generate_interactive_morph",
    description:
      "Generate an interactive visual Morph study block (roadmap sequence cards, animated phonocardiogram/simulator, or anatomical precordial landmarks) grounded in authoritative sources.",
    parameters: {
      type: "OBJECT",
      properties: {
        conceptTitle: {
          type: "STRING",
          description: "Clear title of the morphed mental model (e.g., 'Cardiac Cycle & Auscultation Sequence').",
        },
        cardSteps: {
          type: "ARRAY",
          description: "Sequence of high-yield chronological steps or cards.",
          items: {
            type: "OBJECT",
            properties: {
              badge: { type: "STRING", description: "Short badge e.g. 'S1', 'Phase 1', 'Preload'" },
              title: { type: "STRING", description: "Step title" },
              bullets: {
                type: "ARRAY",
                items: { type: "STRING" },
                description: "Key pearls and invariants",
              },
            },
            required: ["badge", "title", "bullets"],
          },
        },
      },
      required: ["conceptTitle", "cardSteps"],
    },
  },
  {
    name: "generate_board_quiz",
    description:
      "Generate a realistic, high-yield board examination vignette (MRCP / USMLE style) with 4-5 multiple choice options and a comprehensive clinical rationale.",
    parameters: {
      type: "OBJECT",
      properties: {
        question: {
          type: "STRING",
          description: "Clinical scenario or vignette presentation.",
        },
        options: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "List of 4-5 choices.",
        },
        correctIndex: {
          type: "INTEGER",
          description: "0-based index of the single best answer.",
        },
        rationale: {
          type: "STRING",
          description: "Detailed pathophysiological rationale explaining why the correct choice is right and distractor choices are incorrect.",
        },
      },
      required: ["question", "options", "correctIndex", "rationale"],
    },
  },
];

/**
 * Executes a tool called by the LLM agent against live MongoDB book records and deep corpus.
 */
export async function executeAgentTool(
  toolName: string,
  args: Record<string, any>,
  context: { bookId: string; currentSegmentIndex: number; currentSegmentContent: string }
): Promise<{ output: string; data?: any }> {
  try {
    switch (toolName) {
      case "search_book_context": {
        const query = String(args.query || "");
        const limit = Number(args.limit || 3);
        if (!context.bookId || !query) {
          return { output: "No query or book ID supplied for search." };
        }
        const searchRes = await searchBookSegments(context.bookId, query, limit);
        if (searchRes.success && searchRes.data && searchRes.data.length > 0) {
          const segs = searchRes.data as Array<{
            content: string;
            pageNumber?: number;
            segmentIndex?: number;
          }>;
          const formatted = segs
            .map(
              (s) =>
                `[Section ${Number(s.segmentIndex ?? 0) + 1}${
                  s.pageNumber ? ` (Page ${s.pageNumber})` : ""
                }]:\n${s.content}`
            )
            .join("\n\n---\n\n");
          return { output: formatted, data: segs };
        }
        return {
          output: `No exact matches found for "${query}" in book database. Using active reading section.`,
        };
      }

      case "inspect_current_page": {
        if (!context.bookId) {
          return { output: `[Active Section]:\n${context.currentSegmentContent}` };
        }
        await connectToDatabase();
        const targetIdx = Number(args.segmentIndex ?? context.currentSegmentIndex);
        const bookObjId = new mongoose.Types.ObjectId(context.bookId);

        const surrounding = await BookSegment.find({
          bookId: bookObjId,
          segmentIndex: { $gte: Math.max(0, targetIdx - 1), $lte: targetIdx + 1 },
        })
          .sort({ segmentIndex: 1 })
          .lean();

        if (surrounding.length > 0) {
          const formatted = surrounding
            .map(
              (s: any) =>
                `[Section ${s.segmentIndex + 1} (Page ${s.pageNumber || s.segmentIndex + 1})]:\n${s.content}`
            )
            .join("\n\n---\n\n");
          return { output: formatted, data: surrounding };
        }
        return { output: `[Active Section]:\n${context.currentSegmentContent}` };
      }

      case "fetch_authoritative_references": {
        const topic = String(args.topic || "");
        const enriched = await retrieveEnrichedContext(context.currentSegmentContent, topic);
        const refs = enriched.authoritativeReferences;
        if (refs.length > 0) {
          const formatted = refs
            .map(
              (r) =>
                `📚 ${r.source} (${r.chapterOrSection}):\n"${r.title}"\n${r.excerpt}\nKey Pearls:\n${r.clinicalPearls.map((p) => ` • ${p}`).join("\n")}`
            )
            .join("\n\n---\n\n");
          return { output: formatted, data: refs };
        }
        return { output: "No extra external references found for topic." };
      }

      case "query_qbank_repository": {
        const topic = String(args.topic || "");
        const enriched = await retrieveEnrichedContext(context.currentSegmentContent, topic);
        const qbanks = enriched.qbankVignettes;
        if (qbanks.length > 0) {
          const selected = qbanks[0];
          const formatted = `🎯 Source: ${selected.sourceQBank} (${selected.examType})\nTopic: ${selected.topic}\n\nVignette:\n${selected.vignette}\n\nOptions:\n${selected.options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n")}\n\nCorrect Answer: ${String.fromCharCode(65 + selected.correctIndex)}\nRationale: ${selected.distractorRationales[selected.correctIndex]}\nHigh-Yield Takeaway: ${selected.highYieldTakeaway}`;
          return { output: formatted, data: selected };
        }
        return { output: "No specific QBank questions found." };
      }

      case "generate_interactive_morph": {
        return {
          output: `Successfully generated Morph Study Block: "${args.conceptTitle}" with ${args.cardSteps?.length || 0} stages.`,
          data: {
            title: args.conceptTitle,
            steps: args.cardSteps,
          },
        };
      }

      case "generate_board_quiz": {
        return {
          output: `Successfully generated Board Vignette Quiz.`,
          data: {
            question: args.question,
            options: args.options,
            correctIndex: args.correctIndex,
            rationale: args.rationale,
          },
        };
      }

      default:
        return { output: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    console.error(`Error executing agent tool ${toolName}:`, err);
    return { output: `Error executing tool: ${err instanceof Error ? err.message : String(err)}` };
  }
}
