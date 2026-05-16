# Request

The `ctx.request` object provides helpers for reading the incoming request body
and inspecting the `Content-Type` header.

## request.buffer(limit?)

Reads the raw request body into a `Buffer`. By default, requests are limited to
the app's `bodyLimit` option, which defaults to `"1mb"`. The optional `limit`
argument accepts a byte count (number), a human-readable string such as
`"1mb"` or `"512kb"` (parsed by the `bytes` package), or `false` to disable the
limit for that call.

```ts
app.route("/upload").post(async (ctx) => {
  const buf = await ctx.request.buffer("5mb");
  ctx.json({ bytes: buf.length });
});
```

Calling `buffer()` a second time returns the same cached `Promise` — the body
is only read once.

### 413 semantics and socket drain

If the body exceeds the limit, `buffer()` rejects with an error whose `.status`
is `413`. The remaining request data is drained from the socket automatically so
the underlying TCP connection stays reusable (HTTP keep-alive is preserved).

```ts
app.route("/limited").post(async (ctx) => {
  await ctx.request.buffer("1b");
  ctx.json({ ok: true });
});
// A large body → 413, next request on the same connection succeeds
```

## request.json(limit?)

Convenience wrapper around `buffer()` that `JSON.parse`s the result. Throws a
`400` error if the body is not valid JSON.

```ts
app.route("/items").post(async (ctx) => {
  const body = await ctx.request.json<{ name: string }>();
  ctx.setStatus(201);
  ctx.json({ created: body.name });
});
```

```ts
// With a size limit
const body = await ctx.request.json("256kb");
```

Invalid limit strings are treated as programmer errors and produce a `500`
response through the default error handler.

## request.is(type)

Checks the `Content-Type` header using the `type-is` package. Accepts a single
string or an array of strings (MIME type shortcuts such as `"json"` and
`"multipart"` are supported).

```ts
app.route("/data").post((ctx) => {
  if (ctx.request.is("json")) {
    // application/json
  }
  if (ctx.request.is(["json", "urlencoded"])) {
    // either
  }
});
```

Returns the matched type string, `false` if no match, or `null` when no
`Content-Type` header is present.

## Expect: 100-continue

When the client sends `Expect: 100-continue`, calling `buffer()` automatically
calls `res.writeContinue()` before reading the body. This allows the client to
proceed with sending the body.

```ts
app.route("/large-upload").post(async (ctx) => {
  // If the client sent Expect: 100-continue, writeContinue() is called here
  const buf = await ctx.request.buffer("50mb");
  ctx.json({ received: buf.length });
});
```
