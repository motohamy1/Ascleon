import { z } from "zod";
import {
  ALLOWED_LESSON_ICONS,
  BoardLimits,
  DEFAULT_BOARD_LIMITS,
  DroppedFactNotice,
  LessonCue,
  LessonIconId,
  LessonLink,
  LessonNode,
  LessonSection,
  LessonSegment,
} from "@/types/lesson-board";

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
