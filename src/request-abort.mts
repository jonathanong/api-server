import type { ServerResponse } from "node:http";

function isPositiveFinite(limit: number): boolean {
  return limit > 0 && Number.isFinite(limit);
}

export function createRequestAbortController(response: ServerResponse): AbortController {
  const abortController = new AbortController();
  const initialLimit = response.getMaxListeners();
  const reservedListenerSlot = isPositiveFinite(initialLimit);

  if (reservedListenerSlot) {
    response.setMaxListeners(initialLimit + 1);
  }

  response.once("close", () => {
    const currentLimit = response.getMaxListeners();
    if (reservedListenerSlot && isPositiveFinite(currentLimit)) {
      response.setMaxListeners(currentLimit - 1);
    }
    if (!response.writableEnded) {
      abortController.abort();
    }
  });

  return abortController;
}
