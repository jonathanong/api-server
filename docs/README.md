# @jongleberry/api-server — Documentation

| File | Description |
|------|-------------|
| [getting-started.md](getting-started.md) | Install, minimal hello-world, mounting on `http.createServer` |
| [routing.md](routing.md) | Trie router, chainable verb methods, route params, `notFoundHandler` |
| [context.md](context.md) | Full `Context` surface: req/res, params, query, signal, ip, cookies, helpers |
| [request.md](request.md) | `request.buffer`, `request.json`, `request.is`, `Expect: 100-continue`, 413 semantics |
| [response.md](response.md) | Buffered (json/text/html/xml/buffer) vs streaming (pipeline), HEAD handling, double-send |
| [etag-and-caching.md](etag-and-caching.md) | Automatic SHA-256 ETag, `If-None-Match` → 304, `cacheControl()` helper |
| [compression.md](compression.md) | br/gzip/deflate negotiation, 1 KB threshold, compressible type check, SYNC_FLUSH |
| [server-timing.md](server-timing.md) | `responseStarted`/`responseFinished` as header (buffered) or trailer (streaming) |
| [cookies.md](cookies.md) | `cookies.get` / `cookies.set`, `CookieOptions`, same-request caveat |
| [error-handling.md](error-handling.md) | `errorHandler`, `app.on('error')`, `notFoundHandler`, `http-errors` integration |
| [async-local-storage.md](async-local-storage.md) | `app.setAsyncLocalStorage(als)`, accessing via `ctx.store` |
| [abort-signals.md](abort-signals.md) | `ctx.signal` / `ctx.abortController`, client-disconnect propagation |
| [logger.md](logger.md) | Concurrency-bar visualization, `LOG_LEVEL`, `timingThresholds`, production/test suppression |
| [trusted-client-ip.md](trusted-client-ip.md) | IP precedence: `cf-connecting-ip` → `x-forwarded-for[0]` → `socket.remoteAddress` |
| [extending-context.md](extending-context.md) | `app.extend({})` and TypeScript module-augmentation pattern |
| [testing.md](testing.md) | vitest + supertest, `withServer` helper, shared-server pattern for multi-request tests |
