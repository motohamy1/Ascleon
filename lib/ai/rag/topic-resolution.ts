import type { StudyScope } from "@/components/reader/StudyScopeBar";

export interface TopicCandidate {
  id?: string;
  title: string;
  startPage: number;
  endPage: number;
  keyConcepts?: string[];
}

export type TopicResolutionResult =
  | { status: "resolved"; topic: TopicCandidate }
  | { status: "ambiguous"; candidates: TopicCandidate[] }
  | { status: "page_only"; detectedHeading?: string };

const GENERIC_TOPIC_TITLES = new Set([
  "",
  "general",
  "general academic",
  "general study",
  "active document",
  "overview",
  "introduction",
  "untitled",
  "summary",
]);

const GENERIC_SUBHEADINGS = new Set([
  "OVERVIEW",
  "INTRODUCTION",
  "CLASSIFICATION",
  "DEFINITION",
  "ETIOLOGY",
  "AETIOLOGY",
  "PATHOPHYSIOLOGY",
  "CLINICAL FEATURES",
  "SYMPTOMS",
  "SIGNS",
  "DIAGNOSIS",
  "INVESTIGATIONS",
  "MANAGEMENT",
  "TREATMENT",
  "COMPLICATIONS",
  "PROGNOSIS",
  "SUMMARY",
  "KEY POINTS",
  "REFERENCES",
]);

export function isGenericTopicTitle(title?: string | null): boolean {
  const low = (title || "").trim().toLowerCase();
  return GENERIC_TOPIC_TITLES.has(low);
}

export function sanitizeStudyScope(
  scope: StudyScope | undefined | null,
  activePage: number
): StudyScope {
  const safeActive = Math.max(1, Number(activePage) || 1);
  if (!scope) {
    return { type: "page", startPage: safeActive, endPage: safeActive };
  }

  const rawStart = Number(scope.startPage) || safeActive;
  const rawEnd = Number(scope.endPage) || rawStart;
  const startPage = Math.max(1, Math.min(rawStart, rawEnd));
  const endPage = Math.max(1, Math.max(rawStart, rawEnd));

  if (scope.type === "topic" && isGenericTopicTitle(scope.topicTitle)) {
    return { type: "page", startPage: safeActive, endPage: safeActive };
  }

  if (scope.type === "page") {
    return { ...scope, type: "page", startPage: safeActive, endPage: safeActive };
  }

  return {
    ...scope,
    startPage,
    endPage,
    topicTitle: isGenericTopicTitle(scope.topicTitle) ? undefined : scope.topicTitle?.trim(),
  };
}

