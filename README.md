# @jongleberry/api-server

A lightweight Node.js HTTP server library built on a trie router with automatic compression, ETag caching, streaming, and a dev-friendly request logger.

## Install

```sh
npm install @jongleberry/api-server
```

Requires Node.js ≥ 24.

## Quick start

```ts
import http from "node:http";
import { Application } from "@jongleberry/api-server";

const app = new Application();

app.route("/hello").get((ctx) => {
  ctx.json({ hello: "world" });
});

app.route("/users/:id").get((ctx) => {
  ctx.json({ id: ctx.params.id });
});

http.createServer(app.callback()).listen(3000);
```

Or use the factory shorthand:

```ts
import { createApp } from "@jongleberry/api-server";

const app = createApp();
app.route("/").get((ctx) => ctx.json({ ok: true }));
```

## Features

- **Trie router** — `find-my-way` under the hood; zero regex overhead on the hot path
- **Buffered responses** — `ctx.json()`, `ctx.response.text()`, `.html()`, `.xml()`, `.buffer()`
- **Streaming** — `ctx.pipeline(readable, ...transforms)` with back-pressure and error propagation
- **Automatic ETag** — SHA-256 ETag on every buffered 2xx; `If-None-Match` → 304
- **Compression** — `br` / `gzip` / `deflate` negotiation; 1 KB threshold; `SYNC_FLUSH` for streams
- **Server-Timing** — response latency as a `Server-Timing` header (buffered) or trailer (streaming)
- **Abort signals** — `ctx.signal` / `ctx.abortController` wired to client disconnect
- **AsyncLocalStorage** — per-request store via `app.setAsyncLocalStorage(als)`
- **Cookies** — `ctx.cookies.get()` / `.set()` with full `Set-Cookie` options
- **Cache-Control** — `ctx.cacheControl(visibility, maxAge)` helper
- **Trusted client IP** — Cloudflare/AWS ALB-aware helper for Node, Deno, and Bun
- **Dev logger** — concurrent-request bar, color-coded status codes, timing thresholds; silent in `NODE_ENV=production` and `NODE_ENV=test`
- **Error safety net** — error handlers that throw or return without a response still guarantee the client receives a response

## Requirements

- Node.js ≥ 22.0.0
- ESM (`"type": "module"` or `.mjs` imports)

## Documentation

See [docs/](docs/README.md) for full API reference:

| Topic                                              | Description                                         |
| -------------------------------------------------- | --------------------------------------------------- |
| [Getting started](docs/getting-started.md)         | Install, hello world, mounting on http.createServer |
| [Routing](docs/routing.md)                         | Route registration, params, notFoundHandler         |
| [Context](docs/context.md)                         | Full `ctx` API surface                              |
| [Request](docs/request.md)                         | Body parsing, size limits, content-type detection   |
| [Response](docs/response.md)                       | Buffered and streaming responses                    |
| [ETag and caching](docs/etag-and-caching.md)       | Automatic ETags, 304s, Cache-Control                |
| [Compression](docs/compression.md)                 | br/gzip/deflate negotiation                         |
| [Server-Timing](docs/server-timing.md)             | Response latency headers and trailers               |
| [Cookies](docs/cookies.md)                         | Reading and writing cookies                         |
| [Error handling](docs/error-handling.md)           | errorHandler, notFoundHandler, http-errors          |
| [Async local storage](docs/async-local-storage.md) | Per-request store                                   |
| [Abort signals](docs/abort-signals.md)             | Client-disconnect propagation                       |
| [Logger](docs/logger.md)                           | Dev logger configuration                            |
| [Trusted client IP](docs/trusted-client-ip.md)     | Node, Deno, and Bun client IP helpers               |
| [Extending context](docs/extending-context.md)     | Adding methods to ctx                               |
| [Testing](docs/testing.md)                         | Testing patterns with vitest and supertest          |

## Design

- No middleware stack. Routes are registered directly on the application; request processing runs top-to-bottom in a single async function per request.
- No magic. `ctx.req` and `ctx.res` are the raw Node.js `IncomingMessage` and `ServerResponse` objects.
- Body is pull-based. `ctx.request.buffer()` and `ctx.request.json()` are explicit calls; the body is never automatically parsed.
- Responses are explicit. You choose buffered or streaming; the library doesn't buffer a stream or stream a buffer behind your back.

## License

MIT © Jonathan Ong 2026
