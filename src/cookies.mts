import type { IncomingMessage, ServerResponse } from "node:http";
import { parse, serialize } from "cookie";
import type { CookieOptions } from "./types.mts";

export class Cookies {
  private req: IncomingMessage;
  private res: ServerResponse;
  private parsed: Record<string, string | undefined> | null = null;

  constructor(req: IncomingMessage, res: ServerResponse) {
    this.req = req;
    this.res = res;
  }

  get(name: string): string | undefined {
    if (!this.parsed) {
      const header = this.req.headers.cookie ?? "";
      this.parsed = parse(header);
    }
    return this.parsed[name];
  }

  set(name: string, value: string, opts?: CookieOptions): void {
    const existing = this.res.getHeader("Set-Cookie");
    const serialized = serialize(name, value, opts);
    if (Array.isArray(existing)) {
      this.res.setHeader("Set-Cookie", [...existing, serialized]);
    } else if (existing) {
      this.res.setHeader("Set-Cookie", [String(existing), serialized]);
    } else {
      this.res.setHeader("Set-Cookie", serialized);
    }
  }
}
