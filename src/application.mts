import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse, RequestListener } from "node:http";
import type { AsyncLocalStorage } from "node:async_hooks";
import { Context, createContextClass } from "./context.mts";
import { createRouteBuilder, type RouteBuilder } from "./router.mts";
import Router from "find-my-way";
import { ServerTiming } from "./server-timing.mts";
import { Logger } from "./logger.mts";
import type { ApplicationOptions } from "./types.mts";
import {
  ensureFallbackHeaders,
  getFallbackBody,
  getFallbackStatus,
  sendFallback,
} from "./fallback-response.mts";
export type ErrorHandler = (ctx: Context, error: Error) => Promise<void> | void;
export type NotFoundHandler = (ctx: Context) => Promise<void> | void;

export class Application extends EventEmitter {
  private router = Router();
  private errorHandlerFn: ErrorHandler | null = null;
  private notFoundHandlerFn: NotFoundHandler | null = null;
  private asyncLocalStorage: AsyncLocalStorage<unknown> | null = null;
  private extensions: Record<string, unknown> = {};
  private contextClass: typeof Context = Context;
  private logger: Logger;
  private bodyLimit: string | number | false;
  private trustProxy: boolean;

  constructor(options?: ApplicationOptions) {
    super();
    this.logger = new Logger(options?.logger);
    this.bodyLimit = options?.bodyLimit ?? "1mb";
    this.trustProxy = options?.trustProxy ?? false;
  }

  route(path: string): RouteBuilder {
    return createRouteBuilder(this.router, path);
  }

  errorHandler(fn: ErrorHandler): void {
    this.errorHandlerFn = fn;
  }

  notFoundHandler(fn: NotFoundHandler): void {
    this.notFoundHandlerFn = fn;
  }

  setAsyncLocalStorage(als: AsyncLocalStorage<unknown>): void {
    this.asyncLocalStorage = als;
  }

  extend(methods: Record<string, unknown>): void {
    Object.assign(this.extensions, methods);
    this.contextClass = createContextClass(this.extensions);
  }

  callback(): RequestListener {
    return (req: IncomingMessage, res: ServerResponse) => {
      this.handleRequest(req, res);
    };
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const run = () =>
      this.runRequest(req, res).catch((err: unknown) => {
        // Safety net: if runRequest rejects before its own try-catch (e.g. during
        // context/timing setup), ensure the client always gets a response instead
        // of a socket hang-up from an unhandled promise rejection.
        const error = err instanceof Error ? err : new Error(String(err));
        try {
          if (this.listenerCount("error") > 0) {
            this.emit("error", error);
          }
        } catch {
          // Swallow listener throws so the 500 response still goes out.
        }
        if (!res.headersSent) {
          ensureFallbackHeaders(res);
          res.writeHead(500);
          res.end("Internal Server Error");
        }
      });

    if (this.asyncLocalStorage) {
      this.asyncLocalStorage.run({}, run);
    } else {
      run();
    }
  }

  private async runRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const abortController = new AbortController();
    const timing = new ServerTiming();
    const ContextClass = this.contextClass;

    req.on("close", () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    const { onWriteHead, onFinish } = this.logger.onRequestStart(req);

    const ctx = new ContextClass(
      req,
      res,
      {},
      timing,
      this.asyncLocalStorage,
      abortController,
      this.bodyLimit,
      this.trustProxy,
      onWriteHead,
    );

    // Security headers
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");

    try {
      const method = req.method ?? "GET";
      const url = req.url ?? "/";
      const rawPath =
        url.startsWith("http://") || url.startsWith("https://")
          ? new URL(url).pathname
          : url.split("?")[0];
      const routePath = rawPath.replace(/^\/+/, "/") || "/";

      const found = this.router.find(method as Router.HTTPMethod, routePath);

      if (found) {
        ctx.params = found.params;
        await found.handler(req, res, found.params, ctx, found.searchParams);
      }

      if (!ctx.response.sent) {
        if (this.notFoundHandlerFn) {
          await this.notFoundHandlerFn(ctx);
        } else {
          ensureFallbackHeaders(res);
          res.writeHead(404);
          res.end("Not Found");
        }
      }

      onFinish(res.statusCode);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      if (this.listenerCount("error") > 0) {
        this.emit("error", error);
      }

      if (this.errorHandlerFn) {
        try {
          await this.errorHandlerFn(ctx, error);
        } catch (handlerErr) {
          if (this.listenerCount("error") > 0) {
            this.emit("error", handlerErr);
          }
        }
        // Safety net: ensure the client always receives a response, even if the
        // registered error handler threw or returned without sending one. Without
        // this, requests hang until the socket times out (issue #1948).
        if (!res.headersSent) {
          sendFallback(res);
        }
      } else if (!res.headersSent) {
        const status = getFallbackStatus(error);
        ensureFallbackHeaders(res);
        res.writeHead(status);
        res.end(getFallbackBody(error, status));
      }

      onFinish(res.statusCode);
    }
  }
}
export const createApp = (options?: ApplicationOptions): Application => new Application(options);
