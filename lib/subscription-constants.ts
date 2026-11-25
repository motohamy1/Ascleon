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
  maxDurationPerSession: number;
  maxFileSizeMb: number;
  hasSessionHistory: boolean;
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  [PLANS.FREE]: {
    maxPagesPerMonth: 60,
    maxCreditsPerMonth: 40,
    maxVoiceMinutesPerMonth: 10,
    maxDurationPerSession: 5,
    maxFileSizeMb: 15,
    hasSessionHistory: false,
  },
  [PLANS.STANDARD]: {
    maxPagesPerMonth: 500,
    maxCreditsPerMonth: 250,
    maxVoiceMinutesPerMonth: 30,
    maxDurationPerSession: 10,
    maxFileSizeMb: 35,
    hasSessionHistory: true,
  },
  [PLANS.PRO]: {
    maxPagesPerMonth: 2500,
    maxCreditsPerMonth: 1200,
    maxVoiceMinutesPerMonth: 150,
    maxDurationPerSession: 25,
    maxFileSizeMb: 50,
    hasSessionHistory: true,
  },
};

export const UNLIMITED_PLAN_LIMITS: PlanLimits = {
  maxPagesPerMonth: 999999,
  maxCreditsPerMonth: 999999,
  maxVoiceMinutesPerMonth: 999999,
  maxDurationPerSession: 120,
  maxFileSizeMb: 250,
  hasSessionHistory: true,
};

export const AI_CREDIT_COSTS = {
  READER_ASSISTANT: 1,
  SUMMARY: 1,
  QBANK: 1,
  MORPH: 3,
  WHITEBOARD_LESSON: 3,
  WHITEBOARD_AUDIO: 1,
  WHITEBOARD_VIDEO: 6,
  WHITEBOARD_BEAT_GENERATE: 2,
  BOOK_INGEST: 2,
} as const;

export type CreditFeature =
  | "reader_assistant"
  | "summary"
  | "qbank"
  | "morph"
  | "whiteboard_lesson"
  | "whiteboard_audio"
  | "whiteboard_video"
  | "whiteboard_beat"
  | "book_ingest";

export interface DynamicCreditCostInput {
  feature: CreditFeature;
  pageSpan?: number;
  scopeType?: "selection" | "page" | "range" | "topic";
  hasVisionInput?: boolean;
  forceRefresh?: boolean;
  isCached?: boolean;
  isTopicDeepDive?: boolean;
  pacing?: "auto" | "concise" | "deep";
  needsVector?: boolean;
  needsAudio?: boolean;
  totalPages?: number;
}

export interface DynamicCreditBreakdown {
  total: number;
  base: number;
  scopeSurcharge: number;
  visionSurcharge: number;
  refreshSurcharge: number;
  pacingSurcharge: number;
  summary: string;
}

export function getScopePageSpan(
  scope?: {
    type?: string;
    startPage?: number;
    endPage?: number;
  } | null,
): number {
  if (!scope) return 1;
  if (
    typeof scope.startPage === "number" &&
    typeof scope.endPage === "number" &&
    Number.isFinite(scope.startPage) &&
    Number.isFinite(scope.endPage)
  ) {
    return Math.max(1, Math.round(scope.endPage - scope.startPage + 1));
  }
  return 1;
}

