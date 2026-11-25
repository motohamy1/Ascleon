import React from "react";
import { describe, expect, it } from "vitest";
import { containsArabic, renderBidiNodes, resolveTextDirection } from "@/components/ui/BiDiText";

function extractBdiTexts(nodes: React.ReactNode): string[] {
  const result: string[] = [];
  const list = Array.isArray(nodes) ? nodes : [nodes];
  for (const node of list) {
    if (
      React.isValidElement<{ children?: React.ReactNode; dir?: string }>(node) &&
      node.type === "bdi"
    ) {
      expect(node.props.dir).toBe("ltr");
      result.push(String(node.props.children));
    }
  }
  return result;
}

describe("BiDiText mixed Arabic + English isolation", () => {
  it("keeps full English words and multi-word medical phrases intact instead of splitting per letter", () => {
    const sample =
      "تعال نبص على الـ table ده بتاع الـ Risk Factors ونربطه بالـ pathophysiology لـ Acute Coronary Syndrome (ACS) ع السريع!";
    const nodes = renderBidiNodes(sample);
    const bdis = extractBdiTexts(nodes);

    expect(bdis).toEqual([
      "table",
      "Risk Factors",
      "pathophysiology",
      "Acute Coronary Syndrome (ACS)",
    ]);
  });

  it("handles hyphenated, slashed, numeric, and trailing-punctuation terms cleanly", () => {
    const sample =
      "الـ premature coronary artery disease في first-degree relatives بيعمل micro/macrovascular damage قبل سن 55 للرجالة أو 56 للستات.";
    const nodes = renderBidiNodes(sample);
    const bdis = extractBdiTexts(nodes);

    expect(bdis).toEqual([
      "premature coronary artery disease",
      "first-degree relatives",
      "micro/macrovascular damage",
      "55",
      "56",
    ]);
  });

  it("does not swallow opening parenthesis before Arabic text", () => {
    const sample = "Unmodifiable Risk Factors (حاجات مش بإيدينا نغيرها):";
    const nodes = renderBidiNodes(sample);
    const bdis = extractBdiTexts(nodes);

    expect(bdis).toEqual(["Unmodifiable Risk Factors"]);
  });

  it("handles quick 1-question oral check and Reperfusion therapy without reversal", () => {
    const sample =
      "حبايبي، تحب نعمل quick 1-question oral check على الحتة دي ولا ندخل في الـ Management والـ Reperfusion therapy؟";
    const nodes = renderBidiNodes(sample);
    const bdis = extractBdiTexts(nodes);

    expect(bdis).toEqual([
      "quick 1-question oral check",
      "Management",
      "Reperfusion therapy",
    ]);
  });

  it("resolves paragraph direction to rtl for mixed Arabic/English and ltr for pure English", () => {
    expect(
      resolveTextDirection("الـ Pathophysiology بتبدأ بـ initial endothelial dysfunction")
    ).toBe("rtl");
    expect(
      resolveTextDirection("ECG بيوضح ST elevation في leads V1-V4")
    ).toBe("rtl");
    expect(resolveTextDirection("Acute Coronary Syndrome (ACS) overview")).toBe("ltr");
  });

  it("detects Arabic characters cleanly via containsArabic", () => {
    expect(containsArabic("تشخيص الحالة مع troponin")).toBe(true);
    expect(containsArabic("Acute Coronary Syndrome (ACS)")).toBe(false);
    expect(containsArabic("")).toBe(false);
  });
});
