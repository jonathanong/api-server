import { describe, it, expect } from "vitest";
import request from "supertest";
import { Application } from "./application.mts";
import { withServer } from "./test-helpers/with-server.mts";

describe("Router", () => {
  it("registers GET route", async () => {
    const app = new Application();
    app.route("/items").get((ctx) => {
      ctx.json({ items: [] });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/items");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [] });
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
      ctx.json({ updated: ctx.params.id });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).put("/items/42");
      expect(res.body.updated).toBe("42");
    });
  });

  it("registers DELETE route", async () => {
    const app = new Application();
    app.route("/items/:id").delete((ctx) => {
      ctx.setStatus(204);
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).delete("/items/42");
      expect(res.status).toBe(204);
    });
  });

  it("registers PATCH route", async () => {
    const app = new Application();
    app.route("/items/:id").patch((ctx) => {
      ctx.json({ patched: ctx.params.id });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).patch("/items/99");
      expect(res.body.patched).toBe("99");
    });
  });

  it("method chaining .get().post()", async () => {
    const app = new Application();
    app
      .route("/items")
      .get((ctx) => {
        ctx.json({ method: "GET" });
      })
      .post((ctx) => {
        ctx.json({ method: "POST" });
      });

    await withServer(app.callback(), async (server) => {
      const get = await request(server).get("/items");
      expect(get.body.method).toBe("GET");

      const post = await request(server).post("/items");
      expect(post.body.method).toBe("POST");
    });
  });

  it("404 for unregistered route", async () => {
    const app = new Application();

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  it("route with params", async () => {
    const app = new Application();
    app.route("/users/:userId/posts/:postId").get((ctx) => {
      ctx.json({ userId: ctx.params.userId, postId: ctx.params.postId });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/users/abc/posts/xyz");
      expect(res.body).toEqual({ userId: "abc", postId: "xyz" });
    });
  });

  it("route with query string", async () => {
    const app = new Application();
    app.route("/search").get((ctx) => {
      ctx.json({ q: ctx.query.q });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/search?q=hello");
      expect(res.body.q).toBe("hello");
    });
  });

  it("wildcard routes", async () => {
    const app = new Application();
    app.route("/files/*").get((ctx) => {
      ctx.json({ wildcard: ctx.params["*"] });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/files/a/b/c");
      expect(res.status).toBe(200);
    });
  });
});
