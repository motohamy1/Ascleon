import { auth, currentUser } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/database/mongoose";
import UserSubscription from "@/database/models/user-subscription.model";
import {
  BillingCycle,
  EgyptPaymentMethod,
  pickHigherPlan,
  PLANS,
  PLAN_LIMITS,
  PlanType,
} from "@/lib/subscription-constants";

export interface UserPlanDetails {
  plan: PlanType;
  source: "clerk" | "egypt_manual" | "free";
  paymentMethod?: EgyptPaymentMethod | "clerk" | "manual" | null;
  billingCycle?: BillingCycle | null;
  currentPeriodEnd?: string | null;
}

export async function getActiveDbSubscription(clerkId: string) {
  try {
    await connectToDatabase();
    const now = new Date();
    const sub = await UserSubscription.findOne({
      clerkId,
      status: "active",
      currentPeriodEnd: { $gt: now },
    }).lean();

    if (!sub) return null;

    return {
      plan: (sub.plan as PlanType) || PLANS.FREE,
      billingCycle: (sub.billingCycle as BillingCycle) || "monthly",
      paymentMethod:
        (sub.paymentMethod as EgyptPaymentMethod | "clerk" | "manual") ||
        "vodafone_cash",
      currentPeriodEnd: sub.currentPeriodEnd
        ? new Date(sub.currentPeriodEnd).toISOString()
        : null,
    };
  } catch (err) {
    console.error("[subscription.server] Failed to read DB subscription:", err);
    return null;
  }
}

export async function getUserPlanDetails(): Promise<UserPlanDetails> {
  const { has, userId } = await auth();

  if (!userId) {
    return {
      plan: PLANS.FREE,
      source: "free",
      paymentMethod: null,
      billingCycle: null,
      currentPeriodEnd: null,
    };
  }

  let clerkPlan: PlanType = PLANS.FREE;
  if (has({ plan: "pro" })) clerkPlan = PLANS.PRO;
  else if (has({ plan: "standard" })) clerkPlan = PLANS.STANDARD;

  const dbSub = await getActiveDbSubscription(userId);
  const dbPlan = dbSub?.plan ?? PLANS.FREE;

  const effectivePlan = pickHigherPlan(clerkPlan, dbPlan);

  if (effectivePlan === PLANS.FREE) {
    return {
      plan: PLANS.FREE,
      source: "free",
      paymentMethod: null,
      billingCycle: null,
      currentPeriodEnd: null,
    };
  }

  if (dbPlan === effectivePlan && dbSub) {
    return {
      plan: effectivePlan,
      source: "egypt_manual",
      paymentMethod: dbSub.paymentMethod,
      billingCycle: dbSub.billingCycle,
      currentPeriodEnd: dbSub.currentPeriodEnd,
    };
  }

  return {
    plan: effectivePlan,
    source: "clerk",
    paymentMethod: "clerk",
    billingCycle: null,
    currentPeriodEnd: null,
  };
}

export const getUserPlan = async (): Promise<PlanType> => {
  const details = await getUserPlanDetails();
  return details.plan;
};

export const getPlanLimits = async () => {
  const plan = await getUserPlan();
  return PLAN_LIMITS[plan];
};

export async function isSubscriptionAdmin(): Promise<{
  isAdmin: boolean;
  userId: string | null;
  email: string | null;
}> {
  const { userId } = await auth();
  if (!userId) {
    return { isAdmin: false, userId: null, email: null };
  }

  const user = await currentUser();
  const emails =
    user?.emailAddresses?.map((e) => e.emailAddress.toLowerCase()) ?? [];
  const primaryEmail =
    user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? emails[0] ?? null;

  const allowedIds = (process.env.ADMIN_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allowedEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const hasRole =
    (user?.publicMetadata as { role?: string } | undefined)?.role === "admin";

  const isAdmin =
    hasRole ||
    allowedIds.includes(userId) ||
    emails.some((email) => allowedEmails.includes(email));

  return { isAdmin, userId, email: primaryEmail };
}
