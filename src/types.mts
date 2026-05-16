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
  logger?: LoggerOptions;
}
