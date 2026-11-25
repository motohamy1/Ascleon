import { auth, currentUser } from "@clerk/nextjs/server";
import { isSubscriptionAdmin } from "@/lib/subscription.server";

export type WhiteboardAccessMode = "public" | "admin-preview" | "locked";

export interface WhiteboardAccessResult {
  allowed: boolean;
  mode: WhiteboardAccessMode;
}

const DEFAULT_WHITEBOARD_PREVIEW_EMAILS = ["meltohamy080@gmail.com"];

function getWhiteboardPreviewEmailAllowlist(): Set<string> {
  const envEmails = (process.env.WHITEBOARD_ALLOWED_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return new Set([...DEFAULT_WHITEBOARD_PREVIEW_EMAILS, ...envEmails]);
}

export async function getWhiteboardAccess(): Promise<WhiteboardAccessResult> {
  if (process.env.WHITEBOARD_PUBLIC_ENABLED === "true") {
    return { allowed: true, mode: "public" };
  }

  try {
    const { userId } = await auth();
    if (userId) {
      const user = await currentUser();
      const allowlist = getWhiteboardPreviewEmailAllowlist();
      const verifiedEmails =
        user?.emailAddresses
          ?.filter((e) => !e.verification || e.verification.status === "verified")
          .map((e) => e.emailAddress.trim().toLowerCase()) ?? [];

      if (verifiedEmails.some((email) => allowlist.has(email))) {
        return { allowed: true, mode: "admin-preview" };
      }
    }

    const admin = await isSubscriptionAdmin();
    if (admin.isAdmin) {
      return { allowed: true, mode: "admin-preview" };
    }
  } catch {
    return { allowed: false, mode: "locked" };
  }

  return { allowed: false, mode: "locked" };
}
