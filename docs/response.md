# Response

## Buffered responses

The buffered send methods collect the entire body in memory, compute an ETag,
apply compression if eligible, set `Content-Type`, `Content-Length`, and
`ETag` headers, then write the response in one shot.

```ts
ctx.json({ hello: "world" });
// Content-Type: application/json; charset=utf-8

ctx.response.text("plain text");
// Content-Type: text/plain; charset=utf-8

ctx.response.html("<h1>Hello</h1>");
// Content-Type: text/html; charset=utf-8

ctx.response.xml("<root/>");
// Content-Type: application/xml; charset=utf-8

ctx.response.buffer(Buffer.from([0x89, 0x50, 0x4e, 0x47]), "image/png");
// Content-Type: image/png
```

`ctx.json(data)` is shorthand for `ctx.response.json(data)`.

### Status code

Set the status code with `ctx.setStatus()` before the send call:

```ts
ctx.setStatus(201);
ctx.json({ created: true });
```

Status codes `204` and `205` are handled specially — calling `ctx.setStatus(204)`
immediately sends an empty response; no additional send call is required or
permitted.

```ts
app.route("/item/:id").delete((ctx) => {
  ctx.setStatus(204); // sends immediately
});
```

### ETag and conditional GET

All 2xx buffered responses automatically include an `ETag` header (SHA-256,
base64url). If the client sends a matching `If-None-Match`, the framework
returns `304 Not Modified` without sending the body. Non-2xx responses do not
get an ETag. See [etag-and-caching.md](etag-and-caching.md).

## Streaming responses (pipeline)

Use `ctx.pipeline()` (or `ctx.response.pipeline()`) to stream a readable
source — optionally through transform streams — to the client.

```ts
import { createReadStream } from "node:fs";

app.route("/file").get(async (ctx) => {
  ctx.setType("application/octet-stream");
  await ctx.pipeline(createReadStream("/path/to/file"));
});
```

With transform streams:

```ts
import { createGunzip } from "node:zlib";

app.route("/decompressed").get(async (ctx) => {
  ctx.setType("text/plain");
  await ctx.pipeline(createReadStream("file.gz"), createGunzip());
});
```

`pipeline()` returns a `Promise` that resolves when the stream finishes. The
`Server-Timing` header is sent as an HTTP trailer for streaming responses.

### HEAD handling

For both buffered and streaming responses, `HEAD` requests receive the same
headers as a `GET` but no response body. The handler code is identical — the
framework suppresses the body automatically.

```ts
app.route("/data").get((ctx) => {
  ctx.json({ value: 42 }); // HEAD /data returns headers only
});
```

## Double-send protection

Calling any response method after the response has already been sent throws
`"Response already sent"`. The error is emitted via `app.on('error', ...)` —
the client already has a response, so it does not produce another one.

```ts
app.route("/bad").get((ctx) => {
  ctx.json({ first: true });
  ctx.json({ second: true }); // throws — caught and emitted as 'error'
});
```
