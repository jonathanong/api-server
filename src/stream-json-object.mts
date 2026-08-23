import { Readable } from "node:stream";
import { isPromise } from "node:util/types";
import { JsonStreamStringify } from "json-stream-stringify";

const cancelled = Symbol("cancelled");
type Entry = { key: string; value: unknown } | { error: unknown };
type Pending = { count: number; entries: Entry[]; waiters: Array<(entry: Entry) => void> };
type State = {
  closed: boolean;
  failure: unknown;
  failed: boolean;
  fail: (error: unknown) => void;
  failedPromise: Promise<never>;
  producer: Readable | null;
  source: Readable | null;
  stop: () => void;
  stopped: Promise<typeof cancelled>;
};

export type StreamJsonObjectInput<T extends object> = {
  [Key in keyof T]: T[Key] | PromiseLike<T[Key]>;
};

export function streamJsonObject<T extends object>(input: StreamJsonObjectInput<T>): Readable {
  const state = createState();
  const stream = Readable.from(iterateObject(snapshotEntries(input, state), state));
  const destroy = stream.destroy.bind(stream);
  stream.destroy = ((error?: Error) => {
    stop(state);
    return destroy(error);
  }) as typeof stream.destroy;
  stream.once("close", () => stop(state));
  return stream;
}

async function* iterateObject(entries: Pending, state: State): AsyncGenerator<string> {
  if (state.failed) throw state.failure;
  yield "{";
  let hasEntries = false;
  while (!state.closed) {
    const entry = await waitFor(nextEntry(entries), state);
    if (entry === cancelled) return;
    if (!entry) break;
    if ("error" in entry) throw entry.error;
    hasEntries = yield* iterateEntry(entry, hasEntries, state);
  }
  yield "}";
}

async function* iterateEntry(
  entry: { key: string; value: unknown },
  hasEntries: boolean,
  state: State,
) {
  const source = entry.value instanceof Readable ? entry.value : null;
  state.source = source;
  const producer = new JsonStreamStringify(entry.value);
  state.producer = producer;
  try {
    const iterator = producer[Symbol.asyncIterator]();
    const first = await waitFor(iterator.next(), state);
    if (first === cancelled || first.done) return hasEntries;
    yield `${hasEntries ? "," : ""}${JSON.stringify(entry.key)}:${String(first.value)}`;
    for (;;) {
      const next = await waitFor(iterator.next(), state);
      if (next === cancelled || next.done) return true;
      yield String(next.value);
    }
  } finally {
    if (state.producer === producer) state.producer = null;
    if (state.source === source) {
      state.source = null;
      source?.destroy();
    }
    producer.destroy();
  }
}

function createState(): State {
  let reject!: (error: unknown) => void;
  let resolve!: (value: typeof cancelled) => void;
  const state: State = {
    closed: false,
    failure: undefined,
    failed: false,
    fail: null!,
    failedPromise: new Promise<never>((_resolve, fail) => (reject = fail)),
    producer: null,
    source: null,
    stop: () => resolve(cancelled),
    stopped: new Promise<typeof cancelled>((done) => (resolve = done)),
  };
  state.failedPromise.catch(() => {});
  state.fail = (error) => {
    if (!state.failed) {
      state.failed = true;
      state.failure = error;
      reject(error);
    }
  };
  return state;
}

function stop(state: State): void {
  if (state.closed) return;
  state.closed = true;
  state.stop();
  state.producer?.destroy();
  state.source?.destroy();
}

function snapshotEntries(input: object, state: State): Pending {
  const pending: Pending = { count: 0, entries: [], waiters: [] };
  for (const [key, value] of Object.entries(input)) {
    const promise = assimilate(value);
    if (promise) addPendingEntry(pending, key, promise, state);
    else pending.entries.push({ key, value });
  }
  return pending;
}

function addPendingEntry(
  pending: Pending,
  key: string,
  value: PromiseLike<unknown>,
  state: State,
): void {
  pending.count += 1;
  Promise.resolve(value).then(
    (resolved) => settle(pending, { key, value: resolved }),
    (error: unknown) => {
      state.fail(error);
      settle(pending, { error });
    },
  );
}

function settle(pending: Pending, entry: Entry): void {
  pending.count -= 1;
  const waiter = pending.waiters.shift();
  if (waiter) waiter(entry);
  else pending.entries.push(entry);
}

function nextEntry(pending: Pending): Promise<Entry | undefined> {
  const entry = pending.entries.shift();
  if (entry) return Promise.resolve(entry);
  return pending.count === 0
    ? Promise.resolve(undefined)
    : new Promise((resolve) => pending.waiters.push(resolve));
}

function waitFor<T>(value: Promise<T>, state: State): Promise<T | typeof cancelled> {
  return Promise.race([value, state.stopped, state.failedPromise]);
}

function assimilate(value: unknown): Promise<unknown> | undefined {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return;
  if (isPromise(value)) return value;
  let then: unknown;
  try {
    then = (value as { then?: unknown }).then;
  } catch (error) {
    return Promise.reject(error);
  }
  if (typeof then !== "function") return;
  return new Promise((resolve, reject) => {
    queueMicrotask(() => {
      try {
        Reflect.apply(then, value, [resolve, reject]);
      } catch (error) {
        reject(error);
      }
    });
  });
}
