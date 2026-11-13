import { describe, expect, it, vi, afterEach } from "vitest";
import {
  layoutLessonBoard,
  shouldUseCompactLod,
  BOARD_GEOMETRY,
} from "@/lib/board/layout";
import {
  applyGroundingAndPrune,
  computeSectionCues,
  LessonValidationError,
  validateRawLessonOutline,
} from "@/lib/board/validate";
import { computeBoardTimeline } from "@/lib/board/timeline";
import {
  callGeminiTtsAudioWithMeta,
  PinnedTtsModelError,
} from "@/lib/whiteboard/ai-client";
import {
  DEFAULT_BOARD_LIMITS,
  getBoardLimits,
  LessonBoardData,
  LessonLink,
  LessonSection,
} from "@/types/lesson-board";

function makeSampleSections(): LessonSection[] {
  return [
    {
      id: "s1",
      title: "Plaque Rupture",
      kind: "mechanism",
      nodes: [
        {
          id: "n1",
          text: "Atherosclerotic plaque ruptures",
          kind: "cause",
          tone: "pathology",
          icon: "flame",
          source: { page: 12, quote: "Atherosclerotic plaque rupture exposes thrombogenic core" },
        },
        {
          id: "n2",
          text: "Platelet thrombus occludes lumen",
          kind: "effect",
          tone: "pathology",
          icon: "droplet",
          source: { page: 12, quote: "Platelets aggregate to form an occlusive thrombus" },
        },
      ],
      script: [
        { id: "seg1", nodeId: "n1", text: "First, look at how an unstable plaque ruptures." },
        { id: "seg2", nodeId: "n2", text: "Notice how this arrow leads straight to thrombus occlusion." },
      ],
    },
    {
      id: "s2",
      title: "Myocardial Ischemia",
      kind: "clinical",
      nodes: [
        {
          id: "n3",
          text: "Subendocardial oxygen supply drops",
          kind: "step",
          tone: "pathology",
          icon: "heart-pulse",
          source: { page: 13, quote: "Reduced coronary flow causes myocardial oxygen supply mismatch" },
        },
        {
          id: "n4",
          text: "Crushing substernal chest pain",
          kind: "sign",
          tone: "pathology",
          icon: "alert-triangle",
          source: { page: 13, quote: "Patients present with substernal chest pain radiating left" },
        },
      ],
      script: [
        { id: "seg3", nodeId: "n3", text: "Next, blood flow falls below myocardial demand." },
        { id: "seg4", nodeId: "n4", text: "Clinically, this presents as classic substernal chest pain." },
      ],
    },
    {
      id: "s3",
      title: "Diagnosis & Urgent Care",
      kind: "management",
      nodes: [
        {
          id: "n5",
          text: "Elevated cardiac troponin I",
          kind: "test",
          tone: "pathology",
          trend: "up",
          icon: "flask-conical",
          source: { page: 14, quote: "Serum cardiac troponin levels rise within hours" },
        },
        {
          id: "n6",
          text: "Immediate antiplatelet & PCI",
          kind: "treatment",
          tone: "normal",
          icon: "pill",
          source: { page: 14, quote: "Early dual antiplatelet therapy and percutaneous intervention restore flow" },
        },
      ],
      script: [
        { id: "seg5", nodeId: "n5", text: "To confirm necrosis, check rising troponin levels." },
        { id: "seg6", nodeId: "n6", text: "Finally, restore perfusion with antiplatelets and PCI." },
      ],
    },
  ];
}

function makeSampleLinks(): LessonLink[] {
  return [
    { from: "n1", to: "n2", kind: "causes", label: "triggers" },
    { from: "n2", to: "n3", kind: "leads_to" },
    { from: "n3", to: "n4", kind: "causes" },
    { from: "n4", to: "n5", kind: "leads_to" },
    { from: "n6", to: "n2", kind: "treats", label: "restores" },
  ];
}

describe("LessonBoard deterministic layout", () => {
  it("produces identical coordinates across repeated runs and follows S-route row reversal", () => {
    const sections = makeSampleSections();
    const links = makeSampleLinks();

    const a = layoutLessonBoard(sections, links);
    const b = layoutLessonBoard(sections, links);

    expect(a).toEqual(b);
    expect(a.sections).toHaveLength(3);
    // Row 0: s1 left (col 0), s2 right (col 1)
    expect(a.sections[0].col).toBe(0);
    expect(a.sections[1].col).toBe(1);
    expect(a.sections[0].rect.x).toBeLessThan(a.sections[1].rect.x);
    // Row 1 S-snake reverses: s3 sits on the right (col 1) directly under s2!
    expect(a.sections[2].row).toBe(1);
    expect(a.sections[2].col).toBe(1);
    expect(a.routeConnectors).toHaveLength(2);
    expect(a.links).toHaveLength(5);
  });

  it("enables compact LOD when zoomed out below legibility threshold", () => {
    const wideWorldWidth = BOARD_GEOMETRY.sectionWidth * 2 + 300; // ~2380
    expect(shouldUseCompactLod(wideWorldWidth, 800)).toBe(true);
    expect(shouldUseCompactLod(1128, 900)).toBe(false);
  });
});

