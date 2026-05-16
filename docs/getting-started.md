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
  logger: {
    timingThresholds: { yellow: 100, orange: 500, red: 2000 },
  },
});
```

See [logger.md](logger.md) for logger options.

## Security headers

Every response automatically includes:

- `X-XSS-Protection: 0`
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`

These are set unconditionally by the framework before the route handler runs.
