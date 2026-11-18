import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/database/mongoose";
import SubscriptionPaymentRequest from "@/database/models/subscription-payment-request.model";
import UserSubscription from "@/database/models/user-subscription.model";
import { isSubscriptionAdmin } from "@/lib/subscription.server";
import { PLANS } from "@/lib/subscription-constants";

const adminActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    requestId: z.string().min(1),
    reviewNote: z.string().trim().max(300).optional(),
  }),
  z.object({
    action: z.literal("reject"),
    requestId: z.string().min(1),
    reviewNote: z.string().trim().max(300).optional(),
  }),
  z.object({
    action: z.literal("grant"),
    clerkId: z.string().trim().min(3),
    plan: z.enum([PLANS.FREE, PLANS.STANDARD, PLANS.PRO]),
    billingCycle: z.enum(["monthly", "annual"]).default("monthly"),
    paymentMethod: z
      .enum(["vodafone_cash", "instapay", "manual"])
      .default("manual"),
    durationDays: z.number().int().min(1).max(730).optional(),
    notes: z.string().trim().max(300).optional(),
  }),
]);

export async function GET(req: NextRequest) {
  try {
    const admin = await isSubscriptionAdmin();
    if (!admin.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!admin.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await connectToDatabase();
    const statusFilter = req.nextUrl.searchParams.get("status");
    const query =
      statusFilter && ["pending", "approved", "rejected"].includes(statusFilter)
        ? { status: statusFilter }
        : {};

    const [requests, activeSubscriptions] = await Promise.all([
      SubscriptionPaymentRequest.find(query)
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      UserSubscription.find({ status: "active", currentPeriodEnd: { $gt: new Date() } })
        .sort({ updatedAt: -1 })
        .limit(100)
        .lean(),
    ]);

    return NextResponse.json({
      success: true,
      requests: requests.map((r) => ({
        id: String(r._id),
        requestCode: r.requestCode,
        clerkId: r.clerkId,
        userEmail: r.userEmail || "",
        userName: r.userName || "",
        plan: r.plan,
        billingCycle: r.billingCycle,
        paymentMethod: r.paymentMethod,
        amountEgp: r.amountEgp,
        senderIdentifier: r.senderIdentifier,
        referenceNote: r.referenceNote || "",
        status: r.status,
        reviewNote: r.reviewNote || "",
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      })),
      activeSubscriptions: activeSubscriptions.map((s) => ({
        id: String(s._id),
        clerkId: s.clerkId,
        plan: s.plan,
        billingCycle: s.billingCycle,
        paymentMethod: s.paymentMethod,
        currentPeriodStart: s.currentPeriodStart
          ? new Date(s.currentPeriodStart).toISOString()
          : null,
        currentPeriodEnd: s.currentPeriodEnd
          ? new Date(s.currentPeriodEnd).toISOString()
          : null,
      })),
    });
  } catch (error) {
    console.error("[subscriptions/admin GET] Error:", error);
    return NextResponse.json(
      { error: "Failed to load admin subscription data." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await isSubscriptionAdmin();
    if (!admin.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!admin.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = adminActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid request." },
        { status: 400 },
      );
    }

    await connectToDatabase();
    const data = parsed.data;
    const now = new Date();

    if (data.action === "approve") {
      const payReq = await SubscriptionPaymentRequest.findById(data.requestId);
      if (!payReq) {
        return NextResponse.json(
          { error: "Payment request not found." },
          { status: 404 },
        );
      }

      payReq.status = "approved";
      payReq.reviewedBy = admin.email || admin.userId;
      payReq.reviewedAt = now;
      if (data.reviewNote) payReq.reviewNote = data.reviewNote;
      await payReq.save();

      const days = payReq.billingCycle === "annual" ? 365 : 30;
      const existingSub = await UserSubscription.findOne({ clerkId: payReq.clerkId });
      const baseStart =
        existingSub &&
        existingSub.status === "active" &&
        existingSub.currentPeriodEnd > now &&
        existingSub.plan === payReq.plan
          ? existingSub.currentPeriodEnd
          : now;
      const periodEnd = new Date(baseStart.getTime() + days * 24 * 60 * 60 * 1000);

      await UserSubscription.findOneAndUpdate(
        { clerkId: payReq.clerkId },
        {
          $set: {
            clerkId: payReq.clerkId,
            plan: payReq.plan,
            billingCycle: payReq.billingCycle,
            paymentMethod: payReq.paymentMethod,
            status: "active",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            lastPaymentRequestId: payReq._id,
            activatedBy: admin.email || admin.userId,
            notes: data.reviewNote || `Approved request ${payReq.requestCode}`,
          },
        },
        { upsert: true, new: true },
      );

      return NextResponse.json({ success: true, status: "approved" });
    }

    if (data.action === "reject") {
      const payReq = await SubscriptionPaymentRequest.findById(data.requestId);
      if (!payReq) {
        return NextResponse.json(
          { error: "Payment request not found." },
          { status: 404 },
        );
      }
      payReq.status = "rejected";
      payReq.reviewedBy = admin.email || admin.userId;
      payReq.reviewedAt = now;
      if (data.reviewNote) payReq.reviewNote = data.reviewNote;
      await payReq.save();

      return NextResponse.json({ success: true, status: "rejected" });
    }

    // Manual grant / revoke
    if (data.plan === PLANS.FREE) {
      await UserSubscription.findOneAndUpdate(
        { clerkId: data.clerkId },
        {
          $set: {
            plan: PLANS.FREE,
            status: "cancelled",
            currentPeriodEnd: now,
            activatedBy: admin.email || admin.userId,
            notes: data.notes || "Set to free by admin",
          },
        },
      );
      return NextResponse.json({ success: true, plan: PLANS.FREE });
    }

    const days = data.durationDays ?? (data.billingCycle === "annual" ? 365 : 30);
    const periodEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    await UserSubscription.findOneAndUpdate(
      { clerkId: data.clerkId },
      {
        $set: {
          clerkId: data.clerkId,
          plan: data.plan,
          billingCycle: data.billingCycle,
          paymentMethod: data.paymentMethod,
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          activatedBy: admin.email || admin.userId,
          notes: data.notes || "Manually activated by admin",
        },
      },
      { upsert: true, new: true },
    );

    return NextResponse.json({ success: true, plan: data.plan });
  } catch (error) {
    console.error("[subscriptions/admin POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to process admin action." },
      { status: 500 },
    );
  }
}
