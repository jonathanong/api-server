import { createHash } from "node:crypto";

/** Returns the SHA-256 digest bytes for a string or visible ArrayBufferView bytes. */
export function sha256(input: string | NodeJS.ArrayBufferView): Buffer {
  return createHash("sha256").update(input).digest();
}
