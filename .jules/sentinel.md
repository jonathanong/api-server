## 2026-06-01 - [Malformed URL 500 Error Log Pollution]
**Vulnerability:** Node's `new URL(url)` throws a synchronous error for malformed URLs (e.g. `http://[/foo`). If `req.url` contains an absolute URL and is parsed without a try-catch, it throws an uncaught exception during request handling, resulting in an unhandled 500 Internal Server Error rather than a 400 Bad Request.
**Learning:** `req.url` can be arbitrary user input, and when evaluating it as an absolute URL, standard library parsers (like `URL`) are strict and throw. Unhandled throws early in request routing logic cause 500s, polluting error logs and creating a vector for DoS via noise/alert fatigue.
**Prevention:** Always wrap `new URL()` in a `try-catch` when operating on `req.url`, and re-throw with `{ status: 400 }` to ensure malformed requests are properly rejected without causing server-side exceptions.
## 2026-06-19 - [Content-Security-Policy Rejection]
**Vulnerability:** Adding a restrictive CSP (`default-src 'none'`) to `SECURITY_HEADERS` globally applies it to all responses, including successful ones.
**Learning:** Adding CSP headers to global fallbacks can inadvertently apply to all responses depending on framework internals, breaking legitimate HTML routes if not carefully scoped as opt-in.
**Prevention:** Avoid blindly adding global CSP headers without verifying the exact scope of the header injection and implementing a compatibility-safe opt-in design.
