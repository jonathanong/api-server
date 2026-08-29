import type { IncomingMessage } from "node:http";
import { sha256 } from "./sha256.mts";

export function generateETag(body: Buffer): string {
  const hash = sha256(body).toString("base64url");
  return `"${hash}"`;
}

export function isFresh(req: IncomingMessage, etag: string): boolean {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") return false;

  const ifNoneMatch = req.headers["if-none-match"];
  if (!ifNoneMatch) return false;

  if (ifNoneMatch === "*") return true;

  const tags = ifNoneMatch.split(",").map((t) => t.trim());
  return tags.includes(etag);
}
