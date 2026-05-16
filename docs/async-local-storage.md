# AsyncLocalStorage

`AsyncLocalStorage` from `node:async_hooks` provides request-scoped storage
without passing values through every function call. The framework integrates
with it so every handler runs inside the storage context.

## Setup

Call `app.setAsyncLocalStorage(als)` before the server starts handling requests:

```ts
import { createApp } from "@jongleberry/api-server";
import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  requestId: string;
  userId?: string;
}

const als = new AsyncLocalStorage<RequestContext>();
const app = createApp();

app.setAsyncLocalStorage(als as AsyncLocalStorage<unknown>);
```

## Accessing the store

`ctx.store` returns the current value from `als.getStore()`. Because each
request runs inside `als.run({}, ...)`, the store starts as an empty object.
Populate it by mutating the object returned by `ctx.store`:

```ts
app.route("/protected").get((ctx) => {
  const store = ctx.store as RequestContext;
  // store is the same object for the entire request
  store.userId = "user-42";
  ctx.json({ userId: store.userId });
});
```

## Checking availability

`ctx.store` returns `undefined` if no `AsyncLocalStorage` has been configured:

```ts
const app = createApp();
// No setAsyncLocalStorage call
app.route("/test").get((ctx) => {
  ctx.json({ hasStore: ctx.store !== undefined }); // false
});
```

After `setAsyncLocalStorage`:

```ts
app.setAsyncLocalStorage(als as AsyncLocalStorage<unknown>);
app.route("/test").get((ctx) => {
  ctx.json({ hasStore: ctx.store !== undefined }); // true
});
```

## TypeScript typing

The `AsyncLocalStorage` generic parameter is erased to `unknown` in the
framework API. Cast `ctx.store` to your own type inside handlers:

```ts
const store = ctx.store as RequestContext;
```

Alternatively, use `app.extend()` to add a typed accessor — see
[extending-context.md](extending-context.md).
