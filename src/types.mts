import type { LoggerOptions } from "./logger.mts";

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "strict" | "lax" | "none" | true;
  path?: string;
  domain?: string;
  expires?: Date;
  maxAge?: number;
}

export interface ApplicationOptions {
  bodyLimit?: string | number | false;
  logger?: LoggerOptions;
  trustProxy?: boolean;
  /**
   * When true, ctx.request.json() rejects requests whose Content-Type is not
   * application/json (or a compatible JSON subtype such as application/merge-patch+json)
   * with a 415 Unsupported Media Type error. Requests with no body are unaffected.
   *
   * Defaults to false (lenient: any Content-Type is accepted, preserving
   * backward-compatible behavior).
   */
  strictJsonContentType?: boolean;
}