export function calculateDynamicCreditCost(
  input: DynamicCreditCostInput,
): DynamicCreditBreakdown {
  if (input.isCached) {
    return {
      total: 0,
      base: 0,
      scopeSurcharge: 0,
      visionSurcharge: 0,
      refreshSurcharge: 0,
      pacingSurcharge: 0,
      summary: "Cached result (0 credits)",
    };
  }

  const pageSpan = Math.max(1, Math.round(input.pageSpan || 1));
  let base = 0;
  let scopeSurcharge = 0;
  let visionSurcharge = 0;
  let refreshSurcharge = 0;
  let pacingSurcharge = 0;

  switch (input.feature) {
    case "reader_assistant": {
      base = AI_CREDIT_COSTS.READER_ASSISTANT;
      if (pageSpan > 1) {
        scopeSurcharge = Math.min(4, Math.ceil((pageSpan - 1) / 4));
      } else if (input.isTopicDeepDive && input.scopeType === "topic") {
        scopeSurcharge = 1;
      }
      visionSurcharge = input.hasVisionInput ? 1 : 0;
      break;
    }

    case "summary": {
      base = AI_CREDIT_COSTS.SUMMARY;
      if (pageSpan > 1) {
        scopeSurcharge = Math.min(5, Math.ceil((pageSpan - 1) / 3));
      }
      refreshSurcharge = input.forceRefresh ? 1 : 0;
      break;
    }

    case "qbank": {
      base = AI_CREDIT_COSTS.QBANK;
      if (pageSpan > 1) {
        scopeSurcharge = Math.min(4, Math.ceil((pageSpan - 1) / 4));
      }
      visionSurcharge = input.hasVisionInput ? 1 : 0;
      refreshSurcharge = input.forceRefresh ? 1 : 0;
      break;
    }

    case "morph": {
      base = AI_CREDIT_COSTS.MORPH;
      if (pageSpan > 1) {
        scopeSurcharge = Math.min(4, Math.ceil((pageSpan - 1) / 4));
      }
      visionSurcharge = input.hasVisionInput ? 1 : 0;
      refreshSurcharge = input.forceRefresh ? 1 : 0;
      break;
    }

    case "whiteboard_lesson": {
      base = AI_CREDIT_COSTS.WHITEBOARD_LESSON;
      if (pageSpan > 1) {
        scopeSurcharge = Math.min(4, Math.ceil((pageSpan - 1) / 4));
      }
      pacingSurcharge = input.pacing === "deep" ? 1 : 0;
      refreshSurcharge = input.forceRefresh ? 1 : 0;
      break;
    }

    case "whiteboard_audio": {
      base = AI_CREDIT_COSTS.WHITEBOARD_AUDIO;
      refreshSurcharge = input.forceRefresh ? 1 : 0;
      break;
    }

    case "whiteboard_video": {
      base = AI_CREDIT_COSTS.WHITEBOARD_VIDEO;
      if (pageSpan > 1) {
        scopeSurcharge = Math.min(4, Math.ceil((pageSpan - 1) / 4));
      }
      pacingSurcharge = input.pacing === "deep" ? 2 : 0;
      refreshSurcharge = input.forceRefresh ? 2 : 0;
      break;
    }

    case "whiteboard_beat": {
      const needVec = Boolean(input.needsVector);
      const needAud = Boolean(input.needsAudio);
      if (!needVec && !needAud) {
        return {
          total: 0,
          base: 0,
          scopeSurcharge: 0,
          visionSurcharge: 0,
          refreshSurcharge: 0,
          pacingSurcharge: 0,
          summary: "Cached beat (0 credits)",
        };
      }
      base = (needVec ? 1 : 0) + (needAud ? 1 : 0);
      refreshSurcharge = input.forceRefresh ? 1 : 0;
      break;
    }

    case "book_ingest": {
      const pages = Math.max(1, Math.round(input.totalPages || pageSpan));
      base = AI_CREDIT_COSTS.BOOK_INGEST;
      scopeSurcharge =
        pages > 20 ? Math.min(8, Math.floor((pages - 1) / 30)) : 0;
      break;
    }
  }

  const total =
    base +
    scopeSurcharge +
    visionSurcharge +
    refreshSurcharge +
    pacingSurcharge;

  const parts = [`${base} base`];
  if (scopeSurcharge > 0) parts.push(`+${scopeSurcharge} multi-page`);
  if (visionSurcharge > 0) parts.push(`+${visionSurcharge} diagram/vision`);
  if (pacingSurcharge > 0) parts.push(`+${pacingSurcharge} deep mode`);
  if (refreshSurcharge > 0) parts.push(`+${refreshSurcharge} fresh regen`);

  return {
    total,
    base,
    scopeSurcharge,
    visionSurcharge,
    refreshSurcharge,
    pacingSurcharge,
    summary: `${total} credit${total === 1 ? "" : "s"} (${parts.join(", ")})`,
  };
}

export type BillingCycle = "monthly" | "annual";
export type EgyptPaymentMethod = "vodafone_cash" | "instapay";
export type PaidPlanType = typeof PLANS.STANDARD | typeof PLANS.PRO;

export const PAYMENT_CONTACT = {
  phoneDisplay: "01016747795",
  phoneInternational: "+20 101 674 7795",
  whatsappDigits: "201016747795",
  vodafoneCashNumber: "01016747795",
  instapayNumber: "01016747795",
  instapayHandle: "m.tohamy11111@instapay",
  instapayPaymentUrl: "https://ipn.eg/S/m.tohamy11111/instapay/7qJiFO",
} as const;

export interface PlanCatalogItem {
  id: PlanType;
  name: string;
  tagline: string;
  badge?: string;
  monthlyPriceEgp: number;
  annualPriceEgp: number;
  monthlyPriceUsd: number;
  annualMonthlyPriceUsd: number;
  features: string[];
}

