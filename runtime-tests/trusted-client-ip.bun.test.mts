import { describe, expect, test } from "bun:test";
import { resolveTrustedClientIp } from "../src/trusted-client-ip.mts";

describe("resolveTrustedClientIp on Bun", () => {
  test("resolves IP from Bun.serve Request and requestIP()", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request, server) {
        const ip = resolveTrustedClientIp({
          request,
          remoteAddress: server.requestIP(request) ?? undefined,
        });
        return Response.json({ ip });
      },
    });

    try {
      const response = await fetch(server.url, {
        headers: {
          "x-forwarded-for": "[2001:db8::1]:12345, 10.0.0.1",
        },
      });
      expect(await response.json()).toEqual({ ip: "2001:db8::1" });
    } finally {
      server.stop(true);
    }
  });

  test("falls back to Bun remote address shape when trusted headers are blank", () => {
    const ip = resolveTrustedClientIp({
      request: new Request("http://localhost", {
        headers: { "cf-connecting-ip": "", "x-forwarded-for": " " },
      }),
      remoteAddress: { address: "198.51.100.30", port: 54321 },
    });

    expect(ip).toBe("198.51.100.30");
  });
});
