import { pipeline } from "node:stream/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { generateETag, isFresh } from "./etag.mts";
import { shouldCompress, createCompressStream, compressSync } from "./compression.mts";
import type { ServerTiming } from "./server-timing.mts";

export class Response {
  private req: IncomingMessage;
  private res: ServerResponse;
  private timing: ServerTiming;
  private responseSent = false;
  private statusCode = 200;
  // Only called for non-HEAD streaming responses (pipeline), not buffered or HEAD
  private onWriteHeadCallback: (() => void) | null = null;

  constructor(
    req: IncomingMessage,
    res: ServerResponse,
    timing: ServerTiming,
    onWriteHead?: () => void,
  ) {
    this.req = req;
    this.res = res;
    this.timing = timing;
    this.onWriteHeadCallback = onWriteHead ?? null;
  }

  setStatus(code: number): void {
    this.statusCode = code;
  }

  get sent(): boolean {
    return this.responseSent;
  }

  json(data: unknown): void {
    const body = Buffer.from(JSON.stringify(data), "utf8");
    this.sendBuffered(body, "application/json; charset=utf-8");
  }

  text(data: string): void {
    const body = Buffer.from(data, "utf8");
    this.sendBuffered(body, "text/plain; charset=utf-8");
  }

  html(data: string): void {
    const body = Buffer.from(data, "utf8");
    this.sendBuffered(body, "text/html; charset=utf-8");
  }

  xml(data: string): void {
    const body = Buffer.from(data, "utf8");
    this.sendBuffered(body, "application/xml; charset=utf-8");
  }

  buffer(data: Buffer, contentType: string): void {
    this.sendBuffered(data, contentType);
  }

  async pipeline(
    source: NodeJS.ReadableStream,
    ...transforms: NodeJS.ReadWriteStream[]
  ): Promise<void> {
    if (this.responseSent) throw new Error("Response already sent");
    this.responseSent = true;

    const contentType =
      (this.res.getHeader("Content-Type") as string | undefined) ?? "application/octet-stream";
    const encoding = shouldCompress(this.req, this.res, contentType, Infinity);

    if (encoding) {
      this.res.setHeader("Content-Encoding", encoding);
      this.res.setHeader("Vary", "Accept-Encoding");
    }

    // HEAD requests: send headers only, no body
    if (this.req.method === "HEAD") {
      this.timing.markResponseStarted();
      const finishedAt = process.hrtime.bigint();
      this.res.setHeader("Server-Timing", this.timing.getBufferedHeaderValue(finishedAt));
      this.res.writeHead(this.statusCode);
      this.res.end();
      return;
    }

    this.res.setHeader("Trailer", "Server-Timing");
    this.timing.markResponseStarted();
    this.onWriteHeadCallback?.();
    this.res.writeHead(this.statusCode);

    const compressStream = encoding ? createCompressStream(encoding) : null;
    // Build pipeline stages
    const stages: NodeJS.ReadWriteStream[] = [...transforms];
    if (compressStream) stages.push(compressStream);

    if (stages.length > 0) {
      await pipeline(source, ...stages, this.res);
    } else {
      await pipeline(source, this.res);
    }

    const finishedAt = process.hrtime.bigint();
    this.res.addTrailers({ "Server-Timing": this.timing.getBufferedHeaderValue(finishedAt) });
  }

  empty(): void {
    if (this.responseSent) throw new Error("Response already sent");
    this.responseSent = true;
    this.timing.markResponseStarted();
    const finishedAt = process.hrtime.bigint();
    this.res.setHeader("Server-Timing", this.timing.getBufferedHeaderValue(finishedAt));
    this.res.writeHead(this.statusCode);
    this.res.end();
  }

  private sendBuffered(body: Buffer, contentType: string): void {
    if (this.responseSent) throw new Error("Response already sent");
    this.responseSent = true;

    const etag = generateETag(body);

    if (this.statusCode >= 200 && this.statusCode < 300 && isFresh(this.req, etag)) {
      this.timing.markResponseStarted();
      this.res.writeHead(304);
      this.res.end();
      return;
    }

    const encoding = shouldCompress(this.req, this.res, contentType, body.length);
    let finalBody = body;
    if (encoding) {
      finalBody = compressSync(encoding, body);
      this.res.setHeader("Content-Encoding", encoding);
      this.res.setHeader("Vary", "Accept-Encoding");
    }

    this.res.setHeader("Content-Type", contentType);
    this.res.setHeader("Content-Length", finalBody.length);
    if (this.statusCode >= 200 && this.statusCode < 300) {
      this.res.setHeader("ETag", etag);
    }

    this.timing.markResponseStarted();
    const finishedAt = process.hrtime.bigint();
    this.res.setHeader("Server-Timing", this.timing.getBufferedHeaderValue(finishedAt));

    this.res.writeHead(this.statusCode);

    if (this.req.method === "HEAD") {
      this.res.end();
    } else {
      this.res.end(finalBody);
    }
  }
}
