## 2026-05-18 - Missing Content-Type Headers
**Vulnerability:** Fallback 500 and 404 error responses didn't specify a `Content-Type` header, potentially allowing for XSS or content-sniffing if an error message reflects user input.
**Learning:** Default text responses in frameworks must always explicitly declare their Content-Type to avoid implicit browser behaviors.
**Prevention:** Ensure any fallback strings or generated error text explicitly specify `Content-Type: text/plain; charset=utf-8` before being sent.
