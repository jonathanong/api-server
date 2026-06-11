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
  private strictJsonContentType: boolean;

  constructor(
    req: IncomingMessage,
    res: ServerResponse,
    defaultLimit: string | number | false = "1mb",
    strictJsonContentType = false,
  ) {
    this.req = req;
    this.res = res;
    this.defaultLimit = defaultLimit;
    this.strictJsonContentType = strictJsonContentType;
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
      this.bodyPromise = readBody(this.req, this.res, effectiveLimit);
    }
    return this.bodyPromise;
  }

  async json<T = unknown>(limit?: string | number | false): Promise<T> {
    if (this.strictJsonContentType) {
      // type-is semantics:
      //   null  → no body (no Content-Length / Transfer-Encoding header);
      //           skip the content-type check — buffer() will return an empty
      //           buffer that JSON.parse rejects with 400 as usual.
      //   false → a body is indicated but Content-Type is not a JSON type.
      //           We 415 only when the body actually has content (CL > 0 or
      //           Transfer-Encoding is set without CL). A Content-Length: 0
      //           body has nothing to read, so let it fall through to 400.
      //   truthy → recognised JSON type; proceed normally.
      const mediaType = this.is(["json", "application/*+json"]);
      const cl = this.req.headers["content-length"];
      const emptyBody = cl !== undefined && Number(cl) === 0;
      if (mediaType === false && !emptyBody) {
        throw Object.assign(new Error("Unsupported Media Type"), { status: 415 });
      }
    }
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

function readBody(
  req: IncomingMessage,
  res: ServerResponse,
  limit: string | number | false,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const maxBytes = parseLimit(limit);

    // Fast-fail if Content-Length exceeds the limit
    const contentLength = req.headers["content-length"];
    if (contentLength !== undefined && Number(contentLength) > maxBytes) {
      if (!res.headersSent) {
        res.setHeader("Connection", "close");
      }
      req.pause();
      return reject(Object.assign(new Error("Request entity too large"), { status: 413 }));
    }
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

        // Force connection close to prevent DoS from infinite streams
        if (!res.headersSent) {
          res.setHeader("Connection", "close");
        }
        req.pause();

        reject(Object.assign(new Error("Request entity too large"), { status: 413 }));
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
