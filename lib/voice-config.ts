export interface LiveVoice {
  id: string;
  name: string;
  gender: "Male" | "Female";
  tone: string;
  description: string;
}

export const AVAILABLE_LIVE_VOICES: LiveVoice[] = [
  {
    id: "Puck",
    name: "Puck",
    gender: "Male",
    tone: "Engaging & Dynamic",
    description: "Natural conversational rhythm, great for fast interactive Q&A and Egyptian dialect.",
  },
  {
    id: "Kore",
    name: "Kore",
    gender: "Female",
    tone: "Warm & Clear",
    description: "Soothing, articulate delivery ideal for deep clinical case breakdowns.",
  },
  {
    id: "Fenrir",
    name: "Fenrir",
    gender: "Male",
    tone: "Confident & Energetic",
    description: "Direct, high-energy academic delivery for rapid oral viva prep.",
  },
  {
    id: "Aoede",
    name: "Aoede",
    gender: "Female",
    tone: "Authoritative & Melodious",
    description: "Structured, academic pacing with clear pronunciation across English and Arabic.",
  },
  {
    id: "Charon",
    name: "Charon",
    gender: "Male",
    tone: "Deep & Calm",
    description: "Grounded, clinical consultant resonance for patient rounds simulation.",
  },
];

export const DEFAULT_LIVE_VOICE = "Puck";

export type VoiceBargeInMode = "shield" | "smart" | "sensitive";

export interface VoiceModeOption {
  id: VoiceBargeInMode;
  name: string;
  nameAr: string;
  badge: string;
  description: string;
  descriptionAr: string;
}

export const VOICE_BARGE_IN_MODES: VoiceModeOption[] = [
  {
    id: "smart",
    name: "Smart Vocal Focus",
    nameAr: "تركيز صوتي ذكي",
    badge: "Recommended",
    description: "Filters ambient sounds; only direct, deliberate speech interrupts.",
    descriptionAr: "عزل ذكي للأصوات المحيطة، مقاطعة عند التحدث بوضوح فقط.",
  },
  {
    id: "shield",
    name: "Noise Shield (No Interruptions)",
    nameAr: "درع الضوضاء (بدون مقاطعة)",
    badge: "High Noise",
    description: "The mentor speaks uninterrupted. Spacebar or Interrupt button to speak.",
    descriptionAr: "لا ينقطع الشرح نهائياً بسبب الأصوات. اضغط زر المسافة أو زر المقاطعة للتحدث.",
  },
  {
    id: "sensitive",
    name: "High Sensitivity",
    nameAr: "حساسية عالية",
    badge: "Quiet / Headset",
    description: "Instant barge-in for quiet study spaces with headphones.",
    descriptionAr: "مقاطعة فورية خفيفة للغرف الهادئة جداً أو مع السماعات.",
  },
];

