import { describe, it, expect } from "vitest";
import { sanitizeTopicCandidates } from "@/lib/ai/rag/topic-resolution";
import {
  clearModelCooldown,
  GEMINI_MODEL_CHAIN,
  isModelCoolingDown,
  markModelCooldownFromError,
  orderModelsByHealth,
} from "@/lib/ai/model-cooldown";
import { resolveTextDirection } from "@/components/ui/BiDiText";

describe("Platform fixes regression suite", () => {
  it("subdivides oversized legacy topic ranges into focused <=12 page segments", () => {
    const rawTopics = [
      {
        id: "huge-bucket",
        title: "Cardiovascular Physiology & Shock",
        startPage: 1,
        endPage: 60,
        keyConcepts: ["Preload", "Afterload"],
      },
      {
        id: "focused-topic",
        title: "Frank-Starling Mechanism",
        startPage: 61,
        endPage: 68,
      },
    ];

    const sanitized = sanitizeTopicCandidates(rawTopics);
    expect(sanitized.length).toBe(6);
    expect(sanitized[0]).toMatchObject({
      title: "Cardiovascular Physiology & Shock (Part 1)",
      startPage: 1,
      endPage: 12,
    });
    expect(sanitized[4]).toMatchObject({
      title: "Cardiovascular Physiology & Shock (Part 5)",
      startPage: 49,
      endPage: 60,
    });
    expect(sanitized[5]).toMatchObject({
      title: "Frank-Starling Mechanism",
      startPage: 61,
      endPage: 68,
    });
    for (const t of sanitized) {
      expect(t.endPage - t.startPage + 1).toBeLessThanOrEqual(12);
    }
  });

  it("marks overloaded models into cooldown and prioritizes healthy fallbacks", () => {
    const model = GEMINI_MODEL_CHAIN[0];
    clearModelCooldown(`gemini:${model}`);

    markModelCooldownFromError(
      `gemini:${model}`,
      new Error("503 Service Unavailable: The model is overloaded. Please try again later.")
    );

    expect(isModelCoolingDown(`gemini:${model}`)).toBe(true);
    const ordered = orderModelsByHealth(GEMINI_MODEL_CHAIN);
    expect(ordered[0]).not.toBe(model);
    expect(ordered[ordered.length - 1]).toBe(model);

    clearModelCooldown(`gemini:${model}`);
  });

  it("resolves mixed Arabic + English clinical text cleanly as RTL", () => {
    expect(resolveTextDirection("الـ Acute Coronary Syndrome (ACS) بيحصل لما")).toBe("rtl");
    expect(resolveTextDirection("ECG changes in inferior STEMI lead II, III, aVF")).toBe("ltr");
    expect(resolveTextDirection("بسبب Preload")).toBe("rtl");
  });
});
