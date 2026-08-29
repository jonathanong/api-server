# HTTP retry primitives

`@jongleberry/api-server/http-retry` supplies decision helpers only. It does not execute a
request, wait, or retry on your behalf.

```ts
import {
  computeExponentialBackoffMs,
  getHeaderValue,
  isRetryableNetworkError,
  parseRetryAfter,
} from "@jongleberry/api-server/http-retry";
```

`getHeaderValue(headers, name)` reads Fetch `Headers` and plain records case-insensitively. It
returns a string, a string array, or `undefined`; array-valued headers are intentionally preserved
so callers can reject ambiguous fields.

`parseRetryAfter(value, now?)` accepts exactly one `Retry-After` value. Decimal seconds must be
nonnegative base-10 integers. HTTP dates must use IMF-fixdate (`Wed, 21 Oct 2015 07:28:00 GMT`).
Missing, invalid, negative, ambiguous, and unrepresentable values return `null`; a valid past date
returns `0`. Pass a millisecond Unix timestamp as `now` for deterministic tests.

`isRetryableNetworkError(error)` follows `.cause` safely and matches only known Node or Undici
network `code` values. It never inspects message text, and an `AbortError` is terminal.

`computeExponentialBackoffMs({ attempt, baseDelayMs, maxDelayMs, random })` returns
`floor(min(maxDelayMs, baseDelayMs * 2 ** attempt) * random)`. `random` must be an injected value
from `0` through `1`, making the full-jitter result deterministic. Invalid numeric inputs throw a
`RangeError`.
