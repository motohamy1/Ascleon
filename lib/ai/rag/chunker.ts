import { isGenericTopicTitle } from "@/lib/ai/rag/topic-resolution";

export interface PageChunk {
  chunkId: string;
  pageNumber: number;
  chunkIndex: number;
  text: string;
  wordCount: number;
  headingHint?: string;
}

export interface DeterministicPageMetadata {
  headings: string[];
  keyTerms: string[];
  summary: string;
}

export interface ScoredPageChunk extends PageChunk {
  bm25Score: number;
  matchedTerms: string[];
}

const ENGLISH_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "by", "can",
  "could", "did", "do", "does", "for", "from", "had", "has", "have", "he",
  "her", "here", "him", "his", "how", "if", "in", "into", "is", "it", "its",
  "may", "me", "might", "more", "most", "must", "my", "no", "not", "of", "on",
  "or", "our", "out", "over", "page", "pages", "please", "section", "sections",
  "she", "should", "so", "some", "such", "summarize", "summary", "explain",
  "describe", "tell", "about", "than", "that", "the", "their", "them", "then",
  "there", "these", "they", "this", "those", "through", "to", "too", "under",
  "up", "use", "used", "using", "was", "we", "were", "what", "when", "where",
  "which", "while", "who", "why", "will", "with", "would", "you", "your",
  "study", "source", "book", "topic", "chapter",
]);

const ARABIC_STOPWORDS = new Set([
  "في", "من", "على", "الي", "الى", "عن", "مع", "هذا", "هذه", "ذلك", "تلك",
  "هؤلاء", "الذي", "التي", "الذين", "اللذان", "اللتان", "هو", "هي", "هم", "هن",
  "نحن", "انا", "انت", "انتم", "انتن", "كان", "كانت", "يكون", "تكون", "ان",
  "انها", "انه", "لان", "لكن", "او", "و", "ف", "ثم", "قد", "لقد", "ما", "ماذا",
  "كيف", "لماذا", "متى", "اين", "هل", "لا", "لم", "لن", "كل", "بعض", "غير",
  "بين", "تحت", "فوق", "امام", "خلف", "عند", "منذ", "حتى", "الا", "اذا",
  "اشرح", "لخص", "ملخص", "الصفحه", "صفحه", "الموضوع", "الكتاب", "الدرس", "شرح",
  "معني", "يعني", "ايه", "ده", "دي", "دول", "اللي", "عشان",
]);

const GENERIC_HEADING_SUBSTRINGS = new Set([
  "overview", "introduction", "classification", "definition", "etiology",
  "aetiology", "pathophysiology", "clinical features", "symptoms", "signs",
  "diagnosis", "investigations", "management", "treatment", "complications",
  "prognosis", "summary", "key points", "references",
]);

const PLACEHOLDER_PAGE_RE =
  /^\[Page\s+\d+\s*:\s*(Visual diagram or scanned page|content unavailable)\]$/i;

/**
 * Strips Arabic diacritics and tatweel, and normalizes common alef/ya/ta-marbuta forms.
 */
export function normalizeArabic(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

/**
 * Unicode-safe multilingual tokenizer supporting English, Arabic, and mixed clinical/STEM terms.
 */
export function tokenizeText(text: string): string[] {
  if (!text) return [];
  const normalized = normalizeArabic(text).toLowerCase();
  const matches = normalized.match(/[\p{L}\p{N}]+/gu);
  if (!matches) return [];

  const tokens: string[] = [];
  for (const raw of matches) {
    if (raw.length < 2) continue;
    if (/^\d+$/.test(raw) && raw.length <= 4) continue;
    if (ENGLISH_STOPWORDS.has(raw) || ARABIC_STOPWORDS.has(raw)) continue;
    tokens.push(raw);
  }
  return tokens;
}

/**
 * Detects empty, near-empty, or synthetic placeholder page text.
 */
export function isPlaceholderPageText(text?: string | null): boolean {
  const trimmed = (text || "").trim();
  if (trimmed.length < 30) return true;
  if (PLACEHOLDER_PAGE_RE.test(trimmed)) return true;
  if (/^\[Page\s+\d+[^\]]*\]$/i.test(trimmed)) return true;
  return false;
}

function isBoilerplateLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^(page\s*\d+|\d+\s*\/\s*\d+|\d+|pg\.?\s*\d+)$/i.test(trimmed)) return true;
  if (/^(telegram:|https?:\/\/|www\.|camscanner|oceanofpdf)/i.test(trimmed)) return true;
  if (/^telegram\s*:/i.test(trimmed) || /@\w+bot/i.test(trimmed)) return true;
  return false;
}

function looksLikeHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 90) return false;
  if (isBoilerplateLine(trimmed)) return false;
  const normalized = trimmed.toLowerCase();
  if (GENERIC_HEADING_SUBSTRINGS.has(normalized) || isGenericTopicTitle(trimmed)) return false;

  if (/^(chapter|unit|section|part|lecture|module|topic)\s+[\divx]+/i.test(trimmed)) {
    return true;
  }
  if (/^\d+(\.\d+)*[.)]?\s+[\p{L}]/u.test(trimmed) && !/[.?!;]$/.test(trimmed)) {
    return true;
  }
  const lettersOnly = trimmed.replace(/[^\p{L}]/gu, "");
  if (
    lettersOnly.length >= 4 &&
    trimmed === trimmed.toUpperCase() &&
    /[A-Z]/.test(trimmed) &&
    !/[.?!;]$/.test(trimmed)
  ) {
    return true;
  }
  if (!/[.?!:;]$/.test(trimmed) && trimmed.split(/\s+/).length <= 10) {
    return true;
  }
  return false;
}

function splitParagraphByWords(
  paragraph: string,
  maxWords: number,
  overlapWords: number
): string[] {
  const words = paragraph.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return [words.join(" ")];

  const step = Math.max(1, maxWords - Math.min(overlapWords, maxWords - 1));
  const slices: string[] = [];
  for (let start = 0; start < words.length; start += step) {
    const end = Math.min(start + maxWords, words.length);
    slices.push(words.slice(start, end).join(" "));
    if (end >= words.length) break;
  }
  return slices;
}

function splitLongInlineBlock(text: string): string[] {
  // Handle single-line PDF text extraction by splitting at sentence boundaries into ~90-word blocks
  const sentences = text.split(/(?<=[.!?؟])\s+/u).filter(Boolean);
  if (sentences.length <= 1) return [text];

  const blocks: string[] = [];
  let current = "";
  let wordCount = 0;

  for (const s of sentences) {
    const sWords = s.split(/\s+/).filter(Boolean).length;
    if (wordCount > 0 && wordCount + sWords > 110) {
      blocks.push(current.trim());
      current = s;
      wordCount = sWords;
    } else {
      current = current ? `${current} ${s}` : s;
      wordCount += sWords;
    }
  }
  if (current.trim()) blocks.push(current.trim());
  return blocks;
}

/**
 * Splits a page's text into structure-aware overlapping chunks for BM25 hybrid RAG.
 */
