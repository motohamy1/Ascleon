export type StudyLanguage = "en" | "ar" | "mixed";

export interface LanguageOption {
  id: StudyLanguage;
  label: string;
  sublabel: string;
  flag?: string;
  dir: "ltr" | "rtl";
}

export const STUDY_LANGUAGES: LanguageOption[] = [
  { id: "en", label: "EN", sublabel: "English only", dir: "ltr" },
  { id: "ar", label: "عربي", sublabel: "Egyptian Colloquial", dir: "rtl" },
  { id: "mixed", label: "Mix عربي / EN", sublabel: "مكس مصري + English", dir: "ltr" },
];

export const DEFAULT_STUDY_LANGUAGE: StudyLanguage = "en";

/**
 * Normalizes streaming transcript fragments so mixed Arabic + English text
 * doesn't glue characters across script boundaries or scramble layout.
 */
export function joinStreamingTranscript(previous: string, chunk: string): string {
  if (!previous) return chunk || "";
  if (!chunk) return previous;

  const prevLastChar = previous.slice(-1);
  const nextFirstChar = chunk.charAt(0);

  // If there's already whitespace at boundary, join directly
  if (/\s/.test(prevLastChar) || /\s/.test(nextFirstChar)) {
    return previous + chunk;
  }

  // Detect script boundary: Arabic (\u0600-\u06FF) transition to/from Latin or Digit
  const isArabicChar = (c: string) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(c);
  const isLatinOrDigit = (c: string) => /[A-Za-z0-9]/.test(c);

  if (
    (isArabicChar(prevLastChar) && isLatinOrDigit(nextFirstChar)) ||
    (isLatinOrDigit(prevLastChar) && isArabicChar(nextFirstChar))
  ) {
    return previous + " " + chunk;
  }

  return previous + chunk;
}

/**
 * Checks whether an incoming voice transcription fragment is spurious foreign noise
 * (e.g., Spanish greetings like '¿Qué tal?' or '¿Qué?' produced by unconstrained ASR on speaker bleed/breaths).
 */
export function isHallucinatedNoiseTranscript(text: string): boolean {
  if (!text) return true;
  const cleaned = text.trim();
  if (!cleaned) return true;

  // Standalone single-word or short foreign greeting/noise hallucinations
  const foreignNoiseRegex = /^(¿?\s*(qué|que|qué tal|hola|gracias|bueno|por favor|cómo|como)\s*\??|\?|¿|¡)+$/i;
  if (foreignNoiseRegex.test(cleaned)) {
    return true;
  }

  // If text has Spanish question/exclamation marks without any Arabic or standard medical English
  if (/^[¿¡]/.test(cleaned) && !/[\u0600-\u06FF]/.test(cleaned) && cleaned.split(/\s+/).length <= 2) {
    return true;
  }

  return false;
}

/**
 * Builds a strict prompt directive for language mode.
 * - Egyptian Colloquial Arabic (اللهجة المصرية الإكلينيكية زي شرح دكتور وائل)
 * - Mixed Egyptian Arabic + English medical terms
 * - Pure English
 */
export function buildLanguageDirective(
  mode: StudyLanguage = "en",
  target: "voice" | "text" | "json" = "text"
): string {
  const jsonRule =
    target === "json"
      ? "\nCRITICAL: Keep all JSON keys exactly in English as specified in the schema. Only the user-facing string values should be localized."
      : "";

  const spokenRule =
    target === "voice"
      ? `\nSpoken Delivery: Keep your speech natural, friendly, and conversational. Do NOT use markdown symbols (*, #, \`), bullet lists, or emojis because this is being streamed directly as spoken audio.
ASR & LANGUAGE CONSTRAINTS: The student speaks ONLY in English, Egyptian Arabic (العامية المصرية), or a clinical mix of both. The student does NOT speak Spanish, French, or other languages. Never hallucinate foreign greetings or words (such as Spanish ¿Qué tal?) from ambient noise or breaths.`
      : "";

  switch (mode) {
    case "ar":
      return `LANGUAGE DIRECTIVE (عربي - Egyptian Colloquial):
- You MUST respond strictly in authentic, natural Egyptian Colloquial Arabic (اللهجة المصرية السلسة الحية زي أسلوب كبار أساتذة الطب ودكتور وائل).
- Explain medical concepts warmly and clearly in Egyptian dialect (e.g. "علشان نفهم الـ case دي كويس", "لاحظ هنا إن العيان بيشتكي من...", "خد بالك من النقطة دي").
- Keep clinical English terminology available by pairing key terms with their standard English names when first introduced (e.g. "تضخم الغدة الدرقية (Goiter)").
- DYNAMIC OVERRIDE: If the student explicitly asks you in speech or text to switch to English or to Mixed Arabic/English, switch immediately and cheerfully without ever refusing.${jsonRule}${spokenRule}`;

    case "mixed":
      return `LANGUAGE DIRECTIVE (Mixed - Egyptian Medical Code-Switching):
- You MUST respond in the authentic clinical Egyptian-English medical mix used by Egyptian medical students, residents, and consultants on clinical rounds.
- Sentences and conversational framing MUST be in friendly Egyptian Arabic, while ALL medical terms, anatomy, symptoms, diagnoses, drugs, and pathophysiology remain in standard English.
- Example tone:
  "الـ swelling ده طالما onset بتاعه gradual و progressive course، يبقى أول حاجة تيجي في بالك benign neoplasm أو chronic inflammation. لكن لو كان sudden ومعه severe pain، نفكر على طول في hematoma أو acute vascular event."
- DYNAMIC OVERRIDE: If the student explicitly asks you to explain purely in English or purely in Egyptian Arabic, switch immediately and cheerfully without ever refusing.${jsonRule}${spokenRule}`;

    case "en":
    default:
      return `LANGUAGE DIRECTIVE (English):
- Respond primarily in clear, academic, professional English by default.
- DYNAMIC OVERRIDE: If the student explicitly asks you during the conversation to explain in Arabic (Egyptian Colloquial / العامية المصرية) or Mixed Arabic & English (or asks "اشرح بالعربي" or "can you explain in Arabic?"), you MUST immediately and cheerfully switch to Egyptian Arabic or Mixed mode without ever refusing or apologizing. Academic flexibility is paramount.${jsonRule}${spokenRule}`;
  }
}
