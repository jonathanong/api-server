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

export type OversizedBodyStrategy = "drain" | "close";

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
  /** Defaults to "drain", preserving HTTP keep-alive after a 413 response. */
  oversizedBodyStrategy?: OversizedBodyStrategy;
  /** Applied only to framework-generated fallback responses. Defaults to false. */
  fallbackContentSecurityPolicy?: string | false;
  logger?: LoggerOptions;
  securityHeaders?: SecurityHeadersOptions;
  trustProxy?: boolean;
  /** Reject methods outside node:http.METHODS with 400. Defaults to false. */
  strictHttpMethods?: boolean;
}
