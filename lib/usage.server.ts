import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/database/mongoose";
import UserUsage from "@/database/models/user-usage.model";
import getCurrentBillingPeriodStart, {
  PLAN_LIMITS,
  PlanType,
} from "@/lib/subscription-constants";
import { getUserPlan } from "@/lib/subscription.server";

export interface UsageCheckResult {
  allowed: boolean;
  plan: PlanType;
  used: number;
  limit: number;
  remaining: number;
  error?: string;
}

export interface VoiceBudgetResult {
  allowed: boolean;
  plan: PlanType;
  voiceMinutesUsed: number;
  voiceMinutesLimit: number;
  remainingMinutes: number;
  maxDurationPerSession: number;
  error?: string;
}

async function ensureMonthlyUsageDoc(clerkId: string, billingPeriodStart: Date) {
  await connectToDatabase();
  return UserUsage.findOneAndUpdate(
    { clerkId, billingPeriodStart },
    {
      $setOnInsert: {
        clerkId,
        billingPeriodStart,
        pagesUsed: 0,
        creditsUsed: 0,
        voiceMinutesUsed: 0,
      },
    },
    { upsert: true, new: true },
  );
}

export async function getUserUsageSummary(clerkId: string) {
  const plan = await getUserPlan();
  const limits = PLAN_LIMITS[plan];
  const billingPeriodStart = getCurrentBillingPeriodStart();
  const doc = await ensureMonthlyUsageDoc(clerkId, billingPeriodStart);

  return {
    plan,
    limits,
    billingPeriodStart,
    usage: {
      pagesUsed: doc.pagesUsed,
      creditsUsed: doc.creditsUsed,
      voiceMinutesUsed: Number(doc.voiceMinutesUsed.toFixed(2)),
    },
  };
}

export async function consumeCredits(
  clerkId: string,
  amount: number,
): Promise<UsageCheckResult> {
  const cost = Math.max(0, Math.ceil(amount));
  const plan = await getUserPlan();
  const limits = PLAN_LIMITS[plan];
  const limit = limits.maxCreditsPerMonth;
  const billingPeriodStart = getCurrentBillingPeriodStart();

  const existing = await ensureMonthlyUsageDoc(clerkId, billingPeriodStart);

  if (cost === 0) {
    return {
      allowed: true,
      plan,
      used: existing.creditsUsed,
      limit,
      remaining: Math.max(0, limit - existing.creditsUsed),
    };
  }

  const updated = await UserUsage.findOneAndUpdate(
    {
      clerkId,
      billingPeriodStart,
      creditsUsed: { $lte: limit - cost },
    },
    { $inc: { creditsUsed: cost } },
    { new: true },
  );

  if (!updated) {
    return {
      allowed: false,
      plan,
      used: existing.creditsUsed,
      limit,
      remaining: Math.max(0, limit - existing.creditsUsed),
      error: `Monthly AI credit limit reached for your ${plan} plan (${limit} credits/month). Please upgrade your plan to continue.`,
    };
  }

  return {
    allowed: true,
    plan,
    used: updated.creditsUsed,
    limit,
    remaining: Math.max(0, limit - updated.creditsUsed),
  };
}

export async function consumePages(
  clerkId: string,
  pageCount: number,
): Promise<UsageCheckResult> {
  const pages = Math.max(1, Math.ceil(pageCount));
  const plan = await getUserPlan();
  const limits = PLAN_LIMITS[plan];
  const limit = limits.maxPagesPerMonth;
  const billingPeriodStart = getCurrentBillingPeriodStart();

  const existing = await ensureMonthlyUsageDoc(clerkId, billingPeriodStart);

  if (pages > limit) {
    return {
      allowed: false,
      plan,
      used: existing.pagesUsed,
      limit,
      remaining: Math.max(0, limit - existing.pagesUsed),
      error: `This file (${pages} pages) exceeds your ${plan} plan monthly limit of ${limit} pages. Please upgrade to process larger files.`,
    };
  }

  const updated = await UserUsage.findOneAndUpdate(
    {
      clerkId,
      billingPeriodStart,
      pagesUsed: { $lte: limit - pages },
    },
    { $inc: { pagesUsed: pages } },
    { new: true },
  );

  if (!updated) {
    return {
      allowed: false,
      plan,
      used: existing.pagesUsed,
      limit,
      remaining: Math.max(0, limit - existing.pagesUsed),
      error: `Monthly page limit reached for your ${plan} plan (${existing.pagesUsed}/${limit} pages used). Please upgrade to process more files.`,
    };
  }

  return {
    allowed: true,
    plan,
    used: updated.pagesUsed,
    limit,
    remaining: Math.max(0, limit - updated.pagesUsed),
  };
}

export async function checkVoiceBudget(
  clerkId: string,
): Promise<VoiceBudgetResult> {
  const plan = await getUserPlan();
  const limits = PLAN_LIMITS[plan];
  const billingPeriodStart = getCurrentBillingPeriodStart();
  const doc = await ensureMonthlyUsageDoc(clerkId, billingPeriodStart);

  const remainingMinutes = Math.max(
    0,
    limits.maxVoiceMinutesPerMonth - doc.voiceMinutesUsed,
  );

  if (remainingMinutes <= 0.25) {
    return {
      allowed: false,
      plan,
      voiceMinutesUsed: Number(doc.voiceMinutesUsed.toFixed(2)),
      voiceMinutesLimit: limits.maxVoiceMinutesPerMonth,
      remainingMinutes: 0,
      maxDurationPerSession: 0,
      error: `You have reached the monthly live voice limit for your ${plan} plan (${limits.maxVoiceMinutesPerMonth} min/month). Please upgrade for more voice minutes.`,
    };
  }

  return {
    allowed: true,
    plan,
    voiceMinutesUsed: Number(doc.voiceMinutesUsed.toFixed(2)),
    voiceMinutesLimit: limits.maxVoiceMinutesPerMonth,
    remainingMinutes: Number(remainingMinutes.toFixed(2)),
    maxDurationPerSession: Math.max(
      1,
      Math.min(limits.maxDurationPerSession, Math.ceil(remainingMinutes)),
    ),
  };
}

export async function recordVoiceMinutes(
  clerkId: string,
  durationSeconds: number,
) {
  const minutes = Math.max(0, durationSeconds) / 60;
  if (minutes <= 0) return;

  const billingPeriodStart = getCurrentBillingPeriodStart();
  await ensureMonthlyUsageDoc(clerkId, billingPeriodStart);
  await UserUsage.findOneAndUpdate(
    { clerkId, billingPeriodStart },
    { $inc: { voiceMinutesUsed: Number(minutes.toFixed(2)) } },
  );
}

/**
 * Authenticates the request and optionally consumes AI credits.
 * Pass cost=0 to only authenticate and defer credit deduction (e.g. until cache miss).
 */
export async function requireAuthAndCredits(cost: number): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }
> {
  const { userId } = await auth();
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Authentication required. Please sign in to continue." },
        { status: 401 },
      ),
    };
  }

  if (cost > 0) {
    const check = await consumeCredits(userId, cost);
    if (!check.allowed) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: check.error,
            isBillingError: true,
            plan: check.plan,
            creditsUsed: check.used,
            creditLimit: check.limit,
          },
          { status: 402 },
        ),
      };
    }
  }

  return { ok: true, userId };
}
