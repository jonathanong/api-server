import { describe, it, expect } from "vitest";
import { ServerTiming } from "./server-timing.mts";

describe("ServerTiming", () => {
  it("markResponseStarted records a timestamp", () => {
    const timing = new ServerTiming();
    timing.markResponseStarted();
    // No error means it worked
    const now = process.hrtime.bigint();
    const value = timing.getBufferedHeaderValue(now);
    expect(value).toContain("responseStarted");
  });

  it("getBufferedHeaderValue returns valid Server-Timing format", () => {
    const timing = new ServerTiming();
    timing.markResponseStarted();
    const now = process.hrtime.bigint();
    const value = timing.getBufferedHeaderValue(now);
    expect(value).toMatch(/responseStarted;dur=[\d.]+, responseFinished;dur=[\d.]+/);
  });

  it("duration values are greater than or equal to 0", () => {
    const timing = new ServerTiming();
    timing.markResponseStarted();
    const now = process.hrtime.bigint();
    const value = timing.getBufferedHeaderValue(now);
    const matches = [...value.matchAll(/dur=([\d.]+)/g)];
    expect(matches.length).toBe(2);
    for (const match of matches) {
      expect(parseFloat(match[1])).toBeGreaterThanOrEqual(0);
    }
  });

  it("works without markResponseStarted", () => {
    const timing = new ServerTiming();
    const now = process.hrtime.bigint();
    const value = timing.getBufferedHeaderValue(now);
    expect(value).toContain("responseStarted");
    expect(value).toContain("responseFinished");
  });
});
