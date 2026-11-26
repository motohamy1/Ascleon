/**
 * Verifies a Cloudflare Turnstile CAPTCHA token when TURNSTILE_SECRET_KEY is configured.
 * Clerk's built-in Turnstile bot protection guards sign-up/sign-in flows automatically.
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  ip?: string
): Promise<{ ok: boolean; skipped?: boolean }> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    return { ok: true, skipped: true };
  }

  if (!token || typeof token !== "string" || !token.trim()) {
    return { ok: false };
  }

  try {
    const body = new URLSearchParams({
      secret,
      response: token.trim(),
    });
    if (ip && ip !== "unknown") {
      body.set("remoteip", ip);
    }

    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { success?: boolean };
    return { ok: Boolean(data?.success) };
  } catch {
    return { ok: false };
  }
}
