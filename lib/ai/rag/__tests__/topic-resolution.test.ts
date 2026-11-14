import { describe, it, expect } from "vitest";
import {
  extractPrimaryPageHeading,
  isGenericTopicTitle,
  resolveActivePageTopic,
  sanitizeStudyScope,
  sanitizeTopicCandidates,
} from "@/lib/ai/rag/topic-resolution";

describe("topic-resolution", () => {
  it("sanitizes generic 'General' topics and inverted page ranges like pp. 183–121", () => {
    const generic = sanitizeStudyScope(
      { type: "topic", topicTitle: "General", startPage: 183, endPage: 121 },
      195
    );
    expect(generic).toEqual({ type: "page", startPage: 195, endPage: 195 });

    const invertedRange = sanitizeStudyScope(
      { type: "range", startPage: 205, endPage: 195 },
      195
    );
    expect(invertedRange).toEqual({
      type: "range",
      startPage: 195,
      endPage: 205,
      topicTitle: undefined,
    });
  });

  it("filters generic titles and normalizes inverted pages in topicMap", () => {
    const cleaned = sanitizeTopicCandidates([
      { id: "1", title: "General", startPage: 183, endPage: 121 },
      { id: "2", title: "Arrhythmia", startPage: 201, endPage: 195 },
    ]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]).toMatchObject({
      id: "2",
      title: "Arrhythmia",
      startPage: 195,
      endPage: 201,
    });
  });

  it("recognizes active topic even when user is in the middle of a multi-page topic", () => {
    const res = resolveActivePageTopic({
      activePage: 198,
      activePageText: "Atrial fibrillation management and anticoagulation...",
      topicMapTopics: [
        { id: "c1", title: "Cardiomyopathies", startPage: 120, endPage: 135 },
        { id: "c2", title: "Arrhythmia", startPage: 195, endPage: 202 },
      ],
      query: "Generate a high-yield executive summary for Page 198",
    });

    expect(res.status).toBe("resolved");
    if (res.status === "resolved") {
      expect(res.topic.title).toBe("Arrhythmia");
      expect(res.topic.startPage).toBe(195);
      expect(res.topic.endPage).toBe(202);
    }
  });

  it("returns ambiguous candidates when multiple overlapping topics cover the active page", () => {
    const res = resolveActivePageTopic({
      activePage: 195,
      activePageText: "Cardiac rhythm and conduction disorders...",
      topicMapTopics: [
        { id: "t1", title: "Supraventricular Tachycardia", startPage: 194, endPage: 197 },
        { id: "t2", title: "Ventricular Arrhythmias", startPage: 195, endPage: 200 },
      ],
      query: "Executive Topic Summary",
    });

    expect(res.status).toBe("ambiguous");
    if (res.status === "ambiguous") {
      expect(res.candidates.map((c) => c.title)).toEqual([
        "Supraventricular Tachycardia",
        "Ventricular Arrhythmias",
      ]);
    }
  });

  it("extracts primary heading from live page text while skipping generic subheadings", () => {
    const heading = extractPrimaryPageHeading(
      "Page 195\nARRHYTHMIA\nOVERVIEW\nCardiac rhythm is normally initiated by the SA node."
    );
    expect(heading).toBe("ARRHYTHMIA");
    expect(isGenericTopicTitle("General")).toBe(true);
  });
});
