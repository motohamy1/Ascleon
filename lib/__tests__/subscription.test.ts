import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildWhatsAppIssueMessage,
  buildWhatsAppPaymentMessage,
  buildWhatsAppSupportUrl,
  calculateDynamicCreditCost,
  getPlanPriceEgp,
  getScopePageSpan,
  PAYMENT_CONTACT,
  pickHigherPlan,
  PLAN_CATALOG,
  PLANS,
} from "@/lib/subscription-constants";

const mockAuth = vi.fn();
const mockCurrentUser = vi.fn();
const mockConnectToDatabase = vi.fn();
const mockSubFindOne = vi.fn();
const mockReqFindOne = vi.fn();
const mockReqCreate = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
  currentUser: () => mockCurrentUser(),
}));

vi.mock("@/database/mongoose", () => ({
  connectToDatabase: () => mockConnectToDatabase(),
}));

vi.mock("@/database/models/user-subscription.model", () => ({
  default: {
    findOne: (...args: unknown[]) => mockSubFindOne(...args),
  },
}));

vi.mock("@/database/models/subscription-payment-request.model", () => ({
  default: {
    findOne: (...args: unknown[]) => mockReqFindOne(...args),
    create: (...args: unknown[]) => mockReqCreate(...args),
  },
}));

describe("Egyptian subscription constants & WhatsApp helpers", () => {
  it("uses 01016747795 and direct InstaPay link/handle for Vodafone Cash, InstaPay, and WhatsApp", () => {
    expect(PAYMENT_CONTACT.phoneDisplay).toBe("01016747795");
    expect(PAYMENT_CONTACT.vodafoneCashNumber).toBe("01016747795");
    expect(PAYMENT_CONTACT.instapayNumber).toBe("01016747795");
    expect(PAYMENT_CONTACT.instapayHandle).toBe("m.tohamy11111@instapay");
    expect(PAYMENT_CONTACT.instapayPaymentUrl).toBe(
      "https://ipn.eg/S/m.tohamy11111/instapay/7qJiFO",
    );
    expect(PAYMENT_CONTACT.whatsappDigits).toBe("201016747795");
  });

  it("configures 99 EGP/mo (990 EGP/yr) for Standard and 199 EGP/mo (1,990 EGP/yr) for Pro", () => {
    expect(PLAN_CATALOG[PLANS.STANDARD].monthlyPriceEgp).toBe(99);
    expect(PLAN_CATALOG[PLANS.STANDARD].annualPriceEgp).toBe(990);
    expect(PLAN_CATALOG[PLANS.PRO].monthlyPriceEgp).toBe(199);
    expect(PLAN_CATALOG[PLANS.PRO].annualPriceEgp).toBe(1990);
    expect(getPlanPriceEgp(PLANS.STANDARD, "monthly")).toBe(99);
    expect(getPlanPriceEgp(PLANS.PRO, "annual")).toBe(1990);
  });

  it("selects the higher plan tier accurately", () => {
    expect(pickHigherPlan(PLANS.FREE, PLANS.STANDARD)).toBe(PLANS.STANDARD);
    expect(pickHigherPlan(PLANS.PRO, PLANS.STANDARD)).toBe(PLANS.PRO);
    expect(pickHigherPlan(PLANS.STANDARD, PLANS.PRO)).toBe(PLANS.PRO);
  });

  it("builds valid WhatsApp URLs with pre-filled payment & support text", () => {
    const payMsg = buildWhatsAppPaymentMessage({
      requestCode: "ASC-123ABC",
      planName: "Standard",
      billingCycle: "monthly",
      paymentMethod: "vodafone_cash",
      amountEgp: 99,
      senderIdentifier: "01099887766",
      userEmail: "student@example.com",
    });
    const url = buildWhatsAppSupportUrl(payMsg);
    expect(url.startsWith("https://wa.me/201016747795?text=")).toBe(true);
    expect(decodeURIComponent(url)).toContain("ASC-123ABC");
    expect(decodeURIComponent(url)).toContain("99 EGP");
    expect(decodeURIComponent(url)).toContain("Vodafone Cash");

    const issueMsg = buildWhatsAppIssueMessage({
      currentPlan: "Free",
      userEmail: "student@example.com",
    });
    expect(issueMsg).toContain("Current Plan: Free");
  });
});

