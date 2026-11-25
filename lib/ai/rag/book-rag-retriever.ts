import mongoose from "mongoose";
import { connectToDatabase } from "@/database/mongoose";
import Book from "@/database/models/book.model";
import BookSegment from "@/database/models/book-segment.model";
import type { StudyScope } from "@/components/reader/StudyScopeBar";
import {
  extractPrimaryPageHeading,
  isGenericTopicTitle,
  sanitizeStudyScope,
  sanitizeTopicCandidates,
} from "@/lib/ai/rag/topic-resolution";
import {
  chunkPageText,
  computeLexicalOverlap,
  extractDeterministicPageMetadata,
  isPlaceholderPageText,
  scoreChunksBM25,
  tokenizeText,
  type PageChunk,
} from "@/lib/ai/rag/chunker";

export interface RetrievedSegmentResult {
  pageNumber: number;
  segmentIndex: number;
  content: string;
  headings: string[];
  keyTerms: string[];
  clinicalEntities: string[];
  goldStandards: string[];
  summary: string;
  relevanceScore: number;
  matchReasons: string[];
}

export type RagAlignmentStatus = "verified" | "live_only" | "misaligned_fallback";

export interface BookRagRetrievalResult {
  segments: RetrievedSegmentResult[];
  combinedContext: string;
  citedPages: number[];
  detectedTopic?: string;
  goldStandardsFound: string[];
  primaryField: string;
  subField: string;
  alignmentStatus: RagAlignmentStatus;
  matchedChunksCount: number;
}

const CROSS_BOOK_LOOKUP_RE =
  /\b(where else|other chapters?|across the book|compare with|earlier in the book|whole book|entire book|all pages)\b|في الكتاب|فصل آخر|فصول أخرى|قارن مع|في باقي الكتاب/i;

const BOOK_CHUNKS_CACHE_TTL_MS = 10 * 60 * 1000;
const BOOK_CHUNKS_CACHE_MAX_ENTRIES = 20;

interface BookChunksCacheEntry {
  chunks: PageChunk[];
  expiresAt: number;
}

const globalForBookChunks = globalThis as typeof globalThis & {
  __ascleonBookChunksCache?: Map<string, BookChunksCacheEntry>;
};

const bookChunksCache =
  globalForBookChunks.__ascleonBookChunksCache ??
  (globalForBookChunks.__ascleonBookChunksCache = new Map<string, BookChunksCacheEntry>());

async function getCachedBookChunks(bookId: string): Promise<PageChunk[]> {
  const now = Date.now();
  const cached = bookChunksCache.get(bookId);
  if (cached && cached.expiresAt > now) {
    return cached.chunks;
  }

  const allSegments = (await BookSegment.find({ bookId })
    .sort({ pageNumber: 1, segmentIndex: 1 })
    .limit(400)
    .lean()) as any[];

  const chunks: PageChunk[] = [];
  for (const seg of allSegments) {
    if (isPlaceholderPageText(seg.content)) continue;
    const pNum = segmentPageNumber(seg);
    chunks.push(...chunkPageText(pNum, String(seg.content || "")));
  }

  if (bookChunksCache.size >= BOOK_CHUNKS_CACHE_MAX_ENTRIES) {
    const oldestKey = bookChunksCache.keys().next().value;
    if (oldestKey) bookChunksCache.delete(oldestKey);
  }
  bookChunksCache.set(bookId, {
    chunks,
    expiresAt: now + BOOK_CHUNKS_CACHE_TTL_MS,
  });

  return chunks;
}

function buildSyntheticSegment(pageNumber: number, liveText: string): RetrievedSegmentResult {
  const meta = extractDeterministicPageMetadata(pageNumber, liveText);
  return {
    pageNumber,
    segmentIndex: Math.max(0, pageNumber - 1),
    content: liveText,
    headings: meta.headings,
    keyTerms: meta.keyTerms,
    clinicalEntities: [],
    goldStandards: [],
    summary: meta.summary,
    relevanceScore: 1000,
    matchReasons: ["live_active_page"],
  };
}

