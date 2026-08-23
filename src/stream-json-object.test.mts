import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { describe, expect, it } from "vitest";
import { streamJsonObject } from "./stream-json-object.mts";

describe("streamJsonObject", () => {
  it("streams direct fields and omits values with no JSON output", async () => {
    const output = await read(
      streamJsonObject({
        visible: 1,
        omitted: undefined,
        function: () => {},
        symbol: Symbol("omitted"),
        toJson: { toJSON: () => undefined },
      }),
    );
    expect(output).toBe('{"visible":1}');
  });

  it("emits promise fields in settlement order after direct fields", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const stream = streamJsonObject({ direct: 1, first: first.promise, second: second.promise });
    const output = read(stream);
    await tick();
    second.resolve("second");
    first.resolve("first");
    expect(await output).toBe('{"direct":1,"second":"second","first":"first"}');
  });

  it("omits settled fields with no JSON output without corrupting commas", async () => {
    expect(
      await read(
        streamJsonObject({
          before: Promise.resolve("before"),
          omitted: Promise.resolve(undefined),
          function: Promise.resolve(() => {}),
          after: Promise.resolve("after"),
        }),
      ),
    ).toBe('{"before":"before","after":"after"}');
  });

  it("preserves settlement order between native promises and custom thenables", async () => {
    const native = Promise.resolve("native");
    const custom = {
      // eslint-disable-next-line unicorn/no-thenable
      then(resolve: (value: string) => void) {
        resolve("custom");
      },
    };
    expect(
      await read(streamJsonObject({ native, custom: custom as unknown as PromiseLike<string> })),
    ).toBe('{"native":"native","custom":"custom"}');
  });

  it("honors backpressure with a slow writable", async () => {
    let produced = 0;
    let consumed = 0;
    let gate = deferred<void>();
    gate.resolve();
    const source = Readable.from(
      (async function* () {
        for (const value of ["a", "b", "c"]) {
          await gate.promise;
          gate = deferred<void>();
          produced += 1;
          yield value.repeat(600);
        }
      })(),
    );
    const destination = new Writable({
      highWaterMark: 1,
      write(_chunk, _encoding, callback) {
        consumed += 1;
        expect(produced - consumed).toBeLessThanOrEqual(1);
        setImmediate(() => {
          gate.resolve();
          callback();
        });
      },
    });
    await pipeline(streamJsonObject({ source }), destination);
    expect(produced).toBe(3);
  });

  it("cancels a pending top-level promise when a consumer disconnects", async () => {
    const pending = deferred<never>();
    const destination = failingWritable();
    await expect(
      pipeline(streamJsonObject({ pending: pending.promise }), destination),
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
    await expect(
      read(streamJsonObject({ source, rejected: Promise.reject(new Error("top-level failed")) })),
    ).rejects.toThrow("top-level failed");
    expect(source.destroyed).toBe(true);
  });

  it("destroys a direct readable when serialization fails", async () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const source = Readable.from([cyclic], { objectMode: true });
    await expect(read(streamJsonObject({ source }))).rejects.toThrow();
    expect(source.destroyed).toBe(true);
  });

  it("assimilates top-level thenables once and reports throwing getters as stream errors", async () => {
    const throwing = {};
    // eslint-disable-next-line unicorn/no-thenable
    Object.defineProperty(throwing, "then", {
      get() {
        throw new Error("throwing then");
      },
    });
    await expect(read(streamJsonObject({ throwing }))).rejects.toThrow("throwing then");

    const throwingCall = {
      // eslint-disable-next-line unicorn/no-thenable
      then() {
        throw new Error("throwing then call");
      },
    };
    await expect(read(streamJsonObject({ throwingCall }))).rejects.toThrow("throwing then call");

    let reads = 0;
    const thenable = {};
    // eslint-disable-next-line unicorn/no-thenable
    Object.defineProperty(thenable, "then", {
      get() {
        reads += 1;
        if (reads > 1) throw new Error("read twice");
        return (resolve: (value: string) => void) => resolve("ok");
      },
    });
    expect(await read(streamJsonObject({ thenable }))).toBe('{"thenable":"ok"}');
    expect(reads).toBe(1);

    const then = Object.assign((resolve: (value: string) => void) => resolve("shadowed"), {
      call: undefined,
    });
    // eslint-disable-next-line unicorn/no-thenable
    const shadowedCall = { then };
    expect(
      await read(
        streamJsonObject({ shadowedCall: shadowedCall as unknown as PromiseLike<string> }),
      ),
    ).toBe('{"shadowedCall":"shadowed"}');
  });

  it("defers captured thenable calls to a microtask", async () => {
    const events: string[] = [];
    const thenable = {
      // eslint-disable-next-line unicorn/no-thenable
      then(resolve: (value: string) => void) {
        events.push("then");
        resolve("ok");
      },
    };
    const output = read(streamJsonObject({ thenable: thenable as unknown as PromiseLike<string> }));
    events.push("after");
    expect(await output).toBe('{"thenable":"ok"}');
    expect(events).toEqual(["after", "then"]);
  });

  it("supports proxy thenables and treats nonfunction then accessors as direct values", async () => {
    let reads = 0;
    const proxy = new Proxy(
      {},
      {
        get(_target, key) {
          if (key === "then") {
            reads += 1;
            // eslint-disable-next-line unicorn/no-thenable
            return (resolve: (value: string) => void) => resolve("proxy");
          }
          return undefined;
        },
      },
    );
    expect(await read(streamJsonObject({ direct: 1, proxy }))).toBe('{"direct":1,"proxy":"proxy"}');
    expect(reads).toBe(1);

    let nonfunctionReads = 0;
    const ordinary = {};
    // eslint-disable-next-line unicorn/no-thenable
    Object.defineProperty(ordinary, "then", {
      get() {
        nonfunctionReads += 1;
        return undefined;
      },
    });
    expect(await read(streamJsonObject({ direct: 1, ordinary }))).toBe(
      '{"direct":1,"ordinary":{}}',
    );
    expect(nonfunctionReads).toBeGreaterThanOrEqual(1);
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

function failingWritable(): Writable {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback(new Error("client disconnected"));
    },
  });
}

async function read(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
