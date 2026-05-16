import type { IncomingMessage, ServerResponse } from "node:http";
// @ts-ignore
import typeIs from "type-is";
// @ts-ignore
import bytes from "bytes";

function noop() {}

export class Request {
  private req: IncomingMessage;
  private res: ServerResponse;
  private bodyPromise: Promise<Buffer> | null = null;
  private defaultLimit: string | number | false;

  constructor(
    req: IncomingMessage,
    res: ServerResponse,
    defaultLimit: string | number | false = "1mb",
  ) {
    this.req = req;
    this.res = res;
    this.defaultLimit = defaultLimit;
  }

  is(type: string | string[]): string | false | null {
    return typeIs(this.req, Array.isArray(type) ? type : [type]);
  }

  buffer(limit?: string | number | false): Promise<Buffer> {
    if (!this.bodyPromise) {
      const effectiveLimit = limit ?? this.defaultLimit;
      if (this.req.headers.expect === "100-continue") {
        this.res.writeContinue();
      }
      this.bodyPromise = readBody(this.req, effectiveLimit);
    }
    return this.bodyPromise;
  }

  async json<T = unknown>(limit?: string | number | false): Promise<T> {
    const buf = await this.buffer(limit);
    try {
      return JSON.parse(buf.toString("utf8")) as T;
    } catch {
      throw Object.assign(new Error("Invalid JSON"), { status: 400 });
    }
  }
}

function parseLimit(limit: string | number | false): number {
  if (limit === false) return Infinity;
  const parsed = typeof limit === "number" ? limit : bytes.parse(limit);
  if (parsed === null || parsed === undefined || !Number.isFinite(parsed) || parsed < 0) {
    throw new TypeError(`Invalid request body limit: ${String(limit)}`);
  }
  return parsed;
}

function readBody(req: IncomingMessage, limit: string | number | false): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const maxBytes = parseLimit(limit);
    const chunks: Buffer[] = [];
    let totalLength = 0;

    function cleanup() {
      req.removeListener("data", onData);
      req.removeListener("end", onEnd);
      req.removeListener("error", onError);
    }

    function onData(chunk: Buffer) {
      totalLength += chunk.length;
      if (totalLength > maxBytes) {
        // Remove data/end listeners but keep a no-op error handler during drain
        // to prevent unhandled 'error' events from crashing the process.
        req.removeListener("data", onData);
        req.removeListener("end", onEnd);
        req.removeListener("error", onError);
        req.on("error", noop);
        reject(Object.assign(new Error("Request entity too large"), { status: 413 }));
        // Drain remaining data so the connection stays reusable (HTTP keep-alive)
        req.resume();
        return;
      }
      chunks.push(chunk);
    }

    function onEnd() {
      cleanup();
      resolve(Buffer.concat(chunks));
    }

    function onError(err: Error) {
      cleanup();
      reject(err);
    }

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
}
