# Trusted Client IP

`ctx.ip` resolves the client's IP address from request headers and the
underlying runtime remote address, following this precedence:

1. `cf-connecting-ip` — set by Cloudflare
2. `x-forwarded-for` — first value (leftmost IP), set by reverse proxies
3. runtime remote address — Node socket, Deno `remoteAddr`, or Bun `requestIP()`

```ts
app.route("/whoami").get((ctx) => {
  ctx.json({ ip: ctx.ip ?? null });
});
```

## Resolution logic

```
cf-connecting-ip present?
  yes → use its value (first comma-separated segment)
  no  → x-forwarded-for present?
          yes → use first comma-separated segment
          no  → use the runtime remote address
```

For both `cf-connecting-ip` and `x-forwarded-for`, if the header contains
multiple comma-separated values, only the **first** segment is used. An empty
segment (e.g. a header present but blank) falls through to the next source.

When AWS Application Load Balancer includes client ports in
`x-forwarded-for`, `ctx.ip` returns only the address. For example,
`203.0.113.10:12345` becomes `203.0.113.10`, and
`[2001:db8::1]:12345` becomes `2001:db8::1`.

## Runtime helpers

The standalone helper is exported from
`@jongleberry/api-server/trusted-client-ip` so Deno and Bun code can use it
without importing the Node server entrypoint.

### Node

```ts
import { resolveTrustedClientIp } from "@jongleberry/api-server/trusted-client-ip";

const ip = resolveTrustedClientIp({
  headers: req.headers,
  socketRemoteAddress: req.socket?.remoteAddress,
});
```

### Deno

```ts
import { resolveTrustedClientIp } from "npm:@jongleberry/api-server/trusted-client-ip";

Deno.serve((request, info) => {
  const ip = resolveTrustedClientIp({
    request,
    remoteAddress: info.remoteAddr,
  });
  return Response.json({ ip });
});
```

### Bun

```ts
import { resolveTrustedClientIp } from "@jongleberry/api-server/trusted-client-ip";

Bun.serve({
  fetch(request, server) {
    const ip = resolveTrustedClientIp({
      request,
      remoteAddress: server.requestIP(request) ?? undefined,
    });
    return Response.json({ ip });
  },
});
```

## When `ctx.ip` is undefined

`ctx.ip` is `undefined` when none of the three sources yield a value. This can
happen in tests or synthetic request environments where no remote address is
available.

## Security caveat

Only trust `cf-connecting-ip` and `x-forwarded-for` when your server sits
behind a known, trusted proxy that sets these headers. If the server is
directly internet-facing, a client can forge these headers and claim any IP
address.

In untrusted Node environments, use `socket.remoteAddress` directly:

```ts
app.route("/ip").get((ctx) => {
  const ip = ctx.req.socket?.remoteAddress;
  ctx.json({ ip });
});
```
