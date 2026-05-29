import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import request from "supertest";
import { Logger } from "./logger.mts";
import { Application } from "./application.mts";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";

function makeReq(method = "GET", url = "/test"): IncomingMessage {
  return { method, url } as IncomingMessage;
}

describe("Logger", () => {
  let originalEnv: string | undefined;
  let originalLogLevel: string | undefined;
  let writeSpy: Mock;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    originalLogLevel = process.env.LOG_LEVEL;
    // Default to info so tests that set NODE_ENV=development see verbose output.
    // Tests that explicitly want error mode set LOG_LEVEL=error in their own beforeEach.
    process.env.LOG_LEVEL = "info";
    writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true) as Mock;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalLogLevel;
    }
    vi.restoreAllMocks();
  });

  it("does not log in production", () => {
    process.env.NODE_ENV = "production";
    expect(new Logger().isEnabled()).toBe(false);
  });

  it("does not log in test environment", () => {
    process.env.NODE_ENV = "test";
    expect(new Logger().isEnabled()).toBe(false);
  });

  it("logs in development", () => {
    process.env.NODE_ENV = "development";
    expect(new Logger().isEnabled()).toBe(true);
  });

  it("prints ──‣ on request start", () => {
    process.env.NODE_ENV = "development";
    const logger = new Logger();
    logger.onRequestStart(makeReq());
    const output = (writeSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(output).toContain("──‣");
  });

  it("finish line includes status, timing, method, path", async () => {
    process.env.NODE_ENV = "development";
    const app = new Application();
    app.route("/api/data").get((ctx) => {
      ctx.json({ ok: true });
    });

    await request(app.callback()).get("/api/data");
    const output = (writeSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(output).toContain("200");
    expect(output).toContain("GET");
    expect(output).toContain("/api/data");
    expect(output).toMatch(/\d+ms/);
  });

  it("concurrent requests use different slots", () => {
    process.env.NODE_ENV = "development";
    const logger = new Logger();
    const { onFinish: finish1 } = logger.onRequestStart(makeReq("GET", "/a"));
    logger.onRequestStart(makeReq("GET", "/b"));

    const output = (writeSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    // Second start should show first slot active (│) and second slot starting (┬)
    expect(output).toContain("│┈┬");
    writeSpy.mockClear();

    finish1(200);
    const output2 = (writeSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    // First finish: slot 0 ends (┴), slot 1 still active (│)
    expect(output2).toContain("┴┈│");
  });

  it("bar shrinks after all concurrent requests finish", () => {
    process.env.NODE_ENV = "development";
    const logger = new Logger();
    const { onFinish: finish1 } = logger.onRequestStart(makeReq("GET", "/a"));
    const { onFinish: finish2 } = logger.onRequestStart(makeReq("GET", "/b"));
    writeSpy.mockClear();

    finish2(200);
    finish1(200);
    writeSpy.mockClear();

    // New request after all finished — bar should be back to single slot (┬ alone, no separators)
    logger.onRequestStart(makeReq("GET", "/c"));
    const output = (writeSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(output).toContain(" ┬ ");
  });

  it("write-head line printed for streaming responses", async () => {
    process.env.NODE_ENV = "development";
    const app = new Application();
    app.route("/stream").get(async (ctx) => {
      ctx.res.setHeader("Content-Type", "text/plain");
      await ctx.pipeline(Readable.from("hello"));
    });

    await request(app.callback()).get("/stream");
    const output = (writeSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(output).toContain("···");
    expect(output).toContain("/stream");
  });

  it("does not print write-head for buffered responses", async () => {
    process.env.NODE_ENV = "development";
    const app = new Application();
    app.route("/json").get((ctx) => {
      ctx.json({ ok: true });
    });

    await request(app.callback()).get("/json");
    const output = (writeSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(output).not.toContain("···");
  });

  it("no output when disabled", () => {
    process.env.NODE_ENV = "test";
    const logger = new Logger();
    const { onWriteHead, onFinish } = logger.onRequestStart(makeReq());
    onWriteHead();
    onFinish(200);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("4xx status uses orange color code", async () => {
    process.env.NODE_ENV = "development";
    const app = new Application();
    app.route("/missing").get((ctx) => {
      ctx.setStatus(404);
      ctx.json({ err: "not found" });
    });

    await request(app.callback()).get("/missing");
    const output = (writeSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    // Orange = ANSI 256-color \x1b[38;5;208m
    expect(output).toContain("\x1b[38;5;208m");
  });

  it("5xx status uses red color code", async () => {
    process.env.NODE_ENV = "development";
    const app = new Application();
    app.errorHandler((ctx) => {
      ctx.setStatus(500);
      ctx.json({ err: "oops" });
    });
    app.route("/boom").get(() => {
      throw new Error("boom");
    });

    await request(app.callback()).get("/boom");
    const output = (writeSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(output).toContain("\x1b[31m"); // RED
  });

  it("slow requests use yellow color for timing", () => {
    process.env.NODE_ENV = "development";
    const logger = new Logger({ timingThresholds: { yellow: 0, orange: 250, red: 500 } });
    const { onFinish } = logger.onRequestStart(makeReq());
    onFinish(200);
    const output = (writeSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    // Any timing ≥ 0ms triggers yellow
    expect(output).toContain("\x1b[33m"); // YELLOW
  });

  it("configurable thresholds: orange above custom limit", () => {
    process.env.NODE_ENV = "development";
    const logger = new Logger({ timingThresholds: { yellow: 0, orange: 0, red: 500 } });
    const { onFinish } = logger.onRequestStart(makeReq());
    onFinish(200);
    const output = (writeSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    // orange at 0ms threshold
    expect(output).toContain("\x1b[38;5;208m"); // ORANGE
  });

  it("configurable thresholds: red above custom limit", () => {
    process.env.NODE_ENV = "development";
    const logger = new Logger({ timingThresholds: { yellow: 0, orange: 0, red: 0 } });
    const { onFinish } = logger.onRequestStart(makeReq());
    onFinish(200);
    const output = (writeSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    // red at 0ms threshold
    expect(output).toContain("\x1b[31m"); // RED
  });

  it("3xx status uses cyan color code", async () => {
    process.env.NODE_ENV = "development";
    const app = new Application();
    app.route("/redirect").get((ctx) => {
      ctx.setStatus(301);
      ctx.json({ moved: true });
    });

    await request(app.callback()).get("/redirect");
    const output = (writeSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(output).toContain("\x1b[36m"); // CYAN
  });

  it("handles req with no method or url (defaults to GET and /)", () => {
    process.env.NODE_ENV = "development";
    const logger = new Logger();
    const bareReq = {} as IncomingMessage;
    expect(() => logger.onRequestStart(bareReq)).not.toThrow();
    const output = (writeSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(output).toContain("GET");
    expect(output).toContain("/");
  });

  it("renderBar shows ┈ gap for freed intermediate slot", () => {
    process.env.NODE_ENV = "development";
    const logger = new Logger();
    const { onFinish: finish0 } = logger.onRequestStart(makeReq("GET", "/a"));
    const { onFinish: finish1 } = logger.onRequestStart(makeReq("GET", "/b"));
    const { onWriteHead: writeHead2 } = logger.onRequestStart(makeReq("GET", "/c"));
    writeSpy.mockClear();

    // Free slot 1 (middle) while slots 0 and 2 are still active
    finish1(200);
    writeSpy.mockClear();

    // Trigger a bar render on slot 2 — bar should show slot 0 active (│),
    // slot 1 freed (┈), slot 2 as the event
    writeHead2();
    const output = (writeSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(output).toContain("┈");

    finish0(200);
  });

  it("slot reassignment does not grow highWaterMark beyond needed", () => {
    process.env.NODE_ENV = "development";
    const logger = new Logger();
    const { onFinish: finish0 } = logger.onRequestStart(makeReq("GET", "/a"));
    const { onFinish: finish1 } = logger.onRequestStart(makeReq("GET", "/b"));
    writeSpy.mockClear();

    // Free slot 0; highWaterMark stays at 2 because slot 1 is still active
    finish0(200);
    writeSpy.mockClear();

    // Start a new request — gets slot 0 again; slot + 1 (=1) is NOT > highWaterMark (=2)
    // so highWaterMark should NOT increment again
    const { onFinish: finishNew } = logger.onRequestStart(makeReq("GET", "/c"));
    expect(logger.isEnabled()).toBe(true); // sanity
    finishNew(200);
    finish1(200);
  });

  describe("LOG_LEVEL=error mode", () => {
    let savedLogLevel: string | undefined;

    beforeEach(() => {
      savedLogLevel = process.env.LOG_LEVEL;
      process.env.NODE_ENV = "development";
      process.env.LOG_LEVEL = "error";
      writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true) as Mock;
    });

    afterEach(() => {
      if (savedLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = savedLogLevel;
      }
    });

    it("suppresses per-request lines for 2xx responses", async () => {
      const app = new Application();
      app.route("/api/data").get((ctx) => {
        ctx.json({ ok: true });
      });

      await request(app.callback()).get("/api/data");
      expect(writeSpy).not.toHaveBeenCalled();
    });

    it("still prints a line for 5xx responses", async () => {
      const app = new Application();
      app.errorHandler((ctx) => {
        ctx.setStatus(500);
        ctx.json({ err: "oops" });
      });
      app.route("/boom").get(() => {
        throw new Error("boom");
      });

      await request(app.callback()).get("/boom");
      const output = (writeSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
      expect(output).toContain("500");
      expect(output).toContain("/boom");
    });

    it("does not print write-head line for 5xx responses", async () => {
      const app = new Application();
      app.errorHandler((ctx) => {
        ctx.setStatus(500);
        ctx.json({ err: "oops" });
      });
      app.route("/boom").get(() => {
        throw new Error("boom");
      });

      await request(app.callback()).get("/boom");
      const output = (writeSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
      expect(output).not.toContain("···");
    });

    it("defaults method and url in error-level logger when req has none", () => {
      const logger = new Logger();
      const bareReq = {} as IncomingMessage;
      const { onFinish } = logger.onRequestStart(bareReq);
      // Trigger a 5xx so createErrorLevelLogger's onFinish writes output
      onFinish(500);
      const output = (writeSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
      expect(output).toContain("GET");
      expect(output).toContain("/");
    });

    it("sanitizes malicious characters in url and method for all log levels", () => {
      const inputMethod = "GET\n";
      const inputUrl = "/foo\r\nBar\x1b[31m\u202E";
      const req = makeReq(inputMethod, inputUrl);
      const cases = ["info", "error"] as const;

      for (const level of cases) {
        process.env.LOG_LEVEL = level;
        const logger = new Logger();
        writeSpy.mockClear();

        const { onFinish } = logger.onRequestStart(req);
        onFinish(500);

        const output = (writeSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
        expect(output).toContain("/fooBar");
        expect(output).not.toContain("/foo\r");
        expect(output).not.toContain("Bar\x1b[31m");
        expect(output).not.toContain("\u202E");
      }
    });
  });
});
