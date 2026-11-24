import { describe, expect, it } from "vitest";
import {
  computeReadinessScore,
  deferStepInSections,
  preserveStepsOnReplan,
} from "../utils";
import type { StudyPlanSection } from "@/types/study-plan";

function makeSampleSections(): StudyPlanSection[] {
  return [
    {
      id: "sec-1",
      title: "Day 1 · Renal Physiology",
      dayNumber: 1,
      scheduledDate: "2026-12-01",
      topics: ["GFR", "Filtration"],
      steps: [
        {
          id: "st-1",
          title: "Core Summary",
          type: "summary",
          startPage: 1,
          endPage: 8,
          estimatedMinutes: 20,
          status: "completed",
          generatedContent: {
            kind: "summary",
            keyTakeaways: ["GFR depends on Starling forces"],
            highYieldNotes: ["Afferent arteriole dilates with PGs"],
            clinicalPearls: [],
          },
          completedAt: "2026-12-01T10:00:00.000Z",
        },
        {
          id: "st-2",
          title: "Recall Quiz",
          type: "quiz",
          startPage: 1,
          endPage: 8,
          estimatedMinutes: 25,
          status: "pending",
          generatedContent: null,
          completedAt: null,
        },
      ],
    },
    {
      id: "sec-2",
      title: "Day 2 · Tubular Reabsorption",
      dayNumber: 2,
      scheduledDate: "2026-12-02",
      topics: ["PCT", "Loop of Henle"],
      steps: [
        {
          id: "st-3",
          title: "Flashcard Drill",
          type: "flashcards",
          startPage: 9,
          endPage: 16,
          estimatedMinutes: 20,
          status: "ready",
          generatedContent: null,
          completedAt: null,
        },
      ],
    },
  ];
}

describe("Study Plan utils", () => {
  it("computes weighted readiness score and excludes deferred steps from active pool", () => {
    const sections = makeSampleSections();
    // Total weights: summary(1.0 completed=1.0) + quiz(1.4 pending=0) + flashcards(1.25 ready=0.1875) = 1.1875 / 3.65 => 33%
    expect(computeReadinessScore(sections)).toBe(33);

    const deferred = deferStepInSections(sections, "st-2", false);
    expect(deferred.found).toBe(true);
    // Remaining active: summary(1.0 completed) + flashcards(1.25 ready=0.1875) = 1.1875 / 2.25 => 53%
    expect(computeReadinessScore(deferred.sections)).toBe(53);
  });

  it("moves deferred step into the next session or creates a catch-up session", () => {
    const sections = makeSampleSections();
    const res1 = deferStepInSections(sections, "st-2", true);
    expect(res1.found).toBe(true);
    expect(res1.sections[0].steps.map((s) => s.id)).toEqual(["st-1"]);
    expect(res1.sections[1].steps.map((s) => s.id)).toEqual(["st-2", "st-3"]);

    // Deferring from the last session appends a new catch-up session
    const res2 = deferStepInSections(res1.sections, "st-3", true);
    expect(res2.sections).toHaveLength(3);
    expect(res2.sections[2].dayNumber).toBe(3);
    expect(res2.sections[2].scheduledDate).toBe("2026-12-03");
    expect(res2.sections[2].steps[0].id).toBe("st-3");
  });

  it("preserves completed status and generated content across conversational replanning", () => {
    const existing = makeSampleSections();
    const replanned: StudyPlanSection[] = [
      {
        id: "sec-1",
        title: "Day 1 · Condensed Renal",
        dayNumber: 1,
        scheduledDate: "2026-12-01",
        topics: ["GFR"],
        steps: [
          {
            id: "st-1",
            title: "Core Summary (Refocused)",
            type: "summary",
            startPage: 1,
            endPage: 8,
            estimatedMinutes: 15,
            status: "pending",
            generatedContent: null,
            completedAt: null,
          },
          {
            id: "st-new",
            title: "High-Yield Reading",
            type: "reading",
            startPage: 4,
            endPage: 7,
            estimatedMinutes: 15,
            status: "pending",
            generatedContent: null,
            completedAt: null,
          },
        ],
      },
    ];

    const merged = preserveStepsOnReplan(existing, replanned);
    expect(merged[0].steps[0].status).toBe("completed");
    expect(merged[0].steps[0].generatedContent?.kind).toBe("summary");
    expect(merged[0].steps[1].status).toBe("pending");
  });
});
