const CONTROL_CHARS_PLAIN_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const CONTROL_CHARS_RICH_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const BIDI_OVERRIDE_RE = /[\u202A-\u202E\u2066-\u2069]/g;
const HTML_TAG_RE = /<[^>]*>/g;
const SCRIPT_BLOCK_RE = /<script\b[^>]*>[\s\S]*?<\/script>/gi;

const ALLOWED_STORAGE_HOST_SUFFIXES = [
  ".blob.vercel-storage.com",
  ".r2.dev",
  ".backblazeb2.com",
];

const ALLOWED_STORAGE_EXACT_HOSTS = new Set([
  "res.cloudinary.com",
  "covers.openlibrary.org",
]);

/**
 * Sanitizes short plain-text user input (titles, author names, topics, identifiers).
 * Strips null bytes, control chars, Unicode bidi overrides, and HTML tags.
 */
export function sanitizePlainText(input: unknown, maxLength = 500): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(CONTROL_CHARS_PLAIN_RE, "")
    .replace(BIDI_OVERRIDE_RE, "")
    .replace(HTML_TAG_RE, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitizes longer study text / prompts while preserving newlines and scientific symbols (<, >).
 * Strips null bytes, control chars, Unicode bidi overrides, and <script> blocks.
 */
export function sanitizeRichText(input: unknown, maxLength = 20000): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(CONTROL_CHARS_RICH_RE, "")
    .replace(BIDI_OVERRIDE_RE, "")
    .replace(SCRIPT_BLOCK_RE, "")
    .trim()
    .slice(0, maxLength);
}

/**
 * Recursively strips MongoDB query operators ($-prefixed keys), dotted keys, and prototype-pollution keys.
 */
export function stripMongoOperators<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripMongoOperators(item, depth + 1)) as unknown as T;
  }
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (
      key.startsWith("$") ||
      key.includes(".") ||
      key === "__proto__" ||
      key === "constructor" ||
      key === "prototype"
    ) {
      continue;
    }
    clean[key] = stripMongoOperators(val, depth + 1);
  }
  return clean as T;
}

/**
 * Strictly validates storage proxy target URLs using URL parsing + HTTPS + hostname allowlist
 * to prevent open redirects and SSRF.
 */
export function isAllowedStorageUrl(rawUrl: string): {
  allowed: boolean;
  isVercelBlob: boolean;
  parsed?: URL;
} {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { allowed: false, isVercelBlob: false };
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { allowed: false, isVercelBlob: false };
  }

  if (parsed.protocol !== "https:") {
    return { allowed: false, isVercelBlob: false };
  }

  const host = parsed.hostname.toLowerCase();
  const isVercelBlob = host.endsWith(".blob.vercel-storage.com");
  const matchesSuffix = ALLOWED_STORAGE_HOST_SUFFIXES.some(
    (suffix) => host.endsWith(suffix) && host.length > suffix.length
  );
  const matchesExact = ALLOWED_STORAGE_EXACT_HOSTS.has(host);

  if (!matchesSuffix && !matchesExact) {
    return { allowed: false, isVercelBlob: false };
  }

  return { allowed: true, isVercelBlob, parsed };
}

/**
 * Validates file signatures (magic bytes) so MIME spoofing cannot bypass upload checks.
 */
export function validateUploadMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (!buffer || buffer.length < 4) return false;

  switch (mimeType) {
    case "application/pdf":
      return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    case "image/jpeg":
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );
    case "image/webp":
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
      );
    default:
      return false;
  }
}
