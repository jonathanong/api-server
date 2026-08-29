import { describe, expect, it } from "vitest";
import {
  computeExponentialBackoffMs,
  getHeaderValue,
  isRetryableNetworkError,
  parseRetryAfter,
} from "./http-retry.mts";

describe("getHeaderValue", () => {
  it("finds record headers without regard to casing", () => {
    expect(getHeaderValue({ "Retry-After": "3" }, "retry-after")).toBe("3");
  });

  it("preserves array values and accepts Fetch Headers", () => {
    const values = ["3", "4"];
    expect(getHeaderValue({ "retry-after": values }, "Retry-After")).toBe(values);
    expect(getHeaderValue(new Headers({ "Retry-After": "5" }), "retry-after")).toBe("5");
  });

  it("converts supported numeric record values", () => {
    expect(getHeaderValue({ "retry-after": 6 }, "retry-after")).toBe("6");
  });

  it("rejects records with ambiguous case-insensitive duplicate names", () => {
    expect(
      getHeaderValue({ "Retry-After": "3", "retry-after": "4" }, "retry-after"),
    ).toBeUndefined();
    expect(
      getHeaderValue({ "Retry-After": "3", "retry-after": "4" }, "Retry-After"),
    ).toBeUndefined();
  });

  it("returns undefined for missing or absent headers", () => {
    expect(getHeaderValue(undefined, "retry-after")).toBeUndefined();
    expect(getHeaderValue({}, "retry-after")).toBeUndefined();
    expect(getHeaderValue({ unrelated: "value" }, "retry-after")).toBeUndefined();
    expect(getHeaderValue({ "retry-after": ["1", 2] }, "retry-after")).toBeUndefined();
  });
});

describe("parseRetryAfter", () => {
  const now = Date.UTC(2026, 0, 1, 0, 0, 0);

  it("parses only nonnegative decimal-second values", () => {
    expect(parseRetryAfter("12", now)).toBe(12_000);
    expect(parseRetryAfter("0", now)).toBe(0);
    expect(parseRetryAfter(" 12", now)).toBeNull();
    expect(parseRetryAfter("12.5", now)).toBeNull();
    expect(parseRetryAfter("+12", now)).toBeNull();
    expect(parseRetryAfter("-1", now)).toBeNull();
  });

  it("uses its injected clock for a valid HTTP date and preserves past dates as zero", () => {
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:05 GMT", now)).toBe(5_000);
    expect(parseRetryAfter("Wed, 31 Dec 2025 23:59:59 GMT", now)).toBe(0);
  });

  it("rejects missing, ambiguous, and non-HTTP date values", () => {
    expect(parseRetryAfter(undefined, now)).toBeNull();
    expect(parseRetryAfter(["1", "2"], now)).toBeNull();
    expect(parseRetryAfter("January 1, 2026", now)).toBeNull();
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:05 PST", now)).toBeNull();
    expect(parseRetryAfter("Xyz, 01 Jan 2026 00:00:05 GMT", now)).toBeNull();
    expect(parseRetryAfter("Thu, 01 Xxx 2026 00:00:05 GMT", now)).toBeNull();
    expect(parseRetryAfter("Thu, 32 Jan 2026 00:00:05 GMT", now)).toBeNull();
    expect(parseRetryAfter("Wed, 01 Jan 2026 00:00:05 GMT", now)).toBeNull();
  });
});

describe("isRetryableNetworkError", () => {
  it.each([
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
  ])("matches approved code %s directly and through nested causes", (code) => {
    expect(isRetryableNetworkError(Object.assign(new Error("request failed"), { code }))).toBe(
      true,
    );
    const error = new Error("request failed", {
      cause: Object.assign(new Error("socket failed"), { code }),
    });
    expect(isRetryableNetworkError(error)).toBe(true);
  });

  it("does not classify messages, ordinary aborts, or unknown codes", () => {
    expect(isRetryableNetworkError(new Error("network timeout ECONNRESET"))).toBe(false);
    expect(isRetryableNetworkError(new DOMException("cancelled", "AbortError"))).toBe(false);
    expect(isRetryableNetworkError(Object.assign(new Error("failed"), { code: "EACCES" }))).toBe(
      false,
    );
  });

  it("keeps abort errors terminal even with retryable codes in their cause chain", () => {
    const abort = {
      name: "AbortError",
      code: "ECONNRESET",
      cause: Object.assign(new Error("socket failed"), { code: "UND_ERR_SOCKET" }),
    };
    expect(isRetryableNetworkError(abort)).toBe(false);
  });

  it("terminates safely for cyclic causes", () => {
    const error = Object.assign(new Error("cycle"), { code: "EACCES" });
    Object.assign(error, { cause: error });
    expect(isRetryableNetworkError(error)).toBe(false);
  });

  it("does not throw when error details have throwing accessors", () => {
    const error = Object.defineProperty({}, "code", {
      get: () => {
        throw new Error("unavailable");
      },
    });
    expect(isRetryableNetworkError(error)).toBe(false);
  });
});

describe("computeExponentialBackoffMs", () => {
  it("caps exponential growth and applies deterministic full jitter", () => {
    expect(
      computeExponentialBackoffMs({ attempt: 0, baseDelayMs: 100, maxDelayMs: 1_000, random: 0.5 }),
    ).toBe(50);
    expect(
      computeExponentialBackoffMs({ attempt: 4, baseDelayMs: 100, maxDelayMs: 1_000, random: 1 }),
    ).toBe(1_000);
  });

  it("caps before applying jitter and floors fractional milliseconds", () => {
    expect(
      computeExponentialBackoffMs({ attempt: 1, baseDelayMs: 10, maxDelayMs: 15, random: 0.8 }),
    ).toBe(12);
    expect(
      computeExponentialBackoffMs({ attempt: 0, baseDelayMs: 5, maxDelayMs: 100, random: 0.51 }),
    ).toBe(2);
    expect(
      computeExponentialBackoffMs({ attempt: 0, baseDelayMs: 20, maxDelayMs: 15, random: 1 }),
    ).toBe(15);
  });

  it("saturates huge safe-integer attempts without overflowing", () => {
    expect(
      computeExponentialBackoffMs({
        attempt: Number.MAX_SAFE_INTEGER,
        baseDelayMs: 1,
        maxDelayMs: 1_000,
        random: 1,
      }),
    ).toBe(1_000);
    expect(
      computeExponentialBackoffMs({
        attempt: Number.MAX_SAFE_INTEGER,
        baseDelayMs: 0,
        maxDelayMs: Number.MAX_VALUE,
        random: 1,
      }),
    ).toBe(0);
  });

  it("rejects invalid numeric inputs", () => {
    for (const options of [
      { attempt: -1, baseDelayMs: 100, maxDelayMs: 1_000, random: 0 },
      { attempt: 1.5, baseDelayMs: 100, maxDelayMs: 1_000, random: 0 },
      { attempt: 1, baseDelayMs: -1, maxDelayMs: 1_000, random: 0 },
      { attempt: 1, baseDelayMs: 100, maxDelayMs: -1, random: 0 },
      { attempt: 1, baseDelayMs: 100, maxDelayMs: 1_000, random: 1.01 },
    ]) {
      expect(() => computeExponentialBackoffMs(options)).toThrow(RangeError);
    }
  });
});
