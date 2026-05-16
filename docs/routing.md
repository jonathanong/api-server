# Routing

Routes are registered with `app.route(path)` followed by one or more HTTP
verb methods. The underlying router is [find-my-way](https://github.com/delvedor/find-my-way),
a radix-trie router with the same path-pattern syntax.

## Registering routes

```ts
import { createApp } from "@jongleberry/api-server";

const app = createApp();

app.route("/users").get((ctx) => {
  ctx.json({ users: [] });
});

app.route("/users").post((ctx) => {
  ctx.setStatus(201);
  ctx.json({ created: true });
});

app.route("/users/:id").get((ctx) => {
  ctx.json({ id: ctx.params.id });
});

app.route("/users/:id").put((ctx) => {
  ctx.json({ id: ctx.params.id });
});

app.route("/users/:id").patch((ctx) => {
  ctx.json({ patched: true });
});

app.route("/users/:id").delete((ctx) => {
  ctx.setStatus(204);
});
```

## Chaining verbs

`.get()`, `.post()`, `.put()`, `.patch()`, and `.delete()` all return the same
`RouteBuilder`, so you can chain multiple verbs in one statement:

```ts
app
  .route("/resource")
  .get((ctx) => ctx.json({ m: "GET" }))
  .post((ctx) => ctx.json({ m: "POST" }));
```

## Automatic HEAD for GET

Registering `.get()` automatically registers a `HEAD` handler for the same
path. The handler runs normally, but the response body is suppressed and only
headers are sent.

```ts
app.route("/data").get((ctx) => {
  ctx.json({ value: 42 });
});
// HEAD /data is handled automatically — returns headers, no body
```

## Route parameters

Named segments (`:name`) are captured in `ctx.params`:

```ts
app.route("/posts/:year/:slug").get((ctx) => {
  const { year, slug } = ctx.params;
  ctx.json({ year, slug });
});
```

`ctx.params` is typed as `Record<string, string | undefined>`.

## Query string

Query parameters are available on `ctx.query` — see [context.md](context.md).

## Not-found handler

When no route matches (or a matched handler sends no response), the framework
calls the registered not-found handler if one exists, otherwise it sends a
plain-text `404 Not Found`.

```ts
app.notFoundHandler((ctx) => {
  ctx.response.setStatus(404);
  ctx.json({ error: "Not Found", path: ctx.req.url });
});
```
