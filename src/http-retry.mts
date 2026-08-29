export type HeaderValue = string | string[];
export type HeaderGetter = { get(name: string): string | null };
export type HeaderSource = HeaderGetter | Record<string, unknown> | null | undefined;

export interface ExponentialBackoffOptions {
  attempt: number;
  baseDelayMs: number;
  maxDelayMs: number;
  random: number;
}

const RETRYABLE_NETWORK_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);
const DECIMAL_SECONDS = /^(?:0|[1-9]\d*)$/;
const HTTP_DATE =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

function isHeaderGetter(headers: HeaderSource): headers is HeaderGetter {
  return typeof (headers as HeaderGetter | undefined)?.get === "function";
}

function normalizeHeaderValue(value: unknown): HeaderValue | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
  return undefined;
}

/** Reads Fetch or Node-style headers without assuming a particular casing. */
export function getHeaderValue(headers: HeaderSource, name: string): HeaderValue | undefined {
  if (!headers) return undefined;
  if (isHeaderGetter(headers)) return headers.get(name) ?? undefined;

  const matchingEntries = Object.entries(headers).filter(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  if (matchingEntries.length !== 1) return undefined;
  return normalizeHeaderValue(matchingEntries[0][1]);
}

/** Parses a single Retry-After field into milliseconds using the supplied or current clock. */
export function parseRetryAfter(
  value: HeaderValue | null | undefined,
  now = Date.now(),
): number | null {
  if (typeof value !== "string" || !Number.isFinite(now)) return null;
  if (DECIMAL_SECONDS.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) && Number.isSafeInteger(seconds * 1_000)
      ? seconds * 1_000
      : null;
  }
  if (!HTTP_DATE.test(value)) return null;
  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt) || new Date(retryAt).toUTCString() !== value) return null;
  return Math.max(0, retryAt - now);
}

function isObject(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function errorDetails(
  value: object,
): { code?: unknown; cause?: unknown; name?: unknown } | undefined {
  try {
    const error = value as { code?: unknown; cause?: unknown; name?: unknown };
    return { code: error.code, cause: error.cause, name: error.name };
  } catch {
    return undefined;
  }
}

/** Classifies only known network error codes, following a finite error cause chain. */
export function isRetryableNetworkError(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;
  while (isObject(current) && !seen.has(current)) {
    seen.add(current);
    const details = errorDetails(current);
    if (!details || details.name === "AbortError") return false;
    if (typeof details.code === "string" && RETRYABLE_NETWORK_CODES.has(details.code)) return true;
    current = details.cause;
  }
  return false;
}

function assertBackoffOptions(options: ExponentialBackoffOptions): void {
  const { attempt, baseDelayMs, maxDelayMs, random } = options;
  if (
    !Number.isSafeInteger(attempt) ||
    attempt < 0 ||
    !Number.isFinite(baseDelayMs) ||
    baseDelayMs < 0 ||
    !Number.isFinite(maxDelayMs) ||
    maxDelayMs < 0 ||
    !Number.isFinite(random) ||
    random < 0 ||
    random > 1
  ) {
    throw new RangeError("Invalid exponential backoff options");
  }
}

/** Returns capped exponential delay with deterministic full jitter; it never sleeps. */
export function computeExponentialBackoffMs(options: ExponentialBackoffOptions): number {
  assertBackoffOptions(options);
  const { attempt, baseDelayMs, maxDelayMs, random } = options;
  if (baseDelayMs === 0 || maxDelayMs === 0 || random === 0) return 0;

  let capped = Math.min(baseDelayMs, maxDelayMs);
  let remainingAttempts = attempt;
  while (remainingAttempts > 0 && capped < maxDelayMs) {
    if (capped >= maxDelayMs / 2) {
      capped = maxDelayMs;
      break;
    }
    capped *= 2;
    remainingAttempts -= 1;
  }
  return Math.floor(capped * random);
}