export function chunkPageText(
  pageNumber: number,
  content: string,
  options?: { maxWords?: number; overlapWords?: number }
): PageChunk[] {
  const maxWords = Math.max(40, options?.maxWords ?? 260);
  const overlapWords = Math.max(0, Math.min(maxWords - 10, options?.overlapWords ?? 45));
  const clean = (content || "").trim();
  if (!clean) return [];

  // Split by blank lines first, or promote single-line heading transitions into blocks
  let rawBlocks = clean
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (rawBlocks.length === 1 && rawBlocks[0].includes("\n")) {
    const lines = rawBlocks[0].split(/\r?\n/);
    const rebuilt: string[] = [];
    let buf: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (looksLikeHeadingLine(t) && buf.length > 0) {
        rebuilt.push(buf.join("\n"));
        buf = [t];
      } else {
        buf.push(t);
      }
    }
    if (buf.length > 0) rebuilt.push(buf.join("\n"));
    rawBlocks = rebuilt;
  } else if (rawBlocks.length === 1) {
    rawBlocks = splitLongInlineBlock(rawBlocks[0]);
  }

  // Normalize oversized single blocks cleanly before packing into chunks
  const atomicUnits: Array<{ text: string; words: number; heading?: string }> = [];
  let currentHeading: string | undefined;

  for (const block of rawBlocks) {
    const firstLine = block.split(/\r?\n/)[0]?.trim() || "";
    if (looksLikeHeadingLine(firstLine)) {
      currentHeading = firstLine;
    }

    const words = block.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) {
      atomicUnits.push({ text: block, words: words.length, heading: currentHeading });
    } else {
      const subParts = splitParagraphByWords(block, maxWords, overlapWords);
      for (const part of subParts) {
        const w = part.split(/\s+/).filter(Boolean).length;
        atomicUnits.push({ text: part, words: w, heading: currentHeading });
      }
    }
  }

  const chunks: PageChunk[] = [];
  let bufferUnits: Array<{ text: string; words: number; heading?: string }> = [];
  let bufferWordCount = 0;

  const flushBuffer = () => {
    if (bufferUnits.length === 0) return;
    const text = bufferUnits.map((u) => u.text).join("\n\n").trim();
    const wc = text.split(/\s+/).filter(Boolean).length;
    const headingHint =
      bufferUnits.find((u) => u.heading)?.heading ||
      (looksLikeHeadingLine(text.split(/\r?\n/)[0] || "")
        ? text.split(/\r?\n/)[0].trim()
        : undefined);
    const chunkIndex = chunks.length;
    chunks.push({
      chunkId: `p${pageNumber}-c${chunkIndex}`,
      pageNumber,
      chunkIndex,
      text,
      wordCount: wc,
      headingHint,
    });
  };

  for (const unit of atomicUnits) {
    if (bufferWordCount > 0 && bufferWordCount + unit.words > maxWords) {
      flushBuffer();

      // Carry tail overlap words from previous chunk
      if (overlapWords > 0) {
        const prevText = chunks[chunks.length - 1]?.text || "";
        const prevWords = prevText.split(/\s+/).filter(Boolean);
        const takeOverlap = Math.min(overlapWords, Math.max(15, maxWords - unit.words));
        const tailWords = prevWords.slice(Math.max(0, prevWords.length - takeOverlap));
        if (tailWords.length > 0) {
          bufferUnits = [
            { text: tailWords.join(" "), words: tailWords.length, heading: unit.heading },
            unit,
          ];
          bufferWordCount = tailWords.length + unit.words;
          continue;
        }
      }

      bufferUnits = [unit];
      bufferWordCount = unit.words;
    } else {
      bufferUnits.push(unit);
      bufferWordCount += unit.words;
    }
  }
  flushBuffer();

  return chunks;
}

/**
 * Extracts headings, key terms, and a concise summary deterministically without LLM latency.
 */
export function extractDeterministicPageMetadata(
  pageNumber: number,
  content: string
): DeterministicPageMetadata {
  const clean = (content || "").trim();
  if (!clean || isPlaceholderPageText(clean)) {
    return { headings: [], keyTerms: [], summary: "" };
  }

  const lines = clean
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isBoilerplateLine(l));

  const headings: string[] = [];
  const seenHeadings = new Set<string>();

  for (const line of lines.slice(0, 12)) {
    if (looksLikeHeadingLine(line)) {
      const key = line.toLowerCase();
      if (!seenHeadings.has(key)) {
        seenHeadings.add(key);
        headings.push(line);
        if (headings.length >= 3) break;
      }
    }
  }

  // Also scan top of single-line text for ALL-CAPS header phrase if no newlines existed
  if (headings.length === 0) {
    const topSlice = clean.slice(0, 220);
    const numberedOrCapsMatch = topSlice.match(
      /^((?:\d+(?:\.\d+)*\s+)?[A-Z][A-Z0-9\s\-&/()]{4,60})(?=\s+[A-Z][a-z]|\s*$)/
    );
    if (numberedOrCapsMatch?.[1]) {
      const candidate = numberedOrCapsMatch[1].trim();
      if (
        !isBoilerplateLine(candidate) &&
        !isGenericTopicTitle(candidate) &&
        !GENERIC_HEADING_SUBSTRINGS.has(candidate.toLowerCase())
      ) {
        headings.push(candidate);
      }
    }
  }

  // Extract top 6 non-stopword domain terms by frequency
  const freq = new Map<string, number>();
  for (const token of tokenizeText(clean)) {
    if (token.length < 3) continue;
    freq.set(token, (freq.get(token) || 0) + 1);
  }
  const keyTerms = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 6)
    .map(([term]) => term);

  // Build clean 1-2 sentence summary capped at 240 chars
  const bodyLines = lines.filter((l) => !seenHeadings.has(l.toLowerCase()));
  const bodyText = (bodyLines.length > 0 ? bodyLines : lines).join(" ").replace(/\s+/g, " ").trim();
  const sentences = bodyText
    .split(/(?<=[.!?؟])\s+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  let summary = "";
  if (sentences.length > 0) {
    summary = sentences.slice(0, 2).join(" ");
  } else {
    summary = bodyText;
  }
  if (summary.length > 240) {
    summary = `${summary.slice(0, 237).trimEnd()}...`;
  }
  if (!summary && headings.length > 0) {
    summary = `${headings[0]} (Page ${pageNumber})`;
  }

  return { headings, keyTerms, summary };
}

