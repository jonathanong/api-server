import { describe, it, expect } from "vitest";
import { applyCacheControl } from "./cache-control.mts";
import type { ServerResponse } from "node:http";

function makeRes() {
  const headers: Record<string, string> = {};
  const res = {
    headers,
    setHeader(name: string, value: unknown) {
      headers[name.toLowerCase()] = String(value);
    },
  };
  return res as unknown as ServerResponse & { headers: Record<string, string> };
}

describe("applyCacheControl", () => {
  it("public with numeric ttl sets max-age", () => {
    const res = makeRes();
    applyCacheControl(res, "public", 60);
    expect(res.headers["cache-control"]).toBe("public, max-age=60");
  });

  it('public with "1 hour" string sets max-age=3600', () => {
    const res = makeRes();
    applyCacheControl(res, "public", "1 hour");
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
  });

  it('public with "1 year" string sets max-age=31536000', () => {
    const res = makeRes();
    applyCacheControl(res, "public", "1 year");
    expect(res.headers["cache-control"]).toBe("public, max-age=31536000");
  });

  it('public with "1 minute" string sets max-age=60', () => {
    const res = makeRes();
    applyCacheControl(res, "public", "1 minute");
    expect(res.headers["cache-control"]).toBe("public, max-age=60");
  });

  it("private sets no-cache no-store must-revalidate", () => {
    const res = makeRes();
    applyCacheControl(res, "private");
    expect(res.headers["cache-control"]).toBe("private, no-cache, no-store, must-revalidate");
  });

  it("public without ttl throws an error", () => {
    const res = makeRes();
    expect(() => applyCacheControl(res, "public")).toThrow(
      "TTL is required for public cache control",
    );
  });

  it("public with malformed string (no space) throws an error", () => {
    const res = makeRes();
    expect(() => applyCacheControl(res, "public", "1hour")).toThrow("Invalid TTL format");
  });

  it("public with unknown unit throws an error", () => {
    const res = makeRes();
    expect(() => applyCacheControl(res, "public", "1 fortnight")).toThrow("Unknown TTL unit");
  });
});
