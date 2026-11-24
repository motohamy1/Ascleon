import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  chunkPageText,
  computeLexicalOverlap,
  extractDeterministicPageMetadata,
  isPlaceholderPageText,
  normalizeArabic,
  scoreChunksBM25,
  tokenizeText,
} from "@/lib/ai/rag/chunker";
import { preparePageAwareHistory } from "@/lib/ai/agent-harness";

const mockConnectToDatabase = vi.fn();
const mockBookFindById = vi.fn();
const mockBookSegmentFind = vi.fn();

vi.mock("@/database/mongoose", () => ({
  connectToDatabase: () => mockConnectToDatabase(),
}));

vi.mock("@/database/models/book.model", () => ({
  default: {
    findById: (...args: unknown[]) => mockBookFindById(...args),
  },
}));

vi.mock("@/database/models/book-segment.model", () => ({
  default: {
    find: (...args: unknown[]) => mockBookSegmentFind(...args),
  },
}));

function makeQueryChain<T>(result: T) {
  const chain = {
    select: () => chain,
    sort: () => chain,
    limit: () => chain,
    lean: async () => result,
  };
  return chain;
}

describe("RAG Chunker, Multilingual BM25 & Misalignment Detection", () => {
  it("normalizes Arabic diacritics and tokenizes multilingual text while removing stopwords", () => {
    const normalized = normalizeArabic("أَشْرَحُ الفِيزْيُولُوجْيَا المَرَضِيَّةَ لِفَشَلِ القَلْبِ");
    expect(normalized).toBe("اشرح الفيزيولوجيا المرضيه لفشل القلب");

    const tokens = tokenizeText("Explain the pathophysiology of heart failure in this page و اشرح فشل القلب");
    expect(tokens).not.toContain("explain");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("page");
    expect(tokens).not.toContain("اشرح");
    expect(tokens).toContain("pathophysiology");
    expect(tokens).toContain("heart");
    expect(tokens).toContain("failure");
    expect(tokens).toContain("فشل");
    expect(tokens).toContain("القلب");
  });

  it("splits long pages into overlapping structure-aware chunks", () => {
    const paraA = Array.from({ length: 140 }, (_, i) => `cardiac${i}`).join(" ");
    const paraB = Array.from({ length: 140 }, (_, i) => `renal${i}`).join(" ");
    const text = `AORTIC STENOSIS\n\n${paraA}\n\n${paraB}`;

    const chunks = chunkPageText(12, text, { maxWords: 160, overlapWords: 30 });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].pageNumber).toBe(12);
    expect(chunks[0].headingHint).toBe("AORTIC STENOSIS");

    // Second chunk carries tail overlap from first chunk
    const firstChunkWords = chunks[0].text.split(/\s+/);
    const tailWord = firstChunkWords[firstChunkWords.length - 1];
    expect(chunks[1].text).toContain(tailWord);
  });

  it("extracts headings, key terms, and clean summary deterministically", () => {
    const meta = extractDeterministicPageMetadata(
      45,
      "Page 45\nPULMONARY EMBOLISM\nAcute pulmonary embolism causes sudden right ventricular afterload elevation and ventilation-perfusion mismatch. CT pulmonary angiography is the definitive diagnostic test in hemodynamically stable patients."
    );
    expect(meta.headings).toContain("PULMONARY EMBOLISM");
    expect(meta.keyTerms).toContain("pulmonary");
    expect(meta.summary).toContain("Acute pulmonary embolism");
    expect(isPlaceholderPageText("[Page 3: Visual diagram or scanned page]")).toBe(true);
    expect(isPlaceholderPageText("Too short")).toBe(true);
    expect(
      isPlaceholderPageText(
        "Acute pulmonary embolism causes sudden right ventricular afterload elevation."
      )
    ).toBe(false);
  });

  it("ranks English and Arabic chunks accurately using Okapi BM25", () => {
    const chunks = [
      {
        chunkId: "p1-c0",
        pageNumber: 1,
        chunkIndex: 0,
        text: "فشل القلب الاحتقاني يؤدي إلى احتباس السوائل وزيادة الضغط الوريدي الرئوي",
        wordCount: 11,
        headingHint: "فشل القلب",
      },
      {
        chunkId: "p2-c0",
        pageNumber: 2,
        chunkIndex: 0,
        text: "الربو الشعبي يسبب ضيقاً في الشعب الهوائية مع أزيز عند الزفير",
        wordCount: 11,
        headingHint: "الربو الشعبي",
      },
    ];

    const ranked = scoreChunksBM25("ما هي آلية فشل القلب واحتباس السوائل", chunks);
    expect(ranked[0].pageNumber).toBe(1);
    expect(ranked[0].bm25Score).toBeGreaterThan(ranked[1].bm25Score);
  });

  it("detects misaligned text pairs accurately via lexical overlap", () => {
    const liveAortic =
      "Aortic stenosis causes left ventricular hypertrophy, concentric remodeling, exertional syncope, angina, and dyspnea with a crescendo-decrescendo systolic murmur.";
    const alignedDb =
      "Aortic stenosis produces concentric left ventricular hypertrophy and classic SAD symptoms: syncope, angina, and dyspnea with systolic ejection murmur.";
    const misalignedDb =
      "Insulin resistance in type 2 diabetes mellitus impairs GLUT4 translocation in skeletal muscle and adipose tissue.";

    expect(computeLexicalOverlap(liveAortic, alignedDb)).toBeGreaterThan(0.35);
    expect(computeLexicalOverlap(liveAortic, misalignedDb)).toBeLessThan(0.12);
  });
});

