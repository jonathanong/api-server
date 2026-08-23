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

## Mutation request media types

For `POST`, `PUT`, `PATCH`, and `DELETE`, a body-bearing request must use
`application/json` or an `application/*+json` subtype. This check runs before
the route handler and also applies when no route matches, so handlers that do
not call `ctx.request.json()` remain protected. The default allows media-type
parameters and is case-insensitive.

For HTTP/1, requests with no `Content-Length` or `Transfer-Encoding`, or with
`Content-Length: 0`, are bodyless and remain valid without a `Content-Type`.
`Transfer-Encoding` always indicates a body. HTTP/2 has no equivalent framing
header: a JSON-typed request proceeds directly, while a missing or unsupported
type is held until either END_STREAM (bodyless) or its first DATA frame (415).
Node's HTTP parser rejects malformed `Content-Length` before it invokes the
application callback, using its normal `400 Bad Request` behavior. Other HTTP
methods are unaffected by this policy and retain the `strictHttpMethods`
behavior described below.

Use the optional second argument on a mutation route to replace the JSON
default with the deliberate media types that route accepts. Matching is exact
after ignoring parameters and case, unless the declared type contains `*`; a
wildcard matches any characters in that position. For example, an RFC one-click
unsubscribe route can accept an HTML form body:

```ts
app.route("/unsubscribe").post(handleUnsubscribe, {
  acceptedMediaTypes: ["application/x-www-form-urlencoded"],
});
```

An explicit list replaces, rather than adds to, the default JSON types. Include
`"application/json"` or `"application/*+json"` in that list when the route
also accepts JSON.

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

## Strict HTTP methods

By default, request methods are passed through to the router unchanged. Set
`strictHttpMethods: true` to reject methods outside Node's `http.METHODS` set
with `400 Unsupported HTTP method` before router lookup:

```ts
const app = createApp({ strictHttpMethods: true });
```

The default remains permissive so applications using extension methods keep
their existing behavior.

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