export function sanitizeTopicCandidates(topics: unknown): TopicCandidate[] {
  if (!Array.isArray(topics)) return [];
  const seen = new Set<string>();
  const valid: TopicCandidate[] = [];

  for (const item of topics) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (isGenericTopicTitle(title)) continue;

    const p1 = Number(raw.startPage);
    const p2 = Number(raw.endPage);
    if (!Number.isFinite(p1) || !Number.isFinite(p2) || p1 <= 0 || p2 <= 0) continue;

    const startPage = Math.min(p1, p2);
    const endPage = Math.max(p1, p2);
    const dedupeKey = `${title.toLowerCase()}|${startPage}|${endPage}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    valid.push({
      id: typeof raw.id === "string" ? raw.id : undefined,
      title,
      startPage,
      endPage,
      keyConcepts: Array.isArray(raw.keyConcepts)
        ? raw.keyConcepts.filter((k): k is string => typeof k === "string")
        : undefined,
    });
  }

  return valid;
}

/**
 * Extracts the primary topic heading from the top of a page's raw text.
 * Skips page numbers and generic section subheadings like "OVERVIEW" or "MANAGEMENT".
 */
export function extractPrimaryPageHeading(pageText: string): string | undefined {
  if (!pageText || !pageText.trim()) return undefined;
  const lines = pageText
    .slice(0, 700)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 8)) {
    if (/^(page\s*\d+|\d+\s*\/\s*\d+|\d+)$/i.test(line)) continue;
    if (line.length < 3 || line.length > 72) continue;
    const upper = line.toUpperCase();
    if (GENERIC_SUBHEADINGS.has(upper) || isGenericTopicTitle(line)) continue;
    // Prefer lines without terminal sentence punctuation (headings/titles)
    if (!/[.?!:;]$/.test(line) && /^[A-Za-z0-9\u0600-\u06FF]/.test(line)) {
      return line;
    }
  }
  return undefined;
}

/**
 * Resolves which topic is active on `activePage`, even when the student is in the
 * middle of a multi-page topic. Returns `ambiguous` with candidate choices if
 * multiple distinct topics overlap or conflict.
 */
export function resolveActivePageTopic(params: {
  activePage: number;
  activePageText?: string;
  topicMapTopics?: unknown;
  nearbySegments?: Array<{ pageNumber: number; headings?: string[]; content?: string }>;
  query?: string;
}): TopicResolutionResult {
  const { activePage, activePageText = "", topicMapTopics, nearbySegments = [], query = "" } = params;
  const candidatesFromMap = sanitizeTopicCandidates(topicMapTopics);

  // 1. Topics in topicMap whose range covers activePage
  const coveringTopics = candidatesFromMap.filter(
    (t) => t.startPage <= activePage && activePage <= t.endPage
  );

  // 2. Check if query explicitly names one or more topics in topicMap
  const qLower = query.toLowerCase();
  const isGenericSummaryPrompt =
    /\b(executive\s+(topic|page|range)\s+summary|summarize\s+this|explain\s+this\s+(topic|page))\b/i.test(
      query
    );

  if (!isGenericSummaryPrompt && query.trim().length > 3) {
    const queryMatches = candidatesFromMap.filter((t) => {
      const tLower = t.title.toLowerCase();
      if (qLower.includes(tLower)) return true;
      const words = tLower.split(/\s+/).filter((w) => w.length > 3);
      return words.length > 0 && words.every((w) => qLower.includes(w));
    });

    if (queryMatches.length === 1) {
      return { status: "resolved", topic: queryMatches[0] };
    }
    if (queryMatches.length > 1) {
      return { status: "ambiguous", candidates: queryMatches.slice(0, 4) };
    }
  }

  // 3. If coveringTopics has 1 clear match, verify against activePage heading if present
  const pageHeading = extractPrimaryPageHeading(activePageText);
  if (coveringTopics.length === 1) {
    return { status: "resolved", topic: coveringTopics[0] };
  }
  if (coveringTopics.length > 1) {
    // If pageHeading strongly matches exactly one covering topic, resolve it
    if (pageHeading) {
      const hLow = pageHeading.toLowerCase();
      const exactHeadingMatches = coveringTopics.filter(
        (t) => t.title.toLowerCase().includes(hLow) || hLow.includes(t.title.toLowerCase())
      );
      if (exactHeadingMatches.length === 1) {
        return { status: "resolved", topic: exactHeadingMatches[0] };
      }
    }
    return { status: "ambiguous", candidates: coveringTopics.slice(0, 4) };
  }

  // 4. Fallback: inspect nearbySegments (activePage and preceding pages) for headings
  const segmentTopics: TopicCandidate[] = [];
  const seenTitles = new Set<string>();
  const sortedNearby = [...nearbySegments].sort((a, b) => a.pageNumber - b.pageNumber);

  for (const seg of sortedNearby) {
    if (seg.pageNumber > activePage) continue;
    const headings = (seg.headings || []).filter(
      (h) => !isGenericTopicTitle(h) && !GENERIC_SUBHEADINGS.has(h.trim().toUpperCase())
    );
    for (const h of headings) {
      const key = h.trim().toLowerCase();
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        segmentTopics.push({
          title: h.trim(),
          startPage: seg.pageNumber,
          endPage: activePage,
        });
      }
    }
  }

  if (pageHeading && !seenTitles.has(pageHeading.toLowerCase())) {
    segmentTopics.unshift({
      title: pageHeading,
      startPage: activePage,
      endPage: activePage,
    });
  }

  if (segmentTopics.length === 1) {
    return { status: "resolved", topic: segmentTopics[0] };
  }
  if (segmentTopics.length > 1 && pageHeading) {
    const hLow = pageHeading.toLowerCase();
    const matched = segmentTopics.find((t) => t.title.toLowerCase() === hLow);
    if (matched) {
      return { status: "resolved", topic: matched };
    }
    return { status: "ambiguous", candidates: segmentTopics.slice(0, 4) };
  }

  return { status: "page_only", detectedHeading: pageHeading };
}
