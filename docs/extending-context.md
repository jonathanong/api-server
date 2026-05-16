# Extending Context

## app.extend(methods)

`app.extend()` adds methods (or properties) to every `Context` instance for
the application. Pass a plain object whose keys become methods on `ctx`:

```ts
import { createApp } from "@jongleberry/api-server";

const app = createApp();

app.extend({
  ok() {
    (this as unknown as import("./context.mts").Context).json({ ok: true });
  },
  sendError(status: number, message: string) {
    const ctx = this as unknown as import("./context.mts").Context;
    ctx.response.setStatus(status);
    ctx.json({ error: message });
  },
});

app.route("/test").get((ctx) => {
  (ctx as unknown as { ok(): void }).ok();
});
```

`app.extend()` can be called multiple times; subsequent calls merge into the
same extension map.

## TypeScript module augmentation

To make the extended methods available on the `Context` type without casting,
declare a module augmentation in a `.d.ts` file or alongside your app setup:

```ts
// types/context-extensions.d.ts
import "@jongleberry/api-server";

declare module "@jongleberry/api-server" {
  interface Context {
    ok(): void;
    sendError(status: number, message: string): void;
  }
}
```

After augmentation, TypeScript recognises the added methods:

```ts
app.route("/test").get((ctx) => {
  ctx.ok(); // no cast needed
  ctx.sendError(404, "Not found");
});
```

## How it works

Internally, each call to `app.extend()` creates a new subclass of `Context`
with the provided methods mixed into its prototype:

```ts
class ExtendedContext extends Context {}
Object.assign(ExtendedContext.prototype, extensions);
```

The subclass is used for all subsequent requests on that application instance.
Existing requests in flight are unaffected.