describe("Hybrid Book RAG Retriever Alignment & Fallbacks", () => {
  const validBookId = "65f1a2b3c4d5e6f7a8b9c0d1";

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectToDatabase.mockResolvedValue(undefined);
    mockBookFindById.mockReturnValue(
      makeQueryChain({
        _id: validBookId,
        title: "Clinical Cardiology",
        domain: "Cardiology",
        subspecialty: "Valvular Heart Disease",
        blueprint: {},
      })
    );
  });

  it("returns alignmentStatus='verified' when DB segment matches live page text 1:1", async () => {
    mockBookSegmentFind.mockReturnValue(
      makeQueryChain([
        {
          pageNumber: 24,
          segmentIndex: 23,
          content:
            "Mitral stenosis causes left atrial enlargement, elevated pulmonary venous pressure, orthopnea, and a low-pitched diastolic rumble with an opening snap.",
          headings: ["Mitral Stenosis"],
          keyTerms: ["mitral", "stenosis", "opening", "snap"],
          clinicalEntities: ["Left atrial enlargement"],
          goldStandards: ["Transthoracic echocardiography"],
          summary: "Mitral stenosis pathophysiology and auscultation.",
        },
      ])
    );

    const { retrieveFromBookRAG } = await import("@/lib/ai/rag/book-rag-retriever");
    const res = await retrieveFromBookRAG({
      bookId: validBookId,
      query: "Explain mitral stenosis murmur",
      scope: { type: "page", startPage: 24, endPage: 24 },
      activePage: 24,
      livePageText:
        "Mitral stenosis results in left atrial enlargement, pulmonary venous congestion, and an opening snap followed by a diastolic rumble.",
    });

    expect(res.alignmentStatus).toBe("verified");
    expect(res.citedPages).toEqual([24]);
    expect(res.goldStandardsFound).toContain("Transthoracic echocardiography");
    expect(res.combinedContext).toContain("Mitral Stenosis");
  });

  it("rejects shifted/misaligned DB segments and preserves livePageText", async () => {
    mockBookSegmentFind.mockReturnValue(
      makeQueryChain([
        {
          pageNumber: 50,
          segmentIndex: 49,
          content:
            "Diabetic ketoacidosis presents with hyperglycemia, high anion gap metabolic acidosis, Kussmaul respirations, and positive serum ketones.",
          headings: ["Diabetic Ketoacidosis"],
          goldStandards: ["IV regular insulin and normal saline"],
        },
      ])
    );

    const { retrieveFromBookRAG } = await import("@/lib/ai/rag/book-rag-retriever");
    const livePage50 =
      "Acute pericarditis presents with pleuritic chest pain relieved by leaning forward, diffuse concave ST elevations, and PR segment depression.";

    const res = await retrieveFromBookRAG({
      bookId: validBookId,
      query: "Explain this page",
      scope: { type: "page", startPage: 50, endPage: 50 },
      activePage: 50,
      livePageText: livePage50,
    });

    expect(res.alignmentStatus).toBe("misaligned_fallback");
    expect(res.combinedContext).toContain("Acute pericarditis");
    expect(res.combinedContext).not.toContain("Diabetic ketoacidosis");
    expect(res.goldStandardsFound).toEqual([]);
  });

  it("handles legacy books with missing pageNumber fields without crashing", async () => {
    mockBookSegmentFind
      .mockReturnValueOnce(makeQueryChain([]))
      .mockReturnValueOnce(makeQueryChain([]));

    const { retrieveFromBookRAG } = await import("@/lib/ai/rag/book-rag-retriever");
    const liveText =
      "Constrictive pericarditis impairs ventricular diastolic filling and causes Kussmaul sign and pericardial knock.";
    const res = await retrieveFromBookRAG({
      bookId: validBookId,
      query: "Summarize this page",
      scope: { type: "page", startPage: 88, endPage: 88 },
      activePage: 88,
      livePageText: liveText,
    });

    expect(res.alignmentStatus).toBe("live_only");
    expect(res.citedPages).toEqual([88]);
    expect(res.combinedContext).toContain("Constrictive pericarditis");
  });

  it("handles invalid/sample non-ObjectId bookId cleanly without CastError", async () => {
    const { retrieveFromBookRAG } = await import("@/lib/ai/rag/book-rag-retriever");
    const res = await retrieveFromBookRAG({
      bookId: "sample-cardio-book",
      query: "Explain",
      scope: { type: "page", startPage: 3, endPage: 3 },
      activePage: 3,
      livePageText:
        "Ventricular septal defect creates a holosystolic murmur best heard at the left lower sternal border.",
    });

    expect(res.alignmentStatus).toBe("live_only");
    expect(res.citedPages).toEqual([3]);
    expect(res.combinedContext).toContain("Ventricular septal defect");
    expect(mockBookFindById).not.toHaveBeenCalled();
  });
});

