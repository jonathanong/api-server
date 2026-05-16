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

  it("reads Fetch Headers from a request-like object", () => {
    expect(
      resolveTrustedClientIp({
        request: {
          headers: new Headers({
            "cf-connecting-ip": "203.0.113.30",
            "x-forwarded-for": "203.0.113.10",
          }),
        },
      }),
    ).toBe("203.0.113.30");
  });

  it("falls through blank trusted headers to runtime remote address", () => {
    expect(
      resolveTrustedClientIp({
        headers: {
          "cf-connecting-ip": " ",
          "x-forwarded-for": "",
        },
        remoteAddress: { hostname: "198.51.100.50", port: 54321 },
      }),
    ).toBe("198.51.100.50");
  });

  it("accepts Bun-style remote address objects", () => {
    expect(
      resolveTrustedClientIp({
        headers: {},
        remoteAddress: { address: "198.51.100.51", port: 54321 },
      }),
    ).toBe("198.51.100.51");
  });

  it("strips AWS ALB client ports from IPv4 header values", () => {
    expect(
      resolveTrustedClientIp({
        headers: { "x-forwarded-for": "203.0.113.10:12345, 10.0.0.1:443" },
      }),
    ).toBe("203.0.113.10");
  });

  it("strips AWS ALB client ports from bracketed IPv6 header values", () => {
    expect(
      resolveTrustedClientIp({
        headers: { "x-forwarded-for": "[2001:db8::1]:12345, 10.0.0.1" },
      }),
    ).toBe("2001:db8::1");
  });

  it("preserves bare IPv6 header values", () => {
    expect(
      resolveTrustedClientIp({
        headers: { "x-forwarded-for": "2001:db8::1" },
      }),
    ).toBe("2001:db8::1");
  });
});
