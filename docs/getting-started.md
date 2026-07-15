# Getting Started

## Installation

```sh
pnpm add @jongleberry/api-server
```

Requires Node.js >= 24.

## Minimal hello-world

```ts
import { createApp } from "@jongleberry/api-server";

const app = createApp();

app.route("/").get((ctx) => {
  ctx.json({ hello: "world" });
});

// app.callback() returns a standard Node.js RequestListener
import { createServer } from "node:http";
const server = createServer(app.callback());
server.listen(3000, () => {
  console.log("Listening on http://localhost:3000");
});
```

## Mounting on an existing server

`app.callback()` returns a plain `(req, res) => void` function that can be
passed directly to `http.createServer` or any other framework that accepts a
`RequestListener`.

```ts
import { createServer } from "node:http";
import { Application } from "@jongleberry/api-server";

const app = new Application();

app.route("/ping").get((ctx) => {
  ctx.response.text("pong");
});

// Mount
const server = createServer(app.callback());
server.listen(8080);
```

## Factory vs class

Both `createApp()` and `new Application()` produce identical instances.
`createApp` is the preferred shorthand for most applications:

```ts
import { createApp } from "@jongleberry/api-server";
const app = createApp();
```

Optional configuration is passed as an options object:

```ts
const app = createApp({
  bodyLimit: "2mb",
  logger: {
    timingThresholds: { yellow: 100, orange: 500, red: 2000 },
  },
  trustProxy: true,
});
```

Options:

- `bodyLimit`: default request body limit for `ctx.request.buffer()` and
  `ctx.request.json()`. Defaults to `"1mb"`. Set to `false` to disable the
  default limit.
- `trustProxy`: when `true`, `ctx.ip` may use `cf-connecting-ip` and
  `x-forwarded-for`. Defaults to `false`, so `ctx.ip` uses the socket address.
- `securityHeaders`: custom values or `false` for the security headers described
  below.
- `logger`: see [logger.md](logger.md).

## Security headers

By default, every normal and fallback response includes:

- `X-XSS-Protection: 0`
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`

The complete set of configurable headers is:

| Header                              | Default      |
| ----------------------------------- | ------------ |
| `X-XSS-Protection`                  | `0`          |
| `X-Frame-Options`                   | `SAMEORIGIN` |
| `X-Content-Type-Options`            | `nosniff`    |
| `Strict-Transport-Security`         | Off          |
| `Referrer-Policy`                   | Off          |
| `X-DNS-Prefetch-Control`            | Off          |
| `X-Download-Options`                | Off          |
| `X-Permitted-Cross-Domain-Policies` | Off          |

Set a string to customize or enable a header. Set `false` to disable a default:

```ts
const app = createApp({
  securityHeaders: {
    "X-Frame-Options": false,
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  },
});
```

Omitted entries keep their documented defaults. The framework applies the
resolved values before route handlers run, so application code can still
overwrite them with `ctx.set()` or `ctx.res.setHeader()` before the response is
sent.
