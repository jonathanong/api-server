# ETag and Caching

## Automatic ETag

Every buffered 2xx response automatically receives an `ETag` header. The value
is a SHA-256 hash of the **pre-compression** response body, encoded as base64url
and wrapped in double-quotes.

```
ETag: "abc123..."
```

ETags are only set on 2xx responses. 4xx/5xx responses do not include an ETag.

## Conditional GET (304)

When the client sends `If-None-Match` with a value that matches the computed
ETag, the framework returns `304 Not Modified` with no body. This works for
both `GET` and `HEAD` requests.

```ts
app.route("/data").get((ctx) => {
  ctx.json({ value: 42 });
});
```

First request:

```
GET /data
← 200  ETag: "abc123..."
        {"value":42}
```

Subsequent request:

```
GET /data
    If-None-Match: "abc123..."
← 304  (no body)
```

A test showing the round-trip:

```ts
const first = await request(server).get("/data");
const etag = first.headers["etag"];

const second = await request(server).get("/data").set("If-None-Match", etag);
expect(second.status).toBe(304);
```

`If-None-Match: *` is also supported and always matches.

## Cache-Control helper

`ctx.cacheControl(type, ttl?)` sets the `Cache-Control` header.

### Public cache

Requires a TTL. The value may be a number (seconds) or a human-readable string:

```ts
ctx.cacheControl("public", 3600); // Cache-Control: public, max-age=3600
ctx.cacheControl("public", "1 hour"); // same
ctx.cacheControl("public", "30 minutes"); // public, max-age=1800
ctx.cacheControl("public", "7 days"); // public, max-age=604800
```

Supported units: `second(s)`, `minute(s)`, `hour(s)`, `day(s)`, `week(s)`,
`month(s)`, `year(s)`.

### Private cache

```ts
ctx.cacheControl("private");
// Cache-Control: private, no-cache, no-store, must-revalidate
```

`private` does not accept a TTL.

### Example

```ts
app.route("/static").get((ctx) => {
  ctx.cacheControl("public", "1 year");
  ctx.json({ built: "2024-01-01" });
});

app.route("/profile").get((ctx) => {
  ctx.cacheControl("private");
  ctx.json({ name: "Alice" });
});
```
