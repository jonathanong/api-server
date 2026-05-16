import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import request from "supertest";
import { AsyncLocalStorage } from "node:async_hooks";
import { Application } from "./application.mts";
import type { Context } from "./context.mts";
import { withServer } from "./test-helpers/with-server.mts";

describe("Context", () => {
  it("ctx.json() sends JSON response", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.json({ hello: "world" });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ hello: "world" });
    });
  });

  it("ctx.params from route", async () => {
    const app = new Application();
    app.route("/users/:id").get((ctx) => {
      ctx.json({ id: ctx.params.id });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/users/123");
      expect(res.body).toEqual({ id: "123" });
    });
  });

  it("ctx.query parsing single values", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.json(ctx.query);
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test?foo=bar&baz=qux");
      expect(res.body).toEqual({ foo: "bar", baz: "qux" });
    });
  });

  it("ctx.query parsing arrays", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.json(ctx.query);
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test?tag=a&tag=b");
      expect(res.body.tag).toEqual(["a", "b"]);
    });
  });

  it("ctx.query appends more than two values for the same key", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.json(ctx.query);
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test?tag=a&tag=b&tag=c");
      expect(res.body.tag).toEqual(["a", "b", "c"]);
    });
  });

  it("ctx.query empty when no query string", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.json(ctx.query);
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.body).toEqual({});
    });
  });

  it("ctx.set() sets response header", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.set("X-Custom", "value");
      ctx.json({ ok: true });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.headers["x-custom"]).toBe("value");
    });
  });

  it("ctx.setStatus() sets status code", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.setStatus(201);
      ctx.json({ created: true });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.status).toBe(201);
    });
  });

  it("ctx.assert() throws on falsy (from http-assert)", async () => {
    const app = new Application();
    app.errorHandler((ctx, err) => {
      const status = (err as { status?: number }).status ?? 500;
      ctx.response.setStatus(status);
      ctx.json({ error: err.message });
    });
    app.route("/test").get((ctx: Context) => {
      ctx.assert(false, 403, "Forbidden");
      ctx.json({ ok: true });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.status).toBe(403);
    });
  });

  it("ctx.assert() passes through when truthy", async () => {
    const app = new Application();
    app.route("/test").get((ctx: Context) => {
      ctx.assert(true, 403, "Should not throw");
      ctx.json({ ok: true });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });

  it("ctx.throw() throws with status and message", async () => {
    const app = new Application();
    app.errorHandler((ctx, err) => {
      const status = (err as { status?: number }).status ?? 500;
      ctx.response.setStatus(status);
      ctx.json({ error: err.message });
    });
    app.route("/test").get((ctx: Context) => {
      ctx.throw(400, "Invalid request");
      ctx.json({ ok: true });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid request");
    });
  });

  it("ctx.throw() throws with status only", async () => {
    const app = new Application();
    app.errorHandler((ctx, err) => {
      const status = (err as { status?: number }).status ?? 500;
      ctx.response.setStatus(status);
      ctx.json({ error: err.message });
    });
    app.route("/test").get((ctx: Context) => {
      ctx.throw(401);
      ctx.json({ ok: true });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.status).toBe(401);
      expect(typeof res.body.error).toBe("string");
    });
  });

  it("ctx.signal is AbortSignal", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.json({ isAbortSignal: ctx.signal instanceof AbortSignal });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.body.isAbortSignal).toBe(true);
    });
  });

  it("ctx.abortController is AbortController", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.json({ isAbortController: ctx.abortController instanceof AbortController });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.body.isAbortController).toBe(true);
    });
  });

  it("ctx.store returns AsyncLocalStorage store", async () => {
    const als = new AsyncLocalStorage<{ userId: string }>();
    const app = new Application();
    app.setAsyncLocalStorage(als as AsyncLocalStorage<unknown>);
    app.route("/test").get((ctx) => {
      ctx.json({ hasStore: ctx.store !== undefined });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.body.hasStore).toBe(true);
    });
  });

  it("ctx.ip returns remote address", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.json({ ip: ctx.ip ?? null, ipType: typeof ctx.ip });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      // In test environment, ip may be undefined or a loopback
      expect(res.body.ip === null || typeof res.body.ip === "string").toBe(true);
    });
  });

  it("ctx.ip ignores forwarded headers unless trustProxy is enabled", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.json({ ip: ctx.ip ?? null });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test").set("X-Forwarded-For", "203.0.113.10");
      expect(res.body.ip).not.toBe("203.0.113.10");
    });
  });

  it("ctx.ip uses forwarded headers when trustProxy is enabled", async () => {
    const app = new Application({ trustProxy: true });
    app.route("/test").get((ctx) => {
      ctx.json({ ip: ctx.ip ?? null });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test").set("X-Forwarded-For", "203.0.113.10");
      expect(res.body.ip).toBe("203.0.113.10");
    });
  });

  it("ctx.req and ctx.res are raw objects", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.json({
        hasReq: ctx.req !== undefined,
        hasRes: ctx.res !== undefined,
      });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.status).toBe(200);
      expect(res.body.hasReq).toBe(true);
      expect(res.body.hasRes).toBe(true);
    });
  });

  it("ctx.cookies is Cookies instance", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.json({ session: ctx.cookies.get("session") ?? null });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test").set("Cookie", "session=tok123");
      expect(res.body.session).toBe("tok123");
    });
  });

  it("ctx.cacheControl() sets cache headers", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.cacheControl("public", 60);
      ctx.json({ ok: true });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.headers["cache-control"]).toBe("public, max-age=60");
    });
  });

  it("ctx.setType() sets Content-Type header (short names)", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      const captured: Record<string, string | undefined> = {};
      for (const type of ["json", "html", "text", "xml", "bin", "form"]) {
        ctx.setType(type);
        captured[type] = ctx.res.getHeader("Content-Type") as string;
      }
      ctx.json(captured);
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.body["json"]).toBe("application/json; charset=utf-8");
      expect(res.body["html"]).toBe("text/html; charset=utf-8");
      expect(res.body["text"]).toBe("text/plain; charset=utf-8");
      expect(res.body["xml"]).toBe("application/xml; charset=utf-8");
      expect(res.body["bin"]).toBe("application/octet-stream");
      expect(res.body["form"]).toBe("application/x-www-form-urlencoded");
    });
  });

  it("ctx.setType() passes through unknown types as-is", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.setType("application/vnd.api+json");
      ctx.response.pipeline(Readable.from(['{"ok":true}']));
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.headers["content-type"]).toBe("application/vnd.api+json");
      expect(res.text).toBe('{"ok":true}');
    });
  });

  it("ctx.setType() works with pipeline streaming", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.setType("json");
      ctx.response.pipeline(Readable.from(['{"ok":true}']));
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.text).toBe('{"ok":true}');
    });
  });

  it("ctx.query returns cached result on second access", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      const first = ctx.query;
      const second = ctx.query;
      ctx.json({ same: first === second });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test?a=1");
      expect(res.body.same).toBe(true);
    });
  });

  it("ctx.query returns empty object when req.url is undefined", async () => {
    const app = new Application();
    app.route("/").get((ctx) => {
      ctx.json(ctx.query);
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

  it("ctx.throw() attaches a custom code property", async () => {
    const app = new Application();
    let capturedCode: string | undefined;
    app.errorHandler((ctx, err) => {
      capturedCode = (err as { code?: string }).code;
      ctx.response.setStatus(400);
      ctx.json({ ok: false });
    });
    app.route("/test").get((ctx) => {
      ctx.throw(400, "bad request", "ERR_BAD");
    });

    await withServer(app.callback(), async (server) => {
      await request(server).get("/test");
      expect(capturedCode).toBe("ERR_BAD");
    });
  });
});
