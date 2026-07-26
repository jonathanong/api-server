# Abort Signals

Each request gets a dedicated `AbortController`. Its signal remains active
after the request body has been consumed and is aborted automatically when the
client disconnects before the response is finished.

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

The framework listens for the `'close'` event on the raw response. When the
response closes before `res.writableEnded` is true, `abortController.abort()`
is called. This means `ctx.signal.aborted` becomes `true` and any code awaiting
the signal is notified.

For responses with a finite listener limit, the framework temporarily reserves
one listener slot before registering this handler and releases that slot when
the response closes. The reservation adjusts the live limit relatively so it
composes with other response listeners. Unlimited listener limits are left
unchanged.

Reading a request body to completion also closes the request-side stream. That
does not abort `ctx.signal`; a POST handler can consume JSON and then keep a
streaming response open with the same signal. A normally completed response
also leaves the signal un-aborted because `res.writableEnded` is already true
when its `'close'` event fires.

## Server shutdown

Force-closing an active connection, for example with
`server.closeAllConnections()`, closes its unfinished response and aborts the
signal. Calling `server.close()` alone does not abort active responses; it waits
for them to finish or for their connections to close.

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
