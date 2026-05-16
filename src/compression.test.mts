import { describe, it, expect } from "vitest";
import {
  negotiateEncoding,
  isCompressible,
  createCompressStream,
  compressSync,
  shouldCompress,
} from "./compression.mts";
import type { IncomingMessage } from "node:http";
import zlib from "node:zlib";

function makeReq(headers: Record<string, string>): IncomingMessage {
  return { headers, method: "GET" } as unknown as IncomingMessage;
}

function makeRes(headers: Record<string, string | undefined> = {}) {
  return {
    getHeader: (name: string) => headers[name.toLowerCase()],
  };
}

describe("negotiateEncoding", () => {
  it("negotiates gzip when client accepts", () => {
    const req = makeReq({ "accept-encoding": "gzip" });
    expect(negotiateEncoding(req)).toBe("gzip");
  });

  it("negotiates br when client accepts", () => {
    const req = makeReq({ "accept-encoding": "br" });
    expect(negotiateEncoding(req)).toBe("br");
  });

  it("negotiates deflate when client accepts", () => {
    const req = makeReq({ "accept-encoding": "deflate" });
    expect(negotiateEncoding(req)).toBe("deflate");
  });

  it("selects br when client prefers br", () => {
    const req = makeReq({ "accept-encoding": "br, gzip" });
    expect(negotiateEncoding(req)).toBe("br");
  });

  it("returns null when no compression accepted", () => {
    const req = makeReq({ "accept-encoding": "identity" });
    expect(negotiateEncoding(req)).toBeNull();
  });

  it("returns null when no accept-encoding header", () => {
    const req = makeReq({});
    expect(negotiateEncoding(req)).toBeNull();
  });
});

describe("isCompressible", () => {
  it("returns true for application/json", () => {
    expect(isCompressible("application/json")).toBe(true);
  });

  it("returns false for image/png", () => {
    expect(isCompressible("image/png")).toBe(false);
  });

  it("returns true for text/html", () => {
    expect(isCompressible("text/html")).toBe(true);
  });
});

describe("createCompressStream", () => {
  it("creates working gzip stream", async () => {
    const stream = createCompressStream("gzip");
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.write(Buffer.from("hello world"));
    stream.end();
    await new Promise((resolve) => stream.on("end", resolve));
    const compressed = Buffer.concat(chunks);
    const decompressed = zlib.gunzipSync(compressed);
    expect(decompressed.toString()).toBe("hello world");
  });

  it("creates working br stream", async () => {
    const stream = createCompressStream("br");
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.write(Buffer.from("hello world"));
    stream.end();
    await new Promise((resolve) => stream.on("end", resolve));
    const compressed = Buffer.concat(chunks);
    const decompressed = zlib.brotliDecompressSync(compressed);
    expect(decompressed.toString()).toBe("hello world");
  });

  it("creates working deflate stream", async () => {
    const stream = createCompressStream("deflate");
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.write(Buffer.from("hello world"));
    stream.end();
    await new Promise((resolve) => stream.on("end", resolve));
    const compressed = Buffer.concat(chunks);
    const decompressed = zlib.inflateSync(compressed);
    expect(decompressed.toString()).toBe("hello world");
  });
});

describe("compressSync", () => {
  it("compresses gzip correctly", () => {
    const input = Buffer.from("hello world");
    const compressed = compressSync("gzip", input);
    expect(zlib.gunzipSync(compressed).toString()).toBe("hello world");
  });

  it("compresses br correctly", () => {
    const input = Buffer.from("hello world");
    const compressed = compressSync("br", input);
    expect(zlib.brotliDecompressSync(compressed).toString()).toBe("hello world");
  });

  it("compresses deflate correctly", () => {
    const input = Buffer.from("hello world");
    const compressed = compressSync("deflate", input);
    expect(zlib.inflateSync(compressed).toString()).toBe("hello world");
  });
});

describe("shouldCompress", () => {
  it("returns null for small bodies (< 1024 bytes)", () => {
    const req = makeReq({ "accept-encoding": "gzip" });
    const res = makeRes();
    expect(shouldCompress(req, res, "application/json", 100)).toBeNull();
  });

  it("returns encoding for large compressible bodies", () => {
    const req = makeReq({ "accept-encoding": "gzip" });
    const res = makeRes();
    expect(shouldCompress(req, res, "application/json", 2000)).toBe("gzip");
  });

  it("returns null for buffered bodies above the sync compression limit", () => {
    const req = makeReq({ "accept-encoding": "gzip" });
    const res = makeRes();
    expect(shouldCompress(req, res, "application/json", 1024 * 1024 + 1)).toBeNull();
  });

  it("returns null when Content-Encoding already set", () => {
    const req = makeReq({ "accept-encoding": "gzip" });
    const res = makeRes({ "content-encoding": "gzip" });
    expect(shouldCompress(req, res, "application/json", 2000)).toBeNull();
  });

  it("returns null when Cache-Control: no-transform", () => {
    const req = makeReq({ "accept-encoding": "gzip", "cache-control": "no-transform" });
    const res = makeRes();
    expect(shouldCompress(req, res, "application/json", 2000)).toBeNull();
  });

  it("returns null for non-compressible content", () => {
    const req = makeReq({ "accept-encoding": "gzip" });
    const res = makeRes();
    expect(shouldCompress(req, res, "image/png", 2000)).toBeNull();
  });

  it("Vary: Accept-Encoding is responsibility of caller", () => {
    // shouldCompress just returns the encoding; Vary header is set in Response
    const req = makeReq({ "accept-encoding": "gzip" });
    const res = makeRes();
    const result = shouldCompress(req, res, "application/json", 2000);
    expect(result).toBe("gzip");
  });
});
