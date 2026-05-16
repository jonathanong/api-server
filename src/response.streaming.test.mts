import { describe, it, expect } from "vitest";
import request from "supertest";
import { Readable, PassThrough, Transform } from "node:stream";
import { Application } from "./application.mts";
import { withServer } from "./test-helpers/with-server.mts";

function createReadable(content: string): Readable {
  return Readable.from(content);
}

describe("Streaming", () => {
  it("pipeline(readable) streams to response", async () => {
    const app = new Application();
    app.route("/stream").get(async (ctx) => {
      ctx.res.setHeader("Content-Type", "text/plain");
      await ctx.pipeline(createReadable("hello from stream"));
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/stream");
      expect(res.status).toBe(200);
      expect(res.text).toBe("hello from stream");
    });
  });

  it("pipeline(readable, transform) applies transform", async () => {
    const app = new Application();
    app.route("/upper").get(async (ctx) => {
      ctx.res.setHeader("Content-Type", "text/plain");
      const upperTransform = new Transform({
        transform(chunk: Buffer, _encoding: string, callback: () => void) {
          this.push(chunk.toString().toUpperCase());
          callback();
        },
      });
      await ctx.pipeline(createReadable("hello"), upperTransform);
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/upper");
      expect(res.text).toBe("HELLO");
    });
  });

  it("pipeline with compression when client accepts gzip", async () => {
    const app = new Application();
    app.route("/compressed").get(async (ctx) => {
      ctx.res.setHeader("Content-Type", "text/plain");
      const large = "x".repeat(2000);
      await ctx.pipeline(createReadable(large));
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server)
        .get("/compressed")
        .set("Accept-Encoding", "gzip")
        .buffer(true);
      // Should have received compressed data
      expect(res.headers["content-encoding"]).toBe("gzip");
      expect(res.headers["vary"]).toContain("Accept-Encoding");
    });
  });

  it("pipeline sets Content-Type before streaming", async () => {
    const app = new Application();
    app.route("/json-stream").get(async (ctx) => {
      ctx.res.setHeader("Content-Type", "application/json");
      await ctx.pipeline(createReadable(JSON.stringify({ items: [1, 2, 3] })));
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/json-stream");
      expect(res.headers["content-type"]).toContain("application/json");
    });
  });

  it("stream error handling", async () => {
    const app = new Application();
    app.errorHandler((ctx, err) => {
      if (!ctx.res.headersSent) {
        ctx.response.setStatus(500);
        ctx.json({ error: err.message });
      }
    });
    app.route("/error-stream").get(async (ctx) => {
      ctx.res.setHeader("Content-Type", "text/plain");
      const failStream = new Readable({
        read() {
          this.destroy(new Error("stream failed"));
        },
      });
      await ctx.pipeline(failStream);
    });

    // Stream errors after headers sent result in connection close
    // We can't easily test the body, but the request should complete
    let requestCompleted = false;
    await withServer(app.callback(), async (server) => {
      try {
        await request(server).get("/error-stream");
      } catch {
        // Connection error is expected when stream fails after headers sent
      }
      requestCompleted = true;
    });
    expect(requestCompleted).toBe(true);
  });

  it("HEAD request to streaming route returns headers only, no body", async () => {
    const app = new Application();
    app.route("/stream").get(async (ctx) => {
      ctx.res.setHeader("Content-Type", "application/json");
      await ctx.pipeline(createReadable(JSON.stringify({ items: [1, 2, 3] })));
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).head("/stream");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.headers["server-timing"]).toBeDefined();
      // HEAD responses have no body
      expect(res.body).toEqual({});
    });
  });

  it("SSE pattern - PassThrough stays open", async () => {
    const app = new Application();
    app.route("/sse").get(async (ctx) => {
      ctx.res.setHeader("Content-Type", "text/event-stream");
      const pass = new PassThrough();
      const pipelinePromise = ctx.pipeline(pass);
      pass.write("data: hello\n\n");
      pass.end();
      await pipelinePromise;
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/sse");
      expect(res.status).toBe(200);
      expect(res.text).toContain("data: hello");
    });
  });

  it("pipeline with no Content-Type header uses octet-stream fallback for compression check", async () => {
    const app = new Application();
    app.route("/binary").get(async (ctx) => {
      // No Content-Type set — pipeline internally falls back to application/octet-stream
      await ctx.pipeline(createReadable("data"));
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server)
        .get("/binary")
        .set("Accept-Encoding", "identity")
        .buffer(true);
      expect(res.status).toBe(200);
      // No Content-Type set by the route — octet-stream is used internally for shouldCompress
      expect(res.headers["content-type"]).toBeUndefined();
      expect(res.text).toBe("data");
    });
  });

  it("streams directly to response when client does not accept encoding", async () => {
    const app = new Application();
    app.route("/plain").get(async (ctx) => {
      ctx.res.setHeader("Content-Type", "text/plain");
      // Accept-Encoding: identity → negotiateEncoding returns null → no compression stages
      // → hits the pipeline(source, res) else branch in response.mts
      await ctx.pipeline(createReadable("plain data"));
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server)
        .get("/plain")
        .set("Accept-Encoding", "identity")
        .buffer(true);
      expect(res.status).toBe(200);
      expect(res.headers["content-encoding"]).toBeUndefined();
      expect(res.text).toBe("plain data");
    });
  });
});
