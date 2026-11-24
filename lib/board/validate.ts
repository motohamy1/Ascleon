import { z } from "zod";
import {
  ALLOWED_LESSON_ICONS,
  BoardLimits,
  BoardOp,
  BoardWashTone,
  DEFAULT_BOARD_LIMITS,
  DroppedFactNotice,
  LessonCue,
  LessonIconId,
  LessonLink,
  LessonNode,
  LessonSection,
  LessonSegment,
  LessonTone,
} from "@/types/lesson-board";
import { compileMathExpr } from "./math-presets";

export interface RawLessonOutline {
  title: string;
  objective: string;
  sections: LessonSection[];
  links: LessonLink[];
}

const ALLOWED_ICON_SET = new Set<string>(ALLOWED_LESSON_ICONS);

export function cleanSpokenProse(text: string): string {
  return text
    .replace(/[*_`#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function clampWords(text: string, maxWords: number): string {
  const clean = cleanSpokenProse(text);
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return clean;
  return words.slice(0, maxWords).join(" ");
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Verifies that a quote matches the resolved source text verbatim or via strong multi-word overlap.
 */
export function isQuoteGroundedInSource(quote: string, sourceText: string): boolean {
  const normQuote = normalizeForMatch(quote);
  const normSource = normalizeForMatch(sourceText);
  if (!normQuote || !normSource) return false;

  if (normSource.includes(normQuote)) return true;

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

export function buildLessonOutlineZodSchema(limits: BoardLimits = DEFAULT_BOARD_LIMITS) {
  const NodeSchema = z.object({
    id: z.string().min(1).max(40),
    text: z.string().min(2).max(140),
    detail: z.string().max(100).optional(),
    kind: z.enum([
      "structure",
      "step",
      "cause",
      "effect",
      "sign",
      "test",
      "treatment",
      "pearl",
    ]),
    tone: z.enum(["neutral", "normal", "pathology"]),
    icon: z.string().optional(),
    trend: z.enum(["up", "down", "none"]).optional(),
    source: z.object({
      page: z.number().int().min(1),
      quote: z.string().min(6).max(400),
    }),
  });

  const SegmentSchema = z.object({
    id: z.string().min(1).max(40),
    nodeId: z.string().nullable(),
    text: z.string().min(4).max(450),
  });

  const SectionSchema = z.object({
    id: z.string().min(1).max(40),
    title: z.string().min(2).max(100),
    kind: z.enum([
      "concept",
      "mechanism",
      "clinical",
      "diagnosis",
      "management",
      "recap",
    ]),
    nodes: z
      .array(NodeSchema)
      .min(limits.minNodesPerSection)
      .max(limits.maxNodesPerSection),
    script: z
      .array(SegmentSchema)
      .min(limits.minSegmentsPerSection)
      .max(limits.maxSegmentsPerSection),
  });

  const LinkSchema = z.object({
    from: z.string().min(1).max(40),
    to: z.string().min(1).max(40),
    kind: z.enum(["leads_to", "causes", "contrasts", "treats"]),
    label: z.string().max(40).optional(),
  });

  return z.object({
    title: z.string().min(3).max(140),
    objective: z.string().min(5).max(240),
    sections: z
      .array(SectionSchema)
      .min(limits.minSections)
      .max(limits.maxSections),
    links: z.array(LinkSchema).max(limits.maxLinks),
  });
}

export class LessonValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LessonValidationError";
  }
}

/**
 * Validates raw parsed outline structure, link targets, and connectivity.
 * Rejects orphan nodes, broken links, or out-of-range section counts before grounding pruning.
 */
export function validateRawLessonOutline(
  raw: unknown,
  limits: BoardLimits = DEFAULT_BOARD_LIMITS
): RawLessonOutline {
  const schema = buildLessonOutlineZodSchema(limits);
  const parsed = schema.parse(raw);

  const seenNodeIds = new Set<string>();
  const seenSectionIds = new Set<string>();
  const sections: LessonSection[] = [];

  for (let sIdx = 0; sIdx < parsed.sections.length; sIdx++) {
    const rawSec = parsed.sections[sIdx];
    const secId = rawSec.id.trim() || `sec-${sIdx + 1}`;
    if (seenSectionIds.has(secId)) {
      throw new LessonValidationError(`Duplicate section id "${secId}".`);
    }
    seenSectionIds.add(secId);

    const nodes: LessonNode[] = rawSec.nodes.map((rawNode, nIdx) => {
      const nodeId = rawNode.id.trim() || `n-${sIdx + 1}-${nIdx + 1}`;
      if (seenNodeIds.has(nodeId)) {
        throw new LessonValidationError(`Duplicate node id "${nodeId}".`);
      }
      seenNodeIds.add(nodeId);

      const safeIcon: LessonIconId | undefined =
        rawNode.icon && ALLOWED_ICON_SET.has(rawNode.icon)
          ? (rawNode.icon as LessonIconId)
          : undefined;

      return {
        id: nodeId,
        text: clampWords(rawNode.text, limits.maxNodeTextWords),
        detail: rawNode.detail ? clampWords(rawNode.detail, 6) : undefined,
        kind: rawNode.kind,
        tone: rawNode.tone,
        icon: safeIcon,
        trend: rawNode.trend ?? "none",
        source: {
          page: rawNode.source.page,
          quote: rawNode.source.quote.trim(),
        },
      };
    });

    const sectionNodeSet = new Set(nodes.map((n) => n.id));
    const script: LessonSegment[] = rawSec.script.map((seg, segIdx) => {
      if (seg.nodeId !== null && !sectionNodeSet.has(seg.nodeId)) {
        throw new LessonValidationError(
          `Segment "${seg.id || segIdx}" references unknown nodeId "${seg.nodeId}" outside section "${secId}".`
        );
      }
      return {
        id: seg.id.trim() || `seg-${sIdx + 1}-${segIdx + 1}`,
        nodeId: seg.nodeId,
        text: cleanSpokenProse(seg.text),
      };
    });

    sections.push({
      id: secId,
      title: clampWords(rawSec.title, limits.maxSectionTitleWords),
      kind: rawSec.kind,
      nodes,
      script,
    });
  }

  // Validate explicit links: must target existing nodes and not self-loop
  const links: LessonLink[] = [];
  const connectedNodeIds = new Set<string>();
  const linkKeys = new Set<string>();

  for (const link of parsed.links) {
    if (link.from === link.to) {
      throw new LessonValidationError(`Self-loop link on node "${link.from}".`);
    }
    if (!seenNodeIds.has(link.from) || !seenNodeIds.has(link.to)) {
      throw new LessonValidationError(
        `Link "${link.from} -> ${link.to}" points to a nonexistent node.`
      );
    }
    const key = `${link.from}->${link.to}:${link.kind}`;
    if (!linkKeys.has(key)) {
      linkKeys.add(key);
      links.push({
        from: link.from,
        to: link.to,
        kind: link.kind,
        label: link.label ? clampWords(link.label, 3) : undefined,
      });
      connectedNodeIds.add(link.from);
      connectedNodeIds.add(link.to);
    }
  }

  // Require meaningful connectivity: at least 1 explicit link per section on average or cross-section chain
  if (links.length === 0) {
    throw new LessonValidationError("Outline contains zero relationship links between nodes.");
  }

  // Ensure every node is connected either by an explicit link or by being part of an ordered multi-node section
  for (const sec of sections) {
    if (sec.nodes.length < 2) {
      for (const n of sec.nodes) {
        if (!connectedNodeIds.has(n.id)) {
          throw new LessonValidationError(`Orphan node "${n.id}" has no links or peers.`);
        }
      }
    }
  }

  return {
    title: clampWords(parsed.title, limits.maxTitleWords),
    objective: clampWords(parsed.objective, limits.maxObjectiveWords),
    sections,
    links,
  };
}

/**
 * Enforces source grounding across all nodes after optional repair.
 * Drops ungrounded nodes visibly (recording DroppedFactNotice) and prunes broken links/segments.
 */
export function applyGroundingAndPrune(params: {
  outline: RawLessonOutline;
  sourceText: string;
  validPages: Set<number>;
  defaultPage: number;
}): {
  outline: RawLessonOutline;
  droppedFacts: DroppedFactNotice[];
} {
  const { outline, sourceText, validPages, defaultPage } = params;
  const droppedFacts: DroppedFactNotice[] = [];
  const survivingNodeIds = new Set<string>();
  const survivingSections: LessonSection[] = [];

  for (const sec of outline.sections) {
    const keptNodes: LessonNode[] = [];

    for (const node of sec.nodes) {
      if (isQuoteGroundedInSource(node.source.quote, sourceText)) {
        survivingNodeIds.add(node.id);
        keptNodes.push({
          ...node,
          source: {
            page: validPages.has(node.source.page) ? node.source.page : defaultPage,
            quote: node.source.quote,
          },
        });
      } else {
        droppedFacts.push({
          text: node.text,
          reason: `Not verified in source page ${node.source.page}`,
        });
      }
    }

    if (keptNodes.length === 0) {
      continue;
    }

    const secKeptSet = new Set(keptNodes.map((n) => n.id));
    const keptScript = sec.script.filter(
      (seg) => seg.nodeId === null || secKeptSet.has(seg.nodeId)
    );

    const safeScript: LessonSegment[] =
      keptScript.length > 0
        ? keptScript
        : [
            {
              id: `${sec.id}-fallback-seg`,
              nodeId: keptNodes[0].id,
              text: `${sec.title}: ${keptNodes.map((n) => n.text).join(", ")}.`,
            },
          ];

    survivingSections.push({
      ...sec,
      nodes: keptNodes,
      script: safeScript,
    });
  }

  if (survivingSections.length === 0) {
    throw new LessonValidationError(
      "Could not verify any concepts directly in this source text. Try a fuller page or topic scope."
    );
  }

  const keptLinks = outline.links.filter(
    (l) => survivingNodeIds.has(l.from) && survivingNodeIds.has(l.to)
  );

  // If pruning removed all explicit links between surviving nodes, reconnect sequential pairs within sections
  if (keptLinks.length === 0) {
    for (const sec of survivingSections) {
      for (let i = 0; i < sec.nodes.length - 1; i++) {
        keptLinks.push({
          from: sec.nodes[i].id,
          to: sec.nodes[i + 1].id,
          kind: "leads_to",
        });
      }
    }
    for (let s = 0; s < survivingSections.length - 1; s++) {
      const a = survivingSections[s];
      const b = survivingSections[s + 1];
      const lastA = a.nodes[a.nodes.length - 1];
      const firstB = b.nodes[0];
      if (lastA && firstB) {
        keptLinks.push({
          from: lastA.id,
          to: firstB.id,
          kind: "leads_to",
        });
      }
    }
  }

  return {
    outline: {
      title: outline.title,
      objective: outline.objective,
      sections: survivingSections,
      links: keptLinks,
    },
    droppedFacts,
  };
}

/**
 * Splits a section's audioDurationMs across its script segments proportionally to spoken character weight.
 * Ensures continuous, gapless cues spanning exactly [0, totalDurationMs].
 */
export function computeSectionCues(
  script: LessonSegment[],
  totalDurationMs: number
): LessonCue[] {
  const safeDuration = Math.max(800, Math.round(totalDurationMs));
  if (script.length === 0) return [];

  const weights = script.map((seg) => {
    const clean = seg.text.replace(/[\s.,!?;:،؟"'"'()\-]/g, "");
    const sentenceMarks = (seg.text.match(/[.!?؟]/g) || []).length;
    return Math.max(8, clean.length + sentenceMarks * 6);
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const cues: LessonCue[] = [];
  let cursor = 0;

  for (let i = 0; i < script.length; i++) {
    const seg = script[i];
    const isLast = i === script.length - 1;
    const slice = isLast
      ? safeDuration - cursor
      : Math.max(200, Math.round((weights[i] / totalWeight) * safeDuration));
    const endMs = isLast ? safeDuration : Math.min(safeDuration, cursor + slice);

    cues.push({
      segmentId: seg.id,
      nodeId: seg.nodeId,
      text: seg.text,
      startMs: cursor,
      endMs: Math.max(cursor, endMs),
    });

    cursor = Math.max(cursor, endMs);
  }

  return cues;
}

const VALID_WASHES = new Set<BoardWashTone>([
  "sky",
  "mint",
  "sand",
  "coral",
  "lilac",
  "head",
  "zebra",
]);

function normalizeWash(wash: unknown, fallback?: BoardWashTone): BoardWashTone | undefined {
  return typeof wash === "string" && VALID_WASHES.has(wash as BoardWashTone)
    ? (wash as BoardWashTone)
    : fallback;
}

function normalizeTone(tone: unknown): LessonTone | undefined {
  return tone === "normal" || tone === "pathology" || tone === "neutral"
    ? tone
    : undefined;
}

function normalizeRange(raw: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(raw) || raw.length < 2) return fallback;
  const a = Number(raw[0]);
  const b = Number(raw[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return fallback;
  if (a < b) return [a, b];
  if (b < a) return [b, a];
  return [a, a + 10];
}

/**
 * Validates and sanitizes raw BoardOp items (including function_plot, data_chart, source_figure).
 * Auto-degrades invalid rich visuals into safe write/bullets ops instead of failing or rendering blank.
 */
export function sanitizeBoardOps(
  rawOps: unknown,
  validPages?: Set<number>,
  defaultPage = 1
): BoardOp[] {
  if (!Array.isArray(rawOps)) return [];
  const cleanOps: BoardOp[] = [];

  for (const item of rawOps) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const t = typeof o.t === "string" ? o.t : "";
    const nodeId = typeof o.nodeId === "string" && o.nodeId.trim() ? o.nodeId.trim() : undefined;
    const tone = normalizeTone(o.tone);
    const wash = normalizeWash(o.wash);

    if (t === "function_plot") {
      const expr = typeof o.expr === "string" ? o.expr.trim() : "";
      const title = typeof o.title === "string" ? cleanSpokenProse(o.title) : undefined;
      const xRange = normalizeRange(o.xRange, [0, 10]);
      let yRange: [number, number] | undefined;
      if (Array.isArray(o.yRange) && o.yRange.length >= 2) {
        yRange = normalizeRange(o.yRange, [-10, 10]);
      }
      let validExpr = false;
      if (expr) {
        try {
          const fn = compileMathExpr(expr);
          const span = xRange[1] - xRange[0];
          for (let i = 0; i <= 8; i++) {
            const xVal = xRange[0] + (span * i) / 8;
            if (Number.isFinite(fn({ x: xVal }))) {
              validExpr = true;
              break;
            }
          }
        } catch {
          validExpr = false;
        }
      }
      if (!validExpr) {
        cleanOps.push({
          t: "write",
          text: title || (expr ? `Relation: ${cleanSpokenProse(expr)}` : "Quantitative function plot"),
          tone: tone || "normal",
          wash: wash || "sky",
          emphasis: "box",
          nodeId,
        });
        continue;
      }
      const highlightPoints = Array.isArray(o.highlightPoints)
        ? o.highlightPoints
            .map((hp) => {
              if (!hp || typeof hp !== "object") return null;
              const rec = hp as Record<string, unknown>;
              const x = Number(rec.x);
              const label = typeof rec.label === "string" ? cleanSpokenProse(rec.label) : "";
              if (!Number.isFinite(x) || !label) return null;
              return { x, label };
            })
            .filter((v): v is { x: number; label: string } => v !== null)
            .slice(0, 4)
        : undefined;
      cleanOps.push({
        t: "function_plot",
        title,
        expr,
        xRange,
        yRange,
        xLabel: typeof o.xLabel === "string" ? cleanSpokenProse(o.xLabel) : undefined,
        yLabel: typeof o.yLabel === "string" ? cleanSpokenProse(o.yLabel) : undefined,
        highlightPoints: highlightPoints && highlightPoints.length > 0 ? highlightPoints : undefined,
        wash: wash || "sky",
        nodeId,
      });
      continue;
    }

    if (t === "data_chart") {
      const title = typeof o.title === "string" ? cleanSpokenProse(o.title) : undefined;
      const chartType: "bar" | "pie" = o.chartType === "pie" ? "pie" : "bar";
      const rawItems = Array.isArray(o.items)
        ? o.items
        : Array.isArray(o.chartItems)
        ? o.chartItems
        : [];
      const items: Array<{ label: string; value: number; tone?: LessonTone }> = [];
      for (const entry of rawItems) {
        if (!entry || typeof entry !== "object") continue;
        const rec = entry as Record<string, unknown>;
        const label = typeof rec.label === "string" ? cleanSpokenProse(rec.label) : "";
        const value = Number(rec.value);
        if (!label || !Number.isFinite(value) || value < 0) continue;
        items.push({
          label,
          value,
          tone: normalizeTone(rec.tone),
        });
      }
      const sum = items.reduce((acc, it) => acc + it.value, 0);
      const validChart = items.length >= 2 && (chartType === "bar" || sum > 0);
      if (!validChart) {
        if (items.length > 0) {
          cleanOps.push({
            t: "bullets",
            heading: title || "Data Breakdown",
            items: items.map((it) => `${it.label}: ${it.value}${typeof o.unit === "string" ? o.unit : ""}`),
            wash: wash || "sand",
            nodeId,
          });
        } else {
          cleanOps.push({
            t: "write",
            text: title || "Clinical Comparison",
            tone: tone || "neutral",
            wash: wash || "sand",
            emphasis: "box",
            nodeId,
          });
        }
        continue;
      }
      cleanOps.push({
        t: "data_chart",
        title,
        chartType,
        items: items.slice(0, 6),
        unit: typeof o.unit === "string" ? cleanSpokenProse(o.unit) : undefined,
        wash: wash || "sand",
        nodeId,
      });
      continue;
    }

    if (t === "source_figure") {
      const caption = typeof o.caption === "string" ? cleanSpokenProse(o.caption) : "";
      const rawPage = Number(o.page);
      const safePage =
        Number.isInteger(rawPage) && rawPage > 0
          ? !validPages || validPages.size === 0 || validPages.has(rawPage)
            ? rawPage
            : defaultPage
          : defaultPage;
      const callouts = Array.isArray(o.callouts)
        ? o.callouts
            .filter((c): c is string => typeof c === "string" && cleanSpokenProse(c).length > 0)
            .map((c) => cleanSpokenProse(c))
            .slice(0, 4)
        : undefined;
      if (!caption) {
        cleanOps.push({
          t: "write",
          text: callouts?.[0] || `Source Figure (p.${safePage})`,
          tone: tone || "neutral",
          wash: wash || "head",
          emphasis: "box",
          nodeId,
        });
        continue;
      }
      cleanOps.push({
        t: "source_figure",
        caption,
        page: safePage,
        callouts: callouts && callouts.length > 0 ? callouts : undefined,
        wash: wash || "head",
        nodeId,
      });
      continue;
    }

    if (t === "title" || t === "write" || t === "bullets" || t === "term" || t === "flow" || t === "compare" || t === "cycle" || t === "timeline" || t === "formula" || t === "pointer") {
      cleanOps.push(item as BoardOp);
    }
  }

  return cleanOps;
}

/**
 * Deterministically synthesizes rich 2D handwritten BoardOp[] primitives from a section's
 * structured nodes & links when explicit ops are omitted or sparse.
 */
export function synthesizeOpsFromSection(
  section: LessonSection,
  links: LessonLink[]
): NonNullable<LessonSection["ops"]> {
  const ops: NonNullable<LessonSection["ops"]> = [
    {
      t: "title",
      text: section.title,
      subtitle: section.kind.toUpperCase(),
      tone: section.nodes.some((n) => n.tone === "pathology")
        ? "pathology"
        : section.nodes.some((n) => n.tone === "normal")
        ? "normal"
        : "neutral",
    },
  ];

  const secNodeIds = new Set(section.nodes.map((n) => n.id));
  const internalLinks = links.filter(
    (l) => secNodeIds.has(l.from) && secNodeIds.has(l.to)
  );

  // If section is mechanism/clinical/diagnosis and has >=2 nodes, render a connected handwritten flow
  if (
    section.nodes.length >= 2 &&
    (section.kind === "mechanism" ||
      section.kind === "clinical" ||
      section.kind === "management" ||
      internalLinks.length > 0)
  ) {
    ops.push({
      t: "flow",
      direction: section.nodes.length <= 3 ? "row" : "col",
      steps: section.nodes.map((n) => ({
        label: n.text,
        sub: n.detail,
        tone: n.tone,
        nodeId: n.id,
      })),
    });
  } else {
    for (const n of section.nodes) {
      if (n.detail) {
        ops.push({
          t: "term",
          term: n.text,
          definition: n.detail,
          tone: n.tone,
          wash: n.tone === "pathology" ? "coral" : n.tone === "normal" ? "sky" : "sand",
          nodeId: n.id,
        });
      } else {
        ops.push({
          t: "write",
          text: n.text,
          tone: n.tone,
          wash: n.tone === "pathology" ? "coral" : n.tone === "normal" ? "mint" : "sand",
          emphasis: n.kind === "pearl" ? "box" : "underline",
          nodeId: n.id,
        });
      }
    }
  }

  // Add a clinical pearl / key takeaway callout if any node is marked pearl or treatment
  const pearl = section.nodes.find((n) => n.kind === "pearl");
  if (pearl && ops.some((o) => o.t === "flow")) {
    ops.push({
      t: "write",
      text: `Key Pearl: ${pearl.text}${pearl.detail ? ` (${pearl.detail})` : ""}`,
      tone: pearl.tone,
      wash: "sand",
      emphasis: "box",
      nodeId: pearl.id,
    });
  }

  return ops;
}

/**
 * Synthesizes an active-recall Challenge for Challenge Mode when one wasn't explicitly provided.
 */
export function synthesizeChallengeFromSection(
  section: LessonSection,
  labScene?: LessonSection["labScene"]
): NonNullable<LessonSection["challenge"]> {
  if (section.challenge) return section.challenge;

  if (
    labScene?.tier === "interactive-sim" &&
    labScene.params.length > 0
  ) {
    const p = labScene.params[0];
    const mid = p.min + (p.max - p.min) * 0.55;
    const span = (p.max - p.min) * 0.2;
    return {
      kind: "predict-slider",
      prompt: `In "${section.title}", adjust ${p.label} to simulate the target physiological range.`,
      paramName: p.name,
      paramLabel: p.label,
      min: p.min,
      max: p.max,
      unit: p.unit,
      targetMin: Number((mid - span).toFixed(2)),
      targetMax: Number((mid + span).toFixed(2)),
      explanation:
        labScene.readoutLabel ||
        `Adjusting ${p.label} directly shifts the curve in real time.`,
    };
  }

  if (section.nodes.length >= 3) {
    const items = section.nodes.map((n) => ({ id: n.id, label: n.text }));
    return {
      kind: "order-steps",
      prompt: `Arrange the key steps of "${section.title}" in their exact teaching sequence:`,
      items,
      correctOrder: section.nodes.map((n) => n.id),
      explanation: `Correct sequence: ${section.nodes.map((n) => n.text).join(" → ")}.`,
    };
  }

  const targetNode = section.nodes[0];
  return {
    kind: "clinical-choice",
    prompt: `Which concept is central to "${section.title}"?`,
    options: [
      { id: "opt-a", label: targetNode?.text || section.title },
      { id: "opt-b", label: "Unrelated systemic artifact" },
      { id: "opt-c", label: "Normal baseline exclusion only" },
    ],
    correctId: "opt-a",
    explanation: `${targetNode?.text || section.title}${targetNode?.detail ? ` — ${targetNode.detail}` : ""}.`,
  };
}

/**
 * Zero-Throw Auto-Healer for production outlines:
 * Repairs missing links, orphan nodes, missing ops, missing/broken 3D lab scenes,
 * and missing script segments instead of throwing 500 errors.
 */
export function healRawLessonOutline(
  raw: unknown,
  limits: BoardLimits = DEFAULT_BOARD_LIMITS,
  defaultPage = 1
): RawLessonOutline {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = clampWords(
    typeof obj.title === "string" && obj.title.trim() ? obj.title : "Clinical Whiteboard Lesson",
    limits.maxTitleWords
  );
  const objective = clampWords(
    typeof obj.objective === "string" && obj.objective.trim()
      ? obj.objective
      : "Step-by-step grounded mechanism and clinical reasoning.",
    limits.maxObjectiveWords
  );

  const rawSections = Array.isArray(obj.sections) ? obj.sections : [];
  if (rawSections.length === 0) {
    throw new LessonValidationError("Model returned zero lesson sections.");
  }

  const seenSecIds = new Set<string>();
  const seenNodeIds = new Set<string>();
  const validNodeKinds = new Set<string>([
    "structure", "step", "cause", "effect", "sign", "test", "treatment", "pearl",
  ]);
  const validSecKinds = new Set<string>([
    "concept", "mechanism", "clinical", "diagnosis", "management", "recap",
  ]);
  const validTones = new Set<string>(["neutral", "normal", "pathology"]);

  const sections: LessonSection[] = rawSections
    .slice(0, limits.maxSections)
    .map((secRaw, sIdx) => {
      const s = (secRaw && typeof secRaw === "object" ? secRaw : {}) as Record<string, unknown>;
      let secId = typeof s.id === "string" && s.id.trim() ? s.id.trim() : `s${sIdx + 1}`;
      if (seenSecIds.has(secId)) secId = `${secId}_${sIdx + 1}`;
      seenSecIds.add(secId);

      const secTitle = clampWords(
        typeof s.title === "string" && s.title.trim() ? s.title : `Section ${sIdx + 1}`,
        limits.maxSectionTitleWords
      );
      const secKind = (
        typeof s.kind === "string" && validSecKinds.has(s.kind) ? s.kind : "mechanism"
      ) as LessonSection["kind"];

      const rawNodes = Array.isArray(s.nodes) ? s.nodes : [];
      const nodes: LessonNode[] = (
        rawNodes.length > 0
          ? rawNodes.slice(0, limits.maxNodesPerSection)
          : [{ text: secTitle, kind: "step", tone: "neutral", source: { page: defaultPage, quote: secTitle } }]
      ).map((nRaw, nIdx) => {
        const n = (nRaw && typeof nRaw === "object" ? nRaw : {}) as Record<string, unknown>;
        let nodeId =
          typeof n.id === "string" && n.id.trim() ? n.id.trim() : `n_${sIdx + 1}_${nIdx + 1}`;
        if (seenNodeIds.has(nodeId)) nodeId = `${nodeId}_${sIdx + 1}_${nIdx + 1}`;
        seenNodeIds.add(nodeId);

        const src = (n.source && typeof n.source === "object" ? n.source : {}) as Record<string, unknown>;
        const page =
          typeof src.page === "number" && Number.isInteger(src.page) && src.page >= 1
            ? src.page
            : defaultPage;
        const quote =
          typeof src.quote === "string" && src.quote.trim().length >= 3
            ? src.quote.trim()
            : secTitle;

        return {
          id: nodeId,
          text: clampWords(
            typeof n.text === "string" && n.text.trim() ? n.text : `${secTitle} Point ${nIdx + 1}`,
            limits.maxNodeTextWords
          ),
          detail: typeof n.detail === "string" && n.detail.trim() ? clampWords(n.detail, 6) : undefined,
          kind: (typeof n.kind === "string" && validNodeKinds.has(n.kind)
            ? n.kind
            : "step") as LessonNode["kind"],
          tone: (typeof n.tone === "string" && validTones.has(n.tone)
            ? n.tone
            : "neutral") as LessonNode["tone"],
          icon:
            typeof n.icon === "string" && ALLOWED_ICON_SET.has(n.icon)
              ? (n.icon as LessonIconId)
              : undefined,
          trend: n.trend === "up" || n.trend === "down" ? n.trend : "none",
          source: { page, quote },
        };
      });

      const secNodeSet = new Set(nodes.map((n) => n.id));
      const rawScript = Array.isArray(s.script) ? s.script : [];
      const script: LessonSegment[] = rawScript
        .filter((segRaw) => segRaw && typeof segRaw === "object")
        .slice(0, limits.maxSegmentsPerSection)
        .map((segRaw, segIdx) => {
          const seg = segRaw as Record<string, unknown>;
          const mappedNodeId =
            typeof seg.nodeId === "string" && secNodeSet.has(seg.nodeId)
              ? seg.nodeId
              : nodes[segIdx % nodes.length]?.id ?? null;
          return {
            id:
              typeof seg.id === "string" && seg.id.trim()
                ? seg.id.trim()
                : `seg_${sIdx + 1}_${segIdx + 1}`,
            nodeId: mappedNodeId,
            text: cleanSpokenProse(
              typeof seg.text === "string" && seg.text.trim()
                ? seg.text
                : `Let us examine ${nodes[segIdx % nodes.length]?.text || secTitle}.`
            ),
          };
        });

      if (script.length === 0) {
        nodes.forEach((n, idx) => {
          script.push({
            id: `seg_${sIdx + 1}_${idx + 1}`,
            nodeId: n.id,
            text: `${n.text}${n.detail ? `, specifically ${n.detail}` : ""}.`,
          });
        });
      }

      const rawOps = sanitizeBoardOps(s.ops, undefined, defaultPage);
      const rawLab =
        s.labScene && typeof s.labScene === "object"
          ? (s.labScene as LessonSection["labScene"])
          : undefined;
      const rawChallenge =
        s.challenge && typeof s.challenge === "object"
          ? (s.challenge as LessonSection["challenge"])
          : undefined;

      return {
        id: secId,
        title: secTitle,
        kind: secKind,
        nodes,
        script,
        ops: rawOps && rawOps.length > 0 ? rawOps : undefined,
        labScene: rawLab,
        challenge: rawChallenge,
      };
    });

  // Repair links: keep valid explicit links and auto-wire any unlinked sequential pairs
  const validLinkKinds = new Set<string>(["leads_to", "causes", "contrasts", "treats"]);
  const rawLinks = Array.isArray(obj.links) ? obj.links : [];
  const links: LessonLink[] = [];
  const linkKeys = new Set<string>();

  for (const lRaw of rawLinks) {
    if (!lRaw || typeof lRaw !== "object") continue;
    const l = lRaw as Record<string, unknown>;
    const from = typeof l.from === "string" ? l.from.trim() : "";
    const to = typeof l.to === "string" ? l.to.trim() : "";
    if (!from || !to || from === to) continue;
    if (!seenNodeIds.has(from) || !seenNodeIds.has(to)) continue;
    const kind = (
      typeof l.kind === "string" && validLinkKinds.has(l.kind) ? l.kind : "leads_to"
    ) as LessonLink["kind"];
    const key = `${from}->${to}:${kind}`;
    if (!linkKeys.has(key)) {
      linkKeys.add(key);
      links.push({
        from,
        to,
        kind,
        label: typeof l.label === "string" && l.label.trim() ? clampWords(l.label, 3) : undefined,
      });
    }
  }

  if (links.length === 0) {
    for (const sec of sections) {
      for (let i = 0; i < sec.nodes.length - 1; i++) {
        links.push({
          from: sec.nodes[i].id,
          to: sec.nodes[i + 1].id,
          kind: "leads_to",
        });
      }
    }
    for (let s = 0; s < sections.length - 1; s++) {
      const lastA = sections[s].nodes[sections[s].nodes.length - 1];
      const firstB = sections[s + 1].nodes[0];
      if (lastA && firstB) {
        links.push({ from: lastA.id, to: firstB.id, kind: "leads_to" });
      }
    }
  }

  return { title, objective, sections, links };
}

/**
 * Non-destructive grounding check: preserves verified nodes cleanly and tags unverified
 * fallback nodes with `source.inferred = true` instead of deleting the whole lesson.
 */
export function applySoftGroundingAndEnrich(params: {
  outline: RawLessonOutline;
  sourceText: string;
  validPages: Set<number>;
  defaultPage: number;
  resolveLabScene: (sec: LessonSection, lessonTitle: string) => LessonSection["labScene"];
}): {
  outline: RawLessonOutline;
  droppedFacts: DroppedFactNotice[];
} {
  const { outline, sourceText, validPages, defaultPage, resolveLabScene } = params;
  const droppedFacts: DroppedFactNotice[] = [];

  const enrichedSections: LessonSection[] = outline.sections.map((sec) => {
    const annotatedNodes: LessonNode[] = sec.nodes.map((node) => {
      const grounded = isQuoteGroundedInSource(node.source.quote, sourceText);
      if (!grounded) {
        droppedFacts.push({
          text: node.text,
          reason: `Synthesized summary (weak verbatim quote match on p.${node.source.page})`,
        });
      }
      return {
        ...node,
        source: {
          page: validPages.has(node.source.page) ? node.source.page : defaultPage,
          quote: node.source.quote,
          inferred: !grounded,
        },
      };
    });

    const enrichedSec: LessonSection = {
      ...sec,
      nodes: annotatedNodes,
    };

    const sanitizedOps =
      enrichedSec.ops && enrichedSec.ops.length > 0
        ? sanitizeBoardOps(enrichedSec.ops, validPages, defaultPage)
        : [];
    const resolvedOps =
      sanitizedOps.length > 0
        ? sanitizedOps
        : synthesizeOpsFromSection(enrichedSec, outline.links);
    const resolvedLab = resolveLabScene(enrichedSec, outline.title);
    const resolvedChallenge = synthesizeChallengeFromSection(enrichedSec, resolvedLab);

    return {
      ...enrichedSec,
      ops: resolvedOps,
      labScene: resolvedLab,
      challenge: resolvedChallenge,
    };
  });

  return {
    outline: {
      ...outline,
      sections: enrichedSections,
    },
    droppedFacts,
  };
}

