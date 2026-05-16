# @jongleberry/api-server

A Node.js HTTP server library. API reference and usage: [README.md](./README.md). Docs: [docs/README.md](./docs/README.md).

## Testing Rules

Tests live colocated with source as `src/*.test.mts` and use `vitest` + `supertest`.

- **Use supertest** (`request(app.callback()).method(path)`) for tests that verify real HTTP semantics (response bodies, headers, status codes).
- **Use mock req/res** (inline object literals passed directly to `app.callback()`) for request-rejection paths where the response is synchronous. This avoids flaky "socket hang up" errors in CI under load.
- **Multiple requests in one test:** use `withServer` from `src/test-helpers/with-server.mts` or an explicit `createServer` from `node:http` so both requests share one server.
- **Handler-side state assertions:** return values in the JSON response body rather than assigning to an outer closure variable.

```ts
// Multiple requests: shared server pattern (via withServer)
import { withServer } from './test-helpers/with-server.mts'
await withServer(app.callback(), async server => {
  const res1 = await request(server).get('/a')
  const res2 = await request(server).get('/b')
})
```

## Standards

- 100% test coverage enforced via Codecov
- max 200 lines per source file (oxlint max-lines)
- TypeScript strict mode, `noUnusedLocals`, `noUnusedParameters`
- `pnpm` preferred over `npm`
