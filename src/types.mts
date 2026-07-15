import type { LoggerOptions } from "./logger.mts";

export type SecurityHeaderName =
  | "X-XSS-Protection"
  | "X-Frame-Options"
  | "X-Content-Type-Options"
  | "Strict-Transport-Security"
  | "Referrer-Policy"
  | "X-DNS-Prefetch-Control"
  | "X-Download-Options"
  | "X-Permitted-Cross-Domain-Policies";

export type SecurityHeadersOptions = Partial<Record<SecurityHeaderName, string | false>>;

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
  securityHeaders?: SecurityHeadersOptions;
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
