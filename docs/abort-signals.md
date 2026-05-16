# Abort Signals

Each request gets a dedicated `AbortController`. The controller is aborted
automatically when the client disconnects before the response is finished.

## ctx.signal

`ctx.signal` is the `AbortSignal` associated with the request's
`AbortController`. Pass it to any async operation that supports cancellation:

```ts
app.route("/slow").get(async (ctx) => {
  const data = await fetch("https://api.example.com/data", {
    signal: ctx.signal,
  });
  ctx.json(await data.json());
});
```

If the client disconnects while `fetch` is in progress, the signal fires and
`fetch` throws an `AbortError`, which propagates to the error handler.

## ctx.abortController

`ctx.abortController` is the underlying `AbortController`. It is exposed in
case you need to pass it to code that accepts a controller rather than a signal,
or if you want to trigger cancellation manually.

```ts
app.route("/test").get((ctx) => {
  ctx.json({
    isAbortSignal: ctx.signal instanceof AbortSignal,
    isAbortController: ctx.abortController instanceof AbortController,
  });
});
```

## Client-disconnect propagation

The framework listens for the `'close'` event on the raw request socket. When
the socket closes before `res.writableEnded` is true, `abortController.abort()`
is called. This means `ctx.signal.aborted` becomes `true` and any code
awaiting the signal is notified.

## Checking abort status

```ts
app.route("/stream").get(async (ctx) => {
  for await (const chunk of generateChunks()) {
    if (ctx.signal.aborted) {
      break; // stop work early
    }
    // process chunk
  }
  ctx.json({ done: true });
});
```

Or use the `'abort'` event:

```ts
ctx.signal.addEventListener("abort", () => {
  cleanup();
});
```
