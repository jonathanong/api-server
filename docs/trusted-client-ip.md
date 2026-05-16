# Trusted Client IP

`ctx.ip` resolves the client's IP address from request headers and the
underlying socket, following this precedence:

1. `cf-connecting-ip` — set by Cloudflare
2. `x-forwarded-for` — first value (leftmost IP), set by reverse proxies
3. `socket.remoteAddress` — the direct TCP peer address

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
          no  → use socket.remoteAddress
```

For both `cf-connecting-ip` and `x-forwarded-for`, if the header contains
multiple comma-separated values, only the **first** segment is used. An empty
segment (e.g. a header present but blank) falls through to the next source.

## When `ctx.ip` is undefined

`ctx.ip` is `undefined` when none of the three sources yield a value. This can
happen in tests or synthetic request environments where the socket has no
remote address.

## Security caveat

Only trust `cf-connecting-ip` and `x-forwarded-for` when your server sits
behind a known, trusted proxy that sets these headers. If the server is
directly internet-facing, a client can forge these headers and claim any IP
address.

In untrusted environments, use `socket.remoteAddress` directly:

```ts
app.route("/ip").get((ctx) => {
  const ip = ctx.req.socket?.remoteAddress;
  ctx.json({ ip });
});
```
