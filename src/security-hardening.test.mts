import { describe, expect, it } from "vitest";
import request from "supertest";
import { Application } from "./application.mts";
import { withServer } from "./test-helpers/with-server.mts";

describe("fallbackContentSecurityPolicy", () => {
  it("is disabled by default", async () => {
    const app = new Application();
    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/missing");
      expect(res.status).toBe(404);
      expect(res.headers["content-security-policy"]).toBeUndefined();
    });
  });

  it("applies only to framework-generated fallbacks", async () => {
    const app = new Application({
      fallbackContentSecurityPolicy: "default-src 'none'",
    });
    app.route("/html").get((ctx) => ctx.response.html("<h1>Hello</h1>"));
    app
      .route("/asset")
      .get((ctx) => ctx.response.buffer(Buffer.from("asset"), "application/octet-stream"));

    await withServer(app.callback(), async (server) => {
      const missing = await request(server).get("/missing");
      const html = await request(server).get("/html");
      const asset = await request(server).get("/asset");
      expect(missing.headers["content-security-policy"]).toBe("default-src 'none'");
      expect(html.headers["content-security-policy"]).toBeUndefined();
      expect(asset.headers["content-security-policy"]).toBeUndefined();
    });
  });

  it("covers error fallbacks and preserves a handler-supplied CSP", async () => {
    const app = new Application({
      fallbackContentSecurityPolicy: "default-src 'none'",
    });
    app.route("/error").get(() => {
      throw Object.assign(new Error("Bad Request"), { status: 400 });
    });
    app.route("/custom").get((ctx) => {
      ctx.set("Content-Security-Policy", "default-src 'self'");
      throw new Error("boom");
    });

    await withServer(app.callback(), async (server) => {
      const error = await request(server).get("/error");
      const custom = await request(server).get("/custom");
      expect(error.status).toBe(400);
      expect(error.headers["content-security-policy"]).toBe("default-src 'none'");
      expect(custom.status).toBe(500);
      expect(custom.headers["content-security-policy"]).toBe("default-src 'self'");
    });
  });

  it("applies to the custom error-handler safety fallback", async () => {
    const app = new Application({
      fallbackContentSecurityPolicy: "default-src 'none'",
    });
    app.errorHandler(() => {});
    app.route("/error").get(() => {
      throw new Error("boom");
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/error");
      expect(res.status).toBe(500);
      expect(res.headers["content-security-policy"]).toBe("default-src 'none'");
    });
  });
});

describe("strictHttpMethods", () => {
  it("preserves unknown-method not-found behavior when disabled", async () => {
    const result = await invokeWithMethod(new Application(), "CUSTOM");
    expect(result).toEqual({ status: 404, body: "Not Found" });
  });

  it("rejects unsupported methods with 400 when enabled", async () => {
    const app = new Application({ strictHttpMethods: true });
    const result = await invokeWithMethod(app, "__proto__");
    expect(result).toEqual({ status: 400, body: "Unsupported HTTP method" });
  });

  it("allows supported methods when enabled", async () => {
    const app = new Application({ strictHttpMethods: true });
    app.route("/").get((ctx) => ctx.json({ ok: true }));
    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });
});

async function invokeWithMethod(
  app: Application,
  method: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const headers = new Map<string, string | number | readonly string[]>();
    const req = {
      method,
      url: "/",
      headers: {},
      on: () => req,
    } as unknown as import("node:http").IncomingMessage;
    const mockRes = {
      headersSent: false,
      writableEnded: false,
      statusCode: 200,
      setHeader: (name: string, value: string | number | readonly string[]) => {
        headers.set(name.toLowerCase(), value);
      },
      getHeader: (name: string) => headers.get(name.toLowerCase()),
      once: () => mockRes,
      writeHead(status: number) {
        mockRes.statusCode = status;
        mockRes.headersSent = true;
      },
      end(body?: string) {
        resolve({ status: mockRes.statusCode, body: body ?? "" });
      },
    };
    const res = mockRes as unknown as import("node:http").ServerResponse;
    app.callback()(req, res);
  });
}
