import { afterEach, describe, expect, it } from "vitest";
import { matchReal3DAsset } from "../anatomy-registry";
import { sanitizeBoardOps } from "../validate";
import { layoutBoardOps } from "../ops-layout";
import type { LessonSection } from "@/types/lesson-board";

describe("Real 3D asset registry & rich 2D ops validation", () => {
  const originalBase = process.env.NEXT_PUBLIC_3D_ASSETS_BASE_URL;

  afterEach(() => {
    if (originalBase === undefined) {
      delete process.env.NEXT_PUBLIC_3D_ASSETS_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_3D_ASSETS_BASE_URL = originalBase;
    }
  });

  it("matches PubChem small-molecule compounds even when GLB CDN env is unset", () => {
    delete process.env.NEXT_PUBLIC_3D_ASSETS_BASE_URL;
    const drug = matchReal3DAsset("Aspirin inhibits COX-1 and COX-2 platelets", "Pharmacology");
    expect(drug?.tier).toBe("molecule-3d");
    if (drug?.tier === "molecule-3d") {
      expect(drug.compoundName).toBe("aspirin");
    }

    // Without CDN base URL, anatomy returns null so built-in anatomy/procedural fallback runs
    expect(matchReal3DAsset("Left ventricular myocardium", "Cardiac Anatomy")).toBeNull();
  });

  it("resolves GLB anatomy packs in English and Arabic when CDN base URL is configured", () => {
    process.env.NEXT_PUBLIC_3D_ASSETS_BASE_URL = "https://cdn.example.com/anatomy/";
    const heart = matchReal3DAsset("تشريح القلب وصمامات البطين الأيسر", "القلب");
    expect(heart?.tier).toBe("glb-anatomy");
    if (heart?.tier === "glb-anatomy") {
      expect(heart.packId).toBe("heart");
      expect(heart.glbUrl).toBe("https://cdn.example.com/anatomy/heart.glb");
    }
  });

  it("sanitizes function_plot, data_chart, and source_figure and degrades invalid ops safely", () => {
    const clean = sanitizeBoardOps(
      [
        { t: "function_plot", title: "Sine", expr: "sin(x)", xRange: [0, 6.28] },
        { t: "function_plot", title: "Broken", expr: "???invalid((" },
        { t: "data_chart", title: "Prevalence", chartType: "pie", chartItems: [{ label: "Type A", value: 70 }, { label: "Type B", value: 30 }] },
        { t: "data_chart", title: "Empty Chart", chartType: "bar", items: [{ label: "Only One", value: 10 }] },
        { t: "source_figure", caption: "Nephron filtration barrier", page: 14, callouts: ["Podocyte", "GBM"] },
      ],
      new Set([14, 15]),
      14
    );

    expect(clean[0].t).toBe("function_plot");
    expect(clean[1].t).toBe("write");
    expect(clean[2].t).toBe("data_chart");
    expect(clean[3].t).toBe("bullets");
    expect(clean[4].t).toBe("source_figure");

    const section: LessonSection = {
      id: "sec-rich",
      title: "Rich Visuals",
      kind: "mechanism",
      nodes: [
        {
          id: "n1",
          text: "Filtration curve",
          kind: "step",
          tone: "normal",
          source: { page: 14, quote: "Nephron filtration barrier" },
        },
      ],
      ops: clean,
      script: [{ id: "s1", nodeId: "n1", text: "Observe the curve and proportions." }],
    };

    const layout = layoutBoardOps({
      lessonId: "rich-test",
      section,
      sectionIndex: 0,
      links: [],
    });
    expect(layout.primitives.some((p) => p.k === "stroke")).toBe(true);
    expect(layout.primitives.some((p) => p.k === "badge" && p.label === "Fig p.14")).toBe(true);
  });
});
