import type { ServerResponse } from "node:http";

const FALLBACK_BODY = "Not Found";
const ERROR_STATUS = 500;
const ERROR_BODY = "Internal Server Error";
const TEXT_PLAIN_CONTENT_TYPE = "text/plain; charset=utf-8";
const FALLBACK_HEADERS = {
  "Content-Type": TEXT_PLAIN_CONTENT_TYPE,
  "X-XSS-Protection": "0",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
} as const;

export function ensureFallbackHeaders(res: ServerResponse): void {
  for (const [name, value] of Object.entries(FALLBACK_HEADERS)) {
    try {
      if (typeof res.hasHeader !== "function" || !res.hasHeader(name)) {
        res.setHeader(name, value);
      }
    } catch {
      // Header mutation can fail on destroyed sockets or non-standard responses.
    }
  }
}

export function sendFallback(res: ServerResponse): void {
  try {
    ensureFallbackHeaders(res);
    res.writeHead(ERROR_STATUS);
    res.end(ERROR_BODY);
  } catch {
    // Socket may already be destroyed; nothing more we can do.
  }
}

export function getFallbackStatus(error: unknown): number {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 600) {
    return status;
  }
  return ERROR_STATUS;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getFallbackBody(error: unknown, status: number): string {
  if (status >= 500) return ERROR_BODY;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? escapeHtml(message) : FALLBACK_BODY;
}
