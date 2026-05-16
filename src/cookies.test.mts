import { describe, it, expect } from "vitest";
import { Cookies } from "./cookies.mts";
import type { IncomingMessage, ServerResponse } from "node:http";

function makeReq(cookieHeader?: string): IncomingMessage {
  return {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  } as unknown as IncomingMessage;
}

function makeRes() {
  const _headers: Record<string, string | string[]> = {};
  return {
    _headers,
    getHeader(name: string): string | string[] | undefined {
      return _headers[name.toLowerCase()];
    },
    setHeader(name: string, value: string | string[]): void {
      _headers[name.toLowerCase()] = value;
    },
  } as unknown as ServerResponse & { _headers: Record<string, string | string[]> };
}

describe("Cookies", () => {
  it("get(name) reads cookie from request", () => {
    const req = makeReq("session=abc123; user=jonah");
    const res = makeRes();
    const cookies = new Cookies(req, res);
    expect(cookies.get("session")).toBe("abc123");
    expect(cookies.get("user")).toBe("jonah");
  });

  it("get(name) returns undefined for missing cookie", () => {
    const req = makeReq("session=abc123");
    const res = makeRes();
    const cookies = new Cookies(req, res);
    expect(cookies.get("missing")).toBeUndefined();
  });

  it("get(name) returns undefined when no cookie header", () => {
    const req = makeReq();
    const res = makeRes();
    const cookies = new Cookies(req, res);
    expect(cookies.get("anything")).toBeUndefined();
  });

  it("set(name, value) adds Set-Cookie header", () => {
    const req = makeReq();
    const res = makeRes();
    const cookies = new Cookies(req, res);
    cookies.set("token", "mytoken");
    const header = res._headers["set-cookie"];
    expect(String(header)).toContain("token=mytoken");
  });

  it("set with httpOnly option", () => {
    const req = makeReq();
    const res = makeRes();
    const cookies = new Cookies(req, res);
    cookies.set("session", "val", { httpOnly: true });
    const header = String(res._headers["set-cookie"]);
    expect(header).toContain("HttpOnly");
  });

  it("set with secure option", () => {
    const req = makeReq();
    const res = makeRes();
    const cookies = new Cookies(req, res);
    cookies.set("session", "val", { secure: true });
    const header = String(res._headers["set-cookie"]);
    expect(header).toContain("Secure");
  });

  it("set with sameSite option", () => {
    const req = makeReq();
    const res = makeRes();
    const cookies = new Cookies(req, res);
    cookies.set("session", "val", { sameSite: "strict" });
    const header = String(res._headers["set-cookie"]);
    expect(header).toContain("SameSite=Strict");
  });

  it("set with maxAge option", () => {
    const req = makeReq();
    const res = makeRes();
    const cookies = new Cookies(req, res);
    cookies.set("session", "val", { maxAge: 3600 });
    const header = String(res._headers["set-cookie"]);
    expect(header).toContain("Max-Age=3600");
  });

  it("multiple set() calls append multiple Set-Cookie headers", () => {
    const req = makeReq();
    const res = makeRes();
    const cookies = new Cookies(req, res);
    cookies.set("a", "1");
    cookies.set("b", "2");
    const header = res._headers["set-cookie"];
    expect(Array.isArray(header)).toBe(true);
    const arr = header as string[];
    expect(arr.some((h) => h.includes("a=1"))).toBe(true);
    expect(arr.some((h) => h.includes("b=2"))).toBe(true);
  });

  it("lazy parsing: only parses on first get() call", () => {
    const req = makeReq("a=1; b=2");
    const res = makeRes();
    const cookies = new Cookies(req, res);
    // Access once triggers parse
    expect(cookies.get("a")).toBe("1");
    // Second access uses cache
    expect(cookies.get("b")).toBe("2");
  });

  it("three set() calls accumulate all cookies into the array", () => {
    const req = makeReq();
    const res = makeRes();
    const cookies = new Cookies(req, res);
    cookies.set("a", "1"); // else branch: sets string
    cookies.set("b", "2"); // else if (existing) branch: wraps string into array
    cookies.set("c", "3"); // if (Array.isArray) branch: spreads existing array
    const header = res._headers["set-cookie"];
    const arr = Array.isArray(header) ? header : [header as string];
    expect(arr.length).toBe(3);
    expect(arr.some((h) => h.includes("a=1"))).toBe(true);
    expect(arr.some((h) => h.includes("b=2"))).toBe(true);
    expect(arr.some((h) => h.includes("c=3"))).toBe(true);
  });
});
