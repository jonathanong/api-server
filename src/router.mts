import { METHODS } from "node:http";
import Router from "find-my-way";
import type { Context } from "./context.mts";
import type { MutationRouteOptions } from "./mutation-media-type.mts";

type RouterInstance = Router.Instance<Router.HTTPVersion.V1>;

export type Handler = (ctx: Context) => Promise<void> | void;

export interface RouteBuilder {
  get(handler: Handler): RouteBuilder;
  post(handler: Handler, options?: MutationRouteOptions): RouteBuilder;
  put(handler: Handler, options?: MutationRouteOptions): RouteBuilder;
  delete(handler: Handler, options?: MutationRouteOptions): RouteBuilder;
  patch(handler: Handler, options?: MutationRouteOptions): RouteBuilder;
}

type RoutedHandler = Router.Handler<Router.HTTPVersion.V1> & {
  acceptedMediaTypes?: readonly string[];
};

export function isSupportedHttpMethod(method: string): boolean {
  return METHODS.includes(method);
}

export function createRouteBuilder(router: RouterInstance, path: string): RouteBuilder {
  const builder: RouteBuilder = {
    get(handler) {
      router.on("GET", path, wrapHandler(handler));
      router.on("HEAD", path, wrapHandler(handler));
      return builder;
    },
    post(handler, options) {
      router.on("POST", path, wrapHandler(handler, options));
      return builder;
    },
    put(handler, options) {
      router.on("PUT", path, wrapHandler(handler, options));
      return builder;
    },
    delete(handler, options) {
      router.on("DELETE", path, wrapHandler(handler, options));
      return builder;
    },
    patch(handler, options) {
      router.on("PATCH", path, wrapHandler(handler, options));
      return builder;
    },
  };
  return builder;
}

export function getAcceptedMediaTypes(
  handler: Router.Handler<Router.HTTPVersion.V1>,
): readonly string[] | undefined {
  return (handler as RoutedHandler).acceptedMediaTypes;
}

function wrapHandler(handler: Handler, options?: MutationRouteOptions): RoutedHandler {
  const wrapped: RoutedHandler = (_req, _res, _params, store) => {
    const ctx = store as Context;
    return handler(ctx);
  };
  if (options) wrapped.acceptedMediaTypes = options.acceptedMediaTypes;
  return wrapped;
}
