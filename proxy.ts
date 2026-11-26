import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { applyCorsHeaders, isOriginAllowed } from "@/lib/security/cors";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

const ONE_MINUTE_MS = 60_000;

function resolveRateLimitBucket(pathname: string): {
  bucket: string;
  limit: number;
  windowMs: number;
} | null {
  if (
    pathname.startsWith("/__clerk") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up")
  ) {
    return { bucket: "auth", limit: 60, windowMs: ONE_MINUTE_MS };
  }

  if (
    pathname === "/api/upload" ||
    pathname === "/api/storage/upload" ||
    pathname === "/api/subscriptions/request"
  ) {
    return { bucket: "sensitive_write", limit: 15, windowMs: ONE_MINUTE_MS };
  }

  if (
    pathname.startsWith("/api/qbank") ||
    pathname.startsWith("/api/summary") ||
    pathname.startsWith("/api/morph") ||
    pathname.startsWith("/api/reader-assistant") ||
    pathname.startsWith("/api/books/digest") ||
    pathname.startsWith("/api/voice") ||
    pathname.startsWith("/api/whiteboard") ||
    pathname.startsWith("/api/study-plans")
  ) {
    return { bucket: "ai_generation", limit: 30, windowMs: ONE_MINUTE_MS };
  }

  if (pathname.startsWith("/api/")) {
    return { bucket: "api_general", limit: 120, windowMs: ONE_MINUTE_MS };
  }

  return null;
}

export default clerkMiddleware(async (_auth, req) => {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") || "";
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const isLocalHost =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]");

  // Enforce HTTPS in production behind TLS-terminating proxies
  if (
    process.env.NODE_ENV === "production" &&
    forwardedProto === "http" &&
    !isLocalHost
  ) {
    const httpsUrl = new URL(req.url);
    httpsUrl.protocol = "https:";
    return NextResponse.redirect(httpsUrl, 308);
  }

  const origin = req.headers.get("origin");
  const isApiRoute = pathname.startsWith("/api/");
  const isWebhookRoute = pathname.startsWith("/api/vapi-search-book");

  // Strict CORS enforcement on API routes
  if (isApiRoute && !isWebhookRoute) {
    if (origin && !isOriginAllowed(origin)) {
      return NextResponse.json(
        { error: "Origin not allowed by CORS policy." },
        { status: 403 }
      );
    }

    if (req.method === "OPTIONS") {
      const preflightHeaders = new Headers();
      applyCorsHeaders(preflightHeaders, origin);
      preflightHeaders.set("Access-Control-Max-Age", "86400");
      return new NextResponse(null, { status: 204, headers: preflightHeaders });
    }
  }

  // Tiered rate limiting on auth, upload/payment, AI, and general API routes
  const rule = resolveRateLimitBucket(pathname);
  let rateLimitHeaders: Record<string, string> | undefined;
  if (rule) {
    const ip = getClientIp(req);
    const result = checkRateLimit(`${rule.bucket}:${ip}`, rule.limit, rule.windowMs);

    rateLimitHeaders = {
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    };

    if (!result.allowed) {
      const headers = new Headers(rateLimitHeaders);
      headers.set("Retry-After", String(result.retryAfterSeconds));
      if (isApiRoute && origin) applyCorsHeaders(headers, origin);

      return NextResponse.json(
        {
          error: "Too many requests. Please wait a moment and try again.",
          code: "RATE_LIMITED",
          retryAfterSeconds: result.retryAfterSeconds,
        },
        { status: 429, headers }
      );
    }
  }

  const res = NextResponse.next();
  if (isApiRoute && origin && !isWebhookRoute) {
    applyCorsHeaders(res.headers, origin);
  }
  if (rateLimitHeaders) {
    for (const [k, v] of Object.entries(rateLimitHeaders)) {
      res.headers.set(k, v);
    }
  }
  return res;
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Route Clerk's app-origin auto-proxy requests on *.vercel.app
    "/__clerk/:path*",
  ],
};
