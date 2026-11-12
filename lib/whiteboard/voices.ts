export interface WhiteboardNarratorVoice {
  id: string;
  name: string;
  gender: "Male" | "Female";
  tone: string;
  description: string;
  sampleLineEn: string;
  sampleLineAr: string;
}

/**
 * Curated prebuilt Gemini 3.8 TTS studio voices.
 * Every ID maps directly to a prebuilt voice verified in the Gemini 3.8 TTS docs.
 */
export const WHITEBOARD_NARRATOR_VOICES: WhiteboardNarratorVoice[] = [
  {
    id: "Kore",
    name: "Kore",
    gender: "Female",
    tone: "Firm & Clear",
    description: "Crisp, authoritative explainer delivery suited for medical and technical diagrams.",
    sampleLineEn: "Let's trace the blood flow step by step across this chamber.",
    sampleLineAr: "يلا نرسم المسار خطوة بخطوة علشان نفهم الآلية بوضوح.",
  },
  {
    id: "Puck",
    name: "Puck",
    gender: "Male",
    tone: "Upbeat & Engaging",
    description: "Energetic, friendly educator rhythm for fast concept breakdowns.",
    sampleLineEn: "Notice how this single blockage triggers the entire downstream cascade.",
    sampleLineAr: "ركز معايا هنا إزاي الانسداد البسيط ده بيغير الصورة كلها.",
  },
  {
    id: "Charon",
    name: "Charon",
    gender: "Male",
    tone: "Informative & Deep",
    description: "Steady, calm lecture voice ideal for longer chapter walkthroughs.",
    sampleLineEn: "First, compare the normal physiological state in blue with the lesion in red.",
    sampleLineAr: "الأول هنقارن الحالة الطبيعية بالأزرق مع التغير المرضي بالأحمر.",
  },
  {
    id: "Aoede",
    name: "Aoede",
    gender: "Female",
    tone: "Warm & Melodious",
    description: "Smooth, approachable narration with strong English and Arabic pacing.",
    sampleLineEn: "Watch how the receptor responds once the therapeutic dose arrives.",
    sampleLineAr: "شوف إزاي المستقبل الخلوي بيستجيب أول ما الدواء يوصل له.",
  },
  {
    id: "Iapetus",
    name: "Iapetus",
    gender: "Male",
    tone: "Clear & Direct",
    description: "Measured, articulate delivery with clean pronunciation of clinical terms.",
    sampleLineEn: "Here are the three diagnostic criteria stated directly on this page.",
    sampleLineAr: "دي الثلاث علامات الأساسية اللي الكتاب ركز عليها في الصفحة دي.",
  },
  {
    id: "Sulafat",
    name: "Sulafat",
    gender: "Female",
    tone: "Warm & Steady",
    description: "Supportive tutor tone for step-by-step mechanisms and exam pearls.",
    sampleLineEn: "Keep this normal pathway in mind before we look at what fails.",
    sampleLineAr: "خلي المسار الطبيعي ده في بالك قبل ما نشوف الخلل بيحصل فين.",
  },
  {
    id: "Sadaltager",
    name: "Sadaltager",
    gender: "Male",
    tone: "Knowledgeable",
    description: "Seasoned professor cadence tailored for high-yield clinical reasoning.",
    sampleLineEn: "Look closely at the pressure gradient shifting from left to right.",
    sampleLineAr: "بص بدقة على فرق الضغط وهو بيتحرك من الشمال لليمين.",
  },
  {
    id: "Zephyr",
    name: "Zephyr",
    gender: "Female",
    tone: "Bright & Crisp",
    description: "Lively, focused narrator great for concise passage summaries.",
    sampleLineEn: "In under a minute, this diagram connects the cause to the bedside sign.",
    sampleLineAr: "في ثواني الرسمة دي هتربط لك السبب بالعرض الإكلينيكي مباشرة.",
  },
];

export const DEFAULT_WHITEBOARD_VOICE = "Kore";

export function isValidWhiteboardVoice(voiceId?: string | null): voiceId is string {
  if (!voiceId) return false;
  return WHITEBOARD_NARRATOR_VOICES.some((v) => v.id === voiceId);
}
