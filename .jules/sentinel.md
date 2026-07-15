## 2026-06-01 - [Malformed URL 500 Error Log Pollution]
**Vulnerability:** Node's `new URL(url)` throws a synchronous error for malformed URLs (e.g. `http://[/foo`). If `req.url` contains an absolute URL and is parsed without a try-catch, it throws an uncaught exception during request handling, resulting in an unhandled 500 Internal Server Error rather than a 400 Bad Request.
**Learning:** `req.url` can be arbitrary user input, and when evaluating it as an absolute URL, standard library parsers (like `URL`) are strict and throw. Unhandled throws early in request routing logic cause 500s, polluting error logs and creating a vector for DoS via noise/alert fatigue.
**Prevention:** Always wrap `new URL()` in a `try-catch` when operating on `req.url`, and re-throw with `{ status: 400 }` to ensure malformed requests are properly rejected without causing server-side exceptions.

## 2025-02-28 - Global CSP breaks static/HTML routes
**Vulnerability:** Adding a strict `Content-Security-Policy` header (e.g. `default-src 'none'`) globally to all response headers (like `SECURITY_HEADERS` used in fallback responses) can inadvertently break existing HTML and static resource routes that depend on external or inline resources.
**Learning:** Security hardening like CSP should be carefully scoped. Applying it as a blanket default can cause unexpected regressions in functionality. It should ideally be opt-in or strictly scoped only to framework-generated fallback responses where we know it's safe (e.g. error pages that don't load scripts).
**Prevention:** Avoid modifying global default headers with strict policies unless explicitly required and verified across all route types. Instead, add CSP specifically to error/fallback handlers.
