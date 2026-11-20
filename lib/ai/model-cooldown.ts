/**
 * Shared Gemini model selection & per-model cooldown registry.
 * Primary: gemini-4-hydrogen (lower cost, higher reasoning & speed).
 * Fallbacks: gemini-3.8-flash, gemini-3.5-flash-lite.
 * Prevents cascading 30s-300s hangs when a model hits 429/503/timeout.
 */

export const PRIMARY_GEMINI_MODEL = "gemini-4-hydrogen";
export const FALLBACK_GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
] as const;

export const GEMINI_MODEL_CHAIN = [
  PRIMARY_GEMINI_MODEL,
  ...FALLBACK_GEMINI_MODELS,
] as const;

const TRANSIENT_COOLDOWN_MS = 180_000; // 3 min
const DAILY_QUOTA_COOLDOWN_MS = 1_800_000; // 30 min

const globalForCooldown = globalThis as typeof globalThis & {
  __ascleonModelCooldowns?: Map<string, number>;
};

const modelCooldownUntil =
  globalForCooldown.__ascleonModelCooldowns ??
  (globalForCooldown.__ascleonModelCooldowns = new Map<string, number>());

export function isModelCoolingDown(key: string): boolean {
  const until = modelCooldownUntil.get(key);
  return typeof until === "number" && until > Date.now();
}

export function markModelCooldown(key: string, durationMs = TRANSIENT_COOLDOWN_MS): void {
  modelCooldownUntil.set(key, Date.now() + durationMs);
}

export function clearModelCooldown(key: string): void {
  modelCooldownUntil.delete(key);
}

export function markModelCooldownFromError(key: string, err: unknown): void {
  const msg = (err instanceof Error ? err.message : String(err || "")).toLowerCase();
  if (
    msg.includes("perday") ||
    msg.includes("per_day") ||
    msg.includes("limit: 20") ||
    msg.includes("limit: 0") ||
    msg.includes("quota exceeded")
  ) {
    markModelCooldown(key, DAILY_QUOTA_COOLDOWN_MS);
  } else if (
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("500") ||
    msg.includes("504") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("aborted") ||
    msg.includes("unavailable")
  ) {
    markModelCooldown(key, TRANSIENT_COOLDOWN_MS);
  }
}

/**
 * Returns models ordered so healthy (non-cooled) models come first,
 * followed by cooled models as last-resort fallbacks.
 */
export function orderModelsByHealth(models: readonly string[], prefix = "gemini"): string[] {
  const healthy = models.filter((m) => !isModelCoolingDown(`${prefix}:${m}`));
  const cooled = models.filter((m) => isModelCoolingDown(`${prefix}:${m}`));
  return [...healthy, ...cooled];
}
