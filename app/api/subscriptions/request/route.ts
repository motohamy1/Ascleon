import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";
import { connectToDatabase } from "@/database/mongoose";
import SubscriptionPaymentRequest from "@/database/models/subscription-payment-request.model";
import {
  buildWhatsAppPaymentMessage,
  buildWhatsAppSupportUrl,
  getPlanPriceEgp,
  PAYMENT_CONTACT,
  PLAN_CATALOG,
  PLANS,
} from "@/lib/subscription-constants";
import { getUserUsageSummary } from "@/lib/usage.server";

const createRequestSchema = z.object({
  plan: z.enum([PLANS.STANDARD, PLANS.PRO]),
  billingCycle: z.enum(["monthly", "annual"]),
  paymentMethod: z.enum(["vodafone_cash", "instapay"]),
  senderIdentifier: z
    .string()
    .trim()
    .min(4, "Please enter the mobile number or InstaPay handle you transferred from.")
    .max(80, "Sender details are too long."),
  referenceNote: z
    .string()
    .trim()
    .max(240, "Reference note must be 240 characters or less.")
    .optional()
    .default(""),
});

function serializeRequest(doc: Record<string, unknown>) {
  return {
    id: String(doc._id),
    requestCode: String(doc.requestCode),
    plan: String(doc.plan),
    billingCycle: String(doc.billingCycle),
    paymentMethod: String(doc.paymentMethod),
    amountEgp: Number(doc.amountEgp),
    recipientNumber: String(doc.recipientNumber),
    senderIdentifier: String(doc.senderIdentifier),
    referenceNote: doc.referenceNote ? String(doc.referenceNote) : "",
    status: String(doc.status),
    reviewNote: doc.reviewNote ? String(doc.reviewNote) : "",
    createdAt: doc.createdAt ? new Date(doc.createdAt as string | Date).toISOString() : null,
  };
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Please sign in to view your subscription status." },
        { status: 401 },
      );
    }

    await connectToDatabase();
    const [summary, requests] = await Promise.all([
      getUserUsageSummary(userId),
      SubscriptionPaymentRequest.find({ clerkId: userId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    return NextResponse.json({
      success: true,
      summary,
      requests: requests.map((r) => serializeRequest(r as Record<string, unknown>)),
    });
  } catch (error) {
    console.error("[subscriptions/request GET] Error:", error);
    return NextResponse.json(
      { error: "Failed to load subscription requests." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Please sign in before submitting a payment confirmation." },
        { status: 401 },
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request payload." },
        { status: 400 },
      );
    }

    const parsed = createRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message || "Invalid payment details.";
      return NextResponse.json({ error: firstIssue }, { status: 400 });
    }

    const { plan, billingCycle, paymentMethod, senderIdentifier, referenceNote } =
      parsed.data;

    if (paymentMethod === "vodafone_cash") {
      const digitsOnly = senderIdentifier.replace(/\D/g, "");
      if (digitsOnly.length < 10) {
        return NextResponse.json(
          {
            error:
              "Please enter a valid Egyptian Vodafone Cash wallet number (e.g. 010XXXXXXXX).",
          },
          { status: 400 },
        );
      }
    }

    await connectToDatabase();

    const user = await currentUser();
    const userEmail =
      user?.primaryEmailAddress?.emailAddress ||
      user?.emailAddresses?.[0]?.emailAddress ||
      undefined;
    const userName =
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
      user?.username ||
      undefined;

    const amountEgp = getPlanPriceEgp(plan, billingCycle);

    // Prevent accidental double-submission within 2 minutes for identical pending details
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const recentDuplicate = await SubscriptionPaymentRequest.findOne({
      clerkId: userId,
      plan,
      billingCycle,
      paymentMethod,
      senderIdentifier,
      status: "pending",
      createdAt: { $gte: twoMinutesAgo },
    }).lean();

    if (recentDuplicate) {
      const serialized = serializeRequest(recentDuplicate as Record<string, unknown>);
      const whatsappUrl = buildWhatsAppSupportUrl(
        buildWhatsAppPaymentMessage({
          requestCode: serialized.requestCode,
          planName: PLAN_CATALOG[plan].name,
          billingCycle,
          paymentMethod,
          amountEgp,
          senderIdentifier,
          userEmail,
          referenceNote,
        }),
      );
      return NextResponse.json({
        success: true,
        deduplicated: true,
        request: serialized,
        whatsappUrl,
      });
    }

    const requestCode = `ASC-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    const created = await SubscriptionPaymentRequest.create({
      requestCode,
      clerkId: userId,
      userEmail,
      userName,
      plan,
      billingCycle,
      paymentMethod,
      amountEgp,
      recipientNumber: PAYMENT_CONTACT.phoneDisplay,
      senderIdentifier,
      referenceNote: referenceNote || undefined,
      status: "pending",
    });

    const serialized = serializeRequest(created.toObject() as Record<string, unknown>);
    const whatsappUrl = buildWhatsAppSupportUrl(
      buildWhatsAppPaymentMessage({
        requestCode: serialized.requestCode,
        planName: PLAN_CATALOG[plan].name,
        billingCycle,
        paymentMethod,
        amountEgp,
        senderIdentifier,
        userEmail,
        referenceNote,
      }),
    );

    return NextResponse.json(
      {
        success: true,
        request: serialized,
        whatsappUrl,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[subscriptions/request POST] Error:", error);
    return NextResponse.json(
      { error: "Unable to record payment request. Please message us directly on WhatsApp." },
      { status: 500 },
    );
  }
}
