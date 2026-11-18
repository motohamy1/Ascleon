"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  pickHigherPlan,
  PLANS,
  PLAN_LIMITS,
  PlanType,
} from "@/lib/subscription-constants";

export const usePlan = () => {
  const { has, isLoaded, userId } = useAuth();
  const [serverPlanState, setServerPlanState] = useState<{
    userId: string;
    plan: PlanType;
  } | null>(null);

  useEffect(() => {
    if (!isLoaded || !userId) {
      return;
    }

    let cancelled = false;
    fetch("/api/usage", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.plan && data.plan in PLAN_LIMITS) {
          setServerPlanState({ userId, plan: data.plan as PlanType });
        }
      })
      .catch(() => {
        // Non-fatal: falls back cleanly to Clerk plan check
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, userId]);

  if (!isLoaded || !userId) {
    return {
      plan: PLANS.FREE,
      limits: PLAN_LIMITS[PLANS.FREE],
      isLoaded,
    };
  }

  const isPro = has?.({ plan: "pro" });
  const isStandard = has?.({ plan: "standard" });

  const clerkPlan: PlanType = isPro
    ? PLANS.PRO
    : isStandard
      ? PLANS.STANDARD
      : PLANS.FREE;

  const activeServerPlan =
    serverPlanState?.userId === userId ? serverPlanState.plan : null;
  const plan = activeServerPlan
    ? pickHigherPlan(clerkPlan, activeServerPlan)
    : clerkPlan;

  return {
    plan,
    limits: PLAN_LIMITS[plan],
    isLoaded,
  };
};
