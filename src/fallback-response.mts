import { type ServerResponse, STATUS_CODES } from "node:http";
import type { SecurityHeaderName, SecurityHeadersOptions } from "./types.mts";

const FALLBACK_BODY = "Not Found";
const ERROR_STATUS = 500;
const ERROR_BODY = "Internal Server Error";
const TEXT_PLAIN_CONTENT_TYPE = "text/plain; charset=utf-8";
export type ResolvedSecurityHeaders = Readonly<Partial<Record<SecurityHeaderName, string>>>;

const SECURITY_HEADER_NAMES = [
  "X-XSS-Protection",
  "X-Frame-Options",
  "X-Content-Type-Options",
  "Strict-Transport-Security",
  "Referrer-Policy",
  "X-DNS-Prefetch-Control",
  "X-Download-Options",
  "X-Permitted-Cross-Domain-Policies",
] as const satisfies readonly SecurityHeaderName[];

export const SECURITY_HEADERS: ResolvedSecurityHeaders = {
  "X-XSS-Protection": "0",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
};

export function resolveSecurityHeaders(options?: SecurityHeadersOptions): ResolvedSecurityHeaders {
  const resolved: Partial<Record<SecurityHeaderName, string>> = { ...SECURITY_HEADERS };
  for (const name of SECURITY_HEADER_NAMES) {
    const value = options?.[name];
    if (value === false) {
      delete resolved[name];
    } else if (typeof value === "string") {
      resolved[name] = value;
    }
  }
  return resolved;
}

export function applySecurityHeaders(
  res: ServerResponse,
  securityHeaders: ResolvedSecurityHeaders,
): void {
  for (const [name, value] of Object.entries(securityHeaders)) {
    res.setHeader(name, value);
  }
}

export function ensureFallbackHeaders(
  res: ServerResponse,
  securityHeaders: ResolvedSecurityHeaders = SECURITY_HEADERS,
): void {
  for (const [name, value] of Object.entries({
    "Content-Type": TEXT_PLAIN_CONTENT_TYPE,
    ...securityHeaders,
  })) {
    try {
      if (typeof res.hasHeader !== "function" || !res.hasHeader(name)) {
        res.setHeader(name, value);
      }
    } catch {
      // Header mutation can fail on destroyed sockets or non-standard responses.
    }
  }
}

export function sendFallback(
  res: ServerResponse,
  securityHeaders: ResolvedSecurityHeaders = SECURITY_HEADERS,
): void {
  try {
    ensureFallbackHeaders(res, securityHeaders);
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
  return unsafe
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function safeString(err: unknown): string {
  try {
    return String(err);
  } catch {
    return "[Object null prototype]";
  }
}

export function getFallbackBody(error: unknown, status: number): string {
  if (status >= 500) return ERROR_BODY;
  const err = error as { message?: unknown; expose?: unknown } | null;
  const message = err?.message;
  if (err?.expose === false) {
    return STATUS_CODES[status] || FALLBACK_BODY;
  }
  const msg =
    typeof message === "string" && message ? message : STATUS_CODES[status] || FALLBACK_BODY;
  return escapeHtml(msg);
}
