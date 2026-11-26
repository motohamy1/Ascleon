import { describe, expect, it } from "vitest";
import {
  isAllowedStorageUrl,
  sanitizePlainText,
  sanitizeRichText,
  stripMongoOperators,
  validateUploadMagicBytes,
} from "@/lib/security/sanitize";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { isOriginAllowed } from "@/lib/security/cors";
import {
  buildSafeErrorResponse,
  classifyAiError,
} from "@/lib/security/error-handler";
import { parseServiceErrorPayload } from "@/lib/api-error-client";

describe("Security utilities", () => {
  it("sanitizes plain text by stripping HTML, bidi overrides, and control chars", () => {
    const dirty = "  <b>Hello</b>\u0000\u202E World <script>alert(1)</script>  ";
    expect(sanitizePlainText(dirty, 100)).toBe("Hello World alert(1)");
    expect(sanitizePlainText("abcdef", 4)).toBe("abcd");
  });

  it("sanitizes rich text while preserving medical inequalities and newlines", () => {
    const raw = "BP < 120 mmHg\nHR > 60\u0000<script>bad()</script>";
    expect(sanitizeRichText(raw, 500)).toBe("BP < 120 mmHg\nHR > 60");
  });

  it("strips MongoDB query operators and prototype pollution keys", () => {
    const payload = JSON.parse(
      '{"$gt": 1, "nested": {"$ne": "x", "ok": "yes"}, "__proto__": {"admin": true}, "a.b": 2}'
    );
    const cleaned = stripMongoOperators(payload);
    expect(cleaned).toEqual({ nested: { ok: "yes" } });
  });

  it("strictly validates storage proxy URLs against HTTPS allowlist", () => {
    expect(
      isAllowedStorageUrl("https://abc123.public.blob.vercel-storage.com/book.pdf").allowed
    ).toBe(true);
    expect(
      isAllowedStorageUrl("https://pub-123.r2.dev/books/file.pdf").allowed
    ).toBe(true);
    expect(
      isAllowedStorageUrl("https://evil.com/.blob.vercel-storage.com/steal").allowed
    ).toBe(false);
    expect(isAllowedStorageUrl("https://evil.com/redirect").allowed).toBe(false);
    expect(isAllowedStorageUrl("http://abc123.r2.dev/file.pdf").allowed).toBe(false);
    expect(isAllowedStorageUrl("javascript:alert(1)").allowed).toBe(false);
  });

  it("validates upload magic bytes for PDF, JPEG, PNG, and WebP", () => {
    expect(
      validateUploadMagicBytes(Buffer.from("%PDF-1.7\n..."), "application/pdf")
    ).toBe(true);
    expect(
      validateUploadMagicBytes(Buffer.from("<html>not pdf</html>"), "application/pdf")
    ).toBe(false);
    expect(
      validateUploadMagicBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")
    ).toBe(true);
    expect(
      validateUploadMagicBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47]), "image/png")
    ).toBe(true);
    expect(
      validateUploadMagicBytes(Buffer.from("RIFF1234WEBP"), "image/webp")
    ).toBe(true);
  });

  it("enforces sliding-window rate limits", () => {
    const key = `test-rl-${Date.now()}`;
    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(true);
    const blocked = checkRateLimit(key, 2, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("validates CORS origins against allowlist", () => {
    expect(isOriginAllowed("https://www.ascleon.app")).toBe(true);
    expect(isOriginAllowed("https://ascleon.app")).toBe(true);
    expect(isOriginAllowed("https://attacker.example")).toBe(false);
    expect(isOriginAllowed(null)).toBe(true);
  });

  it("classifies AI overload/quota errors and never leaks raw error text", async () => {
    const overloadClass = classifyAiError(
      new Error("Gemini 503 UNAVAILABLE: model overloaded")
    );
    expect(overloadClass.isModelOverloaded).toBe(true);

    const quotaClass = classifyAiError(new Error("429 RESOURCE_EXHAUSTED quota"));
    expect(quotaClass.isModelOverloaded).toBe(true);

    const resp = buildSafeErrorResponse(
      "test:ai",
      new Error("SECRET_INTERNAL_STACK_WITH_DB_URI_mongodb://user:pass@host"),
      { creditsRefunded: true }
    );
    expect(resp.status).toBe(500);
    const body = await resp.json();
    expect(body.error).not.toContain("mongodb://");
    expect(body.error).not.toContain("SECRET_INTERNAL_STACK");
    expect(body.errorId).toMatch(/^err_[a-f0-9]+$/);

    const overloadResp = buildSafeErrorResponse(
      "test:overload",
      new Error("503 Model is overloaded"),
      { creditsRefunded: true }
    );
    expect(overloadResp.status).toBe(503);
    const overloadBody = await overloadResp.json();
    expect(overloadBody.isModelOverloaded).toBe(true);
    expect(overloadBody.creditsRefunded).toBe(true);
    expect(overloadBody.error).not.toContain("503");

    const parsedUi = parseServiceErrorPayload(503, overloadBody);
    expect(parsedUi.kind).toBe("overloaded");
    expect(parsedUi.creditsRefunded).toBe(true);

    const parsedCredits = parseServiceErrorPayload(402, {
      isBillingError: true,
      error: "Monthly AI credit limit reached.",
    });
    expect(parsedCredits.kind).toBe("credits");
    expect(parsedCredits.upgradeHref).toBe("/subscriptions?reason=limit");
  });
});
