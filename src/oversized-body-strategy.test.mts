import { afterEach, describe, expect, it } from "vitest";
import {
  Agent,
  createServer,
  request as httpRequest,
  type ClientRequest,
  type IncomingHttpHeaders,
  type Server,
} from "node:http";
import http2 from "node:http2";
import type { AddressInfo, Socket } from "node:net";
import { Readable } from "node:stream";
import { Application } from "./application.mts";
import { Request } from "./request.mts";

const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("oversizedBodyStrategy", () => {
  it("drains by default and reuses the HTTP/1 connection", async () => {
    const app = makeBodyApp();
    const server = await startServer(createServer(app.callback()));
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    try {
      const first = await sendHttp1(server, Buffer.from("xx"), agent);
      const second = await sendHttp1(server, Buffer.from("x"), agent);
      expect(first.status).toBe(413);
      expect(first.headers.connection).not.toBe("close");
      expect(second.status).toBe(200);
      expect(second.body).toBe('{"length":1}');
      expect(second.socket).toBe(first.socket);
    } finally {
      agent.destroy();
    }
  });

  it("closes HTTP/1 after a known-length oversized body", async () => {
    const app = makeBodyApp("close");
    const server = await startServer(createServer(app.callback()));
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    try {
      const first = await sendHttp1(server, Buffer.from("xx"), agent);
      const second = await sendHttp1(server, Buffer.from("x"), agent);
      expect(first.status).toBe(413);
      expect(first.headers.connection).toBe("close");
      expect(second.status).toBe(200);
      expect(second.socket).not.toBe(first.socket);
    } finally {
      agent.destroy();
    }
  });

  it("closes HTTP/1 after a chunked body crosses the limit", async () => {
    const app = makeBodyApp("close");
    const server = await startServer(createServer(app.callback()));
    const result = await sendHttp1(server, [Buffer.from("x"), Buffer.from("x")]);
    expect(result.status).toBe(413);
    expect(result.headers.connection).toBe("close");
  });

  it("sends 100 Continue in drain mode", async () => {
    const app = makeBodyApp();
    const server = createServer();
    server.on("request", app.callback());
    server.on("checkContinue", app.callback());
    await startServer(server);

    const result = await sendExpectRequest(server, Buffer.from("xx"));
    expect(result.continued).toBe(true);
    expect(result.status).toBe(413);
  });

  it("rejects known oversized Expect requests without 100 Continue in close mode", async () => {
    const app = makeBodyApp("close");
    const server = createServer();
    server.on("request", app.callback());
    server.on("checkContinue", app.callback());
    await startServer(server);

    const result = await sendExpectRequest(server, Buffer.from("xx"));
    expect(result.continued).toBe(false);
    expect(result.status).toBe(413);
    expect(result.headers.connection).toBe("close");
  });

  it("returns 413 without connection headers and reuses an HTTP/2 session", async () => {
    const app = makeBodyApp("close");
    const server = http2.createServer(
      app.callback() as unknown as (
        req: http2.Http2ServerRequest,
        res: http2.Http2ServerResponse,
      ) => void,
    );
    let serverSession: http2.ServerHttp2Session | undefined;
    server.on("session", (session) => {
      serverSession = session;
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = (server.address() as AddressInfo).port;
    const client = http2.connect(`http://127.0.0.1:${port}`);
    try {
      const first = await sendHttp2(client, Buffer.from("xx"));
      const second = await sendHttp2(client, Buffer.from("x"));
      expect(first.status).toBe(413);
      expect(first.headers.connection).toBeUndefined();
      expect(second.status).toBe(200);
      expect(second.body).toBe('{"length":1}');
    } finally {
      client.destroy();
      serverSession?.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe("close strategy safety paths", () => {
  it("sends 100 Continue when close mode cannot reject from Content-Length", async () => {
    const stream = makeMockRequest();
    Object.assign(stream.headers, { expect: "100-continue" });
    let continued = false;
    const res = {
      headersSent: false,
      writeContinue: () => {
        continued = true;
      },
    } as unknown as import("node:http").ServerResponse;
    const body = new Request(stream, res, "2b", false, "close").buffer();
    stream.push(Buffer.from("x"));
    stream.push(null);
    await expect(body).resolves.toEqual(Buffer.from("x"));
    expect(continued).toBe(true);
  });

  it("swallows request errors after rejection", async () => {
    const stream = makeMockRequest();
    const headers = new Map<string, string>();
    const res = {
      headersSent: false,
      setHeader: (name: string, value: string) => headers.set(name, value),
    } as unknown as import("node:http").ServerResponse;
    const body = new Request(stream, res, "1b", false, "close").buffer();
    stream.push(Buffer.alloc(2));
    await expect(body).rejects.toMatchObject({ status: 413 });
    expect(headers.get("Connection")).toBe("close");
    stream.destroy(new Error("after rejection"));
    await new Promise<void>((resolve) => setImmediate(resolve));
  });

  it("destroys a response whose headers were already sent", async () => {
    const stream = makeMockRequest();
    let destroyed = false;
    const res = {
      headersSent: true,
      destroy: () => {
        destroyed = true;
      },
    } as unknown as import("node:http").ServerResponse;
    const body = new Request(stream, res, "1b", false, "close").buffer();
    stream.push(Buffer.alloc(2));
    await expect(body).rejects.toMatchObject({ status: 413 });
    expect(destroyed).toBe(true);
  });

  it("destroys the response if the HTTP/1 close header cannot be set", async () => {
    const stream = makeMockRequest();
    let destroyed = false;
    const res = {
      headersSent: false,
      setHeader: () => {
        throw new Error("headers unavailable");
      },
      destroy: () => {
        destroyed = true;
      },
    } as unknown as import("node:http").ServerResponse;
    const body = new Request(stream, res, "1b", false, "close").buffer();
    stream.push(Buffer.alloc(2));
    await expect(body).rejects.toMatchObject({ status: 413 });
    expect(destroyed).toBe(true);
  });
});

function makeBodyApp(strategy: "drain" | "close" = "drain"): Application {
  const app = new Application({ bodyLimit: "1b", oversizedBodyStrategy: strategy });
  app.route("/").post(async (ctx) => {
    const body = await ctx.request.buffer();
    ctx.json({ length: body.length });
  });
  return app;
}

async function startServer(server: Server): Promise<Server> {
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server;
}

interface HttpResult {
  status: number;
  body: string;
  headers: IncomingHttpHeaders;
  socket: Socket;
}

async function sendHttp1(
  server: Server,
  body: Buffer | Buffer[],
  agent?: Agent,
): Promise<HttpResult> {
  const chunks = Array.isArray(body) ? body : [body];
  const contentLength = Array.isArray(body) ? undefined : body.length;
  return new Promise((resolve, reject) => {
    let socket: Socket;
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port: (server.address() as AddressInfo).port,
        method: "POST",
        path: "/",
        agent,
        headers: contentLength === undefined ? {} : { "Content-Length": contentLength },
      },
      (res) => collectHttp1Response(res, socket, resolve),
    );
    req.on("socket", (value) => {
      socket = value;
    });
    req.on("error", reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

function collectHttp1Response(
  res: import("node:http").IncomingMessage,
  socket: Socket,
  resolve: (result: HttpResult) => void,
): void {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () =>
    resolve({
      status: res.statusCode ?? 0,
      body: Buffer.concat(chunks).toString(),
      headers: res.headers,
      socket,
    }),
  );
}

async function sendExpectRequest(
  server: Server,
  body: Buffer,
): Promise<HttpResult & { continued: boolean }> {
  return new Promise((resolve, reject) => {
    let continued = false;
    let socket: Socket;
    const req: ClientRequest = httpRequest({
      host: "127.0.0.1",
      port: (server.address() as AddressInfo).port,
      method: "POST",
      path: "/",
      headers: { Expect: "100-continue", "Content-Length": body.length },
    });
    req.on("socket", (value) => {
      socket = value;
    });
    req.on("continue", () => {
      continued = true;
      req.end(body);
    });
    req.on("response", (res) =>
      collectHttp1Response(res, socket, (result) => resolve({ ...result, continued })),
    );
    req.on("error", reject);
    req.flushHeaders();
  });
}

async function sendHttp2(
  client: http2.ClientHttp2Session,
  body: Buffer,
): Promise<{ status: number; body: string; headers: http2.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = client.request({
      ":method": "POST",
      ":path": "/",
      "content-length": body.length,
    });
    let headers: http2.IncomingHttpHeaders = {};
    const chunks: Buffer[] = [];
    req.on("response", (value) => {
      headers = value;
    });
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () =>
      resolve({
        status: Number(headers[":status"]),
        body: Buffer.concat(chunks).toString(),
        headers,
      }),
    );
    req.on("error", reject);
    req.end(body);
  });
}

function makeMockRequest(): import("node:http").IncomingMessage {
  const stream = new Readable({ read() {} });
  Object.assign(stream, { headers: {}, httpVersionMajor: 1 });
  return stream as unknown as import("node:http").IncomingMessage;
}
