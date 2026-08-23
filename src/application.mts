import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse, RequestListener } from "node:http";
import type { AsyncLocalStorage } from "node:async_hooks";
import { Context, createContextClass } from "./context.mts";
import {
  createRouteBuilder,
  getAcceptedMediaTypes,
  isSupportedHttpMethod,
  type RouteBuilder,
} from "./router.mts";
import Router from "find-my-way";
import { ServerTiming } from "./server-timing.mts";
import { Logger } from "./logger.mts";
import type { ApplicationOptions, OversizedBodyStrategy } from "./types.mts";
import { getRawPath } from "./request-path.mts";
import { createRequestAbortController } from "./request-abort.mts";
import {
  assertAcceptedMutationMediaType,
  drainUnreadHttp2Mutation,
} from "./mutation-media-type.mts";
import {
  applySecurityHeaders,
  ensureFallbackHeaders,
  getFallbackBody,
  getFallbackStatus,
  resolveSecurityHeaders,
  safeString,
  sendFallback,
  type ResolvedSecurityHeaders,
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
  private readonly securityHeaders: ResolvedSecurityHeaders;
  private trustProxy: boolean;
  private readonly oversizedBodyStrategy: OversizedBodyStrategy;
  private readonly fallbackContentSecurityPolicy: string | false;
  private readonly strictHttpMethods: boolean;

  constructor(options?: ApplicationOptions) {
    super();
    this.logger = new Logger(options?.logger);
    this.bodyLimit = options?.bodyLimit ?? "1mb";
    this.securityHeaders = resolveSecurityHeaders(options?.securityHeaders);
    this.trustProxy = options?.trustProxy ?? false;
    this.oversizedBodyStrategy = options?.oversizedBodyStrategy ?? "drain";
    this.fallbackContentSecurityPolicy = options?.fallbackContentSecurityPolicy ?? false;
    this.strictHttpMethods = options?.strictHttpMethods ?? false;
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
        const error = err instanceof Error ? err : new Error(safeString(err));
        try {
          if (this.listenerCount("error") > 0) {
            this.emit("error", error);
          }
        } catch {}
        if (!res.headersSent) {
          ensureFallbackHeaders(res, this.securityHeaders, this.fallbackContentSecurityPolicy);
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
    const abortController = createRequestAbortController(res);
    const timing = new ServerTiming();
    const ContextClass = this.contextClass;

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
      this.oversizedBodyStrategy,
    );

    applySecurityHeaders(res, this.securityHeaders);

    try {
      const method = req.method ?? "GET";
      if (this.strictHttpMethods && !isSupportedHttpMethod(method)) {
        throw Object.assign(new Error("Unsupported HTTP method"), { status: 400 });
      }
      const url = req.url ?? "/";
      const rawPath = getRawPath(url);
      const routePath = rawPath.replace(/^\/+/, "/") || "/";

      const found = this.router.find(method as Router.HTTPMethod, routePath);

      const mediaTypeCheck = assertAcceptedMutationMediaType(
        req,
        found ? getAcceptedMediaTypes(found.handler) : undefined,
      );
      if (mediaTypeCheck) await mediaTypeCheck;

      if (found) {
        ctx.params = found.params;
        try {
          await found.handler(req, res, found.params, ctx, found.searchParams);
        } finally {
          drainUnreadHttp2Mutation(req);
        }
      }

      if (!ctx.response.sent) {
        if (this.notFoundHandlerFn) {
          await this.notFoundHandlerFn(ctx);
        } else {
          ensureFallbackHeaders(res, this.securityHeaders, this.fallbackContentSecurityPolicy);
          res.writeHead(404);
          res.end("Not Found");
        }
      }

      onFinish(res.statusCode);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(safeString(err));

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
        if (!res.headersSent) {
          sendFallback(res, this.securityHeaders, this.fallbackContentSecurityPolicy);
        }
      } else if (!res.headersSent) {
        const status = getFallbackStatus(error);
        ensureFallbackHeaders(res, this.securityHeaders, this.fallbackContentSecurityPolicy);
        res.writeHead(status);
        res.end(getFallbackBody(error, status));
      }

      onFinish(res.statusCode);
    }
  }
}

export const createApp = (options?: ApplicationOptions): Application => new Application(options);
