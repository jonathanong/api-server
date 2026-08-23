import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { describe, expect, it } from "vitest";
import {
  chunks,
  deferred,
  failingWritable,
  read,
  tick,
} from "./test-helpers/stream-json-object.mts";
import {
  getStreamJsonObjectWaiterCountForTesting,
  streamJsonObject,
} from "./stream-json-object.mts";

describe("streamJsonObject cancellation", () => {
  it("cancels a pending top-level promise when a consumer disconnects", async () => {
    const pending = deferred<never>();
    await expect(
      pipeline(streamJsonObject({ pending: pending.promise }), failingWritable()),
    ).rejects.toThrow("client disconnected");
  });

  it("cancels an active serializer when a consumer disconnects", async () => {
    const active = deferred<void>();
    const source = new Readable({
      read() {
        active.resolve();
      },
    });
    const destination = new Writable({
      write(_chunk, _encoding, callback) {
        active.promise.then(() => callback(new Error("client disconnected")));
      },
    });
    await expect(pipeline(streamJsonObject({ source }), destination)).rejects.toThrow(
      "client disconnected",
    );
    expect(source.destroyed).toBe(true);
  });

  it("propagates top-level rejection and serialization errors", async () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    await expect(read(streamJsonObject({ cyclic }))).rejects.toThrow();
    await expect(
      read(streamJsonObject({ rejected: Promise.reject(new Error("failed promise")) })),
    ).rejects.toThrow("failed promise");
  });

  it("interrupts a stalled direct serializer when a later top-level promise rejects", async () => {
    const source = Readable.from(
      (async function* () {
        yield "x";
        await new Promise<void>(() => {});
      })(),
    );
    const rejected = deferred<never>();
    const output = read(streamJsonObject({ source, rejected: rejected.promise }));
    await tick();
    rejected.reject(new Error("top-level failed"));
    await expect(output).rejects.toThrow("top-level failed");
    expect(source.destroyed).toBe(true);
  });

  it("destroys a direct readable when serialization fails", async () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const source = Readable.from([cyclic], { objectMode: true });
    await expect(read(streamJsonObject({ source }))).rejects.toThrow();
    expect(source.destroyed).toBe(true);
  });

  it("does not retain cancellation subscribers across many serialized chunks", async () => {
    const stream = streamJsonObject({ source: chunks(10_000) });
    expect(await read(stream)).toHaveLength(40_012);
    expect(getStreamJsonObjectWaiterCountForTesting(stream)).toBe(0);
  });

  it("observes rejected top-level promises before an unread stream is destroyed", async () => {
    const rejected = Promise.reject(new Error("unread rejection"));
    const stream = streamJsonObject({ rejected });
    let unhandled: unknown;
    const onUnhandled = (error: unknown) => {
      unhandled = error;
    };
    process.once("unhandledRejection", onUnhandled);
    stream.destroy();
    await tick();
    expect(unhandled).toBeUndefined();
    process.removeListener("unhandledRejection", onUnhandled);
  });
});