/**
 * Containment lexical overlap between two texts using multilingual tokens.
 * Returns 0 if either text has fewer than 4 informative tokens.
 */
export function computeLexicalOverlap(textA: string, textB: string): number {
  const setA = new Set(tokenizeText(textA));
  const setB = new Set(tokenizeText(textB));
  const minSize = Math.min(setA.size, setB.size);
  if (minSize < 4) return 0;

  let intersection = 0;
  for (const tok of setA) {
    if (setB.has(tok)) intersection++;
  }
  return intersection / minSize;
}

/**
 * Ranks page chunks against a query using Okapi BM25 with extra weight for heading matches.
 */
export function scoreChunksBM25(
  query: string,
  chunks: PageChunk[],
  opts?: { k1?: number; b?: number }
): ScoredPageChunk[] {
  if (!chunks.length) return [];

  const k1 = opts?.k1 ?? 1.5;
  const b = opts?.b ?? 0.75;
  const queryTerms = Array.from(new Set(tokenizeText(query)));

  const docTokenLists = chunks.map((c) => tokenizeText(c.text));
  const headingTokenSets = chunks.map((c) => new Set(tokenizeText(c.headingHint || "")));
  const totalDocs = chunks.length;
  const avgDocLen =
    docTokenLists.reduce((sum, list) => sum + list.length, 0) / Math.max(1, totalDocs);

  if (queryTerms.length === 0) {
    return chunks.map((chunk) => ({
      ...chunk,
      bm25Score: 0,
      matchedTerms: [],
    }));
  }

  // Document frequency per query term
  const df = new Map<string, number>();
  for (const term of queryTerms) {
    let count = 0;
    for (let i = 0; i < totalDocs; i++) {
      if (docTokenLists[i].includes(term) || headingTokenSets[i].has(term)) {
        count++;
      }
    }
    df.set(term, count);
  }

  const scored: ScoredPageChunk[] = chunks.map((chunk, idx) => {
    const tokens = docTokenLists[idx];
    const headingTokens = headingTokenSets[idx];
    const docLen = Math.max(1, tokens.length);

    const tfMap = new Map<string, number>();
    for (const tok of tokens) {
      tfMap.set(tok, (tfMap.get(tok) || 0) + 1);
    }

    let score = 0;
    const matchedTerms: string[] = [];

    for (const term of queryTerms) {
      const bodyTf = tfMap.get(term) || 0;
      const inHeading = headingTokens.has(term);
      if (bodyTf === 0 && !inHeading) continue;

      matchedTerms.push(term);
      const docFreq = df.get(term) || 0;
      const idf = Math.log(1 + (totalDocs - docFreq + 0.5) / (docFreq + 0.5));
      const effectiveTf = bodyTf + (inHeading ? 2.0 : 0);
      const denom = effectiveTf + k1 * (1 - b + b * (docLen / Math.max(1, avgDocLen)));
      score += idf * ((effectiveTf * (k1 + 1)) / denom);
    }

    return {
      ...chunk,
      bm25Score: score,
      matchedTerms,
    };
  });

  scored.sort(
    (a, bChunk) =>
      bChunk.bm25Score - a.bm25Score ||
      a.pageNumber - bChunk.pageNumber ||
      a.chunkIndex - bChunk.chunkIndex
  );

  return scored;
}
