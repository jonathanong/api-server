import { Readable } from "node:stream";
import { isPromise } from "node:util/types";
import { JsonStreamStringify } from "json-stream-stringify";
const cancelled = Symbol("cancelled");
type Entry = { key: string; value: unknown } | { error: unknown };
type Pending = { count: number; entries: Entry[]; waiters: Array<(entry: Entry) => void> };
type Waiter = { fail: (error: unknown) => void; stop: () => void };
type State = {
  closed: boolean;
  failure: unknown;
  failed: boolean;
  fail: (error: unknown) => void;
  listeners: Set<Waiter>;
  producer: Readable | null;
  sources: Set<Readable>;
};
const states = new WeakMap<Readable, State>();
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
  states.set(stream, state);
  return stream;
}

/** @internal Test-only visibility for bounded waiter regression coverage. */
export function getStreamJsonObjectWaiterCountForTesting(stream: Readable): number {
  return states.get(stream)?.listeners.size ?? 0;
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
    source?.destroy();
    producer.destroy();
  }
}

function createState(): State {
  const state: State = {
    closed: false,
    failure: undefined,
    failed: false,
    fail: null!,
    listeners: new Set(),
    producer: null,
    sources: new Set(),
  };
  state.fail = (error) => {
    if (!state.failed) {
      state.failed = true;
      state.failure = error;
      for (const listener of state.listeners) listener.fail(error);
      state.listeners.clear();
      state.producer?.destroy();
      for (const source of state.sources) source.destroy();
    }
  };
  return state;
}

function stop(state: State): void {
  if (state.closed) return;
  state.closed = true;
  for (const listener of state.listeners) listener.stop();
  state.listeners.clear();
  state.producer?.destroy();
  for (const source of state.sources) source.destroy();
}

function snapshotEntries(input: object, state: State): Pending {
  const pending: Pending = { count: 0, entries: [], waiters: [] };
  for (const [key, value] of Object.entries(input)) {
    const promise = assimilate(value);
    if (promise) addPendingEntry(pending, key, promise, state);
    else {
      if (value instanceof Readable) state.sources.add(value);
      pending.entries.push({ key, value });
    }
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
  const resolve = (resolved: unknown) => settle(pending, { key, value: resolved });
  const reject = (error: unknown) => {
    state.fail(error);
    settle(pending, { error });
  };
  Reflect.apply(Promise.prototype.then, value, [resolve, reject]);
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
  if (state.closed) return Promise.resolve(cancelled);
  if (state.failed) return Promise.reject(state.failure);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      state.listeners.delete(listener);
      settle();
    };
    const listener: Waiter = {
      fail: (error) => finish(() => reject(error)),
      stop: () => finish(() => resolve(cancelled)),
    };
    state.listeners.add(listener);
    Reflect.apply(Promise.prototype.then, value, [
      (result: T) => finish(() => resolve(result)),
      (error: unknown) => finish(() => reject(error)),
    ]);
  });
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
