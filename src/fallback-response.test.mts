import { describe, it, expect } from "vitest";
import {
  ensureFallbackHeaders,
  sendFallback,
  getFallbackBody,
  getFallbackStatus,
} from "./fallback-response.mts";
import type { ServerResponse } from "node:http";

describe("sendFallback", () => {
  it("sends 500 Internal Server Error", () => {
    const res = makeMockRes();
    sendFallback(res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toBe("Internal Server Error");
    expect(res.getHeader("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(res.getHeader("X-Content-Type-Options")).toBe("nosniff");
  });

  it("does not throw if socket is destroyed", () => {
    const res = {
      writeHead: () => {
        throw new Error("socket destroyed");
      },
      end: () => {},
    } as unknown as ServerResponse;
    expect(() => sendFallback(res)).not.toThrow();
  });
});

describe("ensureFallbackHeaders", () => {
  it("sets text and security headers when missing", () => {
    const res = makeMockRes();
    ensureFallbackHeaders(res);
    expect(res.getHeader("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(res.getHeader("X-XSS-Protection")).toBe("0");
    expect(res.getHeader("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(res.getHeader("X-Content-Type-Options")).toBe("nosniff");
  });

  it("does not overwrite existing headers", () => {
    const res = makeMockRes();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Frame-Options", "DENY");
    ensureFallbackHeaders(res);
    expect(res.getHeader("Content-Type")).toBe("application/json");
    expect(res.getHeader("X-Frame-Options")).toBe("DENY");
  });
});

describe("getFallbackStatus", () => {
  it("returns 500 for non-error", () => {
    expect(getFallbackStatus(null)).toBe(500);
    expect(getFallbackStatus(undefined)).toBe(500);
    expect(getFallbackStatus("string error")).toBe(500);
  });

  it("returns error.status when valid HTTP integer", () => {
    expect(getFallbackStatus({ status: 400 })).toBe(400);
    expect(getFallbackStatus({ status: 401 })).toBe(401);
    expect(getFallbackStatus({ status: 500 })).toBe(500);
  });

  it("returns 500 for invalid status values", () => {
    expect(getFallbackStatus({ status: NaN })).toBe(500);
    expect(getFallbackStatus({ status: 200 })).toBe(500);
    expect(getFallbackStatus({ status: 302 })).toBe(500);
    expect(getFallbackStatus({ status: 99 })).toBe(500);
    expect(getFallbackStatus({ status: 600 })).toBe(500);
    expect(getFallbackStatus({ status: 1.5 })).toBe(500);
    expect(getFallbackStatus({ status: "foo" })).toBe(500);
  });
});

describe("getFallbackBody", () => {
  it("hides 5xx error messages", () => {
    expect(getFallbackBody(new Error("secret"), 500)).toBe("Internal Server Error");
  });

  it("returns 4xx messages", () => {
    expect(getFallbackBody(new Error("Bad Request"), 400)).toBe("Bad Request");
  });

  it("escapes HTML characters in 4xx messages to prevent XSS", () => {
    const malicious = '<script>alert("xss")</script> & it\'s dangerous';
    const escaped = "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; it&#39;s dangerous";
    expect(getFallbackBody(new Error(malicious), 400)).toBe(escaped);
  });

  it("uses Not Found for empty 4xx messages", () => {
    expect(getFallbackBody(new Error(""), 404)).toBe("Not Found");
  });
});

function makeMockRes(): ServerResponse & { body: string } {
  const headers = new Map<string, string | number | string[]>();
  const mock = {
    statusCode: 200,
    body: "",
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name.toLowerCase(), value as string | number | string[]);
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    hasHeader(name: string) {
      return headers.has(name.toLowerCase());
    },
    writeHead(status: number) {
      this.statusCode = status;
    },
    end(data?: string) {
      if (data) this.body = data;
    },
  };
  return mock as unknown as ServerResponse & { body: string };
}
