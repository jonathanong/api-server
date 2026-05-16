import { describe, it, expect } from "vitest";
import { generateETag, isFresh } from "./etag.mts";
import type { IncomingMessage } from "node:http";

function makeReq(headers: Record<string, string>, method = "GET"): IncomingMessage {
  return { headers, method } as unknown as IncomingMessage;
}

describe("generateETag", () => {
  it("returns a quoted SHA256 hash", () => {
    const etag = generateETag(Buffer.from("hello"));
    expect(etag).toMatch(/^"[A-Za-z0-9_-]+"$/);
  });

  it("same input produces same ETag", () => {
    const input = Buffer.from("hello world");
    expect(generateETag(input)).toBe(generateETag(input));
  });

  it("different input produces different ETag", () => {
    expect(generateETag(Buffer.from("hello"))).not.toBe(generateETag(Buffer.from("world")));
  });
});

describe("isFresh", () => {
  it("returns true when If-None-Match matches", () => {
    const etag = generateETag(Buffer.from("body"));
    const req = makeReq({ "if-none-match": etag });
    expect(isFresh(req, etag)).toBe(true);
  });

  it("returns false when no If-None-Match", () => {
    const etag = generateETag(Buffer.from("body"));
    const req = makeReq({});
    expect(isFresh(req, etag)).toBe(false);
  });

  it("returns false on POST", () => {
    const etag = generateETag(Buffer.from("body"));
    const req = makeReq({ "if-none-match": etag }, "POST");
    expect(isFresh(req, etag)).toBe(false);
  });

  it("returns false on PATCH", () => {
    const etag = generateETag(Buffer.from("body"));
    const req = makeReq({ "if-none-match": etag }, "PATCH");
    expect(isFresh(req, etag)).toBe(false);
  });

  it("returns false on DELETE", () => {
    const etag = generateETag(Buffer.from("body"));
    const req = makeReq({ "if-none-match": etag }, "DELETE");
    expect(isFresh(req, etag)).toBe(false);
  });

  it("handles comma-separated ETags", () => {
    const etag = generateETag(Buffer.from("body"));
    const req = makeReq({ "if-none-match": `"other", ${etag}` });
    expect(isFresh(req, etag)).toBe(true);
  });

  it("handles wildcard *", () => {
    const etag = generateETag(Buffer.from("body"));
    const req = makeReq({ "if-none-match": "*" });
    expect(isFresh(req, etag)).toBe(true);
  });

  it("returns false when ETag does not match", () => {
    const etag = generateETag(Buffer.from("body"));
    const req = makeReq({ "if-none-match": '"different"' });
    expect(isFresh(req, etag)).toBe(false);
  });

  it("defaults method to GET when req.method is undefined", () => {
    const etag = generateETag(Buffer.from("body"));
    const req = {
      headers: { "if-none-match": etag },
      method: undefined,
    } as unknown as IncomingMessage;
    expect(isFresh(req, etag)).toBe(true);
  });
});
