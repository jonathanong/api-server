## 2026-05-19 - Missing Content-Type Headers
**Vulnerability:** Fallback 500 and 404 error responses didn't specify a `Content-Type` header, potentially allowing for XSS or content-sniffing if an error message reflects user input.
**Learning:** Default text responses in frameworks must always explicitly declare their Content-Type to avoid implicit browser behaviors.
**Prevention:** Ensure any fallback strings or generated error text explicitly specify `Content-Type: text/plain; charset=utf-8` before being sent.
## 2026-05-21 - XSS via Reflected Error Messages
**Vulnerability:** When a 4xx error is generated and the Content-Type header is already set to text/html, unescaped user-supplied error messages (e.g. from invalid parameters) were reflected back to the user, potentially allowing XSS.
**Learning:** Even when using fallback text/plain headers by default, frameworks that respect existing headers (like text/html) must explicitly HTML-escape error messages to avoid reflection attacks.
**Prevention:** Always sanitize/escape fallback error text before returning it to the client, especially when the Content-Type header might not be strictly controlled.
