# Context

Every route handler receives a single `Context` argument (`ctx`). It exposes
both the raw Node.js objects and higher-level helpers.

## Raw request / response

```ts
ctx.req; // node:http IncomingMessage
ctx.res; // node:http ServerResponse
```

Use these for low-level access not covered by the helpers below.

## Route params

```ts
app.route("/users/:id").get((ctx) => {
  ctx.json({ id: ctx.params.id }); // string | undefined
});
```

## Query string

`ctx.query` parses `req.url` on first access and caches the result. A key with
multiple values becomes an array; a key with a single value stays a string.

```ts
app.route("/search").get((ctx) => {
  // GET /search?q=hello&tag=a&tag=b
  ctx.query.q; // "hello"
  ctx.query.tag; // ["a", "b"]
});
```

## Abort signal

```ts
ctx.signal; // AbortSignal — aborted on client disconnect
ctx.abortController; // AbortController driving ctx.signal
```

Pass `ctx.signal` to `fetch`, database queries, or any async work that should
stop when the client disconnects. See [abort-signals.md](abort-signals.md).

## Trusted client IP

```ts
ctx.ip; // string | undefined
```

Resolves `cf-connecting-ip` → `x-forwarded-for[0]` → `socket.remoteAddress`.
See [trusted-client-ip.md](trusted-client-ip.md).

## AsyncLocalStorage store

```ts
ctx.store; // unknown — the value from AsyncLocalStorage.getStore()
```

Available after calling `app.setAsyncLocalStorage(als)`.
See [async-local-storage.md](async-local-storage.md).

## Assert and throw

`ctx.assert` is the `http-assert` function. It throws an `HttpError` when the
condition is falsy:

```ts
ctx.assert(user !== null, 404, "User not found");
```

`ctx.throw` creates and throws an `HttpError` immediately:

```ts
ctx.throw(403, "Forbidden");
// with an optional machine-readable code:
ctx.throw(400, "Bad input", "ERR_INVALID_INPUT");
```

Both integrate with the error handler — see [error-handling.md](error-handling.md).

## Setting the status code

```ts
ctx.setStatus(201);
ctx.json({ created: true });
```

Status codes `204` and `205` are special: calling `ctx.setStatus(204)` or
`ctx.setStatus(205)` automatically sends an empty response immediately. No
further response call is needed (or allowed).

## Setting headers

```ts
ctx.set("X-Request-Id", requestId);
ctx.setType("json"); // short names: json, html, text, xml, bin, form
ctx.setType("application/vnd.api+json"); // or a full MIME type
```

## Sending responses

```ts
ctx.json({ ok: true }); // application/json
ctx.response.text("hello"); // text/plain
ctx.response.html("<h1>Hi</h1>"); // text/html
ctx.response.xml("<root/>"); // application/xml
ctx.response.buffer(buf, "image/png"); // arbitrary content-type
ctx.pipeline(readable, ...transforms); // streaming
```

See [response.md](response.md) for details.

## Cache-Control

```ts
ctx.cacheControl("public", 3600); // public, max-age=3600
ctx.cacheControl("public", "1 hour"); // same, human-readable
ctx.cacheControl("private"); // private, no-cache, no-store, must-revalidate
```

See [etag-and-caching.md](etag-and-caching.md).

## Cookies

```ts
ctx.cookies.get("session"); // read from Cookie header
ctx.cookies.set("session", token, { httpOnly: true, secure: true });
```

See [cookies.md](cookies.md).