describe("LessonBoard outline validation & grounding", () => {
  it("shares identical section limits between getBoardLimits and validateRawLessonOutline", () => {
    const limits = getBoardLimits("selection", 90, "concise");
    expect(limits.minSections).toBe(2);

    const outline = {
      title: "Acute Coronary Syndrome",
      objective: "Trace plaque rupture through urgent reperfusion.",
      sections: makeSampleSections(),
      links: makeSampleLinks(),
    };
    const validated = validateRawLessonOutline(outline, DEFAULT_BOARD_LIMITS);
    expect(validated.sections).toHaveLength(3);
  });

  it("rejects broken links pointing to nonexistent nodes", () => {
    const outline = {
      title: "Broken Link Test",
      objective: "Should reject links pointing to unknown node IDs.",
      sections: makeSampleSections(),
      links: [{ from: "n1", to: "n999", kind: "leads_to" as const }],
    };

    expect(() => validateRawLessonOutline(outline, DEFAULT_BOARD_LIMITS)).toThrow(
      LessonValidationError
    );
  });

  it("rejects boards with zero relationship links (no unrelated cards)", () => {
    const outline = {
      title: "Unlinked Cards Test",
      objective: "Should reject boards lacking any relationship links.",
      sections: makeSampleSections(),
      links: [],
    };

    expect(() => validateRawLessonOutline(outline, DEFAULT_BOARD_LIMITS)).toThrow(
      LessonValidationError
    );
  });

  it("drops ungrounded nodes visibly in droppedFacts and prunes broken links", () => {
    const sections = makeSampleSections();
    const links = makeSampleLinks();
    const sourceText = `
      [PAGE 12] Atherosclerotic plaque rupture exposes thrombogenic core. Platelets aggregate to form an occlusive thrombus.
      [PAGE 13] Reduced coronary flow causes myocardial oxygen supply mismatch. Patients present with substernal chest pain radiating left.
      [PAGE 14] Early dual antiplatelet therapy and percutaneous intervention restore flow.
    `;
    // Notice n5 quote ("Serum cardiac troponin levels rise within hours") is intentionally omitted from sourceText

    const { outline, droppedFacts } = applyGroundingAndPrune({
      outline: {
        title: "ACS Pathway",
        objective: "Understand ACS.",
        sections,
        links,
      },
      sourceText,
      validPages: new Set([12, 13, 14]),
      defaultPage: 12,
    });

    expect(droppedFacts).toHaveLength(1);
    expect(droppedFacts[0].text).toBe("Elevated cardiac troponin I");
    expect(outline.links.some((l) => l.from === "n5" || l.to === "n5")).toBe(false);
    expect(outline.sections.flatMap((s) => s.nodes).map((n) => n.id)).not.toContain("n5");
  });
});

describe("LessonBoard cues & progressive timeline", () => {
  it("builds continuous gapless cues summing exactly to audioDurationMs", () => {
    const sec = makeSampleSections()[0];
    const cues = computeSectionCues(sec.script, 14_250);
    expect(cues).toHaveLength(2);
    expect(cues[0].startMs).toBe(0);
    expect(cues[0].endMs).toBe(cues[1].startMs);
    expect(cues[1].endMs).toBe(14_250);
  });

  it("keeps past sections visible and reveals active section nodes sequentially", () => {
    const sections = makeSampleSections();
    const links = makeSampleLinks();
    const layout = layoutLessonBoard(sections, links);

    const lesson: LessonBoardData = {
      id: "l1",
      bookId: "b1",
      bookTitle: "Cardiology",
      scopeHash: "abc",
      pipelineVersion: 1,
      scope: { type: "page", startPage: 12, endPage: 14 },
      language: "en",
      pacing: "auto",
      title: "ACS",
      objective: "Understand ACS",
      sections,
      links,
      droppedFacts: [],
      status: "completed",
      activeVoiceId: "Sulafat",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      voiceTracks: {
        Sulafat: {
          voiceId: "Sulafat",
          pinnedModel: "gemini-3.8-flash-tts",
          style: "warm tutor",
          status: "ready",
          totalDurationMs: 30_000,
          sections: sections.map((s) => ({
            status: "ready",
            audioUrl: "https://example.com/a.wav",
            audioDurationMs: 10_000,
            cues: computeSectionCues(s.script, 10_000),
          })),
        },
      },
    };

    // During section 1 (index 1), cue 0 (first half): section 0 stays 1, section 1 active node n3 drawing, section 2 hidden (0)
    const tl = computeBoardTimeline({
      lesson,
      layout,
      voiceTrack: lesson.voiceTracks.Sulafat,
      activeSectionIndex: 1,
      sectionElapsedMs: 1500,
      isPlaying: true,
      isOverview: false,
    });

    expect(tl.nodeProgress.n1).toBe(1);
    expect(tl.nodeProgress.n2).toBe(1);
    expect(tl.activeNodeId).toBe("n3");
    expect(tl.nodeProgress.n3).toBeGreaterThan(0);
    expect(tl.nodeProgress.n4).toBe(0);
    expect(tl.nodeProgress.n5).toBe(0);
    expect(tl.penTarget?.active).toBe(true);
  });
});

describe("TTS single-model pinning invariant", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
  });

  it("throws PinnedTtsModelError when strictPin is enabled instead of silently switching models", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Model unavailable" } }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(
      callGeminiTtsAudioWithMeta({
        text: "Hello class",
        style: "warm tutor",
        voiceId: "Sulafat",
        preferredModel: "gemini-3.8-flash-tts",
        strictPin: true,
      })
    ).rejects.toBeInstanceOf(PinnedTtsModelError);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
