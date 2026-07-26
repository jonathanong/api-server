import type { ServerResponse } from "node:http";

type MockResponseListenerBudget = Pick<ServerResponse, "getMaxListeners" | "setMaxListeners">;

export function mockResponseListenerBudget(initialLimit = 10): MockResponseListenerBudget {
  let limit = initialLimit;

  return {
    getMaxListeners: () => limit,
    setMaxListeners(value) {
      limit = value;
      return this as ServerResponse;
    },
  };
}
