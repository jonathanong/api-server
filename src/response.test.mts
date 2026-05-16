import { describe, it, expect } from "vitest";
import request from "supertest";
import { Application } from "./application.mts";
import { withServer } from "./test-helpers/with-server.mts";

describe("Response", () => {
  it("json(data) sends correct Content-Type and body", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.json({ hello: "world" });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.body).toEqual({ hello: "world" });
    });
  });

  it("response.text(data) sends text/plain", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.response.text("hello text");
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/plain");
      expect(res.text).toBe("hello text");
    });
  });

  it("response.html(data) sends text/html", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.response.html("<h1>Hello</h1>");
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
    });
  });

  it("response.xml(data) sends application/xml", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.response.xml("<root/>");
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/xml");
    });
  });

  it("response.buffer(data, contentType) sends raw buffer", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.response.buffer(Buffer.from("raw"), "application/octet-stream");
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/octet-stream");
    });
  });

  it("status 201 with json", async () => {
    const app = new Application();
    app.route("/test").post((ctx) => {
      ctx.setStatus(201);
      ctx.json({ created: true });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).post("/test");
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ created: true });
    });
  });

  it("status 204 - empty body, no response method needed", async () => {
    const app = new Application();
    app.route("/test").delete((ctx) => {
      ctx.setStatus(204);
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).delete("/test");
      expect(res.status).toBe(204);
      expect(res.text).toBe("");
    });
  });

  it("status 205 - empty body, no response method needed", async () => {
    const app = new Application();
    app.route("/test").post((ctx) => {
      ctx.setStatus(205);
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).post("/test");
      expect(res.status).toBe(205);
      expect(res.text).toBe("");
    });
  });

  it("calling json() after setStatus(204) throws double-send error", async () => {
    const app = new Application();
    const errorPromise = new Promise<Error>((resolve) => {
      app.on("error", (err: Error) => resolve(err));
    });
    app.route("/test").delete((ctx) => {
      ctx.setStatus(204);
      ctx.json({});
    });

    const cb = app.callback();
    const mockReq = {
      method: "DELETE",
      url: "/test",
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
    expect(error.message).toContain("already sent");
  });

  it("HEAD request - headers but no body", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.json({ hello: "world" });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).head("/test");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      // HEAD responses have no body
      expect(res.body).toEqual({});
    });
  });

  it("double-send throws error", async () => {
    const app = new Application();
    const errorPromise = new Promise<Error>((resolve) => {
      app.on("error", (err: Error) => resolve(err));
    });
    app.route("/test").get((ctx) => {
      ctx.json({ first: true });
      ctx.json({ second: true });
    });

    const cb = app.callback();
    const mockReq = {
      method: "GET",
      url: "/test",
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
    expect(error.message).toContain("already sent");
  });

  it("custom status via setStatus() before json()", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.setStatus(202);
      ctx.json({ accepted: true });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.status).toBe(202);
    });
  });

  it("sets ETag header on buffered responses", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.json({ hello: "world" });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.headers["etag"]).toBeDefined();
      expect(res.headers["etag"]).toMatch(/^"/);
    });
  });

  it("returns 304 for fresh GET with matching ETag", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.json({ hello: "world" });
    });

    await withServer(app.callback(), async (server) => {
      const first = await request(server).get("/test");
      const etag = first.headers["etag"];

      const second = await request(server).get("/test").set("If-None-Match", etag);
      expect(second.status).toBe(304);
    });
  });

  it("sets Server-Timing header", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.json({ ok: true });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.headers["server-timing"]).toBeDefined();
    });
  });

  it("does not set ETag on non-2xx responses", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.setStatus(401);
      ctx.json({ error: "Unauthorized" });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.status).toBe(401);
      expect(res.headers["etag"]).toBeUndefined();
    });
  });

  it("does not set ETag on 4xx responses", async () => {
    const app = new Application();
    app.route("/test").get((ctx) => {
      ctx.setStatus(404);
      ctx.json({ error: "Not Found" });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/test");
      expect(res.status).toBe(404);
      expect(res.headers["etag"]).toBeUndefined();
    });
  });

  it("pipeline() throws when called a second time", async () => {
    const app = new Application();
    const errors: Error[] = [];
    app.on("error", (err: Error) => errors.push(err));
    app.route("/test").get(async (ctx) => {
      const { Readable } = await import("node:stream");
      ctx.res.setHeader("Content-Type", "text/plain");
      await ctx.pipeline(Readable.from("first"));
      // Second call on the response object directly — responseSent is already true
      await ctx.response.pipeline(Readable.from("second"));
    });

    await withServer(app.callback(), async (server) => {
      try {
        await request(server).get("/test").set("Accept-Encoding", "identity");
      } catch {
        // Connection may close after first pipeline
      }
    });

    expect(errors.some((e) => e.message.includes("already sent"))).toBe(true);
  });

  it("setStatus(204) twice throws via empty()", async () => {
    const app = new Application();
    const errorPromise = new Promise<Error>((resolve) => {
      app.on("error", resolve);
    });
    app.route("/test").delete((ctx) => {
      ctx.setStatus(204);
      ctx.setStatus(204);
    });

    const cb = app.callback();
    const mockReq = {
      method: "DELETE",
      url: "/test",
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

    const error = await errorPromise;
    expect(error.message).toContain("already sent");
  });

  it("Response constructed without onWriteHead uses null callback", async () => {
    const { Response: ResponseClass } = await import("./response.mts");
    const { ServerTiming } = await import("./server-timing.mts");

    const timing = new ServerTiming();
    const mockReq = { method: "GET", headers: {} } as import("node:http").IncomingMessage;
    const chunks: Buffer[] = [];
    const mockRes = {
      headersSent: false,
      writableEnded: false,
      statusCode: 200,
      setHeader: () => {},
      getHeader: () => undefined,
      writeHead: (s: number) => {
        mockRes.statusCode = s;
      },
      end: (data?: Buffer | string) => {
        if (data) chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
      },
    } as unknown as import("node:http").ServerResponse;

    // Construct without onWriteHead — the ?? null branch on line 25
    const resp = new ResponseClass(mockReq, mockRes, timing);
    resp.empty();
    expect(resp.sent).toBe(true);
    expect(mockRes.statusCode).toBe(200);
  });

  it("compresses buffered response when body exceeds threshold and client accepts encoding", async () => {
    const app = new Application();
    app.route("/big").get((ctx) => {
      // body > 1024 bytes triggers compression
      ctx.json({ data: "x".repeat(2000) });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server)
        .get("/big")
        .set("Accept-Encoding", "gzip")
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => callback(null, Buffer.concat(chunks)));
        });
      expect(res.headers["content-encoding"]).toBe("gzip");
      expect(res.headers["vary"]).toContain("Accept-Encoding");
    });
  });
});