describe("Page-Switch History Isolation", () => {
  const sampleHistory = [
    { sender: "user" as const, text: "Explain aortic stenosis", pageNumber: 12 },
    { sender: "ai" as const, text: "Aortic stenosis causes systolic ejection murmur.", pageNumber: 12 },
    { sender: "user" as const, text: "What is on this page?", pageNumber: 95 },
    { sender: "ai" as const, text: "Page 95 covers acute pancreatitis.", pageNumber: 95 },
  ];

  it("drops previous-page history on fresh page-anchored queries after navigating", () => {
    const isolated = preparePageAwareHistory(
      sampleHistory,
      95,
      "Explain this page",
      "explain"
    );

    expect(isolated).toHaveLength(2);
    expect(isolated.every((h) => h.pageNumber === 95)).toBe(true);
    expect(isolated.map((h) => h.text).join(" ")).not.toContain("Aortic stenosis");
  });

  it("retains and explicitly labels earlier-page turns when user requests recap or comparison", () => {
    const recap = preparePageAwareHistory(
      sampleHistory,
      95,
      "What have we studied so far?",
      "recap"
    );

    expect(recap).toHaveLength(4);
    expect(recap[0].text).toContain("[Earlier turn while viewing Page 12]:");
    expect(recap[2].text).toBe("What is on this page?");
  });
});
