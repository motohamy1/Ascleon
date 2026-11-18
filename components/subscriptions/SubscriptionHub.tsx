"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAuth, useClerk, useUser, PricingTable } from "@clerk/nextjs";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  Loader2,
  MessageCircle,
  Phone,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wallet,
  XCircle,
} from "lucide-react";
import {
  BillingCycle,
  buildWhatsAppIssueMessage,
  buildWhatsAppPaymentMessage,
  buildWhatsAppSupportUrl,
  EgyptPaymentMethod,
  formatPaymentMethodLabel,
  getPlanPriceEgp,
  PaidPlanType,
  PAYMENT_CONTACT,
  PLAN_CATALOG,
  PLAN_LIMITS,
  PLANS,
  PlanType,
} from "@/lib/subscription-constants";
import { cn } from "@/lib/utils";

export interface SerializedPaymentRequest {
  id: string;
  requestCode: string;
  plan: string;
  billingCycle: string;
  paymentMethod: string;
  amountEgp: number;
  recipientNumber: string;
  senderIdentifier: string;
  referenceNote: string;
  status: string;
  reviewNote: string;
  createdAt: string | null;
}

export interface InitialSubscriptionState {
  plan: PlanType;
  source: "clerk" | "egypt_manual" | "free";
  paymentMethod?: string | null;
  billingCycle?: string | null;
  currentPeriodEnd?: string | null;
  usage: {
    pagesUsed: number;
    creditsUsed: number;
    voiceMinutesUsed: number;
  };
  requests: SerializedPaymentRequest[];
}

interface SubscriptionHubProps {
  initialState: InitialSubscriptionState | null;
  limitReason?: boolean;
}

