import { describe, expect, it } from "vitest";
import { read } from "./test-helpers/stream-json-object.mts";
import { Readable } from "node:stream";
import { streamJsonObject } from "./stream-json-object.mts";

describe("streamJsonObject thenables", () => {
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

  it("returns a readable stream for native promises with hostile own then getters", async () => {
    const native = Promise.resolve("native");
    // eslint-disable-next-line unicorn/no-thenable
    Object.defineProperty(native, "then", {
      get() {
        throw new Error("hostile then");
      },
    });
    const stream = streamJsonObject({ native });
    expect(stream).toBeInstanceOf(Readable);
    await expect(read(stream)).resolves.toBe('{"native":"native"}');
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
});
