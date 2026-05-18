import type { ServerResponse } from "node:http";

const FALLBACK_BODY = "Not Found";
const ERROR_STATUS = 500;
const ERROR_BODY = "Internal Server Error";

export function sendFallback(res: ServerResponse): void {
  try {
    try {
      if (typeof res.hasHeader === "function" && !res.hasHeader("Content-Type")) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
      }
    } catch {}
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

export function getFallbackBody(error: unknown, status: number): string {
  if (status >= 500) return ERROR_BODY;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : FALLBACK_BODY;
}
