## 2026-05-19 - Missing Content-Type Headers
**Vulnerability:** Fallback 500 and 404 error responses didn't specify a `Content-Type` header, potentially allowing for XSS or content-sniffing if an error message reflects user input.
**Learning:** Default text responses in frameworks must always explicitly declare their Content-Type to avoid implicit browser behaviors.
**Prevention:** Ensure any fallback strings or generated error text explicitly specify `Content-Type: text/plain; charset=utf-8` before being sent.

## 2026-05-22 - Information Exposure in Fallback Error Handler
**Vulnerability:** The error fallback handler returned the raw error message for all errors by default, ignoring the standard `expose: false` flag set by error libraries like `http-errors`. This can leak sensitive internal details (e.g. database schema details or connection strings) to untrusted clients.
**Learning:** Generic fallback response bodies must evaluate the `expose` flag on error objects to safely suppress sensitive messages, instead relying on standard HTTP status code names.
**Prevention:** Check `error.expose === false` and fall back to generic HTTP status descriptions (using `node:http` `STATUS_CODES`) when handling unhandled or unexpected error objects.

## 2026-05-23 - Default Error Message Exposure
**Vulnerability:** The error fallback handler returned raw error messages for errors where the `expose` property was `undefined` (which is the default for native `Error` instances) if their status was a 4xx. This leaked messages for manually created HTTP client errors.
**Learning:** Fallback handlers must be secure by default. They should only expose error messages when explicitly instructed (e.g. `expose === true`), rather than exposing by default unless instructed to hide.
**Prevention:** Always use `err?.expose !== true` instead of `err?.expose === false` to determine if a message should be hidden from the client.
