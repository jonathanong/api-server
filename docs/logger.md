# Logger

The built-in logger prints request/response lines to stdout. It is designed for
development use and is suppressed in production and test environments.

## Enabled environments

The logger is **disabled** when `NODE_ENV` is `"production"` or `"test"`. In
all other environments (including no `NODE_ENV` set) it is enabled.

## Log levels

The log level is controlled by the `LOG_LEVEL` environment variable.

| `LOG_LEVEL` | Behavior |
|-------------|----------|
| `"info"` (default) | Logs all requests with concurrency-bar visualization |
| `"error"` | Logs only 5xx responses; 2xx and 4xx are silent |

```sh
LOG_LEVEL=info  node server.mjs   # full output
LOG_LEVEL=error node server.mjs   # errors only
```

## Concurrency-bar visualization

At `LOG_LEVEL=info`, each request is assigned a slot. The bar renders one
column per concurrent slot using box-drawing characters:

```
──‣ ┈┈┈┈┈ GET┈ ┬ /path
··· ┈12ms GET┈ · /path     ← headers sent (streaming only)
200 ┈12ms GET┈ ┴ /path     ← response finished
```

When multiple requests are in flight simultaneously, the bar shows which slots
are active:

```
──‣ ┈┈┈┈┈ GET┈ ┬┈┈ /fast
──‣ ┈┈┈┈┈ GET┈ ┈┬┈ /slow
200 ┈┈1ms GET┈ ┴┈┈ /fast
200 ┈50ms GET┈ ┈┴┈ /slow
```

## Timing colors

Response times are colored based on configurable thresholds:

| Threshold | Color |
|-----------|-------|
| < yellow | no color |
| >= yellow | yellow |
| >= orange | orange |
| >= red | red |

Default thresholds (milliseconds):

```ts
{ yellow: 50, orange: 250, red: 500 }
```

## Custom timing thresholds

Pass `timingThresholds` in the application options:

```ts
import { createApp } from "@jongleberry/api-server";

const app = createApp({
  logger: {
    timingThresholds: { yellow: 100, orange: 500, red: 2000 },
  },
});
```

## Status colors

Status codes in the concurrency-bar output are also colored:

| Range | Color |
|-------|-------|
| 2xx | green |
| 3xx | cyan |
| 4xx | orange |
| 5xx | red |
