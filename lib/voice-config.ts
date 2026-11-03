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
