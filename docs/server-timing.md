# Server-Timing

Every response includes timing information via the `Server-Timing` header. Two
measurements are reported:

| Metric             | Measures                                                      |
| ------------------ | ------------------------------------------------------------- |
| `responseStarted`  | Time from request receipt to the moment `writeHead` is called |
| `responseFinished` | Time from `writeHead` to the end of the response body         |

Both durations are in milliseconds with three decimal places.

## Buffered responses

For buffered responses (`json`, `text`, `html`, `xml`, `buffer`, and the
implicit `empty` for 204/205), `Server-Timing` is sent as a **response header**:

```
Server-Timing: responseStarted;dur=1.234, responseFinished;dur=0.012
```

```ts
const res = await request(server).get("/test");
expect(res.headers["server-timing"]).toBeDefined();
// "responseStarted;dur=..., responseFinished;dur=..."
```

## Streaming responses (pipeline)

For streaming responses, the body length is unknown at `writeHead` time, so
`Server-Timing` is sent as an HTTP **trailer** after the body has been fully
written. The response will include:

```
Trailer: Server-Timing
```

...in the response headers, with the actual timing value appended after the
body chunks.

Note: HTTP trailers are only delivered to the client when the client reads the
full response body and supports chunked transfer encoding.

## Reading the header

```ts
app.route("/data").get((ctx) => {
  ctx.json({ value: 42 });
});

const res = await request(server).get("/data");
const timing = res.headers["server-timing"];
// e.g. "responseStarted;dur=0.821, responseFinished;dur=0.003"
```