function segmentPageNumber(seg: { pageNumber?: number; segmentIndex?: number }): number {
  if (typeof seg.pageNumber === "number" && seg.pageNumber > 0) return seg.pageNumber;
  return Number(seg.segmentIndex ?? 0) + 1;
}

function getLastWords(text: string, maxWords: number): string {
  const words = (text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `...${words.slice(words.length - maxWords).join(" ")}`;
}

/**
 * Universal Hybrid Book RAG Retriever
 * 1. Validates ObjectId & verifies alignment between live PDF text and MongoDB segments.
 * 2. Enforces single-page supremacy when in single-page scope (never overwrites live page with misaligned DB pages).
 * 3. Uses structure-aware overlapping chunks + multilingual Okapi BM25 across ranges, topics, and explicit cross-book lookups.
 */
export async function retrieveFromBookRAG(params: {
  bookId: string;
  query?: string;
  scope?: StudyScope;
  activePage?: number;
  livePageText?: string;
  topK?: number;
}): Promise<BookRagRetrievalResult> {
  const {
    bookId,
    query = "",
    scope,
    activePage = 1,
    livePageText = "",
    topK = 4,
  } = params;

  const cleanLiveText = (livePageText || "").trim();
  const hasRealLiveText = cleanLiveText.length >= 40 && !isPlaceholderPageText(cleanLiveText);

  if (!bookId || !mongoose.Types.ObjectId.isValid(bookId)) {
    const fallbackSeg = hasRealLiveText ? buildSyntheticSegment(activePage, cleanLiveText) : null;
    return {
      segments: fallbackSeg ? [fallbackSeg] : [],
      combinedContext: fallbackSeg
        ? `--- [Source Study: Page ${activePage}] ---\n${fallbackSeg.content}`
        : "",
      citedPages: fallbackSeg ? [activePage] : [],
      detectedTopic: undefined,
      goldStandardsFound: [],
      primaryField: "General Academic",
      subField: "General Academic",
      alignmentStatus: "live_only",
      matchedChunksCount: fallbackSeg ? 1 : 0,
    };
  }

  await connectToDatabase();
  const book = await Book.findById(bookId)
    .select("title domain subspecialty blueprint")
    .lean();
  const primaryField = book?.domain || book?.blueprint?.primaryField || "General Academic";
  const subField = book?.subspecialty || book?.blueprint?.subField || primaryField;

  const safeScope = sanitizeStudyScope(scope, activePage);
  let startPageConstraint = safeScope.startPage;
  let endPageConstraint = safeScope.endPage;
  let targetTopicTitle: string | undefined =
    safeScope.topicTitle && !isGenericTopicTitle(safeScope.topicTitle)
      ? safeScope.topicTitle
      : undefined;

  const isStrictSinglePage =
    !scope ||
    safeScope.type === "page" ||
    (scope.type === "topic" && isGenericTopicTitle(scope.topicTitle));

  const topicMapTopics = sanitizeTopicCandidates(book?.blueprint?.topicMap?.topics);
  if (!targetTopicTitle && !isStrictSinglePage && query) {
    const qLower = query.toLowerCase();
    const matchedTopic = topicMapTopics.find(
      (t) =>
        qLower.includes(t.title.toLowerCase()) ||
        (t.keyConcepts && t.keyConcepts.some((k) => qLower.includes(k.toLowerCase())))
    );
    if (matchedTopic) {
      targetTopicTitle = matchedTopic.title;
      startPageConstraint = matchedTopic.startPage;
      endPageConstraint = matchedTopic.endPage;
    }
  }

  const wantsCrossBookLookup = CROSS_BOOK_LOOKUP_RE.test(query);

  // Fetch bounded range (include preceding page when in strict single-page mode for heading continuity check)
  const queryStart = isStrictSinglePage
    ? Math.max(1, activePage - 1)
    : startPageConstraint;
  const queryEnd = isStrictSinglePage ? activePage : endPageConstraint;

  let candidateSegments = (await BookSegment.find({
    bookId,
    pageNumber: { $gte: queryStart, $lte: queryEnd },
  })
    .sort({ pageNumber: 1, segmentIndex: 1 })
    .lean()) as any[];

  // Legacy fallback for books whose segments were stored without pageNumber
  if (candidateSegments.length === 0) {
    const legacySegments = (await BookSegment.find({
      bookId,
      segmentIndex: {
        $gte: Math.max(0, queryStart - 1),
        $lte: Math.max(0, queryEnd - 1),
      },
    })
      .sort({ segmentIndex: 1 })
      .lean()) as any[];
    if (legacySegments.length > 0) {
      candidateSegments = legacySegments;
    }
  }

  // Fallback for multi-page scope if bounded range had zero segments
  if (!isStrictSinglePage && candidateSegments.length === 0 && query.trim().length > 3) {
    candidateSegments = (await BookSegment.find({ bookId })
      .sort({ pageNumber: 1, segmentIndex: 1 })
      .limit(400)
      .lean()) as any[];
  }

  // Verify alignment of DB segment for activePage against live PDF text
  const activeDbSeg = candidateSegments.find((s) => segmentPageNumber(s) === activePage);
  let alignmentStatus: RagAlignmentStatus = "live_only";

  if (activeDbSeg) {
    if (hasRealLiveText) {
      const overlap = computeLexicalOverlap(cleanLiveText, String(activeDbSeg.content || ""));
      alignmentStatus = overlap >= 0.12 ? "verified" : "misaligned_fallback";
    } else {
      alignmentStatus = isPlaceholderPageText(activeDbSeg.content) ? "live_only" : "verified";
    }
  } else if (!hasRealLiveText && candidateSegments.length > 0 && !isStrictSinglePage) {
    alignmentStatus = "verified";
  }

  // =========================================================================
  // PATH A: STRICT SINGLE-PAGE SCOPE
  // =========================================================================
  if (isStrictSinglePage) {
    const activeAuthoritativeText = hasRealLiveText
      ? cleanLiveText
      : alignmentStatus === "verified" && activeDbSeg?.content
        ? String(activeDbSeg.content)
        : "";

    const primarySegment: RetrievedSegmentResult | null = activeAuthoritativeText
      ? {
          pageNumber: activePage,
          segmentIndex: activeDbSeg?.segmentIndex ?? Math.max(0, activePage - 1),
          content: activeAuthoritativeText,
          headings:
            alignmentStatus === "verified" && activeDbSeg?.headings?.length
              ? activeDbSeg.headings
              : extractDeterministicPageMetadata(activePage, activeAuthoritativeText).headings,
          keyTerms:
            alignmentStatus === "verified" && activeDbSeg?.keyTerms?.length
              ? activeDbSeg.keyTerms
              : extractDeterministicPageMetadata(activePage, activeAuthoritativeText).keyTerms,
          clinicalEntities:
            alignmentStatus === "verified" ? activeDbSeg?.clinicalEntities || [] : [],
          goldStandards:
            alignmentStatus === "verified" ? activeDbSeg?.goldStandards || [] : [],
          summary:
            alignmentStatus === "verified" && activeDbSeg?.summary
              ? activeDbSeg.summary
              : extractDeterministicPageMetadata(activePage, activeAuthoritativeText).summary,
          relevanceScore: 1000,
          matchReasons: [hasRealLiveText ? "live_active_page" : "db_active_page"],
        }
      : null;

    const resultSegments: RetrievedSegmentResult[] = primarySegment ? [primarySegment] : [];
    const contextParts: string[] = [];
    let matchedChunksCount = primarySegment ? 1 : 0;

    if (primarySegment) {
      const headingText = primarySegment.headings.length
        ? ` [${primarySegment.headings.join(" / ")}]`
        : "";
      const gsText = primarySegment.goldStandards.length
        ? `\n- Author-Stated Gold Standards / Primary Rules: ${primarySegment.goldStandards.join("; ")}`
        : "";
      contextParts.push(
        `--- [Source Study: Page ${activePage}]${headingText} ---\n${primarySegment.content}${gsText}`
      );
    }

    // Topic continuity from preceding page ONLY when verified & activePage lacks a top heading
    if (
      alignmentStatus === "verified" &&
      activePage > 1 &&
      activeAuthoritativeText &&
      !extractPrimaryPageHeading(activeAuthoritativeText)
    ) {
      const prevSeg = candidateSegments.find((s) => segmentPageNumber(s) === activePage - 1);
      if (prevSeg && !isPlaceholderPageText(prevSeg.content)) {
        const prevHeading =
          (prevSeg.headings && prevSeg.headings[0]) ||
          extractPrimaryPageHeading(String(prevSeg.content || ""));
        const tail = getLastWords(String(prevSeg.content || ""), 120);
        const headerTag = prevHeading ? ` (${prevHeading})` : "";
        contextParts.push(
          `--- [PRECEDING PAGE ${activePage - 1} — TOPIC CONTINUITY ONLY]${headerTag} ---\n${tail}`
        );
      }
    }

    // Optional cross-book chunk BM25 lookup when explicitly requested OR when user asks about a specific topic absent from active page
    const queryTokens = tokenizeText(query);
    const activeTokenSet = new Set(tokenizeText(activeAuthoritativeText));
    const hasActiveOverlap = queryTokens.some((t) => activeTokenSet.has(t));
    const referencesCurrentPageOnly =
      /\b(this page|current page|here|this section)\b|الصفحة\s*(دي|هذه|الحالية)/i.test(query);
    const shouldSearchOffPageTopic =
      wantsCrossBookLookup ||
      (!referencesCurrentPageOnly && queryTokens.length >= 2 && !hasActiveOverlap);

    if (shouldSearchOffPageTopic && query.trim().length > 3) {
      let candidateChunks: PageChunk[] = [];

      // Fast path: use indexed MongoDB text search before falling back to full-book scan/cache
      try {
        const textMatchedSegments = (await BookSegment.find(
          { bookId, $text: { $search: query } },
          { score: { $meta: "textScore" } }
        )
          .sort({ score: { $meta: "textScore" } })
          .limit(12)
          .lean()) as any[];

        for (const seg of textMatchedSegments) {
          const pNum = segmentPageNumber(seg);
          if (pNum === activePage) continue;
          if (isPlaceholderPageText(seg.content)) continue;
          candidateChunks.push(...chunkPageText(pNum, String(seg.content || "")));
        }
      } catch {
        // Fallback below if text index is unavailable
      }

      if (candidateChunks.length === 0) {
        const cachedChunks = await getCachedBookChunks(bookId);
        candidateChunks = cachedChunks.filter((c) => c.pageNumber !== activePage);
      }

      const minScore = wantsCrossBookLookup ? 1.5 : 2.2;
      const scoredChunks = scoreChunksBM25(query, candidateChunks)
        .filter((c) => c.bm25Score > minScore)
        .slice(0, 3);

      matchedChunksCount += scoredChunks.length;

      for (const ch of scoredChunks) {
        contextParts.push(
          `--- [RELATED BOOK EXCERPT — Page ${ch.pageNumber}] ---\n${ch.text}`
        );
        resultSegments.push({
          pageNumber: ch.pageNumber,
          segmentIndex: Math.max(0, ch.pageNumber - 1),
          content: ch.text,
          headings: ch.headingHint ? [ch.headingHint] : [],
          keyTerms: [],
          clinicalEntities: [],
          goldStandards: [],
          summary: "",
          relevanceScore: ch.bm25Score,
          matchReasons: ch.matchedTerms.map((t) => `bm25:${t}`),
        });
      }
    }

    const citedPages = Array.from(new Set(resultSegments.map((s) => s.pageNumber)));
    const goldStandardsFound = Array.from(
      new Set(resultSegments.flatMap((s) => s.goldStandards))
    );

    return {
      segments: resultSegments,
      combinedContext: contextParts.join("\n\n"),
      citedPages,
      detectedTopic: targetTopicTitle,
      goldStandardsFound,
      primaryField,
      subField,
      alignmentStatus,
      matchedChunksCount,
    };
  }

  // =========================================================================
  // PATH B: MULTI-PAGE / TOPIC / RANGE HYBRID CHUNKED BM25 RETRIEVAL
  // =========================================================================
  const allBookPool =
    alignmentStatus === "misaligned_fallback" && hasRealLiveText
      ? ((await BookSegment.find({ bookId })
          .sort({ pageNumber: 1, segmentIndex: 1 })
          .limit(400)
          .lean()) as any[])
      : candidateSegments;

  const segByPage = new Map<number, any>();
  const chunks: Array<PageChunk & { sourceSeg?: any }> = [];

  for (const seg of allBookPool) {
    const pNum = segmentPageNumber(seg);
    // Skip stale/misaligned DB content for activePage when we have live text
    if (pNum === activePage && alignmentStatus === "misaligned_fallback" && hasRealLiveText) {
      continue;
    }
    if (!segByPage.has(pNum)) segByPage.set(pNum, seg);
    if (isPlaceholderPageText(seg.content)) continue;
    for (const ch of chunkPageText(pNum, String(seg.content || ""))) {
      chunks.push({ ...ch, sourceSeg: seg });
    }
  }

  if (hasRealLiveText) {
    const liveChunks = chunkPageText(activePage, cleanLiveText);
    for (const ch of liveChunks) {
      chunks.push({
        ...ch,
        sourceSeg:
          alignmentStatus === "verified" ? activeDbSeg : undefined,
      });
    }
  }

  const effectiveQuery =
    alignmentStatus === "misaligned_fallback" && hasRealLiveText
      ? `${query} ${tokenizeText(cleanLiveText).slice(0, 12).join(" ")}`
      : query;

  const queryTokens = Array.from(new Set(tokenizeText(effectiveQuery)));
  const scoredBm25 = scoreChunksBM25(effectiveQuery, chunks);

  const rescored = scoredBm25.map((ch) => {
    const seg = (ch as PageChunk & { sourceSeg?: any }).sourceSeg;
    let totalScore = ch.bm25Score;
    const reasons = ch.matchedTerms.map((t) => `bm25:${t}`);

    if (ch.pageNumber === activePage) {
      totalScore += 12;
      reasons.push("active_page");
    } else {
      const dist = Math.abs(ch.pageNumber - activePage);
      if (dist <= 3) {
        totalScore += Math.max(0, 4 - dist);
      }
    }

    if (seg) {
      const headings: string[] = Array.isArray(seg.headings) ? seg.headings : [];
      for (const h of headings) {
        const hTokens = new Set(tokenizeText(h));
        for (const qt of queryTokens) {
          if (hTokens.has(qt)) {
            totalScore += 5;
            reasons.push(`heading_match:${qt}`);
          }
        }
      }

      const entities = [
        ...(Array.isArray(seg.keyTerms) ? seg.keyTerms : []),
        ...(Array.isArray(seg.clinicalEntities) ? seg.clinicalEntities : []),
      ];
      for (const ent of entities) {
        const eTokens = new Set(tokenizeText(ent));
        for (const qt of queryTokens) {
          if (eTokens.has(qt)) {
            totalScore += 3;
            reasons.push(`concept_match:${qt}`);
          }
        }
      }

      const gsList: string[] = Array.isArray(seg.goldStandards) ? seg.goldStandards : [];
      for (const gs of gsList) {
        const gsTokens = new Set(tokenizeText(gs));
        for (const qt of queryTokens) {
          if (gsTokens.has(qt)) {
            totalScore += 6;
            reasons.push(`gold_standard_match:${qt}`);
          }
        }
      }
    }

    return { chunk: ch, seg, totalScore, reasons };
  });

  rescored.sort(
    (a, b) =>
      b.totalScore - a.totalScore ||
      a.chunk.pageNumber - b.chunk.pageNumber ||
      a.chunk.chunkIndex - b.chunk.chunkIndex
  );

  const selected = rescored.slice(0, topK);

  // Guarantee activePage is represented if it lies within the requested scope
  const activeInScope =
    activePage >= startPageConstraint && activePage <= endPageConstraint;
  if (
    activeInScope &&
    !selected.some((item) => item.chunk.pageNumber === activePage)
  ) {
    const activeCandidate = rescored.find(
      (item) => item.chunk.pageNumber === activePage
    );
    if (activeCandidate) {
      if (selected.length >= topK && selected.length > 0) {
        selected[selected.length - 1] = activeCandidate;
      } else {
        selected.push(activeCandidate);
      }
    }
  }

  selected.sort(
    (a, b) =>
      a.chunk.pageNumber - b.chunk.pageNumber ||
      a.chunk.chunkIndex - b.chunk.chunkIndex
  );

  // Merge selected chunks per page in chronological order
  const mergedByPage = new Map<
    number,
    {
      chunks: typeof selected;
      seg: any;
      bestScore: number;
      reasons: Set<string>;
    }
  >();

  for (const item of selected) {
    const p = item.chunk.pageNumber;
    const existing = mergedByPage.get(p);
    if (existing) {
      existing.chunks.push(item);
      existing.bestScore = Math.max(existing.bestScore, item.totalScore);
      item.reasons.forEach((r) => existing.reasons.add(r));
    } else {
      mergedByPage.set(p, {
        chunks: [item],
        seg: item.seg || segByPage.get(p),
        bestScore: item.totalScore,
        reasons: new Set(item.reasons),
      });
    }
  }

  const topSegments: RetrievedSegmentResult[] = Array.from(mergedByPage.entries()).map(
    ([pNum, group]) => {
      const mergedText = group.chunks.map((c) => c.chunk.text).join("\n\n");
      const seg = group.seg;
      const meta = extractDeterministicPageMetadata(pNum, mergedText);
      return {
        pageNumber: pNum,
        segmentIndex: seg?.segmentIndex ?? Math.max(0, pNum - 1),
        content: mergedText,
        headings: seg?.headings?.length ? seg.headings : meta.headings,
        keyTerms: seg?.keyTerms?.length ? seg.keyTerms : meta.keyTerms,
        clinicalEntities: seg?.clinicalEntities || [],
        goldStandards: seg?.goldStandards || [],
        summary: seg?.summary || meta.summary,
        relevanceScore: group.bestScore,
        matchReasons: Array.from(group.reasons),
      };
    }
  );

  const citedPages = Array.from(new Set(topSegments.map((s) => s.pageNumber)));
  const goldStandardsFound = Array.from(
    new Set(topSegments.flatMap((s) => s.goldStandards))
  );

  const combinedContext = topSegments
    .map((s) => {
      const headingText = s.headings.length ? ` [${s.headings.join(" / ")}]` : "";
      const gsText = s.goldStandards.length
        ? `\n- Author-Stated Gold Standards / Primary Rules: ${s.goldStandards.join("; ")}`
        : "";
      return `--- [Source Study: Page ${s.pageNumber}]${headingText} ---\n${s.content}${gsText}`;
    })
    .join("\n\n");

  return {
    segments: topSegments,
    combinedContext,
    citedPages,
    detectedTopic: targetTopicTitle,
    goldStandardsFound,
    primaryField,
    subField,
    alignmentStatus,
    matchedChunksCount: selected.length,
  };
}
