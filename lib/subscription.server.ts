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
  UNLIMITED_PLAN_LIMITS,
} from "@/lib/subscription-constants";

export const DEFAULT_OWNER_EMAILS = [
  "meltohamy080@gmail.com",
  "motohamy0000@gmail.com",
];

export interface UserPlanDetails {
  plan: PlanType;
  source: "clerk" | "egypt_manual" | "owner" | "free";
  isUnlimited?: boolean;
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
      isUnlimited: false,
      paymentMethod: null,
      billingCycle: null,
      currentPeriodEnd: null,
    };
  }

  try {
    const admin = await isSubscriptionAdmin();
    if (admin.isAdmin) {
      return {
        plan: PLANS.PRO,
        source: "owner",
        isUnlimited: true,
        paymentMethod: "manual",
        billingCycle: null,
        currentPeriodEnd: null,
      };
    }
  } catch {
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
      isUnlimited: false,
      paymentMethod: null,
      billingCycle: null,
      currentPeriodEnd: null,
    };
  }

  if (dbPlan === effectivePlan && dbSub) {
    return {
      plan: effectivePlan,
      source: "egypt_manual",
      isUnlimited: false,
      paymentMethod: dbSub.paymentMethod,
      billingCycle: dbSub.billingCycle,
      currentPeriodEnd: dbSub.currentPeriodEnd,
    };
  }

  return {
    plan: effectivePlan,
    source: "clerk",
    isUnlimited: false,
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
  const details = await getUserPlanDetails();
  if (details.isUnlimited) {
    return UNLIMITED_PLAN_LIMITS;
  }
  return PLAN_LIMITS[details.plan];
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
    user?.emailAddresses
      ?.filter((e) => !e.verification || e.verification.status === "verified")
      .map((e) => e.emailAddress.trim().toLowerCase()) ?? [];
  const primaryEmail =
    user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() ??
    emails[0] ??
    null;

  const allowedIds = (process.env.ADMIN_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const envEmails = [
    process.env.ADMIN_EMAILS || "",
    process.env.OWNER_EMAILS || "",
    process.env.WHITEBOARD_ALLOWED_EMAILS || "",
  ]
    .join(",")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const allowedEmails = new Set([...DEFAULT_OWNER_EMAILS, ...envEmails]);

  const hasRole =
    (user?.publicMetadata as { role?: string } | undefined)?.role === "admin";

  const isAdmin =
    hasRole ||
    allowedIds.includes(userId) ||
    emails.some((email) => allowedEmails.has(email));

  return { isAdmin, userId, email: primaryEmail };
}
