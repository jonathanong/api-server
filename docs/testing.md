# Testing

## Stack

Tests use [vitest](https://vitest.dev) as the test runner and
[supertest](https://github.com/ladjs/supertest) for HTTP assertions.

```sh
pnpm test            # run once
pnpm test:watch      # watch mode
pnpm test:coverage   # coverage report
```

Test files live colocated with source as `src/*.test.mts`.

## Basic pattern

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { Application } from "./application.mts";
import { withServer } from "./test-helpers/with-server.mts";

describe("MyFeature", () => {
  it("returns 200", async () => {
    const app = new Application();
    app.route("/hello").get((ctx) => {
      ctx.json({ hello: "world" });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/hello");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ hello: "world" });
    });
  });
});
```

## withServer — shared server for multiple requests

`request(app.callback())` creates and destroys a TCP server for every call.
Under CI load this causes flaky `"socket hang up"` errors. Use `withServer`
from `src/test-helpers/with-server.mts` whenever a test makes more than one
request, or whenever you need stable server lifecycle:

```ts
import { withServer } from "./test-helpers/with-server.mts";

it("round-trips ETag", async () => {
  const app = new Application();
  app.route("/data").get((ctx) => {
    ctx.json({ value: 42 });
  });

  await withServer(app.callback(), async (server) => {
    const first = await request(server).get("/data");
    const etag = first.headers["etag"];

    const second = await request(server).get("/data").set("If-None-Match", etag);
    expect(second.status).toBe(304);
  });
});
```

`withServer` binds to `127.0.0.1` on a random port, disables keep-alive, and
calls `server.closeAllConnections()` before `server.close()` to avoid hangs.

## Mock req/res for synchronous rejection paths

Use inline mock objects (not supertest) for tests that verify synchronous
rejection where the response is trivial and a real socket would add
non-determinism:

```ts
it("emits error on double-send", async () => {
  const app = new Application();
  const errorPromise = new Promise<Error>((resolve) => {
    app.on("error", resolve);
  });

  app.route("/test").get((ctx) => {
    ctx.json({ first: true });
    ctx.json({ second: true }); // throws
  });

  const cb = app.callback();
  const mockReq = {
    method: "GET",
    url: "/test",
    headers: {},
    on: () => mockReq,
  } as unknown as import("node:http").IncomingMessage;
  const mockRes = {
    headersSent: false,
    writableEnded: false,
    statusCode: 200,
    setHeader: () => {},
    getHeader: () => undefined,
    writeHead: (s: number) => {
      mockRes.statusCode = s;
    },
    end: () => {},
  } as unknown as import("node:http").ServerResponse;

  cb(mockReq, mockRes);

  const error = await errorPromise;
  expect(error.message).toContain("already sent");
});
```

## When to use supertest vs mock objects

| Scenario                                           | Approach                                          |
| -------------------------------------------------- | ------------------------------------------------- |
| Verify real HTTP semantics (status, headers, body) | `request(server)` via `withServer`                |
| Multiple requests in one test                      | `withServer`                                      |
| Synchronous rejection / error event wiring         | Mock req/res                                      |
| Handler-side state assertions                      | Return values in JSON body, assert via `res.body` |
