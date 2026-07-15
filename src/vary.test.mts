import { describe, expect, it } from "vitest";
import { mergeVary } from "./vary.mts";

describe("mergeVary", () => {
  it.each([
    [undefined, "Accept-Encoding"],
    ["", "Accept-Encoding"],
    [42, "42, Accept-Encoding"],
  ])("appends Accept-Encoding to %j", (header, expected) => {
    expect(mergeVary(header)).toBe(expected);
  });

  it("splits comma-delimited array members and drops empty members", () => {
    expect(mergeVary([" Origin,  Accept-Language ", "", "Cookie, "])).toBe(
      "Origin, Accept-Language, Cookie, Accept-Encoding",
    );
  });

  it("deduplicates case-insensitively while preserving first spelling and order", () => {
    expect(mergeVary("Origin, ACCEPT-LANGUAGE, origin, Accept-Language")).toBe(
      "Origin, ACCEPT-LANGUAGE, Accept-Encoding",
    );
  });

  it("does not append a differently-cased existing Accept-Encoding member", () => {
    expect(mergeVary("Origin, accept-encoding, ACCEPT-ENCODING")).toBe("Origin, accept-encoding");
  });

  it.each(["*", "Origin, *", ["Origin", "Accept-Language, *"]])(
    "collapses %j to a wildcard",
    (header) => {
      expect(mergeVary(header)).toBe("*");
    },
  );
});
