export type ServiceErrorKind =
  | "credits"
  | "overloaded"
  | "rate_limited"
  | "auth"
  | "generic";

export interface ParsedServiceError {
  kind: ServiceErrorKind;
  title: string;
  message: string;
  upgradeHref?: string;
  retryAfterSeconds?: number;
  creditsRefunded?: boolean;
  errorId?: string;
}

function asRecord(val: unknown): Record<string, unknown> {
  return val && typeof val === "object" ? (val as Record<string, unknown>) : {};
}

export function parseServiceErrorPayload(
  status: number,
  rawData: unknown
): ParsedServiceError {
  const data = asRecord(rawData);
  const code = typeof data.code === "string" ? data.code : "";
  const errorId = typeof data.errorId === "string" ? data.errorId : undefined;
  const creditsRefunded = Boolean(data.creditsRefunded);
  const retryAfterSeconds =
    typeof data.retryAfterSeconds === "number" ? data.retryAfterSeconds : undefined;

  if (status === 402 || Boolean(data.isBillingError)) {
    const safeBillingMsg =
      typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : "You have reached your monthly AI credit limit. Upgrade your plan to continue.";
    return {
      kind: "credits",
      title: "AI Credits Limit Reached",
      message: safeBillingMsg,
      upgradeHref: "/subscriptions?reason=limit",
    };
  }

  if (
    status === 503 ||
    status === 502 ||
    status === 504 ||
    code === "MODEL_OVERLOADED" ||
    Boolean(data.isModelOverloaded)
  ) {
    return {
      kind: "overloaded",
      title: "AI Model Temporarily Busy",
      message: creditsRefunded
        ? "Our AI servers are experiencing high demand right now. No credits were charged — please try again in a moment."
        : "Our AI servers are experiencing high demand right now. Please wait a moment and try again.",
      retryAfterSeconds: retryAfterSeconds ?? 30,
      creditsRefunded,
      errorId,
    };
  }

  if (status === 429 || code === "RATE_LIMITED") {
    return {
      kind: "rate_limited",
      title: "Too Many Requests",
      message: `Please pause for ${retryAfterSeconds ?? 30} seconds before sending another request.`,
      retryAfterSeconds: retryAfterSeconds ?? 30,
    };
  }

  if (status === 401 || status === 403) {
    return {
      kind: "auth",
      title: "Sign In Required",
      message: "Please sign in to your account to continue using AI features.",
    };
  }

  return {
    kind: "generic",
    title: "Request Interrupted",
    message: creditsRefunded
      ? "We couldn't complete this request right now. Any credits used were refunded — please try again."
      : "We couldn't complete this request right now. Please try again in a moment.",
    creditsRefunded,
    errorId,
  };
}

export function parseApiError(
  res: Response | { status: number },
  data: unknown
): ParsedServiceError {
  return parseServiceErrorPayload(res.status, data);
}
