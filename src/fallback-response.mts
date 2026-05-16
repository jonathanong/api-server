import type { ServerResponse } from "node:http";

const FALLBACK_STATUS = 404;
const FALLBACK_BODY = "Not Found";

export function sendFallback(res: ServerResponse): void {
  try {
    res.writeHead(FALLBACK_STATUS);
    res.end(FALLBACK_BODY);
  } catch {
    // Socket may already be destroyed; nothing more we can do.
  }
}

export function getFallbackStatus(error: unknown): number {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status < 600) {
    return status;
  }
  return FALLBACK_STATUS;
}
