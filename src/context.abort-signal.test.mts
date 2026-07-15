import { once } from "node:events";
import type { Server } from "node:http";
import { PassThrough, Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { Application } from "./application.mts";
import { withServer } from "./test-helpers/with-server.mts";

type SignalState = {
  signal: AbortSignal;
  response: import("node:http").ServerResponse;
};
type SupertestRequest = ReturnType<ReturnType<typeof request>["post"]>;

function addSignalRoutes(app: Application, states: Map<string, SignalState>): void {
  app.route("/stream/:id").post(async (ctx) => {
    await ctx.request.json();
    states.set(ctx.params.id ?? "", { signal: ctx.signal, response: ctx.res });
    ctx.setType("text/event-stream");
    const stream = new PassThrough();
    const pipelinePromise = ctx.pipeline(stream);
    stream.write("data: ready\n\n");
    try {
      await pipelinePromise;
    } catch (error) {
      if (!ctx.signal.aborted) throw error;
    }
  });

  app.route("/done/:id").get((ctx) => {
    states.set(ctx.params.id ?? "", { signal: ctx.signal, response: ctx.res });
    ctx.json({ ok: true });
  });

  app.route("/state/:id").get((ctx) => {
    // A disconnected request cannot return its own result, so expose lifecycle
    // state through a second real HTTP response instead of asserting a closure.
    const state = states.get(ctx.params.id ?? "");
    ctx.json({
      aborted: state?.signal.aborted ?? null,
      closeListeners: state?.response.listenerCount("close") ?? null,
    });
  });
}

async function expectState(
  server: Server,
  id: string,
  expected: { aborted: boolean; closeListeners?: number },
): Promise<void> {
  await expect
    .poll(async () => {
      const res = await request(server).get(`/state/${id}`);
      return res.body as { aborted: boolean | null; closeListeners: number | null };
    })
    .toMatchObject(expected);
}

function streamRequest(
  server: Server,
  id: string,
  onReady: (client: SupertestRequest) => void,
): Promise<void> {
  const client = request(server).post(`/stream/${id}`).send({ value: "ready" }).buffer(false);
  client.on("response", (res) => {
    res.on("error", () => {});
    res.once("data", () => onReady(client));
  });
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.abort();
      reject(new Error("Timed out waiting for streaming request to close"));
    }, 1_000);
    client.then(
      () => {
        clearTimeout(timeout);
        resolve();
      },
      () => {
        clearTimeout(timeout);
        resolve();
      },
    );
  });
}

describe("Context abort signal lifecycle", () => {
  it("stays active after a POST body is consumed while the response is open", async () => {
    const app = new Application();
    app.route("/stream").post(async (ctx) => {
      const requestClosed = once(ctx.req, "close");
      const body = await ctx.request.json<{ value: string }>();
      await requestClosed;
      ctx.setType("application/json");
      await ctx.pipeline(
        Readable.from(JSON.stringify({ body, signalAborted: ctx.signal.aborted })),
      );
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server)
        .post("/stream")
        .set("Accept-Encoding", "identity")
        .send({ value: "ready" });
      expect(res.body).toEqual({ body: { value: "ready" }, signalAborted: false });
    });
  });

  it("aborts when a client disconnects from an open streaming response", async () => {
    const app = new Application();
    const states = new Map<string, SignalState>();
    addSignalRoutes(app, states);

    await withServer(app.callback(), async (server) => {
      await streamRequest(server, "client", (client) => client.abort());
      await expectState(server, "client", { aborted: true });
    });
  });

  it("does not abort or retain its listener after a normally completed response", async () => {
    const app = new Application();
    const states = new Map<string, SignalState>();
    addSignalRoutes(app, states);

    await withServer(app.callback(), async (server) => {
      await request(server).get("/done/normal").expect(200, { ok: true });
      await expectState(server, "normal", { aborted: false, closeListeners: 0 });
    });
  });

  it("aborts when the server forcibly closes an active connection", async () => {
    const app = new Application();
    const states = new Map<string, SignalState>();
    addSignalRoutes(app, states);

    await withServer(app.callback(), async (server) => {
      await streamRequest(server, "server", () => server.closeAllConnections());
      await expectState(server, "server", { aborted: true });
    });
  });
});
