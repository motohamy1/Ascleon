import { connectToDatabase } from "@/database/mongoose";
import Book from "@/database/models/book.model";
import BookSegment from "@/database/models/book-segment.model";
import { StudyScope } from "@/components/reader/StudyScopeBar";

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

export interface BookRagRetrievalResult {
  segments: RetrievedSegmentResult[];
  combinedContext: string;
  citedPages: number[];
  detectedTopic?: string;
  goldStandardsFound: string[];
  primaryField: string;
  subField: string;
}

/**
 * Universal Hybrid Book RAG Retriever
 * Retrieves relevant passages across ALL segments in MongoDB for a book:
 * 1. Scope-bounded retrieval (page, multi-page range, or whole topic)
 * 2. Full-text keyword + concept matching across all pages in the book
 * 3. Extracts verbatim quotes, page citations, and stated gold standards/invariants
 */
export async function retrieveFromBookRAG(params: {
  bookId: string;
  query?: string;
  scope?: StudyScope;
  activePage?: number;
  topK?: number;
}): Promise<BookRagRetrievalResult> {
  const { bookId, query = "", scope, activePage = 1, topK = 4 } = params;

  await connectToDatabase();
  const book = await Book.findById(bookId).select("title domain subspecialty blueprint").lean();
  const primaryField = book?.domain || book?.blueprint?.primaryField || "General Academic";
  const subField = book?.subspecialty || book?.blueprint?.subField || primaryField;

  // 1. Resolve Range Constraints from Scope
  let startPageConstraint = 1;
  let endPageConstraint = 999999;
  let targetTopicTitle: string | undefined = undefined;

  if (scope) {
    if (scope.type === "page") {
      startPageConstraint = scope.startPage;
      endPageConstraint = scope.endPage;
    } else if (scope.type === "range" || scope.type === "topic") {
      startPageConstraint = scope.startPage;
      endPageConstraint = scope.endPage;
      targetTopicTitle = scope.topicTitle;
    }
  }

  // If a topic title is requested or detected in blueprint topicMap
  const topicMapTopics = book?.blueprint?.topicMap?.topics || [];
  if (!targetTopicTitle && query) {
    const qLower = query.toLowerCase();
    const matchedTopic = topicMapTopics.find((t: any) =>
      qLower.includes(t.title.toLowerCase()) || (t.keyConcepts && t.keyConcepts.some((k: string) => qLower.includes(k.toLowerCase())))
    );
    if (matchedTopic) {
      targetTopicTitle = matchedTopic.title;
      startPageConstraint = matchedTopic.startPage;
      endPageConstraint = matchedTopic.endPage;
    }
  }

  // 2. Fetch Candidates from BookSegment collection
  let candidateSegments = await BookSegment.find({
    bookId,
    pageNumber: { $gte: startPageConstraint, $lte: endPageConstraint },
  })
    .sort({ pageNumber: 1 })
    .lean();

  // If scoped to single page, strictly honor the active page
  const isStrictSinglePage = scope?.type === "page" || (!scope && !targetTopicTitle);

  // If scoped fetch returned nothing or was limited to 1 page but query explicitly requests whole-book search
  if (!isStrictSinglePage && candidateSegments.length <= 1 && query.trim().length > 3) {
    const broadSearch = await BookSegment.find({ bookId })
      .sort({ pageNumber: 1 })
      .lean();
    if (broadSearch.length > candidateSegments.length) {
      candidateSegments = broadSearch;
    }
  }

  // 3. Score Segments by Hybrid Term & Concept Overlap
  const queryTokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const scored: RetrievedSegmentResult[] = candidateSegments.map((seg) => {
    let score = 0;
    const reasons: string[] = [];
    const textLower = seg.content.toLowerCase();
    const pNum = seg.pageNumber || seg.segmentIndex + 1;

    // Active page bonus
    if (pNum === activePage) {
      score += 35;
      reasons.push("active_page");
    }

    // Proximity to active page (falloff)
    const dist = Math.abs(pNum - activePage);
    if (dist <= 3) {
      score += Math.max(0, 15 - dist * 4);
    }

    // Heading matches
    if (seg.headings && seg.headings.length > 0) {
      for (const h of seg.headings) {
        const hLow = h.toLowerCase();
        for (const token of queryTokens) {
          if (hLow.includes(token)) {
            score += 20;
            reasons.push(`heading_match:${token}`);
          }
        }
      }
    }

    // Key terms & clinical entities match
    const entities = [...(seg.keyTerms || []), ...(seg.clinicalEntities || [])];
    for (const ent of entities) {
      const entLow = ent.toLowerCase();
      for (const token of queryTokens) {
        if (entLow.includes(token)) {
          score += 15;
          reasons.push(`concept_match:${token}`);
        }
      }
    }

    // Gold standards match
    if (seg.goldStandards && seg.goldStandards.length > 0) {
      for (const gs of seg.goldStandards) {
        const gsLow = gs.toLowerCase();
        for (const token of queryTokens) {
          if (gsLow.includes(token)) {
            score += 30;
            reasons.push(`gold_standard_match:${token}`);
          }
        }
        if (query.toLowerCase().includes("gold standard") || query.toLowerCase().includes("first line") || query.toLowerCase().includes("definitive")) {
          score += 25;
        }
      }
    }

    // Content body token matches
    for (const token of queryTokens) {
      const occurrences = (textLower.match(new RegExp(`\\b${token}\\b`, "g")) || []).length;
      if (occurrences > 0) {
        score += Math.min(25, occurrences * 5);
      }
    }

    return {
      pageNumber: pNum,
      segmentIndex: seg.segmentIndex,
      content: seg.content,
      headings: seg.headings || [],
      keyTerms: seg.keyTerms || [],
      clinicalEntities: seg.clinicalEntities || [],
      goldStandards: seg.goldStandards || [],
      summary: seg.summary || "",
      relevanceScore: score,
      matchReasons: reasons,
    };
  });

  // Sort by relevance score descending
  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const topSegments = scored.slice(0, topK);
  // Sort back chronologically for coherent narrative
  topSegments.sort((a, b) => a.pageNumber - b.pageNumber);

  const citedPages = Array.from(new Set(topSegments.map((s) => s.pageNumber)));
  const goldStandardsFound = Array.from(
    new Set(topSegments.flatMap((s) => s.goldStandards))
  );

  const combinedContext = topSegments
    .map((s) => {
      const headingText = s.headings.length ? ` [${s.headings.join(" / ")}]` : "";
      const gsText = s.goldStandards.length ? `\n- Author-Stated Gold Standards / Primary Rules: ${s.goldStandards.join("; ")}` : "";
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
  };
}
