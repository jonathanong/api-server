import { describe, expect, it } from "vitest";
import request from "supertest";
import { Application, type MatchedRoute } from "./index.mts";
import { withServer } from "./test-helpers/with-server.mts";

describe("Application.matchRoute", () => {
  it("returns the registered template and params using normal request path handling", () => {
    const app = new Application();
    app.route("/users/:userId/posts/:postId").get((ctx) => ctx.json(ctx.params));

    const matched: MatchedRoute | null = app.matchRoute(
      "GET",
      "https://example.com//users/alice/posts/42?view=full",
    );
    expect(matched).toEqual({
      template: "/users/:userId/posts/:postId",
      params: { userId: "alice", postId: "42" },
    });
    expect(app.matchRoute("HEAD", "/users/alice/posts/42")?.template).toBe(
      "/users/:userId/posts/:postId",
    );
  });

  it("follows static route precedence and leaves unmatched methods and paths null", async () => {
    const app = new Application();
    app.route("/users/:id").get((ctx) => ctx.json({ kind: "parameter", id: ctx.params.id }));
    app.route("/users/me").get((ctx) => ctx.json({ kind: "static" }));

    expect(app.matchRoute("GET", "/users/me")).toEqual({
      template: "/users/me",
      params: {},
    });
    expect(app.matchRoute("GET", "/users/alice")).toEqual({
      template: "/users/:id",
      params: { id: "alice" },
    });
    expect(app.matchRoute("POST", "/users/me")).toBeNull();
    expect(app.matchRoute("GET", "/missing")).toBeNull();

    await withServer(app.callback(), async (server) => {
      expect((await request(server).get("/users/me")).body).toEqual({ kind: "static" });
      expect((await request(server).get("/users/alice")).body).toEqual({
        kind: "parameter",
        id: "alice",
      });
      expect((await request(server).post("/users/me")).status).toBe(404);
    });
  });

  it("matches encoded non-UUID values and the root path without changing method behavior", () => {
    const app = new Application();
    app.route("/").get((ctx) => ctx.json({ root: true }));
    app.route("/my/email-addresses/:email").delete((ctx) => ctx.setStatus(204));

    expect(app.matchRoute("GET", "")).toEqual({ template: "/", params: {} });
    expect(app.matchRoute("DELETE", "/my/email-addresses/tests%2Bcase%40example.com")).toEqual({
      template: "/my/email-addresses/:email",
      params: { email: "tests+case@example.com" },
    });
    expect(app.matchRoute("GET", "/my/email-addresses/tests%2Bcase%40example.com")).toBeNull();
  });
});
