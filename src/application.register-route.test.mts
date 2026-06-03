import { describe, it, expect } from "vitest";
import request from "supertest";
import { AsyncLocalStorage } from "node:async_hooks";
import { Application, createApp } from "./application.mts";
import type { Context } from "./context.mts";
import { withServer } from "./test-helpers/with-server.mts";

describe("Application", () => {
  it("registers GET route", async () => {
    const app = new Application();
    app.route("/hello").get((ctx) => {
      ctx.json({ hello: "world" });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/hello");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ hello: "world" });
    });
  });

  it("registers POST route", async () => {
    const app = new Application();
    app.route("/items").post((ctx) => {
      ctx.setStatus(201);
      ctx.json({ created: true });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).post("/items");
      expect(res.status).toBe(201);
    });
  });

  it("registers PUT route", async () => {
    const app = new Application();
    app.route("/items/:id").put((ctx) => {
      ctx.json({ id: ctx.params.id });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).put("/items/5");
      expect(res.body.id).toBe("5");
    });
  });

  it("registers DELETE route", async () => {
    const app = new Application();
    app.route("/items/:id").delete((ctx) => {
      ctx.setStatus(204);
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).delete("/items/5");
      expect(res.status).toBe(204);
    });
  });

  it("registers PATCH route", async () => {
    const app = new Application();
    app.route("/items/:id").patch((ctx) => {
      ctx.json({ patched: true });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).patch("/items/5");
      expect(res.status).toBe(200);
    });
  });

  it("multiple methods on same path", async () => {
    const app = new Application();
    app.route("/resource").get((ctx) => ctx.json({ m: "GET" }));
    app.route("/resource").post((ctx) => ctx.json({ m: "POST" }));

    await withServer(app.callback(), async (server) => {
      expect((await request(server).get("/resource")).body.m).toBe("GET");
      expect((await request(server).post("/resource")).body.m).toBe("POST");
    });
  });

  it("route params", async () => {
    const app = new Application();
    app.route("/users/:id").get((ctx) => {
      ctx.json({ id: ctx.params.id });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/users/42");
      expect(res.body.id).toBe("42");
    });
  });

  it("invokes sync error handler", async () => {
    const app = new Application();
    app.errorHandler((ctx, err) => {
      ctx.response.setStatus(500);
      ctx.json({ error: err.message });
    });
    app.route("/boom").get(() => {
      throw new Error("Sync boom");
    });

    // Use mock req/res to avoid socket-level race conditions under CI load
    // where supertest receives headers (status 500) but the body arrives
    // truncated, causing res.body.error to be undefined.
    const cb = app.callback();
    const res = await new Promise<{ status: number; body: string }>((resolve) => {
      const headers: Record<string, string | number> = {};
      const mockReq = {
        method: "GET",
        url: "/boom",
        headers: {},
        on: () => mockReq,
      } as unknown as import("node:http").IncomingMessage;
      const mockRes = {
        headersSent: false,
        writableEnded: false,
        statusCode: 200,
        setHeader: (name: string, value: string | number) => {
          headers[name.toLowerCase()] = value;
        },
        getHeader: (name: string) => headers[name.toLowerCase()],
        writeHead: (status: number) => {
          mockRes.statusCode = status;
        },
        end: (data?: Buffer | string) => {
          const body = data ? (Buffer.isBuffer(data) ? data.toString() : String(data)) : "";
          resolve({ status: mockRes.statusCode, body });
        },
      } as unknown as import("node:http").ServerResponse;
      cb(mockReq, mockRes);
    });
    expect(res.status).toBe(500);
    expect(JSON.parse(res.body).error).toBe("Sync boom");
  });

  it("invokes async error handler", async () => {
    const app = new Application();
    app.errorHandler((ctx, err) => {
      ctx.response.setStatus(503);
      ctx.json({ error: err.message });
    });
    app.route("/async-boom").get(() => {
      throw new Error("Async boom");
    });

    // Use mock req/res — same socket-level race condition risk as sync error handler test.
    const cb = app.callback();
    const res = await new Promise<{ status: number; body: string }>((resolve) => {
      const headers: Record<string, string | number> = {};
      const mockReq = {
        method: "GET",
        url: "/async-boom",
        headers: {},
        on: () => mockReq,
      } as unknown as import("node:http").IncomingMessage;
      const mockRes = {
        headersSent: false,
        writableEnded: false,
        statusCode: 200,
        setHeader: (name: string, value: string | number) => {
          headers[name.toLowerCase()] = value;
        },
        getHeader: (name: string) => headers[name.toLowerCase()],
        writeHead: (status: number) => {
          mockRes.statusCode = status;
        },
        end: (data?: Buffer | string) => {
          const body = data ? (Buffer.isBuffer(data) ? data.toString() : String(data)) : "";
          resolve({ status: mockRes.statusCode, body });
        },
      } as unknown as import("node:http").ServerResponse;
      cb(mockReq, mockRes);
    });
    expect(res.status).toBe(503);
    expect(JSON.parse(res.body).error).toBe("Async boom");
  });

  it("propagates http-errors status", async () => {
    const app = new Application();
    app.errorHandler((ctx, err) => {
      const status = (err as { status?: number }).status ?? 500;
      ctx.response.setStatus(status);
      ctx.json({ error: err.message });
    });
    app.route("/auth").get((ctx: Context) => {
      ctx.assert(false, 401, "Unauthorized");
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/auth");
      expect(res.status).toBe(401);
    });
  });

  it("404 handler when no route matched", async () => {
    const app = new Application();
    app.notFoundHandler((ctx) => {
      ctx.response.setStatus(404);
      ctx.json({ message: "Not Found" });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/missing");
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Not Found");
    });
  });

  it("404 handler when route matched but no response sent", async () => {
    const app = new Application();
    app.notFoundHandler((ctx) => {
      ctx.response.setStatus(404);
      ctx.json({ message: "Not Found" });
    });
    app.route("/empty").get(() => {
      // Handler does nothing
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/empty");
      expect(res.status).toBe(404);
    });
  });

  it("callback() returns valid RequestListener", () => {
    const app = new Application();
    const listener = app.callback();
    expect(typeof listener).toBe("function");
  });

  it("AsyncLocalStorage integration", async () => {
    const als = new AsyncLocalStorage<{ requestId: string }>();
    const app = new Application();
    app.setAsyncLocalStorage(als as AsyncLocalStorage<unknown>);

    app.route("/store").get((ctx) => {
      ctx.json({ hasStore: ctx.store !== undefined });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/store");
      expect(res.body.hasStore).toBe(true);
    });
  });

  it("context extension via app.extend()", async () => {
    const app = new Application();
    app.extend({
      greet() {
        return "hello from extension";
      },
    });

    app.route("/extended").get((ctx) => {
      const result = (ctx as unknown as { greet(): string }).greet();
      ctx.json({ result });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/extended");
      expect(res.body.result).toBe("hello from extension");
    });
  });

  it("sets security headers on every response", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.json({ ok: true });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.headers["x-xss-protection"]).toBe("0");
      expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["strict-transport-security"]).toBe("max-age=15552000; includeSubDomains");
      expect(res.headers["referrer-policy"]).toBe("no-referrer");
      expect(res.headers["x-dns-prefetch-control"]).toBe("off");
      expect(res.headers["x-download-options"]).toBe("noopen");
      expect(res.headers["x-permitted-cross-domain-policies"]).toBe("none");
    });
  });

  it('app.on("error", handler) emits errors', async () => {
    const app = new Application();
    const errorPromise = new Promise<Error>((resolve) => {
      app.on("error", (err: Error) => resolve(err));
    });

    app.route("/boom").get(() => {
      throw new Error("test error");
    });

    // Use mock req/res to avoid race between error emission and supertest resolution.
    const cb = app.callback();
    const mockReq = {
      method: "GET",
      url: "/boom",
      headers: {},
      on: () => mockReq,
    } as unknown as import("node:http").IncomingMessage;
    const mockRes = {
      headersSent: false,
      writableEnded: false,
      statusCode: 200,
      setHeader: () => {},
      getHeader: () => undefined,
      writeHead: (status: number) => {
        mockRes.statusCode = status;
      },
      end: () => {},
    } as unknown as import("node:http").ServerResponse;
    cb(mockReq, mockRes);

    const error = await errorPromise;
    expect(error.message).toBe("test error");
  });

  it("multiple routes registered", async () => {
    const app = new Application();
    app.route("/a").get((ctx) => ctx.json({ route: "a" }));
    app.route("/b").get((ctx) => ctx.json({ route: "b" }));
    app.route("/c").get((ctx) => ctx.json({ route: "c" }));

    await withServer(app.callback(), async (server) => {
      expect((await request(server).get("/a")).body.route).toBe("a");
      expect((await request(server).get("/b")).body.route).toBe("b");
      expect((await request(server).get("/c")).body.route).toBe("c");
    });
  });

  it("defaults method to GET when req.method is undefined", async () => {
    const app = new Application();
    app.route("/").get((ctx) => {
      ctx.json({ ok: true });
    });

    const cb = app.callback();
    const headers: Record<string, string | number> = {};
    const mockReq = {
      headers: {},
      on: () => mockReq,
    } as unknown as import("node:http").IncomingMessage;
    const mockRes = {
      headersSent: false,
      writableEnded: false,
      statusCode: 200,
      setHeader: (n: string, v: string | number) => {
        headers[n.toLowerCase()] = v;
      },
      getHeader: (n: string) => headers[n.toLowerCase()],
      writeHead: (s: number) => {
        mockRes.statusCode = s;
      },
      end: () => {},
    } as unknown as import("node:http").ServerResponse;

    await new Promise<void>((resolve) => {
      (mockRes as unknown as Record<string, unknown>).end = resolve;
      cb(mockReq, mockRes);
    });
    expect(mockRes.statusCode).toBe(200);
  });

  it("defaults url to / when req.url is undefined", async () => {
    const app = new Application();
    app.route("/").get((ctx) => {
      ctx.json({ ok: true });
    });

    const cb = app.callback();
    const headers: Record<string, string | number> = {};
    const mockReq = {
      method: "GET",
      headers: {},
      on: () => mockReq,
    } as unknown as import("node:http").IncomingMessage;
    const mockRes = {
      headersSent: false,
      writableEnded: false,
      statusCode: 200,
      setHeader: (n: string, v: string | number) => {
        headers[n.toLowerCase()] = v;
      },
      getHeader: (n: string) => headers[n.toLowerCase()],
      writeHead: (s: number) => {
        mockRes.statusCode = s;
      },
      end: () => {},
    } as unknown as import("node:http").ServerResponse;

    await new Promise<void>((resolve) => {
      (mockRes as unknown as Record<string, unknown>).end = resolve;
      cb(mockReq, mockRes);
    });
    expect(mockRes.statusCode).toBe(200);
  });

  it("createApp() factory creates a working Application", async () => {
    const app = createApp();
    app.route("/test").get((ctx) => {
      ctx.json({ factory: true });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.body.factory).toBe(true);
    });
  });

  it("routes req.url starting with ? (empty path) to root handler", async () => {
    const app = new Application();
    app.route("/").get((ctx) => {
      ctx.json({ ok: true });
    });

    const cb = app.callback();
    const headers: Record<string, string | number> = {};
    const mockReq = {
      method: "GET",
      url: "?foo=bar",
      headers: {},
      on: () => mockReq,
    } as unknown as import("node:http").IncomingMessage;
    const mockRes = {
      headersSent: false,
      writableEnded: false,
      statusCode: 200,
      setHeader: (n: string, v: string | number) => {
        headers[n.toLowerCase()] = v;
      },
      getHeader: (n: string) => headers[n.toLowerCase()],
      writeHead: (s: number) => {
        mockRes.statusCode = s;
      },
      end: () => {},
    } as unknown as import("node:http").ServerResponse;

    await new Promise<void>((resolve) => {
      (mockRes as unknown as Record<string, unknown>).end = resolve;
      cb(mockReq, mockRes);
    });
    expect(mockRes.statusCode).toBe(200);
  });

  it("extracts pathname from absolute URL in req.url", async () => {
    const app = new Application();
    app.route("/path").get((ctx) => {
      ctx.json({ ok: true });
    });

    const cb = app.callback();
    const headers: Record<string, string | number> = {};
    const mockReq = {
      method: "GET",
      url: "http://example.com/path?query=1",
      headers: {},
      on: () => mockReq,
    } as unknown as import("node:http").IncomingMessage;
    const mockRes = {
      headersSent: false,
      writableEnded: false,
      statusCode: 200,
      setHeader: (n: string, v: string | number) => {
        headers[n.toLowerCase()] = v;
      },
      getHeader: (n: string) => headers[n.toLowerCase()],
      writeHead: (s: number) => {
        mockRes.statusCode = s;
      },
      end: () => {},
    } as unknown as import("node:http").ServerResponse;

    await new Promise<void>((resolve) => {
      (mockRes as unknown as Record<string, unknown>).end = resolve;
      cb(mockReq, mockRes);
    });
    expect(mockRes.statusCode).toBe(200);
  });

  it("wraps non-Error thrown by route handler into an Error", async () => {
    const app = new Application();
    const errorReceived = new Promise<Error>((resolve) => {
      app.on("error", resolve);
    });
    app.route("/throw-string").get(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "string error";
    });

    const cb = app.callback();
    const mockReq = {
      method: "GET",
      url: "/throw-string",
      headers: {},
      on: () => mockReq,
    } as unknown as import("node:http").IncomingMessage;
    const mockRes = {
      headersSent: false,
      writableEnded: false,
      statusCode: 200,
      setHeader: () => {},
      getHeader: () => undefined,
      writeHead: (s: number) => {
        mockRes.statusCode = s;
      },
      end: () => {},
    } as unknown as import("node:http").ServerResponse;
    cb(mockReq, mockRes);

    const error = await errorReceived;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("string error");
  });

  it("skips fallback response when no error handler and headers already sent", async () => {
    const app = new Application();
    const errorReceived = new Promise<Error>((resolve) => {
      app.on("error", resolve);
    });
    app.route("/early-write").get((ctx) => {
      ctx.res.writeHead(200);
      throw new Error("post-header error");
    });

    const cb = app.callback();
    const mockReq = {
      method: "GET",
      url: "/early-write",
      headers: {},
      on: () => mockReq,
    } as unknown as import("node:http").IncomingMessage;
    const mockResInner = {
      headersSent: false,
      writableEnded: false,
      statusCode: 200,
      setHeader: () => {},
      getHeader: () => undefined,
      writeHead(s: number) {
        mockResInner.statusCode = s;
        mockResInner.headersSent = true;
      },
      end: () => {},
    };
    const mockRes = mockResInner as unknown as import("node:http").ServerResponse;
    cb(mockReq, mockRes);

    const error = await errorReceived;
    expect(error.message).toBe("post-header error");
    expect(mockRes.statusCode).toBe(200);
  });
});