function copyTextSafe(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text: string): boolean {
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export default function SubscriptionHub({
  initialState,
  limitReason = false,
}: SubscriptionHubProps) {
  const { isSignedIn, isLoaded, userId } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();

  const [paymentTab, setPaymentTab] = useState<"egypt" | "card">("egypt");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [selectedPlan, setSelectedPlan] = useState<PaidPlanType>(PLANS.STANDARD);
  const [paymentMethod, setPaymentMethod] =
    useState<EgyptPaymentMethod>("vodafone_cash");

  const [senderIdentifier, setSenderIdentifier] = useState("");
  const [referenceNote, setReferenceNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [lastSubmitted, setLastSubmitted] = useState<{
    request: SerializedPaymentRequest;
    whatsappUrl: string;
  } | null>(null);

  const [subState, setSubState] = useState<InitialSubscriptionState | null>(
    initialState,
  );

  const checkoutSectionRef = useRef<HTMLDivElement | null>(null);

  // Keep state fresh if user signs in client-side without full page reload
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (subState && initialState) return;

    let cancelled = false;
    fetch("/api/subscriptions/request", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.success && data.summary) {
          setSubState({
            plan: data.summary.plan,
            source: data.summary.planDetails?.source || "free",
            paymentMethod: data.summary.planDetails?.paymentMethod || null,
            billingCycle: data.summary.planDetails?.billingCycle || null,
            currentPeriodEnd: data.summary.planDetails?.currentPeriodEnd || null,
            usage: data.summary.usage,
            requests: data.requests || [],
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, subState, initialState]);

  const currentPlan: PlanType = subState?.plan || PLANS.FREE;
  const currentLimits = PLAN_LIMITS[currentPlan];
  const usage = subState?.usage || {
    pagesUsed: 0,
    creditsUsed: 0,
    voiceMinutesUsed: 0,
  };

  const userEmail =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress ||
    null;

  const selectedAmountEgp = getPlanPriceEgp(selectedPlan, billingCycle);
  const selectedPlanInfo = PLAN_CATALOG[selectedPlan];

  const handleCopy = async (value: string, key: string, label: string) => {
    const ok = await copyTextSafe(value);
    if (ok) {
      setCopiedKey(key);
      toast.success(`${label} copied: ${value}`);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2200);
    } else {
      toast.info(`Transfer number: ${value}`);
    }
  };

  const handleSelectPlan = (plan: PaidPlanType) => {
    setSelectedPlan(plan);
    setFormError(null);
    setLastSubmitted(null);
    setPaymentTab("egypt");
    setTimeout(() => {
      checkoutSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 60);
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!isLoaded) return;
    if (!isSignedIn) {
      clerk.openSignIn({
        fallbackRedirectUrl: "/subscriptions",
        signUpFallbackRedirectUrl: "/subscriptions",
      });
      return;
    }

    const trimmedSender = senderIdentifier.trim();
    if (trimmedSender.length < 4) {
      setFormError(
        paymentMethod === "vodafone_cash"
          ? "Please enter the Vodafone Cash mobile number you sent from."
          : "Please enter the mobile number or InstaPay handle (e.g. name@instapay) you sent from.",
      );
      return;
    }

    if (paymentMethod === "vodafone_cash") {
      const digitsOnly = trimmedSender.replace(/\D/g, "");
      if (digitsOnly.length < 10) {
        setFormError(
          "Please enter a valid 11-digit Egyptian wallet number (e.g. 010XXXXXXXX).",
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/subscriptions/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selectedPlan,
          billingCycle,
          paymentMethod,
          senderIdentifier: trimmedSender,
          referenceNote: referenceNote.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.success) {
        const msg = data?.error || "Could not submit your payment request.";
        setFormError(msg);
        toast.error(msg);
        return;
      }

      setLastSubmitted({
        request: data.request,
        whatsappUrl: data.whatsappUrl,
      });

      setSubState((prev) => {
        const existing = prev?.requests || [];
        const withoutDup = existing.filter((r) => r.id !== data.request.id);
        return {
          plan: prev?.plan || PLANS.FREE,
          source: prev?.source || "free",
          paymentMethod: prev?.paymentMethod,
          billingCycle: prev?.billingCycle,
          currentPeriodEnd: prev?.currentPeriodEnd,
          usage: prev?.usage || {
            pagesUsed: 0,
            creditsUsed: 0,
            voiceMinutesUsed: 0,
          },
          requests: [data.request, ...withoutDup],
        };
      });

      setReferenceNote("");
      toast.success(
        "Payment confirmation recorded! Send your transfer screenshot on WhatsApp for fast activation.",
      );
    } catch {
      const msg =
        "Network error submitting request. You can still message us directly on WhatsApp.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const supportWhatsAppUrl = buildWhatsAppSupportUrl(
    buildWhatsAppIssueMessage({
      userEmail,
      userId,
      currentPlan: PLAN_CATALOG[currentPlan].name,
      reason: limitReason
        ? "I reached a monthly usage limit and need help upgrading or checking my subscription."
        : undefined,
    }),
  );

  const ussdCode = `*9*7*${PAYMENT_CONTACT.vodafoneCashNumber}*${selectedAmountEgp}#`;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-3.5 pt-[96px] pb-20 sm:px-6 md:px-8 lg:px-10 sm:pt-[108px]">
      {/* Limit Reached Banner */}
      {limitReason && (
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[20px] border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-5 py-4 text-[color:var(--ink)] shadow-chip">
          <div className="flex items-start sm:items-center gap-3">
            <AlertTriangle className="size-5 shrink-0 mt-0.5 sm:mt-0 stroke-[2.5]" />
            <div>
              <p className="text-sm font-extrabold uppercase tracking-wide">
                Monthly Quota Reached
              </p>
              <p className="text-xs sm:text-sm font-semibold text-[color:var(--ink)]/90">
                Upgrade below using Vodafone Cash, InstaPay, or International Card — or message us on WhatsApp if something looks wrong.
              </p>
            </div>
          </div>
          <a
            href={supportWhatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--panel)] px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-[color:var(--ink)] transition-transform hover:-translate-y-0.5"
          >
            <MessageCircle className="size-4 text-[#16A34A]" />
            WhatsApp Help
          </a>
        </div>
      )}

      {/* Header & Current Plan / Usage Overview */}
      <section className="grid gap-3 lg:grid-cols-12">
        <div className="flex flex-col justify-between rounded-[24px] border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-6 sm:p-8 lg:p-10 lg:col-span-7 shadow-chip">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--ink)]/25 bg-[color:var(--panel)] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[color:var(--ink)]">
              <Sparkles className="size-3.5 text-[color:var(--orange)]" />
              Plans &amp; Egyptian Payments
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#7fd8c9] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--ink)] border border-[color:var(--ink)]/20">
              Vodafone Cash · InstaPay · Card
            </span>
          </div>

          <div className="mt-6">
            <h1 className="display text-[clamp(2.4rem,5vw,4.3rem)] leading-[0.96] text-[color:var(--ink)]">
              Unlock Your
              <br />
              Study Potential.
            </h1>
            <p className="mt-4 max-w-xl text-sm sm:text-base font-medium leading-relaxed text-[color:var(--ink-soft)]">
              Pay locally in Egypt via <strong className="font-bold text-[color:var(--ink)]">Vodafone Cash</strong> or{" "}
              <strong className="font-bold text-[color:var(--ink)]">InstaPay</strong> to{" "}
              <span className="font-mono font-bold text-[color:var(--ink)] underline decoration-2 underline-offset-4">
                {PAYMENT_CONTACT.phoneDisplay}
              </span>
              , or use an international card.
            </p>
          </div>
        </div>

        {/* Active Plan & Usage Card */}
        <div className="flex flex-col justify-between rounded-[24px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-6 sm:p-7 lg:col-span-5 shadow-chip">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="meta-label text-[color:var(--ink)]/60">
                Your Current Plan
              </p>
              <div className="mt-1.5 flex items-center gap-2.5">
                <h2 className="display text-3xl text-[color:var(--ink)]">
                  {PLAN_CATALOG[currentPlan].name}
                </h2>
                {subState?.source === "egypt_manual" && subState.paymentMethod && (
                  <span className="rounded-full border border-[color:var(--ink)]/20 bg-[#7fd8c9] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--ink)]">
                    {subState.paymentMethod === "instapay"
                      ? "InstaPay"
                      : subState.paymentMethod === "vodafone_cash"
                        ? "Vodafone Cash"
                        : "Activated"}
                  </span>
                )}
              </div>
              {subState?.currentPeriodEnd && currentPlan !== PLANS.FREE && (
                <p className="mt-1 text-xs font-semibold text-[color:var(--ink)]/65">
                  Active until{" "}
                  {new Date(subState.currentPeriodEnd).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>

            <a
              href={supportWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--ink)]/25 bg-white px-3 py-1.5 text-[11px] font-bold text-[color:var(--ink)] transition-colors hover:bg-[#dcfce7]"
            >
              <MessageCircle className="size-3.5 text-[#16A34A]" />
              Support
            </a>
          </div>

          {isSignedIn ? (
            <div className="mt-5 space-y-3.5">
              <UsageMeter
                label="Monthly Pages"
                used={usage.pagesUsed}
                limit={currentLimits.maxPagesPerMonth}
                unit="pages"
              />
              <UsageMeter
                label="AI Study Credits"
                used={usage.creditsUsed}
                limit={currentLimits.maxCreditsPerMonth}
                unit="credits"
              />
              <UsageMeter
                label="Live Voice Minutes"
                used={usage.voiceMinutesUsed}
                limit={currentLimits.maxVoiceMinutesPerMonth}
                unit="min"
              />
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-[color:var(--ink)]/15 bg-[color:var(--cream)]/50 p-4">
              <p className="text-xs sm:text-sm font-semibold text-[color:var(--ink)]">
                Sign in to view your monthly usage quota and activate a plan on your account.
              </p>
              <button
                type="button"
                onClick={() =>
                  clerk.openSignIn({
                    fallbackRedirectUrl: "/subscriptions",
                    signUpFallbackRedirectUrl: "/subscriptions",
                  })
                }
                className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--ink)] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[color:var(--cream)] transition-transform hover:-translate-y-0.5"
              >
                Sign in to Continue
                <ArrowRight className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Payment Method Switcher */}
      <section className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-[22px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-3 sm:p-4 shadow-chip">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPaymentTab("egypt")}
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2.5 text-xs sm:text-sm font-extrabold uppercase tracking-wider transition-all",
              paymentTab === "egypt"
                ? "bg-[color:var(--ink)] text-[color:var(--cream)] shadow-xs"
                : "bg-transparent text-[color:var(--ink)]/75 hover:bg-black/5",
            )}
          >
            <Smartphone className="size-4 text-[color:var(--orange)]" />
            Vodafone Cash / InstaPay (Egypt · EGP)
          </button>

          <button
            type="button"
            onClick={() => setPaymentTab("card")}
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2.5 text-xs sm:text-sm font-extrabold uppercase tracking-wider transition-all",
              paymentTab === "card"
                ? "bg-[color:var(--ink)] text-[color:var(--cream)] shadow-xs"
                : "bg-transparent text-[color:var(--ink)]/75 hover:bg-black/5",
            )}
          >
            <CreditCard className="size-4 text-[#7fd8c9]" />
            International Card (USD)
          </button>
        </div>

        {paymentTab === "egypt" && (
          <div className="inline-flex items-center self-start sm:self-auto rounded-full border border-[color:var(--ink)]/20 bg-white p-1">
            <button
              type="button"
              onClick={() => setBillingCycle("monthly")}
              className={cn(
                "cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                billingCycle === "monthly"
                  ? "bg-[color:var(--orange)] text-[color:var(--ink)]"
                  : "text-[color:var(--ink)]/65 hover:text-[color:var(--ink)]",
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle("annual")}
              className={cn(
                "cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                billingCycle === "annual"
                  ? "bg-[color:var(--orange)] text-[color:var(--ink)]"
                  : "text-[color:var(--ink)]/65 hover:text-[color:var(--ink)]",
              )}
            >
              Annual · 2 Months Free
            </button>
          </div>
        )}
      </section>

      {/* TAB 1: EGYPTIAN PAYMENT PLANS + CHECKOUT */}
      {paymentTab === "egypt" ? (
        <div className="mt-6 space-y-6">
          {/* 3 Plan Cards */}
          <section className="grid gap-4 md:grid-cols-3">
            {/* FREE PLAN */}
            <PlanCard
              item={PLAN_CATALOG[PLANS.FREE]}
              billingCycle={billingCycle}
              isCurrent={currentPlan === PLANS.FREE}
              isSelected={false}
              cardTone="panel"
              actionLabel={
                currentPlan === PLANS.FREE ? "Your Current Plan" : "Free Baseline"
              }
              disabled
            />

            {/* STANDARD PLAN */}
            <PlanCard
              item={PLAN_CATALOG[PLANS.STANDARD]}
              billingCycle={billingCycle}
              isCurrent={currentPlan === PLANS.STANDARD}
              isSelected={selectedPlan === PLANS.STANDARD}
              cardTone="cream"
              actionLabel={
                currentPlan === PLANS.STANDARD
                  ? "Renew / Extend Standard"
                  : "Select Standard Plan"
              }
              onSelect={() => handleSelectPlan(PLANS.STANDARD)}
            />

            {/* PRO PLAN */}
            <PlanCard
              item={PLAN_CATALOG[PLANS.PRO]}
              billingCycle={billingCycle}
              isCurrent={currentPlan === PLANS.PRO}
              isSelected={selectedPlan === PLANS.PRO}
              cardTone="ink"
              actionLabel={
                currentPlan === PLANS.PRO
                  ? "Renew / Extend Pro"
                  : "Select Pro Plan"
              }
              onSelect={() => handleSelectPlan(PLANS.PRO)}
            />
          </section>

          {/* Fair Dynamic AI Credit Pricing Info */}
          <section className="rounded-[20px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] px-5 py-4 shadow-chip">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <p className="meta-label text-[color:var(--ink)]/65">
                  Fair Dynamic AI Credits
                </p>
                <p className="mt-0.5 text-xs sm:text-sm font-semibold text-[color:var(--ink)]">
                  Light single-page study actions cost less; heavier multi-page topics, diagram scans, and whiteboards scale proportionally.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] font-bold text-[color:var(--ink)]">
                <span className="rounded-full border border-[color:var(--ink)]/20 bg-white px-3 py-1">
                  Cached Reads · 0 cr
                </span>
                <span className="rounded-full border border-[color:var(--ink)]/20 bg-white px-3 py-1">
                  1-Page Chat / Summary / Q-Bank · 1 cr
                </span>
                <span className="rounded-full border border-[color:var(--ink)]/20 bg-white px-3 py-1">
                  Multi-Page / Vision · +1–4 cr
                </span>
                <span className="rounded-full border border-[color:var(--ink)]/20 bg-white px-3 py-1">
                  Morph / Whiteboard · 3+ cr &amp; 1 cr/audio
                </span>
              </div>
            </div>
          </section>

          {/* Vodafone Cash / InstaPay Transfer & Confirmation Section */}
          <section
            ref={checkoutSectionRef}
            className="grid gap-4 lg:grid-cols-12"
          >
            {/* Left: Transfer Details */}
            <div className="rounded-[24px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-6 sm:p-8 lg:col-span-6 shadow-chip">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="meta-label text-[color:var(--ink)]/65">
                  Step 1 · Send Payment
                </span>
                <span className="rounded-full bg-[#7fd8c9] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--ink)]">
                  {selectedPlanInfo.name} ·{" "}
                  {billingCycle === "annual" ? "Annual" : "Monthly"}
                </span>
              </div>

              <h2 className="display mt-2 text-3xl text-[color:var(--ink)]">
                Pay {selectedAmountEgp.toLocaleString("en-US")} EGP
              </h2>
              <p className="mt-1 text-xs sm:text-sm font-medium text-[color:var(--ink)]/70">
                Choose Vodafone Cash or InstaPay and transfer using the link or number below.
              </p>

              {/* Plan quick switch inside checkout */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlan(PLANS.STANDARD);
                    setLastSubmitted(null);
                  }}
                  className={cn(
                    "cursor-pointer rounded-xl border-2 px-3 py-2.5 text-left transition-all",
                    selectedPlan === PLANS.STANDARD
                      ? "border-[color:var(--ink)] bg-[color:var(--cream)] shadow-xs"
                      : "border-[color:var(--ink)]/15 bg-white hover:border-[color:var(--ink)]/40",
                  )}
                >
                  <div className="text-xs font-extrabold uppercase text-[color:var(--ink)]">
                    Standard
                  </div>
                  <div className="text-sm font-bold text-[color:var(--ink)]">
                    {getPlanPriceEgp(PLANS.STANDARD, billingCycle).toLocaleString("en-US")} EGP
                    <span className="text-xs font-medium opacity-70">
                      /{billingCycle === "annual" ? "yr" : "mo"}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlan(PLANS.PRO);
                    setLastSubmitted(null);
                  }}
                  className={cn(
                    "cursor-pointer rounded-xl border-2 px-3 py-2.5 text-left transition-all",
                    selectedPlan === PLANS.PRO
                      ? "border-[color:var(--ink)] bg-[color:var(--cream)] shadow-xs"
                      : "border-[color:var(--ink)]/15 bg-white hover:border-[color:var(--ink)]/40",
                  )}
                >
                  <div className="text-xs font-extrabold uppercase text-[color:var(--ink)]">
                    Pro
                  </div>
                  <div className="text-sm font-bold text-[color:var(--ink)]">
                    {getPlanPriceEgp(PLANS.PRO, billingCycle).toLocaleString("en-US")} EGP
                    <span className="text-xs font-medium opacity-70">
                      /{billingCycle === "annual" ? "yr" : "mo"}
                    </span>
                  </div>
                </button>
              </div>

              {/* Method Picker: Vodafone Cash vs InstaPay */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod("vodafone_cash");
                    setFormError(null);
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition-all",
                    paymentMethod === "vodafone_cash"
                      ? "border-[#E60000] bg-red-50/90 shadow-xs"
                      : "border-[color:var(--ink)]/15 bg-white hover:border-[color:var(--ink)]/40",
                  )}
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#E60000] text-white font-black text-sm">
                    VF
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-[color:var(--ink)]">
                      Vodafone Cash
                    </div>
                    <div className="text-[11px] font-semibold text-[color:var(--ink)]/65">
                      Wallet transfer
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod("instapay");
                    setFormError(null);
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition-all",
                    paymentMethod === "instapay"
                      ? "border-[#5B2D8E] bg-purple-50/90 shadow-xs"
                      : "border-[color:var(--ink)]/15 bg-white hover:border-[color:var(--ink)]/40",
                  )}
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#5B2D8E] text-white font-black text-xs">
                    IPN
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-[color:var(--ink)]">
                      InstaPay
                    </div>
                    <div className="text-[11px] font-semibold text-[color:var(--ink)]/65">
                      Direct link / bank
                    </div>
                  </div>
                </button>
              </div>

              {/* Transfer Details Box */}
              <div className="mt-5 rounded-2xl border-2 border-[color:var(--ink)] bg-white p-4">
                {paymentMethod === "instapay" && (
                  <div className="mb-4 rounded-xl border-2 border-[#5B2D8E]/35 bg-purple-50/75 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#5B2D8E]">
                          Direct InstaPay Payment Link
                        </p>
                        <p className="mt-0.5 font-mono text-sm sm:text-base font-black text-[color:var(--ink)]">
                          {PAYMENT_CONTACT.instapayHandle}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            PAYMENT_CONTACT.instapayHandle,
                            "instapay-handle",
                            "InstaPay address",
                          )
                        }
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#5B2D8E]/40 bg-white px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[#5B2D8E] hover:bg-purple-100/70"
                      >
                        {copiedKey === "instapay-handle" ? (
                          <>
                            <Check className="size-3 text-emerald-700" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            Copy Address
                          </>
                        )}
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <a
                        href={PAYMENT_CONTACT.instapayPaymentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex flex-1 min-w-[190px] items-center justify-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[#5B2D8E] px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-xs transition-transform hover:-translate-y-0.5"
                      >
                        <ExternalLink className="size-3.5" />
                        Pay {selectedAmountEgp.toLocaleString("en-US")} EGP via InstaPay Link
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            PAYMENT_CONTACT.instapayPaymentUrl,
                            "instapay-url",
                            "InstaPay link",
                          )
                        }
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-[color:var(--ink)]/25 bg-white px-3.5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-[color:var(--ink)] hover:bg-black/5"
                      >
                        {copiedKey === "instapay-url" ? (
                          <>
                            <Check className="size-3.5 text-emerald-700" />
                            Link Copied
                          </>
                        ) : (
                          <>
                            <Copy className="size-3.5" />
                            Copy Link
                          </>
                        )}
                      </button>
                    </div>

                    <p className="mt-2 truncate font-mono text-[11px] font-semibold text-[#5B2D8E]/85">
                      {PAYMENT_CONTACT.instapayPaymentUrl}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--ink)]/60">
                      {paymentMethod === "vodafone_cash"
                        ? "Vodafone Cash Number"
                        : "Or InstaPay Mobile Number"}
                    </p>
                    <p className="mt-0.5 font-mono text-2xl sm:text-3xl font-black tracking-wider text-[color:var(--ink)]">
                      {PAYMENT_CONTACT.phoneDisplay}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        PAYMENT_CONTACT.phoneDisplay,
                        "transfer-number",
                        formatPaymentMethodLabel(paymentMethod) + " number",
                      )
                    }
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--cream)] px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-[color:var(--ink)] transition-transform hover:-translate-y-0.5"
                  >
                    {copiedKey === "transfer-number" ? (
                      <>
                        <Check className="size-3.5 text-emerald-700" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" />
                        Copy Number
                      </>
                    )}
                  </button>
                </div>

                <div className="mt-3 border-t border-[color:var(--ink)]/10 pt-3 text-xs font-medium leading-relaxed text-[color:var(--ink)]/80">
                  {paymentMethod === "vodafone_cash" ? (
                    <div className="space-y-1.5">
                      <p>
                        1. Open <strong>Ana Vodafone</strong> app or dial{" "}
                        <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono font-bold text-[color:var(--ink)]">
                          {ussdCode}
                        </code>{" "}
                        to send <strong>{selectedAmountEgp} EGP</strong>.
                      </p>
                      <p>
                        2. Take a screenshot of the confirmation SMS/receipt, then submit your wallet number on the right.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <p>
                        1. Click <strong>Pay via InstaPay Link</strong> above to send{" "}
                        <strong>{selectedAmountEgp} EGP</strong> directly to{" "}
                        <strong className="font-mono">
                          {PAYMENT_CONTACT.instapayHandle}
                        </strong>{" "}
                        (or transfer to mobile number{" "}
                        <strong className="font-mono">
                          {PAYMENT_CONTACT.instapayNumber}
                        </strong>
                        ).
                      </p>
                      <p>
                        2. Take a screenshot of your InstaPay confirmation and submit your mobile number or InstaPay address on the right.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Submit Confirmation + WhatsApp Receipt */}
            <div className="rounded-[24px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-6 sm:p-8 lg:col-span-6 shadow-chip">
              <div className="flex items-center justify-between gap-2">
                <span className="meta-label text-[color:var(--ink)]/65">
                  Step 2 · Confirm &amp; Activate
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                  <ShieldCheck className="size-4" />
                  Fast Activation
                </span>
              </div>

              <h3 className="display mt-2 text-2xl sm:text-3xl text-[color:var(--ink)]">
                Submit Your Transfer
              </h3>
              <p className="mt-1 text-xs sm:text-sm font-medium text-[color:var(--ink)]/70">
                Record your transfer below and send your receipt screenshot on WhatsApp for quick verification.
              </p>

              {lastSubmitted ? (
                <div className="mt-5 rounded-2xl border-2 border-emerald-700 bg-emerald-50 p-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="size-6 shrink-0 text-emerald-700" />
                    <div>
                      <p className="text-sm font-extrabold text-emerald-950">
                        Request Recorded · {lastSubmitted.request.requestCode}
                      </p>
                      <p className="mt-1 text-xs font-medium text-emerald-900/85">
                        {PLAN_CATALOG[lastSubmitted.request.plan as PlanType]?.name ||
                          lastSubmitted.request.plan}{" "}
                        ({lastSubmitted.request.billingCycle}) —{" "}
                        <strong>
                          {lastSubmitted.request.amountEgp.toLocaleString("en-US")} EGP
                        </strong>{" "}
                        via{" "}
                        {formatPaymentMethodLabel(
                          lastSubmitted.request.paymentMethod as EgyptPaymentMethod,
                        )}
                        .
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
                    <a
                      href={lastSubmitted.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[#25D366] px-5 py-3 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[color:var(--ink)] shadow-xs transition-transform hover:-translate-y-0.5"
                    >
                      <MessageCircle className="size-4" />
                      Send Receipt on WhatsApp ({PAYMENT_CONTACT.phoneDisplay})
                    </a>

                    <button
                      type="button"
                      onClick={() => setLastSubmitted(null)}
                      className="cursor-pointer rounded-full border-2 border-[color:var(--ink)]/25 bg-white px-4 py-3 text-xs font-bold text-[color:var(--ink)] hover:bg-black/5"
                    >
                      New Transfer
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmitRequest} className="mt-5 space-y-4">
                  <div>
                    <label
                      htmlFor="senderIdentifier"
                      className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-[color:var(--ink)]"
                    >
                      {paymentMethod === "vodafone_cash"
                        ? "Your Vodafone Cash Wallet Number"
                        : "Your Mobile Number or InstaPay Address"}
                    </label>
                    <input
                      id="senderIdentifier"
                      type="text"
                      value={senderIdentifier}
                      onChange={(e) => setSenderIdentifier(e.target.value)}
                      placeholder={
                        paymentMethod === "vodafone_cash"
                          ? "e.g. 01012345678"
                          : "e.g. 01012345678 or username@instapay"
                      }
                      className="w-full rounded-xl border-2 border-[color:var(--ink)]/25 bg-white px-4 py-3 text-sm font-semibold text-[color:var(--ink)] placeholder:text-[color:var(--ink)]/40 focus:border-[color:var(--ink)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="referenceNote"
                      className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-[color:var(--ink)]"
                    >
                      Transaction Reference / Note{" "}
                      <span className="font-medium lowercase text-[color:var(--ink)]/55">
                        (optional)
                      </span>
                    </label>
                    <input
                      id="referenceNote"
                      type="text"
                      value={referenceNote}
                      onChange={(e) => setReferenceNote(e.target.value)}
                      placeholder="e.g. Last 4 digits of reference or transfer time"
                      className="w-full rounded-xl border-2 border-[color:var(--ink)]/25 bg-white px-4 py-3 text-sm font-semibold text-[color:var(--ink)] placeholder:text-[color:var(--ink)]/40 focus:border-[color:var(--ink)] focus:outline-none"
                    />
                  </div>

                  {formError && (
                    <div className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700">
                      {formError}
                    </div>
                  )}

                  {isSignedIn ? (
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-6 py-3.5 text-sm font-extrabold uppercase tracking-wider text-[color:var(--ink)] shadow-chip transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Submitting Confirmation...
                        </>
                      ) : (
                        <>
                          <Wallet className="size-4" />
                          Confirm {selectedAmountEgp.toLocaleString("en-US")} EGP Transfer
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        clerk.openSignIn({
                          fallbackRedirectUrl: "/subscriptions",
                          signUpFallbackRedirectUrl: "/subscriptions",
                        })
                      }
                      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--ink)] px-6 py-3.5 text-sm font-extrabold uppercase tracking-wider text-[color:var(--cream)] shadow-chip transition-transform hover:-translate-y-0.5"
                    >
                      Sign In to Confirm Transfer
                      <ArrowRight className="size-4" />
                    </button>
                  )}
                </form>
              )}
            </div>
          </section>

          {/* User's Payment Requests History */}
          {isSignedIn && subState && subState.requests.length > 0 && (
            <section className="rounded-[24px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-6 sm:p-7 shadow-chip">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="meta-label text-[color:var(--ink)]/60">
                    Your Transfer History
                  </p>
                  <h3 className="display mt-1 text-2xl text-[color:var(--ink)]">
                    Recent Payment Requests
                  </h3>
                </div>
              </div>

              <div className="mt-4 divide-y divide-[color:var(--ink)]/10">
                {subState.requests.map((reqItem) => {
                  const whatsappFollowUp = buildWhatsAppSupportUrl(
                    buildWhatsAppPaymentMessage({
                      requestCode: reqItem.requestCode,
                      planName:
                        PLAN_CATALOG[reqItem.plan as PlanType]?.name ||
                        reqItem.plan,
                      billingCycle:
                        reqItem.billingCycle === "annual" ? "annual" : "monthly",
                      paymentMethod:
                        reqItem.paymentMethod === "instapay"
                          ? "instapay"
                          : "vodafone_cash",
                      amountEgp: reqItem.amountEgp,
                      senderIdentifier: reqItem.senderIdentifier,
                      userEmail,
                      referenceNote: reqItem.referenceNote || undefined,
                    }),
                  );

                  return (
                    <div
                      key={reqItem.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5"
                    >
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-extrabold text-[color:var(--ink)]">
                            {reqItem.requestCode}
                          </span>
                          <span className="text-sm font-bold text-[color:var(--ink)]">
                            {PLAN_CATALOG[reqItem.plan as PlanType]?.name ||
                              reqItem.plan}{" "}
                            ({reqItem.billingCycle})
                          </span>
                          <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-[11px] font-bold text-[color:var(--ink)]">
                            {reqItem.amountEgp.toLocaleString("en-US")} EGP ·{" "}
                            {formatPaymentMethodLabel(
                              reqItem.paymentMethod as EgyptPaymentMethod,
                            )}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-[color:var(--ink)]/65">
                          From: {reqItem.senderIdentifier}
                          {reqItem.createdAt
                            ? ` · ${new Date(reqItem.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                            : ""}
                          {reqItem.reviewNote ? ` · Note: ${reqItem.reviewNote}` : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <StatusPill status={reqItem.status} />
                        {reqItem.status !== "approved" && (
                          <a
                            href={whatsappFollowUp}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ink)]/25 bg-white px-3 py-1 text-[11px] font-bold text-[color:var(--ink)] hover:bg-[#dcfce7]"
                          >
                            <MessageCircle className="size-3.5 text-[#16A34A]" />
                            WhatsApp
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      ) : (
        /* TAB 2: INTERNATIONAL CARD (CLERK PRICING TABLE) */
        <div className="mt-6 space-y-4">
          <div className="rounded-[24px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-5 sm:p-8 shadow-chip">
            <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[color:var(--ink)]/10 pb-4">
              <div>
                <p className="meta-label text-[color:var(--ink)]/60">
                  International Cards · USD
                </p>
                <h2 className="display mt-1 text-2xl sm:text-3xl text-[color:var(--ink)]">
                  Card &amp; Apple Pay Checkout
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPaymentTab("egypt")}
                className="inline-flex cursor-pointer items-center gap-2 self-start rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--cream)] px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-[color:var(--ink)] transition-transform hover:-translate-y-0.5"
              >
                <Smartphone className="size-3.5" />
                Switch to Vodafone Cash / InstaPay (EGP)
              </button>
            </div>

            <div className="clerk-pricing-table-wrapper w-full rounded-2xl">
              <PricingTable />
            </div>

            <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-[color:var(--ink)]/15 bg-[color:var(--cream)]/60 px-4 py-3">
              <p className="text-xs sm:text-sm font-semibold text-[color:var(--ink)]">
                Card declined by your Egyptian bank? Switch to{" "}
                <strong>Vodafone Cash</strong> or <strong>InstaPay</strong> (
                {PLAN_CATALOG[PLANS.STANDARD].monthlyPriceEgp} EGP /{" "}
                {PLAN_CATALOG[PLANS.PRO].monthlyPriceEgp} EGP) or contact us on WhatsApp.
              </p>
              <a
                href={supportWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 border-[color:var(--ink)] bg-[#25D366] px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-[color:var(--ink)]"
              >
                <MessageCircle className="size-3.5" />
                WhatsApp Support
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ALWAYS-VISIBLE WHATSAPP SUPPORT FOOTER BANNER */}
      <section className="mt-8 rounded-[24px] border-2 border-[color:var(--ink)] bg-[color:var(--ink)] p-6 sm:p-8 text-[color:var(--cream)] shadow-chip">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#25D366]/20 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-[#7fd8c9]">
              <MessageCircle className="size-3.5 text-[#25D366]" />
              Subscription Support · Egypt
            </div>
            <h2 className="display mt-3 text-2xl sm:text-3xl text-[color:var(--cream)]">
              Need help or something went wrong?
            </h2>
            <p className="mt-2 text-xs sm:text-sm font-medium leading-relaxed text-[color:var(--cream)]/80">
              If any problem happens with your payment, plan activation, or monthly credits, message us directly on WhatsApp at{" "}
              <strong className="font-mono text-white">
                {PAYMENT_CONTACT.phoneDisplay}
              </strong>{" "}
              ({PAYMENT_CONTACT.phoneInternational}) and we will help you immediately.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <a
              href={supportWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border-2 border-[color:var(--cream)] bg-[#25D366] px-5 py-3 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[color:var(--ink)] transition-transform hover:-translate-y-0.5"
            >
              <MessageCircle className="size-4" />
              WhatsApp {PAYMENT_CONTACT.phoneDisplay}
            </a>

            <button
              type="button"
              onClick={() =>
                handleCopy(
                  PAYMENT_CONTACT.phoneDisplay,
                  "support-phone",
                  "WhatsApp & payment number",
                )
              }
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border-2 border-[color:var(--cream)]/35 bg-white/10 px-4 py-3 text-xs font-bold uppercase tracking-wider text-[color:var(--cream)] hover:bg-white/15"
            >
              {copiedKey === "support-phone" ? (
                <>
                  <Check className="size-4 text-[#7fd8c9]" />
                  Copied
                </>
              ) : (
                <>
                  <Phone className="size-4" />
                  Copy {PAYMENT_CONTACT.phoneDisplay}
                </>
              )}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function UsageMeter({
  label,
  used,
  limit,
  unit,
}: {
  label: string;
  used: number;
  limit: number;
  unit: string;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const nearLimit = pct >= 85;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-bold text-[color:var(--ink)]">
        <span>{label}</span>
        <span className="font-mono">
          {used} / {limit} {unit}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--ink)]/12">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            nearLimit ? "bg-[color:var(--orange)]" : "bg-[#2e6f68]",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function PlanCard({
  item,
  billingCycle,
  isCurrent,
  isSelected,
  cardTone,
  actionLabel,
  disabled,
  onSelect,
}: {
  item: (typeof PLAN_CATALOG)[PlanType];
  billingCycle: BillingCycle;
  isCurrent: boolean;
  isSelected: boolean;
  cardTone: "panel" | "cream" | "ink";
  actionLabel: string;
  disabled?: boolean;
  onSelect?: () => void;
}) {
  const priceEgp =
    billingCycle === "annual" ? item.annualPriceEgp : item.monthlyPriceEgp;
  const usdHint =
    billingCycle === "annual"
      ? item.annualMonthlyPriceUsd
      : item.monthlyPriceUsd;

  const isInk = cardTone === "ink";

  return (
    <article
      className={cn(
        "flex flex-col justify-between rounded-[24px] border-2 p-6 shadow-chip transition-transform duration-200",
        cardTone === "panel" && "bg-[color:var(--panel)] text-[color:var(--ink)] border-[color:var(--ink)]",
        cardTone === "cream" && "bg-[color:var(--cream)] text-[color:var(--ink)] border-[color:var(--ink)]",
        cardTone === "ink" && "bg-[color:var(--ink)] text-[color:var(--cream)] border-[color:var(--ink)]",
        isSelected && "ring-4 ring-[color:var(--orange)]/50 -translate-y-0.5",
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="display text-3xl">{item.name}</h3>
          <div className="flex items-center gap-1.5">
            {isCurrent && (
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider",
                  isInk
                    ? "bg-[#7fd8c9] text-[color:var(--ink)]"
                    : "bg-[color:var(--ink)] text-[color:var(--cream)]",
                )}
              >
                Active
              </span>
            )}
            {item.badge && (
              <span className="rounded-full bg-[color:var(--orange)] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--ink)]">
                {item.badge}
              </span>
            )}
          </div>
        </div>

        <p
          className={cn(
            "mt-2 text-xs font-medium leading-relaxed",
            isInk ? "text-[color:var(--cream)]/75" : "text-[color:var(--ink)]/70",
          )}
        >
          {item.tagline}
        </p>

        <div className="mt-5 flex items-baseline gap-2">
          <span className="display text-4xl sm:text-5xl">
            {priceEgp.toLocaleString("en-US")}
          </span>
          <span className="text-sm font-extrabold uppercase">
            EGP / {billingCycle === "annual" ? "year" : "month"}
          </span>
        </div>

        {priceEgp > 0 && (
          <p
            className={cn(
              "mt-1 text-[11px] font-semibold",
              isInk ? "text-[#7fd8c9]" : "text-[color:var(--ink)]/60",
            )}
          >
            {billingCycle === "annual"
              ? `Equivalent to ${Math.round(priceEgp / 12)} EGP/mo · Card rate $${usdHint}/mo`
              : `Or $${usdHint}/mo via International Card`}
          </p>
        )}

        <ul className="mt-5 space-y-2.5">
          {item.features.map((feat) => (
            <li key={feat} className="flex items-start gap-2 text-xs sm:text-[13px] font-semibold">
              <Check
                className={cn(
                  "mt-0.5 size-4 shrink-0 stroke-[2.5]",
                  isInk ? "text-[#7fd8c9]" : "text-[#2e6f68]",
                )}
              />
              <span>{feat}</span>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className={cn(
          "mt-6 flex w-full items-center justify-center gap-2 rounded-full border-2 px-4 py-3 text-xs font-extrabold uppercase tracking-wider transition-transform",
          disabled
            ? isInk
              ? "cursor-default border-white/20 bg-white/10 text-[color:var(--cream)]/65"
              : "cursor-default border-[color:var(--ink)]/20 bg-black/5 text-[color:var(--ink)]/55"
            : isInk
              ? "cursor-pointer border-[color:var(--cream)] bg-[color:var(--orange)] text-[color:var(--ink)] hover:-translate-y-0.5"
              : "cursor-pointer border-[color:var(--ink)] bg-[color:var(--ink)] text-[color:var(--cream)] hover:-translate-y-0.5",
        )}
      >
        {actionLabel}
        {!disabled && <ArrowRight className="size-3.5" />}
      </button>
    </article>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-extrabold uppercase text-emerald-800">
        <CheckCircle2 className="size-3.5" />
        Approved
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-extrabold uppercase text-red-800">
        <XCircle className="size-3.5" />
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-extrabold uppercase text-amber-900">
      <Clock className="size-3.5" />
      Pending Verification
    </span>
  );
}
