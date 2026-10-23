import { AsyncLocalStorage } from "node:async_hooks";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { Application } from "./application.mts";
import { withServer } from "./test-helpers/with-server.mts";

describe("Application callback completion", () => {
  it.each([
    { useStore: false, fail: false },
    { useStore: true, fail: false },
    { useStore: false, fail: true },
    { useStore: true, fail: true },
  ])(
    "joins the handler after its HTTP response (ALS $useStore, error $fail)",
    async ({ useStore, fail }) => {
      const app = new Application();
      const store = new AsyncLocalStorage<unknown>();
      if (useStore) app.setAsyncLocalStorage(store);
      const release = Promise.withResolvers<void>();
      app.route("/completion").get(async (ctx) => {
        if (fail) throw new Error("route failure");
        ctx.json({ hasStore: store.getStore() !== undefined });
        await release.promise;
      });
      app.errorHandler(async (ctx, error) => {
        ctx.setStatus(500);
        ctx.json({ message: error.message, hasStore: store.getStore() !== undefined });
        await release.promise;
      });
      const callback = app.callback();
      let completion: Promise<void> | undefined;
      try {
        await withServer(
          (req, res) => {
            completion = callback(req, res);
          },
          async (server) => {
            const response = await request(server)
              .get("/completion")
              .expect(fail ? 500 : 200);
            expect(response.body).toEqual(
              fail ? { message: "route failure", hasStore: useStore } : { hasStore: useStore },
            );
            expect(completion).toBeInstanceOf(Promise);
            let completed = false;
            const observed = completion!.then(() => {
              completed = true;
            });
            void observed.catch(() => undefined);
            await Promise.resolve();
            expect(completed).toBe(false);
            release.resolve();
            await expect(completion).resolves.toBeUndefined();
          },
        );
      } finally {
        release.resolve();
        try {
          await completion;
        } finally {
          store.disable();
        }
      }
    },
  );
});
