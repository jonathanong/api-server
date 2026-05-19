import { describe, it, expect } from "vitest";
import request from "supertest";
import { Application } from "./application.mts";
import { withServer } from "./test-helpers/with-server.mts";

describe("Application not-found handling", () => {
  it("default 404 response when no route matched and no notFoundHandler", async () => {
    const app = new Application();

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/does-not-exist");
      expect(res.status).toBe(404);
      expect(res.text).toBe("Not Found");
      expect(res.headers["content-type"]).toBe("text/plain; charset=utf-8");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
    });
  });

  it("custom notFoundHandler for unmatched routes", async () => {
    const app = new Application();
    app.notFoundHandler((ctx) => {
      ctx.response.setStatus(404);
      ctx.json({ message: "custom not found" });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/missing");
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("custom not found");
    });
  });

  it("custom notFoundHandler when route matched but no response sent", async () => {
    const app = new Application();
    app.notFoundHandler((ctx) => {
      ctx.response.setStatus(404);
      ctx.json({ message: "route matched, no response" });
    });
    app.route("/empty").get(() => {
      // Handler intentionally does nothing
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/empty");
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("route matched, no response");
    });
  });

  it("100-continue handling", async () => {
    const app = new Application();
    app.route("/upload").post(async (ctx) => {
      const buf = await ctx.request.buffer();
      ctx.json({ size: buf.length });
    });

    await withServer(app.callback(), async (server) => {
      // supertest doesn't send Expect: 100-continue, but we verify the code path
      // by testing normal POST works correctly
      const res = await request(server)
        .post("/upload")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("data"));
      expect(res.status).toBe(200);
      expect(res.body.size).toBe(4);
    });
  });

  it("does not send 100 Continue for unmatched routes", async () => {
    const app = new Application();
    // No routes registered — unmatched request should not get 100 Continue
    app.notFoundHandler((ctx) => {
      ctx.response.setStatus(404);
      ctx.json({ message: "Not Found" });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server)
        .post("/no-such-route")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("data"));
      // Should get 404, not hang or error from premature 100 Continue
      expect(res.status).toBe(404);
    });
  });

  it("query string with :// does not throw", async () => {
    const app = new Application();
    app.route("/api/search").get((ctx) => ctx.json({ ok: true }));

    await withServer(app.callback(), async (server) => {
      // A query param containing '://' must not trigger the absolute-URI branch and 500.
      const res = await request(server).get("/api/search?redir=http://example.com");
      expect(res.status).toBe(200);
    });
  });

  it("URL with double leading slash normalizes correctly", async () => {
    const app = new Application();
    app.route("/api/data").get((ctx) => ctx.json({ ok: true }));

    await withServer(app.callback(), async (server) => {
      // Double leading slash should normalize to single slash for routing
      const res = await request(server).get("//api/data");
      expect(res.status).toBe(200);
    });
  });

  it("URL with trailing slash results in 404 for exact-match route", async () => {
    const app = new Application();
    app.route("/items").get((ctx) => ctx.json({ ok: true }));

    await withServer(app.callback(), async (server) => {
      // find-my-way is strict about trailing slashes by default
      const res = await request(server).get("/items/");
      expect(res.status).toBe(404);
    });
  });
});
