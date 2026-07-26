import type { RequestListener, Server, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { Application } from "./application.mts";
import { withServer } from "./test-helpers/with-server.mts";

type RequestState = {
  response: ServerResponse;
  signal: AbortSignal;
  closeListeners: number;
  maxListeners: number;
  cooperativeLimit?: number;
};

function instrumentResponses(
  callback: RequestListener,
  maxListeners: number,
  closeListeners: number,
): RequestListener {
  return (req, res) => {
    if (req.url !== "/state") {
      res.setMaxListeners(maxListeners);
      for (let index = 0; index < closeListeners; index += 1) {
        res.once("close", () => {});
      }
      const once = res.once.bind(res);
      res.once = ((event: string | symbol, listener: (...args: unknown[]) => void) => {
        const response = once(event, listener);
        if (event === "close") {
          const limit = res.getMaxListeners();
          if (limit > 0 && Number.isFinite(limit)) {
            expect(res.listenerCount("close")).toBeLessThanOrEqual(limit);
          }
        }
        return response;
      }) as typeof res.once;
    }
    callback(req, res);
  };
}

function addStateRoute(app: Application, getState: () => RequestState | undefined): void {
  app.route("/state").get((ctx) => {
    const state = getState();
    ctx.json({
      aborted: state?.signal.aborted ?? null,
      closeListeners: state?.response.listenerCount("close") ?? null,
      maxListeners: state?.response.getMaxListeners() ?? null,
      cooperativeLimit: state?.cooperativeLimit ?? null,
    });
  });
}

async function expectState(
  server: Server,
  expected: {
    aborted: boolean;
    closeListeners?: number;
    maxListeners: number;
    cooperativeLimit?: number;
  },
): Promise<void> {
  await expect
    .poll(async () => {
      const response = await request(server).get("/state");
      return response.body as Record<string, unknown>;
    })
    .toMatchObject(expected);
}

describe("request abort response listener budget", () => {
  it("reserves and releases one finite listener slot on normal close", async () => {
    const app = new Application();
    let state: RequestState | undefined;
    app.route("/done").get((ctx) => {
      state = {
        response: ctx.res,
        signal: ctx.signal,
        closeListeners: ctx.res.listenerCount("close"),
        maxListeners: ctx.res.getMaxListeners(),
      };
      ctx.json({
        closeListeners: state.closeListeners,
        maxListeners: state.maxListeners,
      });
    });
    addStateRoute(app, () => state);

    await withServer(instrumentResponses(app.callback(), 10, 10), async (server) => {
      await request(server).get("/done").expect(200, { closeListeners: 11, maxListeners: 11 });
      await expectState(server, {
        aborted: false,
        closeListeners: 0,
        maxListeners: 10,
      });
    });
  });

  it("aborts and releases its slot when a streaming client disconnects", async () => {
    const app = new Application();
    let state: RequestState | undefined;
    app.route("/stream").get(async (ctx) => {
      const stream = new PassThrough();
      const pipeline = ctx.pipeline(stream);
      state = {
        response: ctx.res,
        signal: ctx.signal,
        closeListeners: ctx.res.listenerCount("close"),
        maxListeners: ctx.res.getMaxListeners(),
      };
      stream.write("ready");
      try {
        await pipeline;
      } catch (error) {
        if (!ctx.signal.aborted) throw error;
      }
    });
    addStateRoute(app, () => state);

    await withServer(instrumentResponses(app.callback(), 10, 3), async (server) => {
      const client = request(server).get("/stream").buffer(false);
      client.on("response", (response) => {
        response.on("error", () => {});
        response.once("data", () => client.abort());
      });
      await client.catch(() => {});

      expect(state?.closeListeners).toBeLessThanOrEqual(state?.maxListeners ?? 0);
      await expectState(server, {
        aborted: true,
        maxListeners: 10,
      });
    });
  });

  it.each([0, Number.POSITIVE_INFINITY])(
    "preserves an unlimited listener limit of %s",
    async (maxListeners) => {
      const app = new Application();
      let state: RequestState | undefined;
      app.route("/done").get((ctx) => {
        state = {
          response: ctx.res,
          signal: ctx.signal,
          closeListeners: ctx.res.listenerCount("close"),
          maxListeners: ctx.res.getMaxListeners(),
        };
        ctx.json({ ok: true });
      });

      await withServer(instrumentResponses(app.callback(), maxListeners, 0), async (server) => {
        await request(server).get("/done").expect(200, { ok: true });
        expect(state?.maxListeners).toBe(maxListeners);
        expect(state?.response.getMaxListeners()).toBe(maxListeners);
      });
    },
  );

  it("releases only its own slot when another client reserves one later", async () => {
    const app = new Application();
    let state: RequestState | undefined;
    app.route("/done").get((ctx) => {
      const frameworkLimit = ctx.res.getMaxListeners();
      ctx.res.setMaxListeners(frameworkLimit + 1);
      state = {
        response: ctx.res,
        signal: ctx.signal,
        closeListeners: ctx.res.listenerCount("close"),
        maxListeners: frameworkLimit,
      };
      ctx.res.once("close", () => {
        if (!state) return;
        state.cooperativeLimit = ctx.res.getMaxListeners();
        ctx.res.setMaxListeners(state.cooperativeLimit - 1);
      });
      ctx.json({ frameworkLimit, combinedLimit: ctx.res.getMaxListeners() });
    });
    addStateRoute(app, () => state);

    await withServer(instrumentResponses(app.callback(), 10, 0), async (server) => {
      await request(server).get("/done").expect(200, { frameworkLimit: 11, combinedLimit: 12 });
      await expectState(server, {
        aborted: false,
        maxListeners: 10,
        cooperativeLimit: 11,
      });
    });
  });
});
