import Link from "next/link";
import { isSubscriptionAdmin } from "@/lib/subscription.server";
import SubscriptionAdminConsole from "@/components/subscriptions/SubscriptionAdminConsole";

export const dynamic = "force-dynamic";

export default async function SubscriptionAdminPage() {
  const admin = await isSubscriptionAdmin();

  if (!admin.userId || !admin.isAdmin) {
    return (
      <main className="min-h-screen acid-bg px-4 pt-32 pb-16">
        <div className="mx-auto max-w-xl rounded-[24px] border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-8 text-center shadow-chip">
          <h1 className="display text-3xl text-[color:var(--ink)]">
            Admin Access Required
          </h1>
          <p className="mt-3 text-sm font-medium text-[color:var(--ink)]/75">
            To review Vodafone Cash and InstaPay subscription requests, sign in with an account listed in{" "}
            <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs">
              ADMIN_EMAILS
            </code>{" "}
            or{" "}
            <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs">
              ADMIN_USER_IDS
            </code>{" "}
            (or with Clerk <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs">publicMetadata.role = &quot;admin&quot;</code>).
          </p>
          <Link
            href="/subscriptions"
            className="mt-6 inline-flex rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--cream)] px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-[color:var(--ink)]"
          >
            Back to Subscriptions
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen acid-bg">
      <SubscriptionAdminConsole />
    </main>
  );
}
