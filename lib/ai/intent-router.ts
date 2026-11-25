export type QueryIntent =
  | "acknowledgment"
  | "recap"
  | "direct"
  | "math_calc"
  | "explain"
  | "quiz";

export interface QueryClassification {
  intent: QueryIntent;
  tier: "fast" | "deep";
  enableCodeExecution: boolean;
}

const ACK_RE =
  /^(ok|okay|k|cool|good|great|nice|got it|understood|makes sense|thanks|thank you|thx|ty|تمام|شكرا|شكراً|فهمت|حلو|ممتاز|جميل|ماشي|اوك|حاضر)[!.\s؟?]*$/i;

const RECAP_RE =
  /(what have we studied|what did we cover|summarize what we covered|recap so far|احنا درسنا|ذاكرنا ايه|لخص اللي فات|اخدنا ايه)/i;

const QUIZ_RE =
  /\b(morph|quiz|qbank|test me|vignette|flashcard|mcq|practice question)\b|اختبرني|امتحني|سؤال اختياري/i;

const DEEP_REASONING_RE =
  /\b(explain|mechanism|pathophysiology|differential|compare|contrast|why|how does|walk me through|summarize|summary|breakdown|cascade|management|algorithm|diagnos)\b|اشرح|لخص|قارن|آلية|الفرق بين|لماذا|كيف يعمل/i;

const MATH_CALC_RE =
  /(henderson[-\s]?hasselbalch|anion gap|osmolarity|osmolality|creatinine clearance|cockcroft|winter'?s formula|parkland|alveolar[-\s]?arterial|a-a gradient|sensitivity|specificity|ppv|npv|odds ratio|relative risk|half[-\s]?life|clearance|loading dose|maintenance dose|pka|ph\s*=|stoichiometr|molarity|dilution)|\b(calculate|compute|solve|derive|equation|dose|dosage|mg\/kg|ml\/hr|mcg\/kg)\b|احسب|معادلة|حساب|جرعة/i;

export function classifyStudyQuery(
  query: string,
  hasImage: boolean
): QueryClassification {
  const trimmed = (query || "").trim();

  if (!hasImage && ACK_RE.test(trimmed)) {
    return { intent: "acknowledgment", tier: "fast", enableCodeExecution: false };
  }

  if (RECAP_RE.test(trimmed)) {
    return {
      intent: "recap",
      tier: hasImage ? "deep" : "fast",
      enableCodeExecution: false,
    };
  }

  if (QUIZ_RE.test(trimmed)) {
    return { intent: "quiz", tier: "deep", enableCodeExecution: false };
  }

  const hasNumericAndCalcVerb =
    /\d/.test(trimmed) &&
    /([=+\-*/^]|\b(calculate|solve|compute|find|what is|how much|how many|rate|percent|ratio)\b|احسب|كام|كم)/i.test(
      trimmed
    );

  if (MATH_CALC_RE.test(trimmed) || hasNumericAndCalcVerb) {
    return { intent: "math_calc", tier: "deep", enableCodeExecution: true };
  }

  if (!hasImage && trimmed.length > 0 && trimmed.length < 90 && !DEEP_REASONING_RE.test(trimmed)) {
    return { intent: "direct", tier: "fast", enableCodeExecution: false };
  }

  return { intent: "explain", tier: "deep", enableCodeExecution: false };
}

export function buildIntentPromptAddon(
  intent: QueryIntent,
  socraticMode?: boolean
): string {
  const lines: string[] = [];

  switch (intent) {
    case "acknowledgment":
      lines.push(
        "INTENT DIRECTIVE (ACKNOWLEDGMENT): Reply warmly in 1–2 brief sentences and suggest one logical next check or concept."
      );
      break;
    case "recap":
      lines.push(
        "INTENT DIRECTIVE (SESSION RECAP): Synthesize the conversation history into a concise bulleted summary of mastered concepts and open gaps."
      );
      break;
    case "direct":
      lines.push(
        "INTENT DIRECTIVE (DIRECT QUESTION): Lead immediately with a crisp 2–4 sentence answer containing exact values, definitions, or criteria before any optional elaboration."
      );
      break;
    case "math_calc":
      lines.push(
        "INTENT DIRECTIVE (CALCULATION & QUANTITATIVE): State the governing formula explicitly, verify every arithmetic step using code execution when available, show units on every intermediate and final value, and interpret the clinical/academic meaning of the number."
      );
      break;
    case "quiz":
      lines.push(
        "INTENT DIRECTIVE (ACTIVE RECALL / QUIZ): Challenge the student with board-style reasoning and clear distractor rationales."
      );
      break;
    case "explain":
    default:
      lines.push(
        "INTENT DIRECTIVE (DEEP EXPLANATION): Break down first-principles mechanisms step by step with clean arrows, criteria, and high-yield exam pearls."
      );
      break;
  }

  if (socraticMode) {
    lines.push(
      "SOCRATIC TUTOR MODE ACTIVE (OVERRIDES LECTURE/TABLE DUMPS): You are coaching the student step-by-step through active recall. " +
        "1) If the student is answering your previous Socratic question, DO NOT treat their reply as a new standalone topic request and DO NOT dump a long explanation or comparison table. Instead: briefly evaluate their answer in 1–2 sentences (affirm what is correct, gently refine any miss or nuance), then advance them to the NEXT logical step of the mechanism/management algorithm with ONE focused follow-up question. " +
        "2) If the student is asking a brand-new question, give a concise 1–3 sentence hint or partial scaffold anchored to their source text, then end with ONE focused probing question for them to answer next. " +
        "3) Only reveal the complete full explanation immediately if the student explicitly asks to reveal/give the full answer."
    );
  }

  return lines.join("\n\n");
}
