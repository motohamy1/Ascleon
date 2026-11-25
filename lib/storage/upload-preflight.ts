import {
  calculateDynamicCreditCost,
  PLAN_LIMITS,
  PlanLimits,
  PlanType,
} from "@/lib/subscription-constants";
import { getPDFPageCount } from "@/lib/utils";

export interface UploadPreflightResult {
  allowed: boolean;
  pageCount?: number;
  plan?: PlanType;
  isUnlimited?: boolean;
  isBillingError?: boolean;
  error?: string;
}

interface UsageApiResponse {
  success?: boolean;
  plan?: PlanType;
  isUnlimited?: boolean;
  limits?: PlanLimits;
  usage?: {
    pagesUsed: number;
    creditsUsed: number;
    voiceMinutesUsed: number;
  };
}

export async function validatePdfAgainstPlan(
  file: File,
): Promise<UploadPreflightResult> {
  if (file.type && file.type !== "application/pdf") {
    return {
      allowed: false,
      error: "Please select a valid PDF file.",
    };
  }

  let plan: PlanType = "free";
  let isUnlimited = false;
  let limits: PlanLimits = PLAN_LIMITS.free;
  let pagesUsed = 0;
  let creditsUsed = 0;

  try {
    const res = await fetch("/api/usage", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as UsageApiResponse;
      if (data.plan) plan = data.plan;
      if (data.isUnlimited) isUnlimited = true;
      if (data.limits) limits = data.limits;
      if (data.usage) {
        pagesUsed = data.usage.pagesUsed || 0;
        creditsUsed = data.usage.creditsUsed || 0;
      }
    }
  } catch {
    return { allowed: true };
  }

  const maxBytes = limits.maxFileSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    const fileMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      allowed: false,
      plan,
      isUnlimited,
      isBillingError: !isUnlimited,
      error: isUnlimited
        ? `This file (${fileMb} MB) exceeds the maximum upload size of ${limits.maxFileSizeMb} MB.`
        : `This file (${fileMb} MB) exceeds your ${plan} plan file size limit of ${limits.maxFileSizeMb} MB. Please upgrade your plan to upload larger files.`,
    };
  }

  if (isUnlimited) {
    return { allowed: true, plan, isUnlimited: true };
  }

  let pageCount = 0;
  try {
    pageCount = await getPDFPageCount(file);
  } catch {
    return {
      allowed: false,
      plan,
      error: "Could not read this PDF file. Please verify it is not corrupted or password-protected.",
    };
  }

  if (pageCount > limits.maxPagesPerMonth) {
    return {
      allowed: false,
      pageCount,
      plan,
      isBillingError: true,
      error: `This file (${pageCount} pages) exceeds your ${plan} plan monthly limit of ${limits.maxPagesPerMonth} pages. Please upgrade to upload larger files.`,
    };
  }

  const remainingPages = Math.max(0, limits.maxPagesPerMonth - pagesUsed);
  if (pageCount > remainingPages) {
    return {
      allowed: false,
      pageCount,
      plan,
      isBillingError: true,
      error: `This file (${pageCount} pages) exceeds your remaining ${plan} plan quota (${remainingPages} of ${limits.maxPagesPerMonth} pages left this month). Please upgrade to continue.`,
    };
  }

  const ingestCost = calculateDynamicCreditCost({
    feature: "book_ingest",
    totalPages: pageCount,
  }).total;
  const remainingCredits = Math.max(0, limits.maxCreditsPerMonth - creditsUsed);
  if (ingestCost > remainingCredits) {
    return {
      allowed: false,
      pageCount,
      plan,
      isBillingError: true,
      error: `Uploading this ${pageCount}-page file requires ${ingestCost} AI credits, but you have ${remainingCredits} remaining on your ${plan} plan. Please upgrade to continue.`,
    };
  }

  return {
    allowed: true,
    pageCount,
    plan,
    isUnlimited: false,
  };
}