describe("Dynamic AI credit pricing engine", () => {
  it("charges 0 credits when a result is served from cache", () => {
    expect(
      calculateDynamicCreditCost({
        feature: "morph",
        pageSpan: 10,
        hasVisionInput: true,
        forceRefresh: true,
        isCached: true,
      }).total,
    ).toBe(0);

    expect(
      calculateDynamicCreditCost({
        feature: "whiteboard_beat",
        needsVector: false,
        needsAudio: false,
      }).total,
    ).toBe(0);
  });

  it("keeps lightweight 1-page queries affordable at 1 credit", () => {
    expect(
      calculateDynamicCreditCost({
        feature: "reader_assistant",
        scopeType: "page",
        pageSpan: 1,
      }).total,
    ).toBe(1);
    expect(
      calculateDynamicCreditCost({
        feature: "summary",
        scopeType: "page",
        pageSpan: 1,
      }).total,
    ).toBe(1);
    expect(
      calculateDynamicCreditCost({
        feature: "qbank",
        scopeType: "page",
        pageSpan: 1,
      }).total,
    ).toBe(1);
  });

  it("scales proportionally with multi-page scope, vision input, deep mode, and forceRefresh", () => {
    expect(getScopePageSpan({ startPage: 10, endPage: 18 })).toBe(9);

    const heavyAssistant = calculateDynamicCreditCost({
      feature: "reader_assistant",
      scopeType: "topic",
      pageSpan: 9,
      hasVisionInput: true,
    });
    expect(heavyAssistant.base).toBe(1);
    expect(heavyAssistant.scopeSurcharge).toBe(2);
    expect(heavyAssistant.visionSurcharge).toBe(1);
    expect(heavyAssistant.total).toBe(4);

    const heavyMorph = calculateDynamicCreditCost({
      feature: "morph",
      scopeType: "topic",
      pageSpan: 12,
      hasVisionInput: true,
      forceRefresh: true,
    });
    expect(heavyMorph.total).toBe(3 + 3 + 1 + 1); // 8 credits

    const deepLesson = calculateDynamicCreditCost({
      feature: "whiteboard_lesson",
      scopeType: "range",
      pageSpan: 6,
      pacing: "deep",
      forceRefresh: true,
    });
    expect(deepLesson.total).toBe(3 + 2 + 1 + 1); // 7 credits

    const sectionAudio = calculateDynamicCreditCost({
      feature: "whiteboard_audio",
      forceRefresh: false,
    });
    expect(sectionAudio.total).toBe(1);

    const beatGen = calculateDynamicCreditCost({
      feature: "whiteboard_beat",
      needsVector: true,
      needsAudio: true,
      forceRefresh: false,
    });
    expect(beatGen.total).toBe(2);

    const bookIngestLarge = calculateDynamicCreditCost({
      feature: "book_ingest",
      totalPages: 120,
    });
    expect(bookIngestLarge.total).toBe(5); // 2 base + 3 multi-page
  });
});

describe("getUserPlanDetails (Clerk + MongoDB Egyptian subscriptions)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectToDatabase.mockResolvedValue(undefined);
  });

  it("returns egypt_manual Pro when DB subscription is active even if Clerk has no card plan", async () => {
    mockAuth.mockResolvedValue({
      userId: "user_eg_1",
      has: () => false,
    });
    mockSubFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        plan: "pro",
        billingCycle: "monthly",
        paymentMethod: "instapay",
        currentPeriodEnd: new Date(Date.now() + 86_400_000),
      }),
    });

    const { getUserPlanDetails } = await import("@/lib/subscription.server");
    const details = await getUserPlanDetails();

    expect(details.plan).toBe(PLANS.PRO);
    expect(details.source).toBe("egypt_manual");
    expect(details.paymentMethod).toBe("instapay");
  });

  it("picks higher Clerk plan when Clerk is Pro and DB is Standard", async () => {
    mockAuth.mockResolvedValue({
      userId: "user_eg_2",
      has: ({ plan }: { plan: string }) => plan === "pro",
    });
    mockSubFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        plan: "standard",
        billingCycle: "monthly",
        paymentMethod: "vodafone_cash",
        currentPeriodEnd: new Date(Date.now() + 86_400_000),
      }),
    });

    const { getUserPlanDetails } = await import("@/lib/subscription.server");
    const details = await getUserPlanDetails();

    expect(details.plan).toBe(PLANS.PRO);
    expect(details.source).toBe("clerk");
  });
});

describe("POST /api/subscriptions/request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectToDatabase.mockResolvedValue(undefined);
    mockAuth.mockResolvedValue({ userId: "user_test_1" });
    mockCurrentUser.mockResolvedValue({
      firstName: "Omar",
      lastName: "Ali",
      primaryEmailAddress: { emailAddress: "omar@example.com" },
    });
    mockReqFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
  });

  it("returns 401 if unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { POST } = await import("@/app/api/subscriptions/request/route");

    const req = new Request("http://localhost/api/subscriptions/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: "standard",
        billingCycle: "monthly",
        paymentMethod: "vodafone_cash",
        senderIdentifier: "01012345678",
      }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("rejects invalid short Vodafone Cash wallet number", async () => {
    const { POST } = await import("@/app/api/subscriptions/request/route");

    const req = new Request("http://localhost/api/subscriptions/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: "standard",
        billingCycle: "monthly",
        paymentMethod: "vodafone_cash",
        senderIdentifier: "1234",
      }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("computes server-side EGP amount (199 EGP for Pro) and returns WhatsApp confirmation URL", async () => {
    mockReqCreate.mockImplementation(async (payload: Record<string, unknown>) => ({
      toObject: () => ({
        _id: "674000000000000000000001",
        createdAt: new Date("2026-11-18T12:00:00Z"),
        ...payload,
      }),
    }));

    const { POST } = await import("@/app/api/subscriptions/request/route");

    const req = new Request("http://localhost/api/subscriptions/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: "pro",
        billingCycle: "monthly",
        paymentMethod: "instapay",
        senderIdentifier: "omar@instapay",
        referenceNote: "Sent at 5pm",
      }),
    });

    const res = await POST(req as never);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.request.amountEgp).toBe(199);
    expect(data.request.recipientNumber).toBe("01016747795");
    expect(data.whatsappUrl).toContain("https://wa.me/201016747795?text=");
    expect(decodeURIComponent(data.whatsappUrl)).toContain("199 EGP");
    expect(decodeURIComponent(data.whatsappUrl)).toContain("omar@instapay");
  });
});
