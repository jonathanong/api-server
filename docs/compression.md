# Compression

## Negotiation

The framework negotiates the response encoding via the `Accept-Encoding` request
header using the `negotiator` package. Supported encodings in preference order:

1. `br` (Brotli)
2. `gzip`
3. `deflate`

If the client does not advertise any of these, or advertises only `identity`,
compression is skipped.

## Buffered response size window

Buffered responses (`json`, `text`, `html`, `xml`, `buffer`) are only
compressed when the body is **at least 1024 bytes** and at most **1 MB**.
Smaller and larger bodies are sent uncompressed regardless of
`Accept-Encoding`. Use `pipeline()` for large responses that need compression
without synchronous buffered compression work.

```ts
// Body < 1024 bytes — no compression even if client requests it
app.route("/small").get((ctx) => {
  ctx.json({ ok: true });
});

// Body >= 1024 bytes and <= 1 MB — compressed if client supports it
app.route("/large").get((ctx) => {
  ctx.json({ data: "x".repeat(2000) });
});
```

Streaming responses (`pipeline`) have no size threshold — compression is
applied whenever the client accepts it and the content-type is compressible.

## Compressible content-type check

Compression is only applied to content-types that the `compressible` package
considers compressible (text, JSON, XML, etc.). Binary formats such as
`image/png` or `application/zip` are never re-compressed.

## No-transform override

If the request includes `Cache-Control: no-transform`, compression is skipped
regardless of the client's `Accept-Encoding`.

## Already-encoded responses

If a `Content-Encoding` header has already been set on the response before the
framework would apply compression, the framework leaves it untouched and does
not double-compress.

## SYNC_FLUSH for streaming

Streaming compression (used by `pipeline`) is created with `Z_SYNC_FLUSH` for
gzip/deflate and `BROTLI_OPERATION_FLUSH` for Brotli. This ensures chunks are
flushed to the client promptly rather than buffered inside the compressor.

## Compression headers

When compression is applied, the framework sets:

```
Content-Encoding: gzip   (or br, deflate)
Vary: Accept-Encoding
```

`Content-Length` reflects the compressed size for buffered responses.

## Test example

```ts
const res = await request(server)
  .get("/large")
  .set("Accept-Encoding", "gzip")
  .buffer(true)
  .parse((res, callback) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () => callback(null, Buffer.concat(chunks)));
  });

expect(res.headers["content-encoding"]).toBe("gzip");
expect(res.headers["vary"]).toContain("Accept-Encoding");
```
