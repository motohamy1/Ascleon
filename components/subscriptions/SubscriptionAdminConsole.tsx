"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PLANS,
  PLAN_CATALOG,
  formatPaymentMethodLabel,
  EgyptPaymentMethod,
} from "@/lib/subscription-constants";

interface AdminRequestRow {
  id: string;
  requestCode: string;
  clerkId: string;
  userEmail: string;
  userName: string;
  plan: string;
  billingCycle: string;
  paymentMethod: string;
  amountEgp: number;
  senderIdentifier: string;
  referenceNote: string;
  status: string;
  reviewNote: string;
  createdAt: string | null;
}

interface ActiveSubRow {
  id: string;
  clerkId: string;
  plan: string;
  billingCycle: string;
  paymentMethod: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}

export default function SubscriptionAdminConsole() {
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [requests, setRequests] = useState<AdminRequestRow[]>([]);
  const [activeSubs, setActiveSubs] = useState<ActiveSubRow[]>([]);

  const [grantClerkId, setGrantClerkId] = useState("");
  const [grantPlan, setGrantPlan] = useState<"standard" | "pro" | "free">("standard");
  const [grantCycle, setGrantCycle] = useState<"monthly" | "annual">("monthly");
  const [grantMethod, setGrantMethod] = useState<"vodafone_cash" | "instapay" | "manual">("vodafone_cash");
  const [granting, setGranting] = useState(false);

  const loadData = async (statusFilter = filter) => {
    setLoading(true);
    try {
      const qs = statusFilter === "all" ? "" : `?status=${statusFilter}`;
      const res = await fetch(`/api/subscriptions/admin${qs}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.error || "Failed to load requests");
        return;
      }
      setRequests(data.requests || []);
      setActiveSubs(data.activeSubscriptions || []);
    } catch {
      toast.error("Failed to fetch admin data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleAction = async (requestId: string, action: "approve" | "reject") => {
    setBusyId(requestId);
    try {
      const res = await fetch("/api/subscriptions/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, requestId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.error || "Action failed");
        return;
      }
      toast.success(
        action === "approve"
          ? "Payment approved & subscription activated!"
          : "Request marked as rejected.",
      );
      await loadData(filter);
    } catch {
      toast.error("Network error while updating request.");
    } finally {
      setBusyId(null);
    }
  };

  const handleManualGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantClerkId.trim()) {
      toast.error("Enter a Clerk User ID (user_...).");
      return;
    }
    setGranting(true);
    try {
      const res = await fetch("/api/subscriptions/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grant",
          clerkId: grantClerkId.trim(),
          plan: grantPlan,
          billingCycle: grantCycle,
          paymentMethod: grantMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.error || "Failed to update subscription");
        return;
      }
      toast.success(`Updated plan to ${grantPlan.toUpperCase()} for ${grantClerkId.trim()}`);
      setGrantClerkId("");
      await loadData(filter);
    } catch {
      toast.error("Network error");
    } finally {
      setGranting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-[98px] pb-16 sm:px-6 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-6 shadow-chip">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#7fd8c9] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--ink)]">
            <ShieldCheck className="size-3.5" />
            Subscription Admin
          </span>
          <h1 className="display mt-2 text-3xl sm:text-4xl text-[color:var(--ink)]">
            Egyptian Payment Requests
          </h1>
          <p className="mt-1 text-xs sm:text-sm font-medium text-[color:var(--ink)]/75">
            Verify Vodafone Cash &amp; InstaPay transfers and activate user subscriptions in one click.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadData(filter)}
          className="inline-flex cursor-pointer items-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--panel)] px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-[color:var(--ink)]"
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="mt-5 flex flex-wrap gap-2">
        {(["pending", "approved", "rejected", "all"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilter(tab)}
            className={cn(
              "cursor-pointer rounded-full border-2 border-[color:var(--ink)] px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider transition-colors",
              filter === tab
                ? "bg-[color:var(--ink)] text-[color:var(--cream)]"
                : "bg-[color:var(--panel)] text-[color:var(--ink)] hover:bg-black/5",
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Requests Table */}
      <div className="mt-4 rounded-[24px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-5 shadow-chip">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm font-bold text-[color:var(--ink)]/60">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading payment requests...
          </div>
        ) : requests.length === 0 ? (
          <p className="py-10 text-center text-sm font-semibold text-[color:var(--ink)]/60">
            No {filter === "all" ? "" : filter} payment requests found.
          </p>
        ) : (
          <div className="divide-y divide-[color:var(--ink)]/10">
            {requests.map((r) => (
              <div
                key={r.id}
                className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-black text-[color:var(--ink)]">
                      {r.requestCode}
                    </span>
                    <span className="rounded-full bg-[color:var(--cream)] px-2.5 py-0.5 text-xs font-extrabold uppercase text-[color:var(--ink)]">
                      {r.plan} · {r.billingCycle}
                    </span>
                    <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-bold text-[color:var(--ink)]">
                      {r.amountEgp} EGP via{" "}
                      {formatPaymentMethodLabel(r.paymentMethod as EgyptPaymentMethod)}
                    </span>
                    {r.status === "pending" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                        <Clock className="size-3" /> Pending
                      </span>
                    ) : r.status === "approved" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                        <CheckCircle2 className="size-3" /> Approved
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">
                        <XCircle className="size-3" /> Rejected
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-[color:var(--ink)]/80">
                    User: {r.userName || "Unknown"} ({r.userEmail || r.clerkId}) ·{" "}
                    <span className="font-mono">{r.clerkId}</span>
                  </p>
                  <p className="text-xs font-medium text-[color:var(--ink)]/65">
                    Sender: <strong>{r.senderIdentifier}</strong>
                    {r.referenceNote ? ` · Ref: ${r.referenceNote}` : ""}
                    {r.createdAt
                      ? ` · ${new Date(r.createdAt).toLocaleString()}`
                      : ""}
                  </p>
                </div>

                {r.status === "pending" && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => handleAction(r.id, "approve")}
                      className="cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[#7fd8c9] px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-[color:var(--ink)] disabled:opacity-50"
                    >
                      Approve &amp; Activate
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => handleAction(r.id, "reject")}
                      className="cursor-pointer rounded-full border-2 border-red-300 bg-red-50 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-red-700 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Direct Manual Grant */}
      <div className="mt-6 grid gap-5 lg:grid-cols-12">
        <form
          onSubmit={handleManualGrant}
          className="rounded-[24px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-6 lg:col-span-6 shadow-chip"
        >
          <div className="flex items-center gap-2">
            <UserPlus className="size-4 text-[color:var(--orange)]" />
            <h2 className="display text-2xl text-[color:var(--ink)]">
              Manual Plan Activation
            </h2>
          </div>
          <p className="mt-1 text-xs font-medium text-[color:var(--ink)]/70">
            Activate or update any user&apos;s plan directly using their Clerk User ID.
          </p>

          <div className="mt-4 space-y-3">
            <input
              type="text"
              value={grantClerkId}
              onChange={(e) => setGrantClerkId(e.target.value)}
              placeholder="Clerk User ID (e.g. user_2abc...)"
              className="w-full rounded-xl border-2 border-[color:var(--ink)]/20 bg-white px-3.5 py-2.5 text-sm font-semibold"
            />
            <div className="grid grid-cols-3 gap-2">
              <select
                value={grantPlan}
                onChange={(e) => setGrantPlan(e.target.value as "standard" | "pro" | "free")}
                className="rounded-xl border-2 border-[color:var(--ink)]/20 bg-white px-3 py-2 text-xs font-bold"
              >
                <option value={PLANS.STANDARD}>
                  Standard ({PLAN_CATALOG[PLANS.STANDARD].monthlyPriceEgp} EGP)
                </option>
                <option value={PLANS.PRO}>
                  Pro ({PLAN_CATALOG[PLANS.PRO].monthlyPriceEgp} EGP)
                </option>
                <option value={PLANS.FREE}>Free (Revoke)</option>
              </select>
              <select
                value={grantCycle}
                onChange={(e) => setGrantCycle(e.target.value as "monthly" | "annual")}
                className="rounded-xl border-2 border-[color:var(--ink)]/20 bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="monthly">Monthly (30d)</option>
                <option value="annual">Annual (365d)</option>
              </select>
              <select
                value={grantMethod}
                onChange={(e) =>
                  setGrantMethod(
                    e.target.value as "vodafone_cash" | "instapay" | "manual",
                  )
                }
                className="rounded-xl border-2 border-[color:var(--ink)]/20 bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="vodafone_cash">Vodafone Cash</option>
                <option value="instapay">InstaPay</option>
                <option value="manual">Manual</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={granting}
              className="w-full cursor-pointer rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-[color:var(--ink)]"
            >
              {granting ? "Applying..." : "Apply Plan Change"}
            </button>
          </div>
        </form>

        <div className="rounded-[24px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-6 lg:col-span-6 shadow-chip">
          <h2 className="display text-2xl text-[color:var(--ink)]">
            Active Egyptian Subscriptions ({activeSubs.length})
          </h2>
          <div className="mt-3 max-h-60 overflow-y-auto divide-y divide-[color:var(--ink)]/10">
            {activeSubs.length === 0 ? (
              <p className="py-6 text-xs font-medium text-[color:var(--ink)]/60">
                No active DB-managed subscriptions yet.
              </p>
            ) : (
              activeSubs.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2.5 text-xs">
                  <div>
                    <p className="font-mono font-bold text-[color:var(--ink)]">{s.clerkId}</p>
                    <p className="text-[color:var(--ink)]/65">
                      {s.plan.toUpperCase()} ({s.billingCycle}) · {s.paymentMethod}
                    </p>
                  </div>
                  <span className="font-semibold text-[color:var(--ink)]/70">
                    Ends{" "}
                    {s.currentPeriodEnd
                      ? new Date(s.currentPeriodEnd).toLocaleDateString("en-GB")
                      : "-"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
