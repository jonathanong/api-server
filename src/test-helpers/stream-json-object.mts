import { Readable, Writable } from "node:stream";

export function failingWritable(): Writable {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback(new Error("client disconnected"));
    },
  });
}

export async function read(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
}

export function deferred<T>(): {
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T) => void;
} {
  let reject!: (error: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, reject, resolve };
}

export function chunks(count: number): Readable {
  return Readable.from(
    (async function* () {
      for (let index = 0; index < count; index += 1) yield "x";
    })(),
  );
}

export function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
