import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { describe, expect, it } from "vitest";
import { deferred, read, tick } from "./test-helpers/stream-json-object.mts";
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
});
