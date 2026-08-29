import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256 } from "./sha256.mts";

describe("sha256", () => {
  it("returns the Node SHA-256 bytes for text", () => {
    expect(sha256("hello")).toEqual(createHash("sha256").update("hello").digest());
  });

  it("hashes only the visible bytes of an ArrayBufferView", () => {
    const bytes = new Uint8Array([99, 104, 105, 99]);
    const view = new Uint8Array(bytes.buffer, 1, 2);
    expect(sha256(view)).toEqual(createHash("sha256").update(Buffer.from("hi")).digest());
  });
});
