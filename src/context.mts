import type { IncomingMessage, ServerResponse } from "node:http";
import type { AsyncLocalStorage } from "node:async_hooks";
import httpAssert from "http-assert";
import createHttpError from "http-errors";
import { Request } from "./request.mts";
import { Response } from "./response.mts";
import { Cookies } from "./cookies.mts";
import { applyCacheControl } from "./cache-control.mts";
import type { ServerTiming } from "./server-timing.mts";
import { resolveTrustedClientIp } from "./trusted-client-ip.mts";

const CONTENT_TYPES: Record<string, string> = {
  json: "application/json; charset=utf-8",
  html: "text/html; charset=utf-8",
  text: "text/plain; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  bin: "application/octet-stream",
  form: "application/x-www-form-urlencoded",
};

export class Context {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string | undefined>;
  request: Request;
  response: Response;
  cookies: Cookies;
  signal: AbortSignal;
  abortController: AbortController;
  assert: typeof httpAssert;

  private queryCache: Record<string, string | string[]> | null = null;
  private asyncLocalStorage: AsyncLocalStorage<unknown> | null;
  private trustProxy: boolean;

  constructor(
    req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string | undefined>,
    timing: ServerTiming,
    als: AsyncLocalStorage<unknown> | null,
    abortController: AbortController,
    bodyLimit: string | number | false,
    trustProxy: boolean,
    onWriteHead?: () => void,
    strictJsonContentType?: boolean,
  ) {
    this.req = req;
    this.res = res;
    this.params = params;
    this.request = new Request(req, res, bodyLimit, strictJsonContentType ?? false);
    this.response = new Response(req, res, timing, onWriteHead);
    this.cookies = new Cookies(req, res);
    this.abortController = abortController;
    this.signal = abortController.signal;
    this.assert = httpAssert;
    this.asyncLocalStorage = als;
    this.trustProxy = trustProxy;
  }

  get query(): Record<string, string | string[]> {
    if (this.queryCache) return this.queryCache;
    const url = this.req.url ?? "";
    const questionMark = url.indexOf("?");
    if (questionMark === -1) {
      this.queryCache = {};
      return this.queryCache;
    }
    const queryString = url.slice(questionMark + 1);
    const params = new URLSearchParams(queryString);
    const result: Record<string, string | string[]> = Object.create(null);
    for (const [key, value] of params) {
      const current = result[key];
      if (current === undefined) {
        result[key] = value;
      } else if (Array.isArray(current)) {
        current.push(value);
      } else {
        result[key] = [current, value];
      }
    }
    this.queryCache = result;
    return this.queryCache;
  }

  get store(): unknown {
    return this.asyncLocalStorage?.getStore();
  }

  get ip(): string | undefined {
    return resolveTrustedClientIp({
      headers: this.trustProxy ? this.req.headers : undefined,
      socketRemoteAddress: this.req.socket?.remoteAddress,
    });
  }

  set(header: string, value: string): void {
    this.res.setHeader(header, value);
  }

  setType(type: string): void {
    this.res.setHeader("Content-Type", CONTENT_TYPES[type] ?? type);
  }

  setStatus(code: number): void {
    this.response.setStatus(code);
    if (code === 204 || code === 205) {
      this.response.empty();
    }
  }

  throw(status: number, message?: string, code?: string): never {
    const err = message !== undefined ? createHttpError(status, message) : createHttpError(status);
    if (code !== undefined) {
      Object.assign(err, { code });
    }
    throw err;
  }

  json(data: unknown): void {
    this.response.json(data);
  }

  pipeline(source: NodeJS.ReadableStream, ...transforms: NodeJS.ReadWriteStream[]): Promise<void> {
    return this.response.pipeline(source, ...transforms);
  }

  cacheControl(type: "public" | "private", ttl?: number | string): void {
    applyCacheControl(this.res, type, ttl);
  }
}

export function createContextClass(extensions: Record<string, unknown>): typeof Context {
  class ExtendedContext extends Context {}
  Object.assign(ExtendedContext.prototype, extensions);
  return ExtendedContext as unknown as typeof Context;
}
