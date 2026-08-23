import http from "node:http";
import http2 from "node:http2";
import { EventEmitter } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { Application } from "./application.mts";
import { assertAcceptedMutationMediaType } from "./mutation-media-type.mts";
import { withServer } from "./test-helpers/with-server.mts";

describe("mutation request media types", () => {
  it("hands accepted request error ownership to the handler without yielding", async () => {
    const { Readable } = await import("node:stream");
    const app = new Application();
    app.route("/owned").post(async (ctx) => {
      const handlerOwnedError = await new Promise<boolean>((resolve) => {
        ctx.req.once("error", () => resolve(true));
      });
      ctx.json({ handlerOwnedError });
    });
    const req = new Readable({ read() {} }) as unknown as import("node:http").IncomingMessage;
    Object.assign(req, {
      method: "POST",
      url: "/owned",
      headers: { "content-type": "application/json" },
      httpVersionMajor: 2,
    });
    let responseBody = "";
    const res = makeMockResponse((body) => {
      responseBody = body;
    });
    let uncaught: Error | undefined;
    const onUncaught = (error: Error) => {
      uncaught = error;
    };
    process.once("uncaughtException", onUncaught);
    try {
      app.callback()(req, res);
      (req as unknown as import("node:stream").Readable).destroy(new Error("handler-owned"));
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(JSON.parse(responseBody)).toEqual({ handlerOwnedError: true });
      expect(uncaught).toBeUndefined();
    } finally {
      process.removeListener("uncaughtException", onUncaught);
    }
  });

  it("owns errors after rejecting an HTTP/2 stream's first data chunk", async () => {
    const { Readable } = await import("node:stream");
    const stream = new Readable({ read() {} });
    Object.assign(stream, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      httpVersionMajor: 2,
    });
    const req = stream as unknown as import("node:http").IncomingMessage;
    const checking = assertAcceptedMutationMediaType(req);
    stream.push("body");
    await expect(checking).rejects.toMatchObject({ status: 415 });
    stream.destroy(new Error("after first chunk"));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(stream.listenerCount("error")).toBeGreaterThan(0);
  });

  it("drains unread accepted and rejected HTTP/2 mutation bodies", async () => {
    const app = new Application();
    let acceptedRequest: import("node:http").IncomingMessage | undefined;
    app.route("/accepted").post((ctx) => {
      acceptedRequest = ctx.req;
      ctx.json({ ok: true });
    });
    app.route("/rejected").post((ctx) => ctx.json({ reached: true }));
    const body = "x".repeat(256 * 1024);

    await withHttp2(app, async (client) => {
      expect((await sendHttp2(client, "/accepted", "application/json", body)).status).toBe(200);
      expect((await sendHttp2(client, "/rejected", "text/plain", body)).status).toBe(415);
      expect((await sendHttp2(client, "/unmatched", "application/json", body)).status).toBe(404);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(acceptedRequest?.readableEnded).toBe(true);
    });
  });

  it("handles HTTP/2 DATA bodies before the handler", async () => {
    const app = new Application();
    let handlerRan = false;
    app.route("/transfer").post(async (ctx) => {
      handlerRan = true;
      const body = await ctx.request.buffer();
      ctx.json({ body: body.toString() });
    });

    await withHttp2(app, async (client) => {
      expect((await sendHttp2(client, "/transfer", "text/plain", "amount=10")).status).toBe(415);
      expect(handlerRan).toBe(false);
      const accepted = await sendHttp2(client, "/transfer", "application/json", '{"amount":10}');
      expect(accepted).toEqual({ status: 200, body: '{"body":"{\\"amount\\":10}"}' });
    });
  });

  it("allows HTTP/2 mutations with no body framing", async () => {
    const app = new Application();
    app.route("/empty").post((ctx) => ctx.json({ ok: true }));

    await withHttp2(app, async (client) => {
      expect(await sendHttp2(client, "/empty")).toEqual({ status: 200, body: '{"ok":true}' });
    });
  });

  it("matches general declared media-type wildcards", async () => {
    const app = new Application();
    app.route("/any").post((ctx) => ctx.json({ ok: true }), { acceptedMediaTypes: ["*/*"] });
    app.route("/image").post((ctx) => ctx.json({ ok: true }), { acceptedMediaTypes: ["image/*"] });
    app.route("/pattern").post((ctx) => ctx.json({ ok: true }), {
      acceptedMediaTypes: ["application/*foo*bar*"],
    });

    await withServer(app.callback(), async (server) => {
      expect((await request(server).post("/any").type("text").send("hello")).status).toBe(200);
      expect(
        (await request(server).post("/image").type("png").send(Buffer.from("image"))).status,
      ).toBe(200);
      expect((await request(server).post("/image").send({ not: "an image" })).status).toBe(415);
      expect(
        (
          await request(server)
            .post("/pattern")
            .set("Content-Type", "application/foo-bar-baz")
            .send("x")
        ).status,
      ).toBe(200);
    });
  });

  it("propagates HTTP/2 stream errors while checking body framing", async () => {
    const { Readable } = await import("node:stream");
    const stream = new Readable({ read() {} });
    Object.assign(stream, { method: "POST", headers: {}, httpVersionMajor: 2 });
    const req = stream as unknown as import("node:http").IncomingMessage;
    const checking = assertAcceptedMutationMediaType(req);
    stream.destroy(new Error("stream failed"));
    await expect(checking).rejects.toThrow("stream failed");
  });

  it("applies JSON suffix, bodyless, and route exceptions to every mutation method", async () => {
    const app = new Application();
    const methods = ["post", "put", "patch", "delete"] as const;
    for (const method of methods) {
      app.route(`/${method}`)[method]((ctx) => ctx.json({ method }));
      app.route(`/${method}/form`)[method]((ctx) => ctx.json({ method }), {
        acceptedMediaTypes: ["application/x-www-form-urlencoded"],
      });
    }

    await withServer(app.callback(), async (server) => {
      for (const method of methods) {
        expect(
          (
            await request(server)
              [method](`/${method}`)
              .set("Content-Type", "application/example+json")
              .send("{}")
          ).status,
        ).toBe(200);
        expect((await request(server)[method](`/${method}`)).status).toBe(200);
        expect(
          (await request(server)[method](`/${method}/form`).type("form").send({ ok: "true" }))
            .status,
        ).toBe(200);
      }
    });
  });

  it("accepts JSON bodies for every mutation method", async () => {
    const app = new Application();
    for (const method of ["post", "put", "patch", "delete"] as const) {
      app.route(`/${method}`)[method]((ctx) => ctx.json({ method }));
    }

    await withServer(app.callback(), async (server) => {
      for (const method of ["post", "put", "patch", "delete"] as const) {
        const response = await request(server)[method](`/${method}`).send({ ok: true });
        expect(response.status).toBe(200);
      }
    });
  });

  it("accepts JSON suffix media types with parameters and mixed case", async () => {
    const app = new Application();
    app.route("/patch").patch((ctx) => ctx.json({ ok: true }));

    await withServer(app.callback(), async (server) => {
      const response = await request(server)
        .patch("/patch")
        .set("Content-Type", "Application/Merge-Patch+Json; Charset=UTF-8")
        .send('{"ok":true}');
      expect(response.status).toBe(200);
    });
  });

  it("allows mutations with an absent or zero-length body", async () => {
    const app = new Application();
    app.route("/empty").post((ctx) => ctx.json({ ok: true }));

    await withServer(app.callback(), async (server) => {
      expect((await request(server).post("/empty")).status).toBe(200);
      expect((await request(server).post("/empty").set("Content-Length", "0")).status).toBe(200);
    });
  });

  it("rejects non-JSON bodies before a matched handler runs", async () => {
    const app = new Application();
    let handlerRan = false;
    app.route("/transfer").post((ctx) => {
      handlerRan = true;
      ctx.json({ reached: true });
    });

    await withServer(app.callback(), async (server) => {
      const response = await request(server)
        .post("/transfer")
        .set("Content-Type", "text/plain")
        .send("amount=10");
      expect(response.status).toBe(415);
      expect(response.text).toBe("Unsupported Media Type");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      const { address, port } = server.address() as AddressInfo;
      const missingType = await sendChunkedRequest(address, port);
      expect(missingType.statusCode).toBe(415);
      expect(handlerRan).toBe(false);
    });
  });

  it("rejects non-JSON bodies for unknown mutation paths", async () => {
    const app = new Application();

    await withServer(app.callback(), async (server) => {
      const response = await request(server)
        .delete("/missing")
        .set("Content-Type", "text/plain")
        .send("remove=true");
      expect(response.status).toBe(415);
    });
  });

  it("allows a route to explicitly accept form bodies", async () => {
    const app = new Application();
    app.route("/unsubscribe").post((ctx) => ctx.json({ unsubscribed: true }), {
      acceptedMediaTypes: ["application/x-www-form-urlencoded"],
    });

    await withServer(app.callback(), async (server) => {
      const response = await request(server)
        .post("/unsubscribe")
        .type("form")
        .send({ token: "abc" });
      expect(response.status).toBe(200);
      expect((await request(server).post("/unsubscribe").send({ token: "abc" })).status).toBe(415);
    });
  });

  it("treats transfer encoding as a body indicator", async () => {
    const app = new Application();
    app.route("/transfer").post((ctx) => ctx.json({ reached: true }));

    await withServer(app.callback(), async (server) => {
      const { address, port } = server.address() as AddressInfo;
      const response = await sendChunkedRequest(address, port, "text/plain");
      expect(response.statusCode).toBe(415);
    });
  });

  it("leaves GET and HEAD requests unaffected", async () => {
    const app = new Application();
    app.route("/read").get((ctx) => ctx.json({ ok: true }));

    await withServer(app.callback(), async (server) => {
      expect((await request(server).get("/read").send("not json")).status).toBe(200);
      expect((await request(server).head("/read")).status).toBe(200);
    });
  });
});

