import type { IncomingMessage } from "node:http";

export const DEFAULT_MUTATION_MEDIA_TYPES = ["application/json", "application/*+json"] as const;

export interface MutationRouteOptions {
  /** Replaces the default JSON media types for this mutation route. */
  acceptedMediaTypes: readonly string[];
}

export function assertAcceptedMutationMediaType(
  req: IncomingMessage,
  acceptedMediaTypes: readonly string[] = DEFAULT_MUTATION_MEDIA_TYPES,
): Promise<void> | undefined {
  const contentType = req.headers["content-type"];
  const accepted =
    typeof contentType === "string" &&
    acceptedMediaTypes.some((type) => matchesMediaType(contentType, type));
  if (!isMutationMethod(req.method)) return;
  if (req.headers["transfer-encoding"] !== undefined || Number(req.headers["content-length"]) > 0) {
    if (!accepted) rejectUnsupportedMediaType(req);
    return;
  }
  if (req.httpVersionMajor === 2 && !accepted) {
    return waitForRejectedHttp2Body(req).then((hasBody) => {
      if (hasBody) rejectUnsupportedMediaType(req);
    });
  }
  return undefined;
}

export function drainUnreadHttp2Mutation(req: IncomingMessage): void {
  if (req.httpVersionMajor === 2 && isMutationMethod(req.method) && !req.readableEnded)
    drainRequest(req);
}

function isMutationMethod(method: string | undefined): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function matchesMediaType(contentType: string, acceptedMediaType: string): boolean {
  const actual = parseMediaType(contentType);
  const expected = parseMediaType(acceptedMediaType);
  return (
    actual !== null &&
    expected !== null &&
    matchesToken(actual[0], expected[0]) &&
    matchesToken(actual[1], expected[1])
  );
}

function parseMediaType(value: string): [string, string] | null {
  const [type, subtype, ...extra] = value.split(";", 1)[0]?.trim().toLowerCase().split("/") ?? [];
  return type && subtype && extra.length === 0 ? [type, subtype] : null;
}

function matchesToken(actual: string, expected: string): boolean {
  if (!expected.includes("*")) return actual === expected;
  const parts = expected.split("*");
  if (!actual.startsWith(parts[0] ?? "")) return false;
  let offset = (parts[0] ?? "").length;
  for (const part of parts.slice(1, -1)) {
    const index = actual.indexOf(part, offset);
    if (index === -1) return false;
    offset = index + part.length;
  }
  const suffix = parts.at(-1) ?? "";
  return expected.endsWith("*") || actual.slice(offset).endsWith(suffix);
}

function rejectUnsupportedMediaType(req: IncomingMessage): never {
  drainRequest(req);
  throw Object.assign(new Error("Unsupported Media Type"), { status: 415 });
}

function waitForRejectedHttp2Body(req: IncomingMessage): Promise<boolean> {
  if (req.readableEnded) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      req.removeListener("data", onData);
      req.removeListener("end", onEnd);
      req.removeListener("error", onError);
    };
    const onData = () => {
      drainRequest(req);
      cleanup();
      resolve(true);
    };
    const onEnd = () => {
      cleanup();
      resolve(false);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    req.once("data", onData);
    req.once("end", onEnd);
    req.once("error", onError);
    req.resume();
  });
}

function drainRequest(req: IncomingMessage): void {
  req.on("error", noop);
  req.resume();
}

function noop(): void {}
