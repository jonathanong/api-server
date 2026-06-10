import { test, expect } from "vitest";
import request from "supertest";
import { Application } from "./application.mts";
import { withServer } from "./test-helpers/with-server.mts";

test("json() accepts any Content-Type by default (lenient mode)", async () => {
  const app = new Application();
  app.route("/transfer").post(async (ctx) => {
    const body = await ctx.request.json<{ amount: number }>();
    ctx.json({ success: true, amount: body.amount });
  });

  await withServer(app.callback(), async (server) => {
    // Default mode: text/plain with JSON body is parsed without error
    const res = await request(server)
      .post("/transfer")
      .set("Content-Type", "text/plain")
      .send('{"amount": 9999}');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, amount: 9999 });
  });
});

test("json() with strictJsonContentType rejects non-JSON Content-Type with 415", async () => {
  const app = new Application({ strictJsonContentType: true });
  app.route("/transfer").post(async (ctx) => {
    const body = await ctx.request.json<{ amount: number }>();
    ctx.json({ success: true, amount: body.amount });
  });

  await withServer(app.callback(), async (server) => {
    // Strict mode: text/plain is rejected with 415 to prevent JSON CSRF
    const res = await request(server)
      .post("/transfer")
      .set("Content-Type", "text/plain")
      .send('{"amount": 9999}');

    expect(res.status).toBe(415);
    expect(res.text).toBe("Unsupported Media Type");
  });
});

test("json() with strictJsonContentType accepts application/json", async () => {
  const app = new Application({ strictJsonContentType: true });
  app.route("/transfer").post(async (ctx) => {
    const body = await ctx.request.json<{ amount: number }>();
    ctx.json({ success: true, amount: body.amount });
  });

  await withServer(app.callback(), async (server) => {
    const res = await request(server)
      .post("/transfer")
      .set("Content-Type", "application/json")
      .send('{"amount": 9999}');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, amount: 9999 });
  });
});

test("json() with strictJsonContentType accepts application/*+json subtypes", async () => {
  const app = new Application({ strictJsonContentType: true });
  app.route("/patch").patch(async (ctx) => {
    const body = await ctx.request.json<{ op: string }>();
    ctx.json({ applied: body.op });
  });

  await withServer(app.callback(), async (server) => {
    // JSON subtypes like merge-patch+json must be accepted in strict mode
    const res = await request(server)
      .patch("/patch")
      .set("Content-Type", "application/merge-patch+json")
      .send('{"op": "replace"}');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ applied: "replace" });
  });
});

test("json() with strictJsonContentType and no body does not throw 415", async () => {
  const app = new Application({ strictJsonContentType: true });
  app.errorHandler((ctx, err) => {
    const status = (err as { status?: number }).status ?? 500;
    ctx.response.setStatus(status);
    ctx.json({ error: err.message });
  });
  app.route("/empty").post(async (ctx) => {
    await ctx.request.json();
    ctx.json({ ok: true });
  });

  await withServer(app.callback(), async (server) => {
    // No Content-Type and no body: type-is returns null, must not 415
    const res = await request(server).post("/empty").set("Content-Length", "0");

    // Empty body results in invalid JSON (400), not unsupported media type (415)
    expect(res.status).toBe(400);
  });
});