function sendChunkedRequest(
  host: string,
  port: number,
  contentType?: string,
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host,
      port,
      path: "/transfer",
      method: "POST",
      headers: {
        ...(contentType ? { "Content-Type": contentType } : {}),
        "Transfer-Encoding": "chunked",
      },
    });
    req.once("response", resolve);
    req.once("error", reject);
    req.end("amount=10");
  });
}

async function withHttp2(
  app: Application,
  fn: (client: http2.ClientHttp2Session) => Promise<void>,
): Promise<void> {
  const server = http2.createServer(
    app.callback() as unknown as (
      req: http2.Http2ServerRequest,
      res: http2.Http2ServerResponse,
    ) => void,
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const client = http2.connect(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  try {
    await fn(client);
  } finally {
    client.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function sendHttp2(
  client: http2.ClientHttp2Session,
  path: string,
  contentType?: string,
  body?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = client.request({
      ":method": "POST",
      ":path": path,
      ...(contentType ? { "content-type": contentType } : {}),
    });
    const chunks: Buffer[] = [];
    let status = 0;
    req.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString() }));
    req.on("error", reject);
    req.end(body);
  });
}

function makeMockResponse(onEnd: (body: string) => void): import("node:http").ServerResponse {
  const response = new EventEmitter();
  return Object.assign(response, {
    headersSent: false,
    writableEnded: false,
    statusCode: 200,
    setHeader: () => {},
    getHeader: () => undefined,
    writeHead: () => {},
    end: (body: string | Buffer) => onEnd(String(body)),
  }) as unknown as import("node:http").ServerResponse;
}
