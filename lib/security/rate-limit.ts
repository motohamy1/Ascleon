export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
  retryAfterSeconds: number;
}

interface RateLimitEntry {
  timestamps: number[];
  resetAt: number;
}

const MAX_STORE_ENTRIES = 5000;

const globalForRateLimit = globalThis as typeof globalThis & {
  __ascleonRateLimitStore?: Map<string, RateLimitEntry>;
};

const store =
  globalForRateLimit.__ascleonRateLimitStore ??
  (globalForRateLimit.__ascleonRateLimitStore = new Map<string, RateLimitEntry>());

function pruneExpired(now: number) {
  for (const [k, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(k);
    }
  }
  if (store.size > MAX_STORE_ENTRIES) {
    const excess = store.size - MAX_STORE_ENTRIES;
    let removed = 0;
    for (const k of store.keys()) {
      store.delete(k);
      removed++;
      if (removed >= excess) break;
    }
  }
}

/**
 * Sliding-window rate limiter safe for Edge/Node runtimes with bounded memory.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  if (store.size > MAX_STORE_ENTRIES) {
    pruneExpired(now);
  }

  const existing = store.get(key);
  const recent = existing
    ? existing.timestamps.filter((ts) => ts > windowStart)
    : [];

  if (recent.length >= limit) {
    const oldest = recent[0] ?? now;
    const resetAt = oldest + windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
    store.set(key, { timestamps: recent, resetAt });
    return {
      allowed: false,
      remaining: 0,
      limit,
      resetAt,
      retryAfterSeconds,
    };
  }

  recent.push(now);
  const resetAt = now + windowMs;
  store.set(key, { timestamps: recent, resetAt });

  return {
    allowed: true,
    remaining: Math.max(0, limit - recent.length),
    limit,
    resetAt,
    retryAfterSeconds: 0,
  };
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}
