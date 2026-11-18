import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/database/mongoose";
import SubscriptionPaymentRequest from "@/database/models/subscription-payment-request.model";
import { getUserUsageSummary } from "@/lib/usage.server";
import SubscriptionHub, {
  InitialSubscriptionState,
  SerializedPaymentRequest,
} from "@/components/subscriptions/SubscriptionHub";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const [{ userId }, params] = await Promise.all([auth(), searchParams]);

  let initialState: InitialSubscriptionState | null = null;

  if (userId) {
    try {
      await connectToDatabase();
      const [summary, requests] = await Promise.all([
        getUserUsageSummary(userId),
        SubscriptionPaymentRequest.find({ clerkId: userId })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
      ]);

      const serializedRequests: SerializedPaymentRequest[] = requests.map(
        (r) => ({
          id: String(r._id),
          requestCode: String(r.requestCode),
          plan: String(r.plan),
          billingCycle: String(r.billingCycle),
          paymentMethod: String(r.paymentMethod),
          amountEgp: Number(r.amountEgp),
          recipientNumber: String(r.recipientNumber),
          senderIdentifier: String(r.senderIdentifier),
          referenceNote: r.referenceNote ? String(r.referenceNote) : "",
          status: String(r.status),
          reviewNote: r.reviewNote ? String(r.reviewNote) : "",
          createdAt: r.createdAt
            ? new Date(r.createdAt as string | Date).toISOString()
            : null,
        }),
      );

      initialState = {
        plan: summary.plan,
        source: summary.planDetails.source,
        paymentMethod: summary.planDetails.paymentMethod ?? null,
        billingCycle: summary.planDetails.billingCycle ?? null,
        currentPeriodEnd: summary.planDetails.currentPeriodEnd ?? null,
        usage: summary.usage,
        requests: serializedRequests,
      };
    } catch (error) {
      console.error("[SubscriptionsPage] Failed to load initial state:", error);
    }
  }

  return (
    <main className="min-h-screen acid-bg">
      <SubscriptionHub
        initialState={initialState}
        limitReason={params?.reason === "limit"}
      />
    </main>
  );
}
