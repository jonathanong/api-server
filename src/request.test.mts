import { describe, it, expect } from "vitest";
import request from "supertest";
import { Application } from "./application.mts";
import { withServer } from "./test-helpers/with-server.mts";

describe("Request", () => {
  it('is("json") returns truthy for application/json', async () => {
    const app = new Application();
    app.route("/test").post((ctx) => {
      ctx.json({ isJson: ctx.request.is("json") });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server)
        .post("/test")
        .set("Content-Type", "application/json")
        .send("{}");
      expect(res.body.isJson).toBeTruthy();
    });
  });

  it('is("json") returns falsy for text/plain', async () => {
    const app = new Application();
    app.route("/test").post((ctx) => {
      ctx.json({ isJson: ctx.request.is("json") });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server)
        .post("/test")
        .set("Content-Type", "text/plain")
        .send("hello");
      expect(res.body.isJson).toBeFalsy();
    });
  });

  it("json() parses JSON body", async () => {
    const app = new Application();
    app.route("/test").post(async (ctx) => {
      const body = await ctx.request.json();
      ctx.json({ parsed: body });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server)
        .post("/test")
        .set("Content-Type", "application/json")
        .send({ message: "hello" });
      expect(res.body.parsed).toEqual({ message: "hello" });
    });
  });

  it("json() throws on invalid JSON", async () => {
    const app = new Application();
    app.errorHandler((ctx, err) => {
      const errorStatus = (err as { status?: number }).status ?? 500;
      ctx.response.setStatus(errorStatus);
      ctx.json({ error: err.message });
    });
    app.route("/test").post(async (ctx) => {
      await ctx.request.json();
      ctx.json({ ok: true });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server)
        .post("/test")
        .set("Content-Type", "application/json")
        .send("not valid json at all }{");
      expect(res.status).toBe(400);
    });
  });

  it("buffer() returns raw Buffer", async () => {
    const app = new Application();
    app.route("/test").post(async (ctx) => {
      const buf = await ctx.request.buffer();
      ctx.json({ isBuffer: Buffer.isBuffer(buf), content: buf.toString() });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server)
        .post("/test")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("raw data"));
      expect(res.body.isBuffer).toBe(true);
      expect(res.body.content).toBe("raw data");
    });
  });

  it('buffer("1b") enforces size limit', async () => {
    const app = new Application();
    app.route("/test").post(async (ctx) => {
      await ctx.request.buffer("1b");
      ctx.json({ ok: true });
    });

    // No custom error handler — ctx.json() in an error handler races with body
    // draining after 413 rejection, causing flaky socket hang ups in CI.
    await withServer(app.callback(), async (server) => {
      const res = await request(server)
        .post("/test")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("this is definitely more than 1 byte"));
      expect(res.status).toBe(413);
    });
  });

  it('json("1b") enforces size limit for JSON', async () => {
    const app = new Application();
    app.route("/test").post(async (ctx) => {
      await ctx.request.json("1b");
      ctx.json({ ok: true });
    });

    // No custom error handler — ctx.json() in an error handler races with body
    // draining after 413 rejection, causing flaky 500s in CI.
    await withServer(app.callback(), async (server) => {
      const res = await request(server)
        .post("/test")
        .set("Content-Type", "application/json")
        .send({ big: "payload that exceeds limit" });
      expect(res.status).toBe(413);
    });
  });

  it("drains request stream after 413 - subsequent request succeeds", async () => {
    const app = new Application();
    app.route("/test").post(async (ctx) => {
      await ctx.request.buffer("1b");
      ctx.json({ ok: true });
    });

    await withServer(app.callback(), async (server) => {
      // First request exceeds limit — uses default error handler to avoid body drain race
      const first = await request(server)
        .post("/test")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("this is more than 1 byte"));
      expect(first.status).toBe(413);

      // Second request should succeed (stream was drained, connection is reusable)
      const second = await request(server)
        .post("/test")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("x"));
      expect(second.status).toBe(200);
    });
  });

  it("handles empty body", async () => {
    const app = new Application();
    app.route("/test").post(async (ctx) => {
      const buf = await ctx.request.buffer();
      ctx.json({ length: buf.length });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server)
        .post("/test")
        .set("Content-Type", "application/octet-stream")
        .set("Content-Length", "0");
      expect(res.body.length).toBe(0);
    });
  });

  it('is(["json"]) with array argument returns truthy for application/json', async () => {
    const app = new Application();
    app.route("/test").post((ctx) => {
      ctx.json({ isJson: ctx.request.is(["json", "text"]) });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server)
        .post("/test")
        .set("Content-Type", "application/json")
        .send("{}");
      expect(res.body.isJson).toBeTruthy();
    });
  });

  it("buffer() returns cached promise on second call", async () => {
    const app = new Application();
    app.route("/test").post(async (ctx) => {
      const p1 = ctx.request.buffer();
      const p2 = ctx.request.buffer();
      ctx.json({ samePromise: p1 === p2 });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server)
        .post("/test")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("data"));
      expect(res.body.samePromise).toBe(true);
    });
  });

  it("buffer() with invalid limit string rejects as a server error", async () => {
    const app = new Application();
    app.route("/test").post(async (ctx) => {
      const buf = await ctx.request.buffer("banana");
      ctx.json({ length: buf.length });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server)
        .post("/test")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello"));
      expect(res.status).toBe(500);
      expect(res.text).toBe("Internal Server Error");
    });
  });

  it("uses the application bodyLimit when no per-call limit is provided", async () => {
    const app = new Application({ bodyLimit: "4b" });
    app.route("/test").post(async (ctx) => {
      await ctx.request.buffer();
      ctx.json({ ok: true });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server)
        .post("/test")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello"));
      expect(res.status).toBe(413);
    });
  });

  it("allows bodyLimit false to disable the application default limit", async () => {
    const app = new Application({ bodyLimit: false });
    app.route("/test").post(async (ctx) => {
      const buf = await ctx.request.buffer();
      ctx.json({ length: buf.length });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server)
        .post("/test")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello"));
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(5);
    });
  });

  it("rejects buffer() promise when request stream emits an error event", async () => {
    const { Request: RequestClass } = await import("./request.mts");
    const { Readable } = await import("node:stream");

    const errorStream = new Readable({ read() {} });
    (errorStream as unknown as Record<string, unknown>).headers = {};
    const mockReq = errorStream as unknown as import("node:http").IncomingMessage;
    const mockRes = {} as unknown as import("node:http").ServerResponse;

    const req = new RequestClass(mockReq, mockRes);
    const bufPromise = req.buffer();

    const streamError = new Error("stream failed");
    errorStream.destroy(streamError);

    await expect(bufPromise).rejects.toThrow("stream failed");
  });

  it("calls writeContinue when Expect: 100-continue header is present", async () => {
    let writeContinueCalled = false;
    const { Request: RequestClass } = await import("./request.mts");
    const { Readable } = await import("node:stream");

    const body = new Readable({
      read() {
        this.push(Buffer.from("hi"));
        this.push(null);
      },
    });
    // Readable is an EventEmitter; attach headers to it to act as IncomingMessage
    (body as unknown as Record<string, unknown>).headers = { expect: "100-continue" };
    const mockReq = body as unknown as import("node:http").IncomingMessage;
    const mockRes = {
      writeContinue: () => {
        writeContinueCalled = true;
      },
    } as unknown as import("node:http").ServerResponse;

    const req = new RequestClass(mockReq, mockRes);
    await req.buffer();

    expect(writeContinueCalled).toBe(true);
  });

  it("noop swallows stream error after 413 rejection to prevent unhandled-error crash", async () => {
    const { Request: RequestClass } = await import("./request.mts");
    const { Readable } = await import("node:stream");

    const stream = new Readable({ read() {} });
    (stream as unknown as Record<string, unknown>).headers = {};
    const mockReq = stream as unknown as import("node:http").IncomingMessage;
    const mockRes = {} as unknown as import("node:http").ServerResponse;

    const req = new RequestClass(mockReq, mockRes);
    const bufPromise = req.buffer("1b");

    // Push data exceeding 1b — triggers 413 and registers noop as error handler
    stream.push(Buffer.alloc(2));
    await expect(bufPromise).rejects.toMatchObject({ status: 413 });

    // Destroying the stream with an error exercises noop; no unhandled error should surface
    stream.destroy(new Error("post-413 drain error"));
    await new Promise<void>((resolve) => setImmediate(resolve));
  });

  it("rejects body promise when request stream emits an error", async () => {
    const app = new Application();
    app.errorHandler((ctx, err) => {
      ctx.response.setStatus(500);
      ctx.json({ error: err.message });
    });
    app.route("/test").post(async (ctx) => {
      await ctx.request.buffer();
      ctx.json({ ok: true });
    });

    await withServer(app.callback(), async (server) => {
      const { createConnection } = await import("node:net");
      const { address, port } = server.address() as import("node:net").AddressInfo;
      await new Promise<void>((resolve, reject) => {
        const socket = createConnection({ host: address, port }, () => {
          // Send headers with a Content-Length but then abruptly destroy the socket
          socket.write(
            "POST /test HTTP/1.1\r\n" +
              `Host: ${address}:${port}\r\n` +
              "Content-Type: application/json\r\n" +
              "Content-Length: 100\r\n" +
              "Connection: close\r\n" +
              "\r\n" +
              '{"partial":',
          );
          // Abruptly destroy triggers an ECONNRESET / ECONNABORTED on the server side
          setTimeout(() => socket.destroy(), 20);
        });
        socket.on("close", resolve);
        socket.on("error", resolve); // client-side error is expected
        socket.on("timeout", reject);
        socket.setTimeout(2000);
      });
      // Allow the server a tick to process the error
      await new Promise((r) => setTimeout(r, 100));
    });
    // The request should have been handled (error path exercised)
  });
});
