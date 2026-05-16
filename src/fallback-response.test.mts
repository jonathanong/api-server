import { describe, it, expect } from "vitest";
import { sendFallback, getFallbackStatus } from "./fallback-response.mts";
import type { ServerResponse } from "node:http";

describe("sendFallback", () => {
  it("sends 404 Not Found", () => {
    const res = makeMockRes();
    sendFallback(res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toBe("Not Found");
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

describe("getFallbackStatus", () => {
  it("returns 404 for non-error", () => {
    expect(getFallbackStatus(null)).toBe(404);
    expect(getFallbackStatus(undefined)).toBe(404);
    expect(getFallbackStatus("string error")).toBe(404);
  });

  it("returns error.status when valid HTTP integer", () => {
    expect(getFallbackStatus({ status: 400 })).toBe(400);
    expect(getFallbackStatus({ status: 401 })).toBe(401);
    expect(getFallbackStatus({ status: 500 })).toBe(500);
  });

  it("returns 404 for invalid status values", () => {
    expect(getFallbackStatus({ status: NaN })).toBe(404);
    expect(getFallbackStatus({ status: 99 })).toBe(404);
    expect(getFallbackStatus({ status: 600 })).toBe(404);
    expect(getFallbackStatus({ status: 1.5 })).toBe(404);
    expect(getFallbackStatus({ status: "foo" })).toBe(404);
  });
});

function makeMockRes(): ServerResponse & { body: string } {
  const mock = {
    statusCode: 200,
    body: "",
    writeHead(status: number) {
      this.statusCode = status;
    },
    end(data?: string) {
      if (data) this.body = data;
    },
  };
  return mock as unknown as ServerResponse & { body: string };
}
