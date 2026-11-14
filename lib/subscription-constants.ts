export const PLANS = {
  FREE: "free",
  STANDARD: "standard",
  PRO: "pro",
} as const;

export type PlanType = (typeof PLANS)[keyof typeof PLANS];

export interface PlanLimits {
  maxPagesPerMonth: number;
  maxCreditsPerMonth: number;
  maxVoiceMinutesPerMonth: number;
  maxDurationPerSession: number; // in minutes
  hasSessionHistory: boolean;
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  [PLANS.FREE]: {
    maxPagesPerMonth: 60,
    maxCreditsPerMonth: 40,
    maxVoiceMinutesPerMonth: 10,
    maxDurationPerSession: 5,
    hasSessionHistory: false,
  },
  [PLANS.STANDARD]: {
    maxPagesPerMonth: 500,
    maxCreditsPerMonth: 250,
    maxVoiceMinutesPerMonth: 30,
    maxDurationPerSession: 10,
    hasSessionHistory: true,
  },
  [PLANS.PRO]: {
    maxPagesPerMonth: 2500,
    maxCreditsPerMonth: 1200,
    maxVoiceMinutesPerMonth: 150,
    maxDurationPerSession: 25,
    hasSessionHistory: true,
  },
};

export const AI_CREDIT_COSTS = {
  READER_ASSISTANT: 1,
  SUMMARY: 1,
  QBANK: 1,
  MORPH: 3,
  WHITEBOARD_LESSON: 3,
  WHITEBOARD_AUDIO: 3,
  WHITEBOARD_VIDEO: 10,
  WHITEBOARD_BEAT_GENERATE: 2,
  BOOK_INGEST: 5,
} as const;
const getCurrentBillingPeriodStart = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
};
export default getCurrentBillingPeriodStart