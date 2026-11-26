import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/database/mongoose";
import DeveloperErrorLog, {
  type DeveloperErrorCategory,
} from "@/database/models/developer-error-log.model";

export interface AiErrorClassification {
  category: "ai_overloaded" | "ai_quota" | "ai_unavailable" | "internal";
  isModelOverloaded: boolean;
  retryAfterSeconds?: number;
}

const SENSITIVE_META_KEYS = new Set([
  "authorization",
  "cookie",
  "cookies",
  "apikey",
  "api_key",
  "token",
  "password",
  "secret",
  "geminikey",
  "groqkey",
  "openrouterkey",
  "openaikey",
]);

function extractErrorDetails(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message || error.name || "Unknown error",
      stack: error.stack,
    };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error ?? "Unknown error") };
  }
}

function redactMeta(
  meta: Record<string, unknown> | undefined,
  depth = 0
): Record<string, unknown> | undefined {
  if (!meta || depth > 3) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (SENSITIVE_META_KEYS.has(normalizedKey)) {
      clean[key] = "[REDACTED]";
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      clean[key] = redactMeta(value as Record<string, unknown>, depth + 1);
    } else if (typeof value === "string") {
      clean[key] = value.slice(0, 500);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Classifies provider/model errors into user-safe overload/quota states vs generic internal errors.
 */
export function classifyAiError(error: unknown): AiErrorClassification {
  const { message } = extractErrorDetails(error);
  const lower = message.toLowerCase();

  if (
    lower.includes("429") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("too many requests") ||
    lower.includes("perday") ||
    lower.includes("per_day") ||
    lower.includes("limit: 0") ||
    lower.includes("limit: 20") ||
    lower.includes("insufficient_quota") ||
    lower.includes("billing")
  ) {
    return {
      category: "ai_quota",
      isModelOverloaded: true,
      retryAfterSeconds: 60,
    };
  }

  if (
    lower.includes("503") ||
    lower.includes("502") ||
    lower.includes("504") ||
    lower.includes("overloaded") ||
    lower.includes("unavailable") ||
    lower.includes("high demand") ||
    lower.includes("capacity") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("aborted")
  ) {
    return {
      category: "ai_overloaded",
      isModelOverloaded: true,
      retryAfterSeconds: 30,
    };
  }

  if (
    lower.includes("all ai") ||
    lower.includes("gemini_api_key") ||
    lower.includes("groq_api_key") ||
    lower.includes("no ai provider") ||
    lower.includes("ephemeral token")
  ) {
    return {
      category: "ai_unavailable",
      isModelOverloaded: true,
      retryAfterSeconds: 45,
    };
  }

  return {
    category: "internal",
    isModelOverloaded: false,
  };
}

/**
 * Records full technical error details for the developer only (server logs + MongoDB TTL log)
 * and returns an opaque errorId reference safe to surface in UI/support responses.
 */
export function logServerError(
  context: string,
  error: unknown,
  meta?: Record<string, unknown>,
  options?: { category?: DeveloperErrorCategory; statusCode?: number; persist?: boolean }
): string {
  const errorId = `err_${crypto.randomBytes(4).toString("hex")}`;
  const { message, stack } = extractErrorDetails(error);
  const aiClassification = classifyAiError(error);
  const category: DeveloperErrorCategory = options?.category ?? aiClassification.category;
  const statusCode =
    options?.statusCode ?? (aiClassification.isModelOverloaded ? 503 : 500);
  const safeMeta = redactMeta(meta);

  console.error(
    "[ASCLEON_DEV_ERROR]",
    JSON.stringify({
      errorId,
      context,
      category,
      statusCode,
      message,
      meta: safeMeta,
      stack: stack?.split("\n").slice(0, 6).join("\n"),
      timestamp: new Date().toISOString(),
    })
  );

  if (options?.persist !== false && process.env.MONGODB_URI) {
    void (async () => {
      try {
        await connectToDatabase();
        await DeveloperErrorLog.create({
          errorId,
          context: context.slice(0, 120),
          category,
          statusCode,
          message: message.slice(0, 2000),
          stack: stack?.slice(0, 4000),
          meta: safeMeta,
        });
      } catch {
        // Never allow logging failures to cascade into request failures
      }
    })();
  }

  return errorId;
}

/**
 * Logs the real error for developers and returns a sanitized HTTP response to clients.
 * Overload/quota AI errors return 503 with `isModelOverloaded: true`; all other errors
 * return a calm generic message with an `errorId` and never expose raw error messages or stacks.
 */
export function buildSafeErrorResponse(
  context: string,
  error: unknown,
  options?: {
    status?: number;
    fallbackMessage?: string;
    meta?: Record<string, unknown>;
    creditsRefunded?: boolean;
  }
): NextResponse {
  const classification = classifyAiError(error);
  const status = classification.isModelOverloaded
    ? 503
    : (options?.status ?? 500);

  const errorId = logServerError(context, error, options?.meta, {
    category: classification.category,
    statusCode: status,
  });

  if (classification.isModelOverloaded) {
    const retryAfter = classification.retryAfterSeconds ?? 30;
    return NextResponse.json(
      {
        error:
          "Our AI model is currently experiencing high demand. Please wait a moment and try again.",
        code: "MODEL_OVERLOADED",
        isModelOverloaded: true,
        retryAfterSeconds: retryAfter,
        creditsRefunded: Boolean(options?.creditsRefunded),
        errorId,
      },
      {
        status: 503,
        headers: {
          "Retry-After": String(retryAfter),
        },
      }
    );
  }

  return NextResponse.json(
    {
      error:
        options?.fallbackMessage ??
        "Something went wrong on our end. Please try again in a moment.",
      code: "INTERNAL_ERROR",
      errorId,
    },
    { status }
  );
}
