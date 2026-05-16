import Router from "find-my-way";
import type { Context } from "./context.mts";

type RouterInstance = Router.Instance<Router.HTTPVersion.V1>;

export type Handler = (ctx: Context) => Promise<void> | void;

export interface RouteBuilder {
  get(handler: Handler): RouteBuilder;
  post(handler: Handler): RouteBuilder;
  put(handler: Handler): RouteBuilder;
  delete(handler: Handler): RouteBuilder;
  patch(handler: Handler): RouteBuilder;
}

export function createRouteBuilder(router: RouterInstance, path: string): RouteBuilder {
  const builder: RouteBuilder = {
    get(handler) {
      router.on("GET", path, wrapHandler(handler));
      router.on("HEAD", path, wrapHandler(handler));
      return builder;
    },
    post(handler) {
      router.on("POST", path, wrapHandler(handler));
      return builder;
    },
    put(handler) {
      router.on("PUT", path, wrapHandler(handler));
      return builder;
    },
    delete(handler) {
      router.on("DELETE", path, wrapHandler(handler));
      return builder;
    },
    patch(handler) {
      router.on("PATCH", path, wrapHandler(handler));
      return builder;
    },
  };
  return builder;
}

function wrapHandler(handler: Handler): Router.Handler<Router.HTTPVersion.V1> {
  return (_req, _res, _params, store) => {
    const ctx = store as Context;
    return handler(ctx);
  };
}
