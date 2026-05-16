# Error Handling

## app.errorHandler(fn)

Register a function to handle errors thrown (or rejected) inside route handlers.
The handler receives the `Context` and the `Error`.

```ts
app.errorHandler((ctx, err) => {
  const status = (err as { status?: number }).status ?? 500;
  ctx.response.setStatus(status);
  ctx.json({ error: err.message });
});
```

The error handler may be async:

```ts
app.errorHandler(async (ctx, err) => {
  await logError(err);
  ctx.response.setStatus(500);
  ctx.json({ error: "Internal Server Error" });
});
```

### Fallback safety net

If the registered error handler itself throws, or returns without sending a
response, the framework ensures the client still receives a response rather than
hanging (issue #1948). The fallback sends `500 Internal Server Error` when no
headers have been sent yet.

## app.on('error', fn)

Errors are also emitted on the `Application` event emitter. This is useful for
logging without intercepting the HTTP response.

```ts
app.on("error", (err: Error) => {
  console.error("Unhandled request error:", err);
});
```

Both `errorHandler` and `on('error', ...)` can be registered at the same time.
The event is emitted for every error, including those caught by `errorHandler`.

## notFoundHandler

When no route matches, or when a matched handler completes without sending a
response, the not-found handler is called:

```ts
app.notFoundHandler((ctx) => {
  ctx.response.setStatus(404);
  ctx.json({ error: "Not Found", path: ctx.req.url });
});
```

Without a registered handler, the framework sends a plain-text `404 Not Found`.

## http-errors integration

Errors with a `.status` property are treated as HTTP errors. The built-in
default error behavior (no `errorHandler` registered) uses the `.status` to
set the response status code.

Use `ctx.throw()` or `ctx.assert()` to create http-errors-compatible errors:

```ts
ctx.throw(404, "User not found");
ctx.throw(400, "Invalid input", "ERR_INVALID_INPUT");

ctx.assert(user !== null, 404, "User not found");
```

With a custom error handler:

```ts
app.errorHandler((ctx, err) => {
  const status = (err as { status?: number }).status ?? 500;
  ctx.response.setStatus(status);
  ctx.json({ error: err.message, code: (err as { code?: string }).code });
});

app.route("/users/:id").get((ctx) => {
  const user = db.find(ctx.params.id);
  ctx.assert(user, 404, "Not found");
  ctx.json(user);
});
```

## Default error behavior

Without a custom `errorHandler`, the framework:

1. Emits the error on `app` if any `'error'` listeners are registered.
2. Sends a response using the error's `.status` property when it is a valid
   4xx or 5xx HTTP status, or `500` otherwise.
3. Sends the error message for 4xx responses and `Internal Server Error` for
   5xx responses.