export const PLAN_CATALOG: Record<PlanType, PlanCatalogItem> = {
  [PLANS.FREE]: {
    id: PLANS.FREE,
    name: "Free",
    tagline: "Explore Ascleon with your first books and voice sessions.",
    monthlyPriceEgp: 0,
    annualPriceEgp: 0,
    monthlyPriceUsd: 0,
    annualMonthlyPriceUsd: 0,
    features: [
      "Up to 60 PDF pages per month",
      "40 AI study credits per month",
      "10 live voice mentor minutes per month",
      "5-minute max per voice session",
    ],
  },
  [PLANS.STANDARD]: {
    id: PLANS.STANDARD,
    name: "Standard",
    tagline: "Built for regular coursework, Q-Banks, and steady exam prep.",
    badge: "Popular",
    monthlyPriceEgp: 99,
    annualPriceEgp: 990,
    monthlyPriceUsd: 6.99,
    annualMonthlyPriceUsd: 4.99,
    features: [
      "Up to 500 PDF pages per month",
      "250 AI study credits per month",
      "30 live voice mentor minutes per month",
      "10-minute max per voice session",
      "Full saved session & study history",
    ],
  },
  [PLANS.PRO]: {
    id: PLANS.PRO,
    name: "Pro",
    tagline: "Full power for heavy medical & technical textbooks without bottlenecks.",
    badge: "Best Value",
    monthlyPriceEgp: 199,
    annualPriceEgp: 1990,
    monthlyPriceUsd: 12.99,
    annualMonthlyPriceUsd: 9.99,
    features: [
      "Up to 2,500 PDF pages per month",
      "1,200 AI study credits per month",
      "150 live voice mentor minutes per month",
      "25-minute max per voice session",
      "Full saved session & study history",
      "Priority WhatsApp support",
    ],
  },
};

export const PLAN_TIER_RANK: Record<PlanType, number> = {
  [PLANS.FREE]: 0,
  [PLANS.STANDARD]: 1,
  [PLANS.PRO]: 2,
};

export function pickHigherPlan(a: PlanType, b: PlanType): PlanType {
  return PLAN_TIER_RANK[a] >= PLAN_TIER_RANK[b] ? a : b;
}

export function getPlanPriceEgp(
  plan: PaidPlanType,
  billingCycle: BillingCycle,
): number {
  const item = PLAN_CATALOG[plan];
  return billingCycle === "annual" ? item.annualPriceEgp : item.monthlyPriceEgp;
}

export function formatPaymentMethodLabel(method: EgyptPaymentMethod): string {
  return method === "vodafone_cash" ? "Vodafone Cash" : "InstaPay";
}

export function buildWhatsAppSupportUrl(message: string): string {
  return `https://wa.me/${PAYMENT_CONTACT.whatsappDigits}?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppPaymentMessage(params: {
  requestCode: string;
  planName: string;
  billingCycle: BillingCycle;
  paymentMethod: EgyptPaymentMethod;
  amountEgp: number;
  senderIdentifier: string;
  userEmail?: string | null;
  referenceNote?: string;
}): string {
  const recipientTarget =
    params.paymentMethod === "instapay"
      ? `${PAYMENT_CONTACT.instapayHandle} / ${PAYMENT_CONTACT.phoneDisplay}`
      : PAYMENT_CONTACT.phoneDisplay;

  const lines = [
    "Hello Ascleon Support,",
    "I completed an Egyptian subscription transfer and would like to activate my plan:",
    `- Request ID: ${params.requestCode}`,
    `- Plan: ${params.planName} (${params.billingCycle === "annual" ? "Annual" : "Monthly"})`,
    `- Amount: ${params.amountEgp.toLocaleString("en-US")} EGP`,
    `- Method: ${formatPaymentMethodLabel(params.paymentMethod)} (to ${recipientTarget})`,
    `- Sender Number / Account: ${params.senderIdentifier}`,
    params.userEmail ? `- Account Email: ${params.userEmail}` : null,
    params.referenceNote ? `- Reference / Note: ${params.referenceNote}` : null,
    "I am attaching the transfer screenshot now.",
  ].filter(Boolean);

  return lines.join("\n");
}

export function buildWhatsAppIssueMessage(params?: {
  userEmail?: string | null;
  userId?: string | null;
  currentPlan?: string | null;
  reason?: string | null;
}): string {
  const lines = [
    "Hello Ascleon Support,",
    "I need help with my Ascleon subscription:",
    params?.currentPlan ? `- Current Plan: ${params.currentPlan}` : null,
    params?.userEmail ? `- Account Email: ${params.userEmail}` : null,
    params?.userId ? `- User ID: ${params.userId}` : null,
    params?.reason ? `- Issue: ${params.reason}` : "- Issue: (please describe your subscription issue here)",
  ].filter(Boolean);

  return lines.join("\n");
}

const getCurrentBillingPeriodStart = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
};
export default getCurrentBillingPeriodStart;