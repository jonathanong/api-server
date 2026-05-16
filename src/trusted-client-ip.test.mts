import { describe, expect, it } from "vitest";
import { resolveTrustedClientIp } from "./trusted-client-ip.mts";

describe("resolveTrustedClientIp", () => {
  it("uses cf-connecting-ip before x-forwarded-for", () => {
    expect(
      resolveTrustedClientIp({
        headers: {
          "cf-connecting-ip": "203.0.113.20",
          "x-forwarded-for": "203.0.113.10, 10.0.0.1",
        },
        socketRemoteAddress: "10.0.0.2",
      }),
    ).toBe("203.0.113.20");
  });

  it("uses the first x-forwarded-for address when cf-connecting-ip is absent", () => {
    expect(
      resolveTrustedClientIp({
        headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
        socketRemoteAddress: "10.0.0.2",
      }),
    ).toBe("203.0.113.10");
  });

  it("accepts cf-connecting-ip when x-forwarded-for is absent", () => {
    expect(
      resolveTrustedClientIp({
        headers: { "cf-connecting-ip": "203.0.113.20" },
        socketRemoteAddress: "10.0.0.2",
      }),
    ).toBe("203.0.113.20");
  });

  it("falls back to the socket address when trusted headers are absent", () => {
    expect(
      resolveTrustedClientIp({
        headers: {},
        socketRemoteAddress: "10.0.0.2",
      }),
    ).toBe("10.0.0.2");
  });

  it("uses first value when cf-connecting-ip is an array", () => {
    expect(
      resolveTrustedClientIp({
        headers: { "cf-connecting-ip": ["203.0.113.20", "203.0.113.21"] },
      }),
    ).toBe("203.0.113.20");
  });
});
