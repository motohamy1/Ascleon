import { isSubscriptionAdmin } from "@/lib/subscription.server";

export type WhiteboardAccessMode = "public" | "admin-preview" | "locked";

export interface WhiteboardAccessResult {
  allowed: boolean;
  mode: WhiteboardAccessMode;
}

export async function getWhiteboardAccess(): Promise<WhiteboardAccessResult> {
  if (process.env.WHITEBOARD_PUBLIC_ENABLED === "true") {
    return { allowed: true, mode: "public" };
  }

  try {
    const admin = await isSubscriptionAdmin();
    const allowAdminPreview =
      process.env.WHITEBOARD_ADMIN_PREVIEW === "true" ||
      process.env.NODE_ENV !== "production";

    if (admin.isAdmin && allowAdminPreview) {
      return { allowed: true, mode: "admin-preview" };
    }
  } catch {
    return { allowed: false, mode: "locked" };
  }

  return { allowed: false, mode: "locked" };
}
