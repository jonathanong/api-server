import { type ServerResponse, STATUS_CODES } from "node:http";

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

function escapeHtml(unsafe: string): string {
  return unsafe.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function shouldEscapeHtml(contentType: unknown): boolean {
  if (Array.isArray(contentType)) {
    contentType = contentType[0];
  }
  if (typeof contentType !== "string") {
    return false;
  }
  return /\btext\/html\b/i.test(contentType) || /\bapplication\/xhtml\+xml\b/i.test(contentType);
}

export function getFallbackBody(error: unknown, status: number, contentType?: unknown): string {
  if (status >= 500) return ERROR_BODY;
  const err = error as { message?: unknown; expose?: unknown } | null;
  const message = err?.message;
  if (err?.expose === false) {
    return STATUS_CODES[status] || FALLBACK_BODY;
  }
  const msg =
    typeof message === "string" && message ? message : STATUS_CODES[status] || FALLBACK_BODY;
  if (shouldEscapeHtml(contentType)) {
    return escapeHtml(msg);
  }
  return msg;
}
