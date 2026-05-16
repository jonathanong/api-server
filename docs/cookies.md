# Cookies

`ctx.cookies` is a `Cookies` instance backed by the `cookie` package.

## Reading cookies

`cookies.get(name)` parses the `Cookie` request header on first access and
returns the value for the named cookie, or `undefined` if it is absent.

```ts
app.route("/profile").get((ctx) => {
  const session = ctx.cookies.get("session");
  if (!session) {
    ctx.throw(401, "No session");
  }
  ctx.json({ session });
});
```

The parsed cookie map is cached for the lifetime of the request; repeated calls
to `get()` do not re-parse the header.

## Setting cookies

`cookies.set(name, value, opts?)` appends a `Set-Cookie` header to the
response. Multiple `set()` calls accumulate correctly — each call adds a new
`Set-Cookie` entry without overwriting previous ones.

```ts
app.route("/login").post(async (ctx) => {
  const { token } = await ctx.request.json<{ token: string }>();
  ctx.cookies.set("session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 86400,
  });
  ctx.json({ ok: true });
});
```

## CookieOptions

All fields are optional.

| Option     | Type                                  | Description                                         |
| ---------- | ------------------------------------- | --------------------------------------------------- |
| `httpOnly` | `boolean`                             | Prevent JavaScript access                           |
| `secure`   | `boolean`                             | HTTPS only                                          |
| `sameSite` | `"strict" \| "lax" \| "none" \| true` | SameSite policy                                     |
| `path`     | `string`                              | Cookie path (default: `/` via the `cookie` package) |
| `domain`   | `string`                              | Cookie domain                                       |
| `expires`  | `Date`                                | Absolute expiry date                                |
| `maxAge`   | `number`                              | Max age in seconds                                  |

## Caveat: get() does not see same-request set() calls

`cookies.get()` reads from the incoming `Cookie` request header only. Cookies
set with `cookies.set()` during the current request are written to `Set-Cookie`
response headers and are not visible to subsequent `get()` calls within the
same request.
