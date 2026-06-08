/**
 * Tests for the framework safety-net introduced to fix issue #1948.
 *
 * When a registered error handler throws or returns without sending a response,
 * the framework must still guarantee the client receives a response (500) rather
 * than leaving the socket hanging until timeout.
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import createHttpError from "http-errors";
import { Application } from "./application.mts";
import { withServer } from "./test-helpers/with-server.mts";

// Shared mock factory — produces a minimal IncomingMessage / ServerResponse pair
// without a real TCP socket. Safer than supertest for paths where the error
// handler itself throws: supertest can surface the throw as a socket hang-up,
// masking the real assertion. Pattern mirrors the existing mock req/res tests
// in application.generated.test.mts.
interface MockRes {
  statusCode: number;
  headersSent: boolean;
  chunks: string[];
  end: (data?: Buffer | string) => void;
}

function makeMockReqRes(url: string): [import("node:http").IncomingMessage, MockRes] {
  const mockReq = {
    method: "GET",
    url,
    headers: {},
    on: () => mockReq,
  } as unknown as import("node:http").IncomingMessage;

  const chunks: string[] = [];
  const headers: Record<string, string | number> = {};
  const mockRes: MockRes = {
    headersSent: false,
    statusCode: 200,
    chunks,
    end: (data?: Buffer | string) => {
      if (data) chunks.push(Buffer.isBuffer(data) ? data.toString() : String(data));
    },
  };

  Object.assign(mockRes, {
    writableEnded: false,
    setHeader: (name: string, value: string | number) => {
      headers[name.toLowerCase()] = value;
    },
    getHeader: (name: string) => headers[name.toLowerCase()],
    writeHead: (status: number) => {
      mockRes.statusCode = status;
      mockRes.headersSent = true;
    },
  });

  return [mockReq, mockRes as unknown as MockRes];
}

describe("Application error fallback (#1948)", () => {
  it("error handler that throws still sends a 500 fallback", async () => {
    const app = new Application();
    const errors: Error[] = [];
    app.on("error", (err: Error) => errors.push(err));
    app.errorHandler(() => {
      throw new Error("handler exploded");
    });
    app.route("/boom").get(() => {
      throw new Error("route error");
    });

    const [mockReq, mockRes] = makeMockReqRes("/boom");
    const origEnd = mockRes.end;
    await new Promise<void>((resolve) => {
      mockRes.end = (data?: Buffer | string) => {
        origEnd(data);
        resolve();
      };
      app.callback()(mockReq, mockRes as unknown as import("node:http").ServerResponse);
    });

    expect(mockRes.statusCode).toBe(500);
    expect(mockRes.chunks.join("")).toBe("Internal Server Error");
    expect(errors.some((e) => e.message === "handler exploded")).toBe(true);
  });

  it("error handler that returns without sending a response sends a 500 fallback", async () => {
    const app = new Application();
    app.errorHandler(() => {
      // returns without calling ctx.json or ctx.setStatus
    });
    app.route("/silent").get(() => {
      throw new Error("route error");
    });

    const [mockReq, mockRes] = makeMockReqRes("/silent");
    const origEnd = mockRes.end;
    await new Promise<void>((resolve) => {
      mockRes.end = (data?: Buffer | string) => {
        origEnd(data);
        resolve();
      };
      app.callback()(mockReq, mockRes as unknown as import("node:http").ServerResponse);
    });

    expect(mockRes.statusCode).toBe(500);
    expect(mockRes.chunks.join("")).toBe("Internal Server Error");
  });

  it("async error handler that rejects sends a 500 fallback", async () => {
    const app = new Application();
    app.errorHandler(async () => {
      await Promise.resolve();
      throw new Error("async handler exploded");
    });
    app.route("/async-boom").get(() => {
      throw new Error("route error");
    });

    const [mockReq, mockRes] = makeMockReqRes("/async-boom");
    const origEnd = mockRes.end;
    await new Promise<void>((resolve) => {
      mockRes.end = (data?: Buffer | string) => {
        origEnd(data);
        resolve();
      };
      app.callback()(mockReq, mockRes as unknown as import("node:http").ServerResponse);
    });

    expect(mockRes.statusCode).toBe(500);
    expect(mockRes.chunks.join("")).toBe("Internal Server Error");
  });

  it("falls back to 500 when no error handler is registered and error has no status", async () => {
    const app = new Application();
    app.route("/plain-error").get(() => {
      throw new Error("boom");
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/plain-error");
      expect(res.status).toBe(500);
      expect(res.text).toBe("Internal Server Error");
      expect(res.headers["content-type"]).toBe("text/plain; charset=utf-8");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
    });
  });

  it("falls back to 500 when no error handler is registered and error.status is NaN", async () => {
    const app = new Application();
    app.route("/nan-status").get(() => {
      const err = Object.assign(new Error("bad status"), { status: NaN });
      throw err;
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/nan-status");
      expect(res.status).toBe(500);
      expect(res.text).toBe("Internal Server Error");
    });
  });

  it("uses error.status when no error handler is registered and status is a valid integer", async () => {
    const app = new Application();
    app.route("/auth-error").get(() => {
      throw createHttpError(401, "Unauthorized");
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/auth-error");
      expect(res.status).toBe(401);
      expect(res.text).toBe("Unauthorized");
    });
  });

  it("does not overwrite existing Content-Type on fallback errors", async () => {
    const app = new Application();
    app.route("/custom-type-error").get((ctx) => {
      ctx.res.setHeader("Content-Type", "text/custom");
      throw createHttpError(400, "Bad Request");
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/custom-type-error");
      expect(res.status).toBe(400);
      expect(res.text).toBe("Bad Request");
      expect(res.headers["content-type"]).toBe("text/custom");
    });
  });

  it("does not leak error messages when expose is false", async () => {
    const app = new Application();
    app.route("/secret-error").get(() => {
      throw createHttpError(400, "Secret Database Error", { expose: false });
    });

    await withServer(app.callback(), async (server) => {
      const res = await request(server).get("/secret-error");
      expect(res.status).toBe(400);
      expect(res.text).toBe("Bad Request");
    });
  });
});

describe("Application outer safety-net (handleRequest catch)", () => {
  function makeThrowingReqRes(
    throwValue: unknown,
    headersSent = false,
  ): [
    import("node:http").IncomingMessage,
    import("node:http").ServerResponse & { statusCode: number; body: string },
  ] {
    const mockReq = {
      method: "GET",
      url: "/test",
      headers: {},
      socket: {},
      on: (_e: string, _h: () => void) => mockReq,
    } as unknown as import("node:http").IncomingMessage;

    const mockRes = {
      headersSent,
      writableEnded: false,
      statusCode: 200,
      body: "",
      setHeader: () => {
        throw throwValue;
      },
      getHeader: () => undefined,
      writeHead: (status: number) => {
        mockRes.statusCode = status;
      },
      end: (data?: string) => {
        if (data) mockRes.body = data;
      },
    } as unknown as import("node:http").ServerResponse & { statusCode: number; body: string };

    return [mockReq, mockRes];
  }

  it("sends 500 when runRequest throws before its try block", async () => {
    const app = new Application();
    const [mockReq, mockRes] = makeThrowingReqRes(new Error("setup error"));
    await new Promise<void>((resolve) => {
      const origEnd = mockRes.end.bind(mockRes);
      (mockRes as unknown as Record<string, unknown>).end = (data?: string) => {
        origEnd(data);
        resolve();
      };
      app.callback()(mockReq, mockRes);
    });
    expect(mockRes.statusCode).toBe(500);
    expect(mockRes.body).toBe("Internal Server Error");
  });

  it("wraps non-Error thrown value into an Error, gracefully handling null prototype objects", async () => {
    const app = new Application();
    const errors: Error[] = [];
    app.on("error", (err: Error) => errors.push(err));

    const verifyThrow = async (throwVal: unknown, expectedMsg: string) => {
      const [mockReq, mockRes] = makeThrowingReqRes(throwVal);
      await new Promise<void>((resolve) => {
        const origEnd = mockRes.end.bind(mockRes);
        (mockRes as unknown as Record<string, unknown>).end = (data?: string) => {
          origEnd(data);
          resolve();
        };
        app.callback()(mockReq, mockRes);
      });
      const err = errors.pop();
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe(expectedMsg);
    };

    await verifyThrow("string error", "string error");
    await verifyThrow(Object.create(null), "[Object null prototype]");
  });

  it("swallows error-listener throws and still sends 500", async () => {
    const app = new Application();
    app.on("error", () => {
      throw new Error("listener blew up");
    });
    const [mockReq, mockRes] = makeThrowingReqRes(new Error("setup error"));
    await new Promise<void>((resolve) => {
      const origEnd = mockRes.end.bind(mockRes);
      (mockRes as unknown as Record<string, unknown>).end = (data?: string) => {
        origEnd(data);
        resolve();
      };
      app.callback()(mockReq, mockRes);
    });
    expect(mockRes.statusCode).toBe(500);
  });

  it("skips 500 response when headers already sent", async () => {
    const app = new Application();
    const [mockReq, mockRes] = makeThrowingReqRes(new Error("setup error"), true);
    let endCalled = false;
    (mockRes as unknown as Record<string, unknown>).end = () => {
      endCalled = true;
    };
    (mockRes as unknown as Record<string, unknown>).writeHead = () => {
      /* noop */
    };
    await new Promise<void>((resolve) => {
      // Safety-net runs asynchronously; give it a tick to settle
      app.callback()(mockReq, mockRes);
      setTimeout(resolve, 50);
    });
    expect(endCalled).toBe(false);
  });
});
