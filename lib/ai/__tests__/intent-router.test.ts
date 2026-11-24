import { describe, expect, it } from "vitest";
import {
  buildIntentPromptAddon,
  classifyStudyQuery,
} from "../intent-router";

describe("AI Engine intent-router", () => {
  it("routes simple acknowledgments and direct short queries to the fast tier", () => {
    const ack = classifyStudyQuery("thanks!", false);
    expect(ack.intent).toBe("acknowledgment");
    expect(ack.tier).toBe("fast");
    expect(ack.enableCodeExecution).toBe(false);

    const direct = classifyStudyQuery("Normal serum sodium level?", false);
    expect(direct.intent).toBe("direct");
    expect(direct.tier).toBe("fast");
    expect(direct.enableCodeExecution).toBe(false);
  });

  it("routes clinical calculations and quantitative problems to deep tier with code execution", () => {
    const anionGap = classifyStudyQuery(
      "Calculate the anion gap for Na 140, Cl 102, HCO3 14",
      false
    );
    expect(anionGap.intent).toBe("math_calc");
    expect(anionGap.tier).toBe("deep");
    expect(anionGap.enableCodeExecution).toBe(true);

    const arMath = classifyStudyQuery("احسب جرعة الدواء 15 * 70", false);
    expect(arMath.intent).toBe("math_calc");
    expect(arMath.tier).toBe("deep");
    expect(arMath.enableCodeExecution).toBe(true);
  });

  it("routes deep mechanism questions and quizzes to deep tier without code execution", () => {
    const explain = classifyStudyQuery(
      "Explain the pathophysiology of heart failure",
      false
    );
    expect(explain.intent).toBe("explain");
    expect(explain.tier).toBe("deep");
    expect(explain.enableCodeExecution).toBe(false);

    const quiz = classifyStudyQuery("Give me an MCQ to test me", false);
    expect(quiz.intent).toBe("quiz");
    expect(quiz.tier).toBe("deep");
  });

  it("appends Socratic tutoring directive only when socraticMode is enabled", () => {
    const standard = buildIntentPromptAddon("explain", false);
    expect(standard).toContain("DEEP EXPLANATION");
    expect(standard).not.toContain("SOCRATIC TUTOR MODE ACTIVE");

    const socratic = buildIntentPromptAddon("direct", true);
    expect(socratic).toContain("DIRECT QUESTION");
    expect(socratic).toContain("SOCRATIC TUTOR MODE ACTIVE");
  });
});
