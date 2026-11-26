const PRODUCTION_ORIGINS = [
  "https://www.ascleon.app",
  "https://ascleon.app",
];

const DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function normalizeOrigin(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    return new URL(raw.trim()).origin;
  } catch {
    return null;
  }
}

export function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>(PRODUCTION_ORIGINS);

  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (configured) origins.add(configured);

  if (process.env.VERCEL_URL) {
    const vercelOrigin = normalizeOrigin(`https://${process.env.VERCEL_URL}`);
    if (vercelOrigin) origins.add(vercelOrigin);
  }

  if (process.env.NODE_ENV !== "production") {
    for (const devOrigin of DEV_ORIGINS) {
      origins.add(devOrigin);
    }
  }

  return origins;
}

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  return getAllowedOrigins().has(normalized);
}

export function applyCorsHeaders(headers: Headers, origin: string | null): void {
  if (origin && isOriginAllowed(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With"
    );
    headers.set("Vary", "Origin");
  }
}
